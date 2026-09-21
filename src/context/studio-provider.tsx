'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import type { Character, ScriptAnalysis, GeneratedLine, Project, UserProfile } from '@/lib/types';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { initializeFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy, limit, doc } from 'firebase/firestore';
import { 
    processHighQualityGenerationAndDeductCredits, 
    generateTtsAudioAction, 
    completeFastGenerationAction, 
    deductFastGenCreditsAction
} from '@/app/studio/actions';
import { ref, onValue, set as rtdbSet, update as rtdbUpdate } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { analyzeScriptStudio } from '@/ai/flows/analyze-script-studio';
import { logSummaryEvent } from '@/lib/summary-logger';
import { useRouter } from 'next/navigation';
import { voices } from '@/lib/voices';
import { getDisplayUrl, cn, checkIsPaidUser, getISTDateString } from '@/lib/utils';
import { mergeWavBlobs } from '@/lib/audio-utils';
import { Button } from '@/components/ui/button';
import { getSignedUploadUrlAction } from '@/lib/gcs-actions';
import { subscribeToPushNotifications } from '@/components/push-subscription-handler';
import { reportClientError } from '@/lib/report-client-error';

type ScriptState = 'pristine' | 'valid';
type GenerationMode = 'fast' | 'high-quality';

/**
 * Which synthesis engine the studio generates with.
 *   'gemini'     — the built-in hardcoded voice set (src/lib/voices.ts)
 *   'elevenlabs' — 11Labs voices: the default premade set, anything from
 *                  the searchable library, or a pasted voice ID
 * The toggle appears after analysis; everything upstream of it (script
 * analysis, character detection, dialogue splitting) is identical for
 * both, which is why this lives here and not in a separate studio.
 */
export type VoiceEngine = 'gemini' | 'elevenlabs';

interface RealtimeProgress {
    processed: number;
    total: number;
    gemini_direct: number;
    google_cloud_tts: number;
    openrouter: number;
    rejected: number;
}

interface StudioContextType {
  script: string;
  setScript: (script: string) => void;
  cleanScript: string;
  setCleanScript: (s: string) => void;
  projectName: string;
  setProjectName: (name: string) => void;
  scriptState: ScriptState;
  characters: Character[];
  isAnalyzing: boolean;
  analysisStatus: string;
  scriptAnalysis: ScriptAnalysis | null;
  isGenerating: boolean;
  generationProgress: number;
  generationMode: GenerationMode;
  setGenerationMode: (mode: GenerationMode) => void;
  voiceEngine: VoiceEngine;
  setVoiceEngine: (engine: VoiceEngine) => void;
  silenceGap: number;
  isFinalizing: boolean;
  generatedAudio: Blob | null;
  generatedAudioUrl: string | null;
  generatedAudioBlob: Blob | null;
  generatedAudioDataUri?: string;
  generatedLines: GeneratedLine[];
  updateGeneratedLine: (lineId: string, updates: Partial<GeneratedLine>) => void;
  deleteGeneratedLine: (lineId: string) => void;
  addGeneratedLine: (characterName: string) => void;
  retryLineGeneration: (lineId: string, updatedText?: string, updatedVoiceId?: string, updatedEmotion?: string) => Promise<void>;
  generationStatusMessage: string;
  isPaused: boolean;
  isFlying: boolean;
  isPremiumOnlyMode: boolean;
  isCheckingUsage: boolean;
  hqProject: Project | null;
  isHqProjectLoading: boolean;
  includeEmotion: boolean;
  setIncludeEmotion: (val: boolean) => void;
  analyzeScript: () => Promise<void>;
  applyExternalAnalysis: (rawInput: any) => boolean;
  handleVoiceChange: (characterId: string, voiceId: string, voiceName?: string, voicePreviewUrl?: string | null) => void;
  handleAgeChange: (characterId: string, newAge: Character['age']) => void;
  clearStudioState: () => void;
  handleGeneration: (options?: { forceLocalFinalize?: boolean }) => Promise<void>;
  togglePause: () => void;
  checkPremiumAccess: () => boolean;
  showPremiumBlock: () => void;
  requestPushSubscription: () => Promise<void>;
  hqProjectId: string | null;
  hqSubmissionId: string | null;
  realtimeProgress: RealtimeProgress | null;
  pricing: { normal: number; discounted: number; elevenLabsNormal: number; elevenLabsDiscounted: number };
  /** Per-character rate for the engine currently selected. */
  activeRate: number;
  charsPerMinute: number;
  dailyAnalysisCount?: number;
  maxDailyAnalysisLimit?: number;
  selectedGenre: string;
  setSelectedGenre: (genre: string) => void;
}

export const StudioContext = createContext<StudioContextType | undefined>(undefined);

const getSessionDBName = () => {
    if (typeof window === 'undefined') return '12Labs_Hub_Default';
    let name = localStorage.getItem('12labs_studio_active_bucket');
    if (!name) {
        name = `12Labs_Hub_${Math.random().toString(36).substring(7).toUpperCase()}`;
        localStorage.setItem('12labs_studio_active_bucket', name);
    }
    return name;
};

const PRODUCTION_STORE = 'studio_production_data';
const AUDIO_STORE = 'studio_audio_segments';
const ACTIVE_ANALYSIS_JOB_KEY = '12labs_active_script_analysis_job';
// How long the UI waits on a submitted analysis job before it stops
// showing the spinner and hands control back to the user. Was 300s (5 min),
// which in practice meant a stuck job left users staring at "ANALYZING
// SCRIPT..." with no way to act — the top complaint. 3 minutes is well past
// how long a normal analysis takes (the server logs show most finishing in
// seconds, the slowest in ~1 min), so anything past this is a genuine
// problem and the user is better off being told to retry.
const SERVER_ANALYSIS_TIMEOUT_MS = 180000;
// A saved job older than this is treated as abandoned on reattach instead
// of being resubscribed to forever. Kept just above SERVER_ANALYSIS_TIMEOUT_MS
// so a job that was legitimately mid-flight when the tab closed can still be
// picked back up, while anything genuinely dead is dropped quickly rather
// than making the next page load wait on it again.
const MAX_RESUMABLE_JOB_AGE_MS = 5 * 60 * 1000;

const getDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(null); return; }
    const dbName = getSessionDBName();
    const request = indexedDB.open(dbName, 2);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PRODUCTION_STORE)) db.createObjectStore(PRODUCTION_STORE);
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
};

const saveAudioNode = async (id: string, blob: Blob) => {
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    tx.objectStore(AUDIO_STORE).put(blob, id);
};

const getAudioNode = async (id: string): Promise<Blob | null> => {
    const db = await getDB();
    if (!db) return null;
    const tx = db.transaction(AUDIO_STORE, 'readonly');
    const request = tx.objectStore(AUDIO_STORE).get(id);
    return new Promise((res) => { 
        request.onsuccess = () => res(request.result); 
        request.onerror = () => res(null); 
    });
};

const deleteCurrentDB = async () => {
    const dbName = localStorage.getItem('12labs_studio_active_bucket');
    if (dbName && typeof window !== 'undefined') {
        indexedDB.deleteDatabase(dbName);
        localStorage.removeItem('12labs_studio_active_bucket');
    }
};

const generateShortId = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const l1 = letters[Math.floor(Math.random() * 26)];
    const l2 = letters[Math.floor(Math.random() * 26)];
    const n1 = Math.floor(Math.random() * 10);
    const n2 = Math.floor(Math.random() * 10);
    return `${l1}${l2}${n1}${n2}`;
};

export const requestPushSubscription = async (user: any, database: any, toast: any) => {
    await subscribeToPushNotifications(user, database, toast);
};

export function StudioProvider({ children }: { children: ReactNode }) {
  const { user, activeUid, activeUser, setUser } = useAuth();
  const { toast } = useToast();
  const { firestore, database } = initializeFirebase();
  const router = useRouter();
  
  const [script, setScript] = useState('');
  const [cleanScript, setCleanScript] = useState('');
  const [projectName, setProjectName] = useState('');
  const [scriptState, setScriptState] = useState<ScriptState>('pristine');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scriptAnalysis, setScriptAnalysis] = useState<ScriptAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('high-quality');
  const [voiceEngineState, setVoiceEngineState] = useState<VoiceEngine>('gemini');
  // Mirrors voiceEngineState for reads inside callbacks that must not
  // re-create on every engine switch (rateForEngine below).
  const voiceEngineStateRef = useRef<VoiceEngine>('gemini');

  // Switching engines invalidates every assigned voice — a Gemini voice
  // id means nothing to 11Labs and vice versa. Clearing them is the only
  // safe move; silently keeping them would submit garbage voice ids.
  // Voices assigned under each engine, kept side by side. A Gemini voice
  // id is meaningless to 11Labs and vice versa, so the two sets can't be
  // shared — but they also don't need to be thrown away. Switching parks
  // the current assignments under the engine you're leaving and restores
  // whatever you had under the one you're going to, so flipping back and
  // forth to compare costs you nothing.
  const voicesByEngine = useRef<Record<VoiceEngine, Record<string, string>>>({
    gemini: {},
    elevenlabs: {},
  });

  const setVoiceEngine = useCallback((engine: VoiceEngine) => {
    setVoiceEngineState((prev) => {
      if (prev === engine) return prev;

      setCharacters((chars) => {
        // Park what's assigned right now under the engine we're leaving.
        const parked: Record<string, string> = {};
        chars.forEach((c) => { if (c.voice) parked[c.name] = c.voice; });
        voicesByEngine.current[prev] = parked;

        // Restore whatever this character had under the incoming engine.
        const saved = voicesByEngine.current[engine] || {};
        return chars.map((c) => ({ ...c, voice: saved[c.name] || '' }));
      });

      // The two engines are priced differently, so the quote already on
      // screen is wrong the moment the engine changes. Re-price it against
      // the same character count, otherwise the user sees the Gemini price
      // and gets charged the 11Labs one (the server re-derives it anyway,
      // so leaving this stale only ever surprises the user at checkout).
      setScriptAnalysis((prev) => {
        if (!prev) return prev;
        const chars = Number((prev as any).characterCount ?? 0);
        if (!chars) return prev;
        const p = pricingRef.current;
        const rate = engine === 'elevenlabs' ? (p.elevenLabsNormal || 2.5) : (p.normal || 1.2);
        const repriced = Math.ceil(chars * rate);
        return { ...prev, cost: repriced, originalCost: repriced } as any;
      });

      return engine;
    });
  }, []);
  const [selectedGenre, setSelectedGenre] = useState<string>('moral');
  const [silenceGap, setSilenceGap] = useState(800); 
  const [generatedLines, setGeneratedLines] = useState<GeneratedLine[]>([]);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<Blob | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [isFlying, setIsFlying] = useState(false);
  const [hqProjectId, setHqProjectId] = useState<string | null>(null);
  const [hqSubmissionId, setHqSubmissionId] = useState<string | null>(null);
  const [isCheckingUsage, setIsCheckingUsage] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [currentFastGenProjectId, setCurrentFastGenProjectId] = useState<string | null>(null);
  const [isPremiumOnlyMode, setIsPremiumOnlyMode] = useState(false);
  const [includeEmotion, setIncludeEmotion] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [realtimeProgress, setRealtimeProgress] = useState<RealtimeProgress | null>(null);
  // Two engines, two rates. 11Labs burns real ElevenLabs characters, so it
  // is priced separately in the admin panel (settings/pricing) rather than
  // sharing studioNormal with Gemini.
  const [pricing, setPricing] = useState({
    normal: 1.2, discounted: 1.2,
    elevenLabsNormal: 2.5, elevenLabsDiscounted: 2.0,
  });
  const [charsPerMinute, setCharsPerMinute] = useState<number>(800);
  const pricingRef = useRef({
    normal: 1.2, discounted: 1.2,
    elevenLabsNormal: 2.5, elevenLabsDiscounted: 2.0,
  });

  // Default to 'server' — script analysis now runs on the Hugging Face
  // backend (script_analysis.py) for everyone. The browser-side 'realtime'
  // path used slightly different logic, so a script could analyse
  // differently depending on where it ran; routing everything through the
  // server keeps it consistent. The admin toggle (settings/
  // analysisExecutionMode) can still force 'realtime' if the backend is
  // ever down, but the safe default is now 'server'.
  const [analysisExecutionMode, setAnalysisExecutionMode] = useState<'realtime' | 'server'>('server');
  const [dailyAnalysisCount, setDailyAnalysisCount] = useState<number>(0);
  const isPaidUser = checkIsPaidUser(user);
  const maxDailyAnalysisLimit = isPaidUser ? 5 : 2;

  useEffect(() => {
    if (!database) return;
    const unsubMode = onRtdbValue(ref(database, 'settings/analysisExecutionMode'), (snap) => {
        // Unset -> 'server' (HF backend), matching the default above.
        setAnalysisExecutionMode(snap.val() || 'server');
    });
    return () => unsubMode();
  }, [database]);

  useEffect(() => {
    if (!database || !activeUid) return;
    const today = getISTDateString();
    const limitRef = ref(database, `userScriptAnalysisLimits/${activeUid}/${today}`);
    return onRtdbValue(limitRef, (snap) => {
      setDailyAnalysisCount(snap.exists() ? Number(snap.val()) : 0);
    });
  }, [database, activeUid]);

  useEffect(() => {
    voiceEngineStateRef.current = voiceEngineState;
  }, [voiceEngineState]);

  useEffect(() => {
    pricingRef.current = pricing;
  }, [pricing]);

  // Repriced the instant real admin rates land (or a saved engine is
  // rehydrated), not just when the engine toggle is clicked. Analysis can
  // (and often does) finish before the 'settings/pricing' RTDB read
  // resolves, so the very first cost is quoted off the hardcoded fallback
  // constants above — which happen to sit close to the Gemini rate. That
  // quote then just sits on screen until something recomputes it, which is
  // why switching the engine away and back "fixed" it: the toggle's own
  // repricing logic ran once the real rate had finally arrived. Reacting
  // to `pricing` and `voiceEngineState` here closes that gap so the number
  // self-corrects on its own — no manual nudge needed, and rehydrated
  // sessions (which restore the engine via the raw setter, bypassing
  // setVoiceEngine's inline repricing) get the same correction.
  useEffect(() => {
    setScriptAnalysis((prev) => {
      if (!prev) return prev;
      const chars = Number((prev as any).characterCount ?? 0);
      if (!chars) return prev;
      const rate = voiceEngineState === 'elevenlabs'
        ? (pricing.elevenLabsNormal || 2.5)
        : (pricing.normal || 1.2);
      const repriced = Math.ceil(chars * rate);
      if (repriced === (prev as any).cost) return prev;
      return { ...prev, cost: repriced, originalCost: repriced } as any;
    });
  }, [pricing, voiceEngineState]);

  // The per-character rate for whichever engine is selected right now.
  // Every cost calculation in this provider goes through this, so the
  // number the user is quoted always matches the engine that will run —
  // and matches what the server independently recomputes before charging.
  const rateForEngine = useCallback((engine?: VoiceEngine) => {
    const p = pricingRef.current;
    const e = engine || voiceEngineStateRef.current;
    return e === 'elevenlabs'
      ? (p.elevenLabsNormal || 2.5)
      : (p.normal || 1.2);
  }, []);

  useEffect(() => {
    if (!database) return;
    const refPath = ref(database, 'settings/pricing');
    return onRtdbValue(refPath, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setPricing({
          normal: Number(val.studioNormal ?? 1.2),
          discounted: Number(val.studioDiscounted ?? 1.2),
          elevenLabsNormal: Number(val.elevenLabsNormal ?? 2.5),
          elevenLabsDiscounted: Number(val.elevenLabsDiscounted ?? 2.0),
        });
        if (val.charsPerMinute) {
          setCharsPerMinute(Number(val.charsPerMinute));
        }
      }
    });
  }, [database]);
  
  const queueLock = useRef(false);
  const submissionLock = useRef(false);
  const serverAnalysisUnsubscribeRef = useRef<(() => void) | null>(null);
  const serverAnalysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyExternalAnalysisRef = useRef<(rawInput: any) => boolean>(() => false);
  const wakeLockRef = useRef<any>(null);
  const isPausedRef = useRef(false);
  const stateRef = useRef<any>(null);

  useEffect(() => {
    stateRef.current = { script, characters, generatedLines, currentFastGenProjectId, projectName, cleanScript, silenceGap, hqSubmissionId, scriptAnalysis };
  }, [script, characters, generatedLines, currentFastGenProjectId, projectName, cleanScript, silenceGap, hqSubmissionId, scriptAnalysis]);

  const requestWakeLock = async () => {
    if (typeof window !== 'undefined' && 'wakeLock' in navigator) {
        try { wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (err) {
            reportClientError('src/context/studio-provider.tsx:262', err);}
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) { wakeLockRef.current.release().then(() => { wakeLockRef.current = null; }).catch((e: any) => {
        reportClientError('src/context/studio-provider.tsx:410', e); wakeLockRef.current = null; }); }
  };

  useEffect(() => {
    if (!activeUid) { setIsLoaded(true); return; }
    const rehydrate = async () => {
        // First check if there's a pending script from Script Generator
        const pendingScript = typeof window !== 'undefined' ? localStorage.getItem('studio_pending_script') : null;
        if (pendingScript) {
            setScript(pendingScript);
            setScriptState('pristine');
            localStorage.removeItem('studio_pending_script');
            setIsLoaded(true);
            return;
        }

        const db = await getDB();
        if (!db) { setIsLoaded(true); return; }
        
        const tx = db.transaction(PRODUCTION_STORE, 'readonly');
        const req = tx.objectStore(PRODUCTION_STORE).get(`production_${activeUid}`);
        req.onsuccess = async () => {
            const saved = req.result;
            if (saved) {
                setScript(saved.script || ''); setCleanScript(saved.cleanScript || ''); setProjectName(saved.projectName || '');
                setScriptState(saved.scriptState || 'pristine'); setCharacters(saved.characters || []);
                setScriptAnalysis(saved.scriptAnalysis || null); setGenerationMode(saved.generationMode || 'high-quality'); setVoiceEngineState(saved.voiceEngine || 'gemini');
                // 🔴 FIX: voicesByEngine (the per-engine voice-assignment
                // parking lot — see setVoiceEngine/handleVoiceChange) is a
                // useRef, so it lived only in memory for this component
                // instance. It correctly kept both engines' assignments
                // separate while switching back and forth WITHIN one
                // session, but was never persisted here — only `characters`
                // (i.e. whichever engine was active) was saved. Any reload,
                // re-navigation to /studio, or provider remount reset it to
                // empty, silently discarding the parked (non-active)
                // engine's assignments for good. Restoring it here, and
                // saving it below, makes that separation actually durable.
                if (saved.voicesByEngine) voicesByEngine.current = saved.voicesByEngine;
                setHqProjectId(saved.hqProjectId || null); setSilenceGap(saved.silenceGap || 800);
                setIsPaid(saved.isPaid || false); setCurrentFastGenProjectId(saved.currentFastGenProjectId || null);
                setIncludeEmotion(saved.includeEmotion || false); setGeneratedAudioUrl(saved.generatedAudioUrl || null);
                setHqSubmissionId(saved.hqSubmissionId || null);
                
                const lines: GeneratedLine[] = saved.generatedLines || [];
                const updatedLines = await Promise.all(lines.map(async (l: GeneratedLine) => {
                    const blob = await getAudioNode(l.id);
                    return blob ? { ...l, status: 'done' as const, audioDataUri: URL.createObjectURL(blob) } : l;
                }));
                setGeneratedLines(updatedLines);
            }
            setIsLoaded(true);
        };
    };
    rehydrate();
  }, [activeUid]);

  useEffect(() => {
    if (isLoaded && !isGenerating && !isAnalyzing && !isFinalizing && activeUid) {
        const saveDraft = async () => {
            const db = await getDB();
            if (!db) return;
            const tx = db.transaction(PRODUCTION_STORE, 'readwrite');
            tx.objectStore(PRODUCTION_STORE).put({
                script, cleanScript, projectName, scriptState, characters, scriptAnalysis,
                generatedLines, generationMode, voiceEngine: voiceEngineState, hqProjectId, silenceGap, isPaid,
                currentFastGenProjectId, includeEmotion, generatedAudioUrl, hqSubmissionId,
                voicesByEngine: voicesByEngine.current
            }, `production_${activeUid}`);
        };
        saveDraft();
    }
  }, [script, cleanScript, projectName, scriptState, characters, scriptAnalysis, generatedLines, generationMode, voiceEngineState, hqProjectId, silenceGap, isPaid, isGenerating, isAnalyzing, isFinalizing, isLoaded, currentFastGenProjectId, includeEmotion, generatedAudioUrl, activeUid, hqSubmissionId]);

  useEffect(() => {
    if (!database) return;
    onRtdbValue(ref(database, 'toolSettings/premium-only'), (snapshot) => { 
        const setting = snapshot.val();
        setIsPremiumOnlyMode(setting !== null && setting.locked === false); 
    });
  }, [database]);

  useEffect(() => {
    if (!database || !hqProjectId || hqProjectId === 'PENDING_SUBMISSION') return;
    // Same live progress bar for both engines — only the node differs.
    // 11.py writes the identical processed_dialogues / total_dialogues /
    // rejected_nodes fields into 11_projects that studio.py writes into
    // pending_projects, so nothing below this line needs to know which
    // engine produced the job.
    const progressNode = voiceEngineState === 'elevenlabs' ? '11_projects' : 'pending_projects';
    const progressRef = ref(database, `${progressNode}/${hqProjectId}`);
    const unsubscribe = onRtdbValue(progressRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.total_dialogues > 0) {
                setRealtimeProgress({ 
                    processed: data.processed_dialogues || 0, 
                    total: data.total_dialogues,
                    gemini_direct: data.gemini_direct_nodes || 0,
                    google_cloud_tts: data.google_cloud_tts_nodes || 0,
                    openrouter: data.openrouter_nodes || 0,
                    rejected: data.rejected_nodes || 0
                });
            }
        } else {
            setRealtimeProgress(null);
        }
    });
    return () => unsubscribe();
  }, [database, hqProjectId, voiceEngineState]);

  const hqProjectRef = useMemoFirebase(() => (!firestore || !hqProjectId || hqProjectId === 'PENDING_SUBMISSION') ? null : doc(firestore, 'projects', activeUid!, 'userProjects', hqProjectId), [firestore, hqProjectId, activeUid]);
  const { data: hqProject, isLoading: isHqProjectLoading } = useDoc<Project>(hqProjectRef);

  const checkPremiumAccess = useCallback(() => {
      if (!isPremiumOnlyMode) return true;
      const isPaidUser = user?.hasMadeFirstPurchase === true || (user?.totalInvestment || 0) > 0;
      return user?.role === 'admin' || user?.isSponsor === true || isPaidUser;
  }, [isPremiumOnlyMode, user]);

  const showPremiumBlock = () => {
      toast({
          title: 'AI Studio',
          description: 'Standard access limit reached. To continue using professional AI tools, please activate your production node with any credit pack.',
          variant: 'default',
          action: (
              <Button variant="default" size="sm" className="font-black uppercase text-[10px] tracking-widest bg-primary text-white hover:bg-primary/90" onClick={() => router.push('/buy-credits')}>
                  ACTIVATE HUB
              </Button>
          )
      });
  };

  const handleVoiceChange = (characterId: string, voiceId: string, voiceName?: string, voicePreviewUrl?: string | null) => {
      setCharacters(prev => {
          const target = prev.find(c => c.id === characterId);
          // 🔴 FIX: voicesByEngine used to only get updated at the MOMENT
          // of an engine switch (a snapshot taken then, in setVoiceEngine
          // below). Every assignment made in between switches lived only
          // in `characters` state — so a voice picked under 11Labs was
          // never actually recorded as "the 11Labs voice for this
          // character" until the NEXT switch happened to snapshot it. If
          // anything at all disrupted that one snapshot moment, the
          // assignment was gone for good, with no other record of it
          // anywhere. Recording it here too, the instant it's picked,
          // means there's no single fragile moment where losing it is
          // possible — every assignment is durable the second it's made,
          // for whichever engine is active right now.
          if (target && voiceId) {
              voicesByEngine.current[voiceEngineStateRef.current][target.name] = voiceId;
          }
          return prev.map(c => c.id === characterId ? { ...c, voice: voiceId, voiceName, voicePreviewUrl } : c);
      });
      // Bulk update pending lines
      setGeneratedLines(prev => prev.map(l => {
          const char = characters.find(c => c.id === characterId);
          if (l.characterName === char?.name && l.status === 'pending') {
              return { ...l, voiceOverride: voiceId };
          }
          return l;
      }));
  };
  
  const handleAgeChange = (characterId: string, newAge: Character['age']) => setCharacters(prev => prev.map(c => c.id === characterId ? { ...c, age: newAge } : c));

  const updateGeneratedLine = (lineId: string, updates: Partial<GeneratedLine>) => {
      setGeneratedLines(prev => {
          const next = prev.map(l => l.id === lineId ? { ...l, ...updates } : l);
          const totalChars = next.reduce((sum, l) => sum + (l.dialogue ? l.dialogue.length : 0), 0);
          const normalRate = rateForEngine();
          setScriptAnalysis(sa => sa ? {
              ...sa,
              characterCount: totalChars,
              dialogueCount: next.length,
              cost: Math.ceil(totalChars * normalRate),
              originalCost: Math.ceil(totalChars * normalRate)
          } : null);
          return next;
      });
  };

  const deleteGeneratedLine = (lineId: string) => {
      setGeneratedLines(prev => {
          const next = prev.filter(l => l.id !== lineId);
          const totalChars = next.reduce((sum, l) => sum + (l.dialogue ? l.dialogue.length : 0), 0);
          const normalRate = rateForEngine();
          setScriptAnalysis(sa => sa ? {
              ...sa,
              characterCount: totalChars,
              dialogueCount: next.length,
              cost: Math.ceil(totalChars * normalRate),
              originalCost: Math.ceil(totalChars * normalRate)
          } : null);
          return next;
      });
  };

  const addGeneratedLine = (characterName: string) => {
      const char = characters.find(c => c.name === characterName);
      const newLine: GeneratedLine = {
          id: `line-manual-${Date.now()}`,
          characterName,
          dialogue: '',
          emotion: 'Neutral',
          status: 'pending',
          voiceOverride: char?.voice
      };
      setGeneratedLines(prev => {
          const next = [...prev, newLine];
          setScriptAnalysis(sa => sa ? { ...sa, dialogueCount: next.length } : null);
          return next;
      });
  };

  const togglePause = () => {
    const newState = !isPaused;
    setIsPaused(newState);
    isPausedRef.current = newState;
    if (newState) releaseWakeLock();
  };

  const finalizeMaster = useCallback(async () => {
    if (isFinalizing || !activeUid) return;
    
    const allDone = stateRef.current.generatedLines.every((l: any) => l.status === 'done');
    if (!allDone) return;

    setIsFinalizing(true);
    setIsGenerating(false);
    try {
        const blobs = await Promise.all(stateRef.current.generatedLines.map(async (l: any) => {
            const blob = await getAudioNode(l.id);
            if (!blob) throw new Error(`Node ${l.id} missing.`);
            return blob;
        }));
        
        const merged = await mergeWavBlobs(blobs, stateRef.current.silenceGap);
        const contentType = 'audio/wav';
        
        const fileName = `master_${stateRef.current.currentFastGenProjectId}.wav`;
        const signRes = await getSignedUploadUrlAction({
            fileName,
            contentType,
            bucketType: 'private',
            folder: `fast_gen/${activeUid}`,
            userId: activeUid
        });

        if (!signRes.success || !signRes.signedUrl || !signRes.gcsPath) {
            throw new Error(signRes.error || "Failed to generate upload node.");
        }

        const storageUrl = signRes.gcsPath;
        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', signRes.signedUrl!);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(true);
                else reject(new Error(`Cloud sync failure: HTTP ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error('Network node sync timeout.'));
            xhr.send(merged);
        });
        
        const actualChars = stateRef.current.generatedLines.reduce((acc: number, l: any) => acc + l.dialogue.length, 0);

        await completeFastGenerationAction(
            activeUid!, activeUser!.name || 'User', activeUser!.email || '', 
            stateRef.current.projectName, stateRef.current.cleanScript || stateRef.current.script, 
            storageUrl, characters.map(({id, ...c}) => c), actualChars, 
            stateRef.current.currentFastGenProjectId!, false, 'Neural Node', 
            { dialogues: stateRef.current.generatedLines.map((l: any) => ({ character: l.characterName, line: l.dialogue })) }
        );

        setGeneratedAudio(merged);
        setGeneratedAudioUrl(URL.createObjectURL(merged));
    } catch (e: any) {
            reportClientError('src/context/studio-provider.tsx:507', e);
        toast({ variant: 'destructive', title: 'Finalization Failed', description: e.message });
    } finally {
        setIsFinalizing(false);
        releaseWakeLock();
    }
  }, [activeUid, activeUser, characters, toast]);

  useEffect(() => {
      if (isGenerating && !isFinalizing && generatedLines.length > 0 && (generatedLines as GeneratedLine[]).every(l => l.status === 'done')) {
          finalizeMaster();
      }
  }, [generatedLines, isGenerating, isFinalizing, finalizeMaster]);

  const processQueue = useCallback(async () => {
    if (queueLock.current || isFinalizing || !activeUid) return;

    const pending = stateRef.current.generatedLines.filter((l: any) => l.status === 'pending' || l.status === 'error');
    if (pending.length === 0) {
        if (stateRef.current.generatedLines.every((l: any) => l.status === 'done')) finalizeMaster();
        return;
    }

    queueLock.current = true;
    setIsGenerating(true);
    await requestWakeLock();

    const CONCURRENCY = 25;
    let pointer = 0;

    const worker = async () => {
        while (true) {
            if (isPausedRef.current) break;
            const line = pending[pointer++] as GeneratedLine; 
            if (!line) break;
            const cachedBlob = await getAudioNode(line.id);
            if (cachedBlob) {
                setGeneratedLines(prev => prev.map(l => l.id === line.id ? { ...l, status: 'done' as const, audioDataUri: URL.createObjectURL(cachedBlob) } : l));
                continue; 
            }
            if (!navigator.onLine) {
                setIsGenerating(false);
                queueLock.current = false;
                releaseWakeLock();
                return;
            }
            setGeneratedLines(prev => prev.map(l => l.id === line.id ? { ...l, status: 'generating' } : l));
            try {
                const char = characters.find((c: Character) => c.name === line.characterName);
                const voiceId = line.voiceOverride || char?.voice;
                if (!voiceId) throw new Error("Voice mapping failed.");
                
                const res = await generateTtsAudioAction(line.dialogue, voiceId, activeUser?.email);
                if (res.success && res.audioDataUri) {
                    const audioRes = await fetch(res.audioDataUri);
                    const blob = await audioRes.blob();
                    await saveAudioNode(line.id, blob);
                    setGeneratedLines(prev => prev.map(l => l.id === line.id ? { ...l, status: 'done' as const, audioDataUri: URL.createObjectURL(blob) } : l));
                } else throw new Error(res.error);
            } catch (e: any) {
            reportClientError('src/context/studio-provider.tsx:566', e);
                setGeneratedLines(prev => prev.map(l => l.id === line.id ? { ...l, status: 'error', error: e.message } : l));
            } finally {
                const current = stateRef.current.generatedLines;
                setGenerationProgress((current.filter((l: GeneratedLine) => l.status === 'done').length / current.length) * 100);
            }
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    queueLock.current = false;
    if (stateRef.current.generatedLines.every((l: GeneratedLine) => l.status === 'done')) finalizeMaster();
    else if (isPausedRef.current) setIsGenerating(false);
  }, [activeUid, characters, activeUser?.email, isFinalizing, finalizeMaster]);

  const clearStudioState = useCallback(async () => {
    await deleteCurrentDB();
    setScript(''); setCleanScript(''); setProjectName(''); setCharacters([]); setGeneratedLines([]); setGeneratedAudio(null); setGeneratedAudioUrl(null); setScriptState('pristine'); setScriptAnalysis(null); setIsPaid(false); setHqProjectId(null); setHqSubmissionId(null); setIsPaused(false); isPausedRef.current = false; setSelectedGenre('moral');
    releaseWakeLock();
  }, [activeUid]);

  const handleGeneration = async (options?: { forceLocalFinalize?: boolean }) => {
    if (submissionLock.current || !activeUser || !scriptAnalysis || !activeUid || !currentFastGenProjectId) return;
    if (!checkPremiumAccess()) { showPremiumBlock(); return; }
    if (options?.forceLocalFinalize) { await finalizeMaster(); return; }
    if (isPaused) { togglePause(); return; }

    submissionLock.current = true;
    const clientTimestamp = new Date().toISOString();
    
    if (generationMode === 'high-quality') {
        setIsGenerating(true);
        setHqProjectId('PENDING_SUBMISSION'); 
    } else {
        setIsGenerating(true); 
    }

    try {
        if (generationMode === 'high-quality') {
            // 🔴 FIX: this used to read `voiceEngineState` directly here.
            // That's normally fine, but `voiceEngineStateRef` exists
            // precisely because closures around async submission handlers
            // are exactly where a state value can end up stale (see its
            // own comment above, and rateForEngine's use of the same ref).
            // Reading the ref here instead guarantees the engine actually
            // submitted is whatever the toggle showed at the moment Start
            // was pressed — not whatever `voiceEngineState` happened to be
            // captured as when this closure was created. This is the fix
            // for "I was on Gemini but the audio came out in an 11Labs
            // voice" — the mismatch was between what the UI showed and
            // what actually got submitted with the job.
            const submittedEngine = voiceEngineStateRef.current;
            // 🔴 Safety net: if this is a Gemini submission, make sure
            // every assigned voice id is actually a known Gemini voice.
            // A stray ElevenLabs id (20-char hash, not in the Gemini list)
            // slipping through here — from a leftover assignment, a race
            // in the engine-switch parking logic, anything — is exactly
            // how "I was on Gemini but the audio came out in an 11Labs
            // voice" happens: the job gets correctly queued to the Gemini
            // worker, but with a voice id Gemini doesn't recognize as its
            // own, and studio.py doesn't reject those, it just synthesizes
            // with whatever string it's given. Catch it here instead,
            // before any credits are spent or a job is queued.
            if (submittedEngine === 'gemini') {
                const knownGeminiIds = new Set(voices.map(v => v.id));
                // 🔴 FIX: this used to only catch `c.voice && !knownGeminiIds.has(...)`
                // — a truthy voice from the wrong library. An EMPTY voice
                // (`c.voice === ''`) slipped straight through that guard
                // because `c.voice &&` is false for it, so it was never
                // flagged as "mismatched". studio.py then silently
                // resynthesizes that character in the Narrator's voice
                // (voice_map.get(name) or voice_map.get("narrator")) instead
                // of erroring — the job "succeeds" but nobody actually
                // picked that character's voice. Checking `!c.voice` here
                // catches it before any credits are spent.
                const mismatched = characters.filter(c => !c.voice || !knownGeminiIds.has(c.voice));
                if (mismatched.length > 0) {
                    setIsGenerating(false);
                    setHqProjectId(null);
                    submissionLock.current = false;
                    toast({
                        variant: 'destructive',
                        title: 'Voice/Engine Mismatch',
                        description: `${mismatched.map(c => c.name).join(', ')} ${mismatched.length > 1 ? 'have' : 'has'} no voice, or a voice not from the Gemini library. Reassign ${mismatched.length > 1 ? 'their voices' : 'a voice'} before generating.`
                    });
                    return;
                }
            } else if (submittedEngine === 'elevenlabs') {
                // 🔴 Same safety net as the Gemini branch above, for the
                // other engine: script analysis deliberately leaves 11Labs
                // characters unassigned (see getRandomVoiceId) so the user
                // picks from the ElevenLabs library themselves. If one was
                // never picked, 11.py's per-line fallback
                // (voice_map.get(character) or fallback_voice_id or ...)
                // silently reuses another character's voice instead of
                // erroring — catch the missing assignment here instead.
                const missing = characters.filter(c => !c.voice);
                if (missing.length > 0) {
                    setIsGenerating(false);
                    setHqProjectId(null);
                    submissionLock.current = false;
                    toast({
                        variant: 'destructive',
                        title: 'Voice Not Assigned',
                        description: `${missing.map(c => c.name).join(', ')} ${missing.length > 1 ? "don't" : "doesn't"} have an 11Labs voice assigned. Pick ${missing.length > 1 ? 'voices' : 'a voice'} for ${missing.length > 1 ? 'them' : 'it'} before generating.`
                    });
                    return;
                }
            }
            const res = await processHighQualityGenerationAndDeductCredits(
              activeUid, 
              activeUser.name || 'User', 
              activeUser.email || '', 
              projectName, 
              cleanScript || script, 
              characters.map(({ id, ...c }) => c), 
              (activeUser as any).totalInvestment || 0, 
              scriptAnalysis.characterCount,
              { 
                dialogues: generatedLines.map(l => ({ character: l.characterName, line: l.dialogue, emotion: l.emotion })),
                clientTimestamp: clientTimestamp,
                genre: selectedGenre,
                genere: selectedGenre
              }, 
              hqSubmissionId || undefined,
              scriptAnalysis.cost,
              submittedEngine
            );
            
            if (res.success && res.projectId) { 
                if (res.newCredits !== undefined) setUser({ ...user, credits: res.newCredits } as any); 
                setHqProjectId(res.projectId); 
                
                setScript('');
                setCleanScript('');
                setCharacters([]);
                setGeneratedLines([]);
                setScriptState('pristine');
                setScriptAnalysis(null);
                setIsPaid(false);
                setHqSubmissionId(null);

            } else {
                setHqProjectId(null);
                setIsGenerating(false);
                throw new Error(res.error);
            }
        } else {
            if (!isPaid) {
                const actualChars = generatedLines.reduce((acc: number, l: any) => acc + l.dialogue.length, 0);
                const normalRate = rateForEngine();
                const fastGenCost = Math.ceil(actualChars * normalRate);
                const res = await deductFastGenCreditsAction(activeUid, actualChars, projectName || 'Production', currentFastGenProjectId, fastGenCost);
                if (!res.success) {
                    setIsGenerating(false);
                    throw new Error(res.error);
                }
                if (res.newCredits !== undefined) setUser({ ...user, credits: res.newCredits } as any);
                setIsPaid(true);
            }
            processQueue();
        }
    } catch (e: any) {
            reportClientError('src/context/studio-provider.tsx:656', e);
        setIsGenerating(false);
        // 🔴 FIX: a thrown exception here (network error, timeout, etc. —
        // as opposed to a `{success:false}` response, which already clears
        // this above) used to leave hqProjectId stuck at 'PENDING_SUBMISSION'
        // forever. That value is truthy, gets persisted to IndexedDB on the
        // next save-draft pass, and is rehydrated on every future visit —
        // so isHqActive stayed true permanently, hiding both ScriptEditor
        // and CharacterAssignments on /studio until the user happened to
        // hit "Start New". Clear it here so a failed submission actually
        // resets, instead of only a cleanly-rejected one.
        if (hqProjectId === 'PENDING_SUBMISSION') setHqProjectId(null);
        toast({ variant: 'destructive', title: 'Engine Error', description: e.message });
    }
    finally {
        submissionLock.current = false;
    }
  };

  const analyzeScript = async () => {
    if (isAnalyzing || !script.trim() || !activeUid || !database) return;
    if (!checkPremiumAccess()) { showPremiumBlock(); return; }

    const charCount = script.trim().length;
    const userCredits = Number((user as any)?.credits ?? (activeUser as any)?.credits ?? 0);
    const isSponsorOrAdmin = (user as any)?.isSponsor === true || (user as any)?.role === 'admin';

    if (!isSponsorOrAdmin && userCredits < charCount) {
      toast({
        variant: 'destructive',
        title: 'Not Enough Credits',
        description: `Script requires ${charCount.toLocaleString()} credits, but you only have ${userCredits.toLocaleString()} credits.`
      });
      return;
    }

    // 🔴 FIX: past the daily free limit, analysis isn't blocked anymore —
    // it becomes a paid action (300 credits, charged server-side in
    // analyzeScriptStudio). This used to `return` here and never even
    // call the server, so the paid-overflow path could never run. Now it
    // just tells the user it'll cost credits and lets the request
    // through; the server is the one place that actually checks the
    // balance and charges it.
    if (!isSponsorOrAdmin && dailyAnalysisCount >= maxDailyAnalysisLimit) {
      toast({
        title: 'Daily Free Limit Reached — This One Costs Credits',
        description: `You've used your free analyses for today (${dailyAnalysisCount}/${maxDailyAnalysisLimit}). This analysis will cost 300 credits.`
      });
    }

    setIsAnalyzing(true);
    
    // ⚡ INSTANT SMART JS PARSER: Check if script is already pre-formatted with "Character: [emotion] Dialogue" or "Character: Dialogue"
    const isAlreadyFormattedScript = (rawText: string): boolean => {
      const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (rawLines.length === 0) return false;
      let matchedCount = 0;
      for (const line of rawLines) {
        if (line.startsWith('//') || line.startsWith('#') || line.startsWith('---') || line.startsWith('===')) continue;
        let colonIdx = line.indexOf(':');
        if (colonIdx === -1) colonIdx = line.indexOf('：');
        const dashIdx = line.indexOf(' - ');
        if ((colonIdx > 0 && colonIdx < 80) || (dashIdx > 0 && dashIdx < 80)) {
          matchedCount++;
        }
      }
      return matchedCount >= 1 && (matchedCount / rawLines.length) >= 0.6;
    };

    // Server mode must always submit to the HQ queue, even when the script
    // already looks formatted. The local shortcut is only for realtime mode.
    if (analysisExecutionMode !== 'server' && isAlreadyFormattedScript(script)) {
      // Show smooth scanning animation for 1.2s to 1.8s then instantly apply parsed script directly via JS
      setTimeout(() => {
        const success = applyExternalAnalysis(script);
        setIsAnalyzing(false);
        if (success) {
          toast({ title: 'Script Analyzed', description: 'Manuscript recognized and characters mapped instantly.' });
        }
      }, 1400);
      return;
    }
    
    if (analysisExecutionMode === 'server') {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const jobRef = ref(database, `pending_script_analysis/${activeUid}/${jobId}`);
        
        try {
            await rtdbSet(jobRef, {
                userId: activeUid,
                jobId,
                script,
                includeEmotion,
                status: 'pending',
                timestamp: Date.now(),
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
            });
            // Persist the queue identity before waiting. A refresh or temporary
            // network drop can now reattach to this same job instead of charging
            // and submitting the manuscript again.
            localStorage.setItem(`${ACTIVE_ANALYSIS_JOB_KEY}:${activeUid}`, JSON.stringify({
                jobId,
                scriptHash: `${script.length}:${script.slice(0, 32)}`,
                createdAt: Date.now()
            }));

            const unsubscribe = onRtdbValue(jobRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    console.log("[StudioProvider] Server Queue Update:", data.status, data);

                    if (data.status === 'ok') {
                        unsubscribe();
                        clearTimeout(timeoutId);
                        localStorage.removeItem(`${ACTIVE_ANALYSIS_JOB_KEY}:${activeUid}`);
                        if (data.analysis) {
                            applyExternalAnalysis(data.analysis);
                        } else if (Array.isArray(data.lines) && Array.isArray(data.characters)) {
                            // HQ worker returns the addEmotion=true shape:
                            // { characters, lines, stats }. The existing
                            // normalizer already accepts this shape.
                            applyExternalAnalysis(data);
                        } else if (data.fullText) {
                            applyExternalAnalysis(data.fullText);
                        } else {
                            console.error("[StudioProvider] Malformed Success Data:", data);
                            toast({ variant: 'destructive', title: 'Analysis Malformed', description: 'Server returned success but no data payload.' });
                        }
                        setIsAnalyzing(false);
                    } else if (data.status === 'error') {
                        unsubscribe();
                        clearTimeout(timeoutId);
                        localStorage.removeItem(`${ACTIVE_ANALYSIS_JOB_KEY}:${activeUid}`);
                        setIsAnalyzing(false);
                        console.error("[StudioProvider] HQ Cluster Process Error:", data.error, data);
                        toast({ 
                            variant: 'destructive', 
                            title: 'Server Engine Error', 
                            description: data.error || 'The HQ Cluster failed to process this manuscript. Check server logs.' 
                        });
                    }
                }
            }, (error) => {
                console.error("[StudioProvider] RTDB Subscription Error:", error);
                toast({ variant: 'destructive', title: 'Sync Error', description: error.message });
            });

            // Set a timeout just in case the server hangs
            const timeoutId = setTimeout(() => {
                // Keep the RTDB listener alive: the worker may still finish
                // after the UI timeout, and if it does, the handler above
                // still applies the result. But DROP the saved job id — the
                // user was stuck on a spinner and is about to retry, and a
                // saved id would make the next page load silently reattach
                // to this same dead job and wait all over again (that loop
                // is exactly what users were complaining about). A retry
                // should start clean.
                localStorage.removeItem(`${ACTIVE_ANALYSIS_JOB_KEY}:${activeUid}`);
                setIsAnalyzing(prev => {
                    if (prev) {
                        toast({ variant: 'destructive', title: 'Analysis Timed Out', description: 'The server did not respond in time. Please press Analyze to try again.' });
                        return false;
                    }
                    return prev;
                });
            }, SERVER_ANALYSIS_TIMEOUT_MS);

        } catch (e: any) {
        reportClientError('src/context/studio-provider.tsx:1064', e);
            console.error("[StudioProvider] Queue Write Error:", e);
            setIsAnalyzing(false);
            toast({ variant: 'destructive', title: 'Queue Failure', description: e.message });
        }
        return;
    }

    try {
        const result = await analyzeScriptStudio({ script, userId: activeUid, userEmail: activeUser?.email || undefined, includeEmotion });
        const timestamp = Date.now();

        // 🔴 NEW: this analysis went over the daily free limit and was
        // charged 300 credits server-side — reflect that in the local
        // credit balance immediately instead of waiting for the next
        // full user-profile refresh, and let the user know it happened.
        if (result.creditsCharged > 0) {
            setUser((prev: any) => prev ? { ...prev, credits: Math.max(0, Number(prev.credits || 0) - result.creditsCharged) } : prev);
            toast({
                title: 'Analysis Charged',
                description: `${result.creditsCharged} credits used for this analysis (daily free limit reached).`
            });
        }
        
        // 🧪 PRE-POPULATE LINES IN DRAFT MODE
        const lines: GeneratedLine[] = result.lines.map((l: any, i: number) => ({ 
            id: `line-${i}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`, 
            characterName: l.character, 
            dialogue: l.text, 
            emotion: l.emotion || 'Neutral',
            status: 'pending' as const 
        }));
        
        const formatCleanLine = (char: string, emotion: string | undefined, text: string) => {
            const emo = (emotion || '').trim();
            if (emo && emo.toLowerCase() !== 'neutral') {
                return `${char}: [ ${emo.toLowerCase()} ] ${text}`;
            }
            return `${char}: ${text}`;
        };

        const totalDialogueChars = result.lines.reduce((acc: number, l: any) => acc + l.text.length, 0);
        setCleanScript(result.lines.map((l: any) => formatCleanLine(l.character, l.emotion, l.text)).join('\n\n'));
        
        // 🔴 FIX: two issues here.
        // 1. If `voices` (the Gemini prebuilt list) hadn't finished loading
        //    yet when analysis completed, `voices[0]` was `undefined` and
        //    `.id` on it threw — silently failing this character's
        //    auto-assign (caught elsewhere) and leaving "Assign a
        //    voice..." blank, which is what looked like auto-assignment
        //    having been "deleted".
        // 2. This only ever knows about Gemini voices — if the engine is
        //    'elevenlabs' when analysis runs, it would still stuff a
        //    Gemini voice id into `char.voice`, which means nothing to
        //    11Labs. Skipping auto-assign for 11Labs (leaving it blank
        //    for the user to explicitly pick from the ElevenLabs library)
        //    is what actually prevents the two engines' voice ids from
        //    ever colliding, by construction.
        const getRandomVoiceId = (aiGender: string) => {
            if (voiceEngineStateRef.current === 'elevenlabs') return '';
            if (!voices || voices.length === 0) return '';

            const g = (aiGender || '').toLowerCase().trim();
            let target: 'Male' | 'Female' = 'Female';
            if (g === 'male' || g === 'boy') target = 'Male';
            else if (g === 'female' || g === 'girl') target = 'Female';
            
            const filtered = voices.filter(v => v.gender === target && !v.disabled);
            if (filtered.length === 0) {
                const fallback = voices.find(v => !v.disabled) || voices[0];
                return fallback?.id || '';
            }
            return filtered[Math.floor(Math.random() * filtered.length)].id;
        };

        const charList: Character[] = result.characters.map((char: any, i: number) => {
            return { 
                id: `char-${i}`, 
                name: char.name, 
                gender: char.gender as any, 
                emotion: char.emotion || 'Neutral', 
                voice: getRandomVoiceId(char.gender), 
                age: 'Adult' as const, 
                dialogueCount: char.dialogueCount || 0 
            };
        });

        // Sync voices to lines
        const linesWithVoices = lines.map((l: GeneratedLine) => {
            const char = charList.find((c: Character) => c.name === l.characterName);
            return { ...l, voiceOverride: char?.voice };
        });

        setCharacters(charList);
        setGeneratedLines(linesWithVoices);
        const normalRate = rateForEngine();
        const calcCost = Math.ceil(totalDialogueChars * normalRate);
        const origCost = calcCost;
        setScriptAnalysis({ 
            characterCount: totalDialogueChars, 
            dialogueCount: result.lines.length, 
            cost: calcCost,
            originalCost: origCost,
        });
        setScriptState('valid'); setIsPaid(false); setCurrentFastGenProjectId(`FG_${generateShortId()}`);
        setHqSubmissionId(`HQ_${generateShortId()}_${timestamp}`); 
        logSummaryEvent('normalScriptAnalysis').catch((e: any) => { reportClientError('src/context/studio-provider.tsx:1172', e); return null; }); 
        
        if (!projectName.trim()) setProjectName(`Studio-${new Date().toLocaleDateString()}`);
    } catch (e: any) {
            reportClientError('src/context/studio-provider.tsx:882', e); toast({ variant: 'destructive', title: 'Analysis Error', description: e.message }); }
    finally { setIsAnalyzing(false); }
  };

  const applyExternalAnalysis = (rawInput: any): boolean => {
    try {
      let rawLines: any[] = [];
      let rawChars: any[] = [];
      let isParsedFromJson = false;

      // 1. Try parsing JSON first
      if (typeof rawInput === 'object' && rawInput !== null) {
        rawLines = rawInput.dialogues || rawInput.lines || rawInput.dialogue_list || [];
        rawChars = rawInput.characters || rawInput.character_list || [];
        isParsedFromJson = true;
      } else if (typeof rawInput === 'string') {
        const trimmed = rawInput.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('```json')) {
          try {
            const cleanJson = trimmed.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            rawLines = parsed.dialogues || parsed.lines || parsed.dialogue_list || (Array.isArray(parsed) ? parsed : []);
            rawChars = parsed.characters || parsed.character_list || [];
            isParsedFromJson = true;
          } catch (jsonErr) {
            reportClientError('src/context/studio-provider.tsx:906', jsonErr);
            isParsedFromJson = false;
          }
        }
      }

      // 2. If not JSON, perform JS line-by-line parsing on plain text
      if (!isParsedFromJson) {
        const textContent = String(rawInput);
        const splitLines = textContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        if (splitLines.length === 0) {
          toast({ variant: 'destructive', title: 'Empty Script', description: 'The provided script file is empty.' });
          return false;
        }

        const extractedDialogues: { character: string; text: string; emotion?: string }[] = [];

        for (let i = 0; i < splitLines.length; i++) {
          const rawLine = splitLines[i];
          // Strip markdown formatting like bold/italics and zero-width spaces
          const line = rawLine.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\*\*/g, '').replace(/__/g, '').trim();

          // Ignore comments, headers, dividers or prompt instructions
          if (
            line.startsWith('//') || 
            line.startsWith('#') || 
            line.startsWith('---') || 
            line.startsWith('===') ||
            line.toLowerCase().includes('you are a professional script formatter') ||
            line.toLowerCase().includes('paste your story') ||
            line.toLowerCase().includes('formatting instructions')
          ) {
            continue;
          }

          let charName = '';
          let dialogueText = '';
          let emotion = 'Neutral';

          // Support both ":" (colon), "：" (full-width colon), and " - " as delimiters
          let colonIdx = line.indexOf(':');
          if (colonIdx === -1) colonIdx = line.indexOf('：');
          const dashIdx = line.indexOf(' - ');

          if (colonIdx > 0 && colonIdx < 100) {
            charName = line.substring(0, colonIdx).trim().replace(/^\[|\]$/g, '');
            dialogueText = line.substring(colonIdx + 1).trim();
          } else if (dashIdx > 0 && dashIdx < 100) {
            charName = line.substring(0, dashIdx).trim().replace(/^\[|\]$/g, '');
            dialogueText = line.substring(dashIdx + 3).trim();
          }

          // Extract emotion if enclosed in parentheses or brackets e.g. "John (Happy)" or "John [Happy]"
          if (charName) {
            const emotionMatch = charName.match(/^([^\(\)\[\]]+)\s*[\(\[]([^\)\]]+)[\)\]]$/);
            if (emotionMatch) {
              charName = emotionMatch[1].trim();
              emotion = emotionMatch[2].trim();
            }
          }

          // Extract emotion after colon if enclosed in brackets/parentheses e.g. "कबीर:[ emotional ] dialogue" or "Vikram: [Angry] dialogue"
          if (dialogueText) {
            const emotionMatchText = dialogueText.match(/^[\(\[]([^\)\]]+)[\)\]]\s*(.*)$/);
            if (emotionMatchText) {
              emotion = emotionMatchText[1].trim();
              dialogueText = emotionMatchText[2].trim();
            }
          }

          if (charName && dialogueText) {
            extractedDialogues.push({
              character: charName,
              text: dialogueText,
              emotion: emotion
            });
          } else if (extractedDialogues.length > 0 && line.length > 0) {
            // Multiline continuation: append line to previous character's dialogue
            extractedDialogues[extractedDialogues.length - 1].text += ' ' + line;
          }
        }

        if (extractedDialogues.length === 0) {
          toast({ 
            variant: 'destructive', 
            title: 'No Dialogues Found', 
            description: 'Could not detect any "Character Name: Dialogue" lines in your script. Please ensure lines follow "Character: Dialogue".' 
          });
          return false;
        }

        rawLines = extractedDialogues;
      }

      if (!Array.isArray(rawLines) || rawLines.length === 0) {
        toast({ variant: 'destructive', title: 'Invalid Script Format', description: 'Could not extract valid dialogues from input.' });
        return false;
      }

      const timestamp = Date.now();
      const lines: GeneratedLine[] = rawLines.map((l: any, i: number) => {
        const charName = (l.character || l.characterName || l.speaker || 'Narrator').trim();
        const textStr = (l.text || l.dialogue || l.line || '').trim();
        const emotionStr = l.emotion || 'Neutral';
        return {
          id: `line-${i}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          characterName: charName,
          dialogue: textStr,
          emotion: emotionStr,
          status: 'pending' as const
        };
      });

      const totalDialogueChars = lines.reduce((acc, l) => acc + l.dialogue.length, 0);

      const formatCleanLine = (char: string, emotion: string | undefined, text: string) => {
        const emo = (emotion || '').trim();
        if (emo && emo.toLowerCase() !== 'neutral') {
          return `${char}: [ ${emo.toLowerCase()} ] ${text}`;
        }
        return `${char}: ${text}`;
      };

      setCleanScript(lines.map(l => formatCleanLine(l.characterName, l.emotion, l.dialogue)).join('\n\n'));
      if (!script.trim()) {
        setScript(lines.map(l => formatCleanLine(l.characterName, l.emotion, l.dialogue)).join('\n\n'));
      }

      // 🔴 FIX: same robustness + engine-awareness as the other
      // getRandomVoiceId above — see that comment for why.
      const getRandomVoiceId = (aiGender: string) => {
        if (voiceEngineStateRef.current === 'elevenlabs') return '';
        if (!voices || voices.length === 0) return '';

        const g = (aiGender || '').toLowerCase().trim();
        let target: 'Male' | 'Female' = 'Female';
        if (g === 'male' || g === 'boy') target = 'Male';
        else if (g === 'female' || g === 'girl') target = 'Female';
        
        const filtered = voices.filter(v => v.gender === target && !v.disabled);
        if (filtered.length === 0) {
            const fallback = voices.find(v => !v.disabled) || voices[0];
            return fallback?.id || '';
        }
        return filtered[Math.floor(Math.random() * filtered.length)].id;
      };

      let charList: Character[] = [];
      if (Array.isArray(rawChars) && rawChars.length > 0) {
        charList = rawChars.map((char: any, i: number) => {
          const name = (char.name || char.character || `Char ${i+1}`).trim();
          const gender = (char.gender || 'male').toLowerCase() === 'female' ? 'Female' : 'Male';
          const age = (char.ageGroup || char.age || 'Adult').toString();
          const mappedAge = age.toLowerCase().includes('kid') ? 'Kid' : age.toLowerCase().includes('old') ? 'Old' : 'Adult';
          return {
            id: `char-${i}`,
            name,
            gender,
            emotion: 'Neutral',
            voice: getRandomVoiceId(gender),
            age: mappedAge as any,
            dialogueCount: lines.filter(l => l.characterName.toLowerCase() === name.toLowerCase()).length
          };
        });
      } else {
        const uniqueNames = Array.from(new Set(lines.map(l => l.characterName)));
        const femaleKeywords = ['रानी', 'रेशमा', 'सीता', 'गीता', 'पद्मावती', 'महिला', 'लड़की', 'स्त्री', 'देवी', 'माता', 'बहन', 'पुत्री', 'माधवी', 'अदिति', 'प्रियंका', 'पूजा', 'queen', 'mrs', 'lady', 'woman', 'girl', 'female', 'she', 'her', 'mother', 'sister', 'daughter', 'princess'];

        charList = uniqueNames.map((name, i) => {
          const lowerName = name.toLowerCase();
          const isFemale = femaleKeywords.some(kw => lowerName.includes(kw));
          const gender: 'Male' | 'Female' = isFemale ? 'Female' : 'Male';

          return {
            id: `char-${i}`,
            name,
            gender,
            emotion: 'Neutral',
            voice: getRandomVoiceId(gender),
            age: 'Adult' as const,
            dialogueCount: lines.filter(l => l.characterName === name).length
          };
        });
      }

      const linesWithVoices = lines.map((l: GeneratedLine) => {
        const char = charList.find((c: Character) => c.name.toLowerCase() === l.characterName.toLowerCase());
        return { ...l, voiceOverride: char?.voice };
      });

      const normalRate = rateForEngine();
      const originalCost = Math.ceil(totalDialogueChars * normalRate);

      setCharacters(charList);
      setGeneratedLines(linesWithVoices);
      setScriptAnalysis({
        characterCount: totalDialogueChars,
        dialogueCount: lines.length,
        cost: originalCost
      });
      setScriptState('valid');
      setIsPaid(false);
      setCurrentFastGenProjectId(`FG_${generateShortId()}`);
      setHqSubmissionId(`HQ_${generateShortId()}_${timestamp}`);
      logSummaryEvent('normalScriptAnalysis').catch((e: any) => { reportClientError('src/context/studio-provider.tsx:1406', e); return null; });

      if (!projectName.trim()) setProjectName(`Studio-${new Date().toLocaleDateString()}`);

      return true;
    } catch (e: any) {
            reportClientError('src/context/studio-provider.tsx:1111', e);
      toast({
        variant: 'destructive',
        title: 'Analysis Failed',
        description: e.message || 'Please ensure you provided a valid formatted script.'
      });
      return false;
    }
  };
  applyExternalAnalysisRef.current = applyExternalAnalysis;

  // Reattach to a queue job after a page refresh. The job remains in RTDB, so
  // the client must not start a second analysis just because its UI restarted.
  useEffect(() => {
    if (!database || !activeUid || analysisExecutionMode !== 'server' || typeof window === 'undefined') return;

    const storageKey = `${ACTIVE_ANALYSIS_JOB_KEY}:${activeUid}`;
    const savedJob = localStorage.getItem(storageKey);
    if (!savedJob) return;

    let job: { jobId?: string; scriptHash?: string; createdAt?: number } | null = null;
    try { job = JSON.parse(savedJob); } catch (e) {
            reportClientError('src/context/studio-provider.tsx:1132', e); localStorage.removeItem(storageKey); return; }
    if (!job?.jobId) { localStorage.removeItem(storageKey); return; }

    // Give up on jobs the backend never finished instead of resubscribing
    // forever. No job's own createdAt (older saved shape) is treated the
    // same as "too old" — safest default. This is a pure local-clock check,
    // it does not cost an extra RTDB read.
    const jobAgeMs = Date.now() - (job.createdAt || 0);
    if (!job.createdAt || jobAgeMs > MAX_RESUMABLE_JOB_AGE_MS) {
      localStorage.removeItem(storageKey);
      // Best-effort single write so the stuck node moves to a terminal
      // status and the existing /admin/cleanup-old-jobs sweep can reap it
      // later. One write, only on this rare abandonment path — not a loop.
      try {
        rtdbUpdate(ref(database, `pending_script_analysis/${activeUid}/${job.jobId}`), {
          status: 'error',
          error: 'Abandoned by client: exceeded resumable job age.'
        });
      } catch (e) {
        reportClientError('src/context/studio-provider.tsx:1450', e); /* best-effort only */ }
      toast({
        variant: 'destructive',
        title: 'Previous Analysis Timed Out',
        description: 'Your last script analysis never completed. Please press Analyze to try again.'
      });
      return;
    }

    const jobRef = ref(database, `pending_script_analysis/${activeUid}/${job.jobId}`);
    setIsAnalyzing(true);
    const unsubscribe = onRtdbValue(jobRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.val();
      if (data.status === 'ok') {
        unsubscribe();
        if (serverAnalysisTimeoutRef.current) clearTimeout(serverAnalysisTimeoutRef.current);
        localStorage.removeItem(storageKey);
        if (data.analysis) applyExternalAnalysisRef.current(data.analysis);
        else if (Array.isArray(data.lines) && Array.isArray(data.characters)) applyExternalAnalysisRef.current(data);
        else if (data.fullText) applyExternalAnalysisRef.current(data.fullText);
        else toast({ variant: 'destructive', title: 'Analysis Malformed', description: 'Server returned success but no analysis payload.' });
        setIsAnalyzing(false);
      } else if (data.status === 'error') {
        unsubscribe();
        if (serverAnalysisTimeoutRef.current) clearTimeout(serverAnalysisTimeoutRef.current);
        localStorage.removeItem(storageKey);
        setIsAnalyzing(false);
        toast({ variant: 'destructive', title: 'Server Engine Error', description: data.error || 'The server failed to process this manuscript.' });
      }
    }, (error) => {
      console.error('[StudioProvider] Resume subscription error:', error);
    });

    serverAnalysisUnsubscribeRef.current = unsubscribe;
    serverAnalysisTimeoutRef.current = setTimeout(() => {
      // Drop the saved job here too. This is the resume path — we already
      // waited once on this job and it still hasn't finished, so keeping
      // the id only guarantees the next page load waits another 3 minutes
      // on the same dead job. The listener above stays attached for this
      // session in case it does land, but a fresh Analyze starts clean.
      localStorage.removeItem(storageKey);
      setIsAnalyzing(false);
      toast({ variant: 'destructive', title: 'Analysis Timed Out', description: 'Your previous analysis did not finish. Please press Analyze to try again.' });
    }, SERVER_ANALYSIS_TIMEOUT_MS);

    return () => {
      unsubscribe();
      if (serverAnalysisTimeoutRef.current) clearTimeout(serverAnalysisTimeoutRef.current);
      serverAnalysisUnsubscribeRef.current = null;
    };
  }, [database, activeUid, analysisExecutionMode, toast]);

  const retryLineGeneration = async (lineId: string, updatedText?: string, updatedVoiceId?: string, updatedEmotion?: string) => {
    const idx = generatedLines.findIndex(l => l.id === lineId); if (idx === -1) return;
    const line = generatedLines[idx];
    const char = characters.find((c: Character) => c.name === line.characterName);
    const voiceId = updatedVoiceId || line.voiceOverride || char?.voice;
    const textToGen = updatedText || line.dialogue;
    const emotionToGen = updatedEmotion || line.emotion || 'Neutral';

    if (!voiceId) return;

    // If it was already done, it costs credits to regenerate
    const needsDeduction = line.status === 'done';

    // 🔴 FIX: this single-line resync path (Fast-Gen's Gemini TTS call)
    // has no structured emotion/style parameter — unlike the HQ/11Labs job
    // payload, which sends `emotion` as its own field per dialogue. Fold it
    // into the prompt itself using the same "[Emotion] text" bracket
    // convention the script parser already understands elsewhere in this
    // file, instead of silently dropping whatever the user picked.
    const promptWithEmotion = emotionToGen && emotionToGen !== 'Neutral' ? `[${emotionToGen}] ${textToGen}` : textToGen;

    setGeneratedLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'generating' } : l));
    try {
        let result;
        if (needsDeduction) {
            const res = await (import('@/app/studio/actions').then(m => m.regenerateLineWithCreditsAction(activeUid!, promptWithEmotion, voiceId)));
            if (res.success && res.audioDataUri) {
                result = { success: true, audioDataUri: res.audioDataUri };
                if (res.newCredits !== undefined) setUser({ ...user, credits: res.newCredits } as any);
            } else throw new Error(res.error);
        } else {
            result = await generateTtsAudioAction(promptWithEmotion, voiceId, activeUser?.email);
        }

        if (result.success && result.audioDataUri) {
            const audioRes = await fetch(result.audioDataUri);
            const blob = await audioRes.blob();
            await saveAudioNode(lineId, blob);
            setGeneratedLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'done' as const, audioDataUri: URL.createObjectURL(blob), dialogue: textToGen, voiceOverride: voiceId, emotion: emotionToGen } : l));
        } else throw new Error(result.error);
    } catch (e: any) {
            reportClientError('src/context/studio-provider.tsx:1206', e);
        setGeneratedLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'error', error: e.message } : l));
    }
  };

  return (
    <StudioContext.Provider value={{
      script, setScript, cleanScript, setCleanScript, projectName, setProjectName, scriptState, characters,
      isAnalyzing, analysisStatus: '', scriptAnalysis, isGenerating, generationProgress,
      generationMode, setGenerationMode, voiceEngine: voiceEngineState, setVoiceEngine, silenceGap, isFinalizing, generatedAudio, generatedAudioUrl, generatedAudioBlob: generatedAudio,
      generatedLines, updateGeneratedLine, deleteGeneratedLine, addGeneratedLine, retryLineGeneration, generationStatusMessage: '',
      isPaused, isFlying, isPremiumOnlyMode, isCheckingUsage,
      includeEmotion, setIncludeEmotion, hqProject: hqProject || null, isHqProjectLoading, 
      analyzeScript, applyExternalAnalysis, handleVoiceChange, handleAgeChange, clearStudioState, handleGeneration, togglePause,
      checkPremiumAccess: () => true, 
      showPremiumBlock, requestPushSubscription: () => requestPushSubscription(user, database, toast),
      hqProjectId, hqSubmissionId, realtimeProgress, pricing, charsPerMinute,
      activeRate: voiceEngineState === 'elevenlabs'
        ? (pricing.elevenLabsNormal || 2.5)
        : (pricing.normal || 1.2),
      dailyAnalysisCount, maxDailyAnalysisLimit,
      selectedGenre, setSelectedGenre
    }}>{children}</StudioContext.Provider>
  );
}

export const useStudio = () => {
  const context = useContext(StudioContext);
  if (context === undefined) throw new Error('useStudio must be within a StudioProvider');
  return context;
};
