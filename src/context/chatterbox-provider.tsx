'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import type { Character, ScriptAnalysis, GeneratedLine } from '@/lib/types';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, set as rtdbSet, remove, get } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { analyzeScriptStudio } from '@/ai/flows/analyze-script-studio';
import { generateChatterboxLineAction, deductNewStudioCreditsAction } from '@/app/new-ai-studio/actions';
import { 
    completeFastGenerationAction
} from '@/app/studio/actions';
import { getSignedUploadUrlAction } from '@/lib/gcs-actions';
import { getDisplayUrl, getISTDateString, checkIsPaidUser } from '@/lib/utils';
import { mergeWavBlobs } from '@/lib/audio-utils';
import { useRouter } from 'next/navigation';
import { reportClientError } from '@/lib/report-client-error';

// --- 🔒 PRODUCTION HUB (INDEXED DB) ---
const getSessionDBName = () => {
    if (typeof window === 'undefined') return '12Labs_Chatter_Default';
    let name = localStorage.getItem('12labs_chatter_active_bucket');
    if (!name) {
        name = `12Labs_Chatter_${Math.random().toString(36).substring(7).toUpperCase()}`;
        localStorage.setItem('12labs_chatter_active_bucket', name);
    }
    return name;
};

const PRODUCTION_STORE = 'chatterbox_production_data';
const AUDIO_STORE = 'chatterbox_audio_segments';

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
    return new Promise((res) => { request.onsuccess = () => res(request.result); request.onerror = () => res(null); });
};

const deleteCurrentDB = async () => {
    const dbName = localStorage.getItem('12labs_chatter_active_bucket');
    if (dbName && typeof window !== 'undefined') {
        indexedDB.deleteDatabase(dbName);
        localStorage.removeItem('12labs_chatter_active_bucket');
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

export interface ChatterboxVoice {
    id: string; name: string; link: string; age: 'Kid' | 'Adult' | 'Old'; gender: 'Male' | 'Female'; tags?: string; isAdded?: boolean; isDefault?: boolean; isPrivate?: boolean;
}

interface ChatterboxContextType {
    script: string; setScript: (s: string) => void; cleanScript: string; setCleanScript: (s: string) => void; projectName: string; setProjectName: (s: string) => void; scriptState: 'pristine' | 'valid'; characters: Character[]; isAnalyzing: boolean; analysisStatus: string; scriptAnalysis: ScriptAnalysis | null; isGenerating: boolean; generationProgress: number; generatedLines: GeneratedLine[]; generatedAudioUrl: string | null; studioVoices: ChatterboxVoice[]; userVoices: ChatterboxVoice[]; globalLibrary: ChatterboxVoice[]; isFinalizing: boolean; finalizingStatus: string; finalizingProgress: number; isPaid: boolean; includeEmotion: boolean; setIncludeEmotion: (v: boolean) => void; trialBalance: number | null; analyzeScript: () => Promise<void>; handleVoiceChange: (id: string, v: string) => void; handleAgeChange: (id: string, a: Character['age']) => void; handleGeneration: () => Promise<void>; retryLineGeneration: (lineId: string, updatedText?: string, updatedVoiceId?: string) => Promise<void>; clearStudioState: () => void; addVoiceToLibrary: (voice: ChatterboxVoice) => Promise<void>; removeVoiceFromLibrary: (voiceId: string) => Promise<void>; addPrivateVoice: (name: string, audioBlob: Blob, gender: 'Male' | 'Female', age: 'Kid' | 'Adult' | 'Old', tags: string) => Promise<void>; dailyAnalysisCount: number; maxDailyAnalysisLimit: number;
    updateGeneratedLine: (lineId: string, updates: Partial<GeneratedLine>) => void;
    deleteGeneratedLine: (lineId: string) => void;
    addGeneratedLine: (characterName: string) => void;
}

const ChatterboxContext = createContext<ChatterboxContextType | undefined>(undefined);

export function ChatterboxProvider({ children }: { children: ReactNode }) {
    const { user, activeUid, setUser } = useAuth();
    const { toast } = useToast();
    const { database } = initializeFirebase();
    const router = useRouter();

    const [script, setScript] = useState('');
    const [cleanScript, setCleanScript] = useState('');
    const [projectName, setProjectName] = useState('');
    const [scriptState, setScriptState] = useState<'pristine' | 'valid'>('pristine');
    const [characters, setCharacters] = useState<Character[]>([]);
    const [scriptAnalysis, setScriptAnalysis] = useState<ScriptAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generatedLines, setGeneratedLines] = useState<GeneratedLine[]>([]);
    const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
    const [includeEmotion, setIncludeEmotion] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [finalizingStatus, setFinalizingStatus] = useState('');
    const [finalizingProgress, setFinalizingProgress] = useState(0);
    const [isPaid, setIsPaid] = useState(false);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [isRehydrated, setIsRehydrated] = useState(false);
    const [trialBalance, setTrialBalance] = useState<number | null>(null);
    const [globalLibrary, setGlobalLibrary] = useState<ChatterboxVoice[]>([]);
    const [studioVoices, setStudioVoices] = useState<ChatterboxVoice[]>([]);
    const [userVoices, setUserVoices] = useState<ChatterboxVoice[]>([]);
    const [dailyAnalysisCount, setDailyAnalysisCount] = useState<number>(0);

    const isPaidUser = checkIsPaidUser(user);
    const maxDailyAnalysisLimit = isPaidUser ? 5 : 2;

    useEffect(() => {
        if (!database || !activeUid) return;
        const today = getISTDateString();
        const limitRef = ref(database, `userScriptAnalysisLimits/${activeUid}/${today}`);
        return onRtdbValue(limitRef, (snap) => {
            setDailyAnalysisCount(snap.exists() ? Number(snap.val()) : 0);
        });
    }, [database, activeUid]);

    const stateRef = useRef<any>(null);
    const queuePointer = useRef(0);
    const isProcessingRef = useRef(false);
    const wakeLockRef = useRef<any>(null);

    useEffect(() => {
        stateRef.current = { script, characters, generatedLines, currentProjectId, projectName, cleanScript };
    }, [script, characters, generatedLines, currentProjectId, projectName, cleanScript]);

    // --- 💾 DRAFT RECOVERY NODE ---
    useEffect(() => {
        if (!activeUid) { setIsRehydrated(true); return; }
        const rehydrate = async () => {
            const db = await getDB();
            if (!db) { setIsRehydrated(true); return; }
            const tx = db.transaction(PRODUCTION_STORE, 'readonly');
            const req = tx.objectStore(PRODUCTION_STORE).get(`production_${activeUid}`);
            req.onsuccess = async () => {
                const saved = req.result;
                if (saved) {
                    setScript(saved.script || ''); setCleanScript(saved.cleanScript || ''); 
                    setProjectName(saved.projectName || ''); setScriptState(saved.scriptState || 'pristine'); 
                    setCharacters(saved.characters || []); setScriptAnalysis(saved.scriptAnalysis || null); 
                    setGeneratedAudioUrl(saved.generatedAudioUrl || null); 
                    setIsPaid(saved.isPaid || false); setCurrentProjectId(saved.currentProjectId || null); 
                    setIncludeEmotion(saved.includeEmotion || false);
                    const lines: GeneratedLine[] = saved.generatedLines || [];
                    const updatedLines = await Promise.all(lines.map(async (l) => {
                        const blob = await getAudioNode(l.id);
                        return blob ? { ...l, status: 'done' as const, audioDataUri: URL.createObjectURL(blob) } : l;
                    }));
                    setGeneratedLines(updatedLines);
                }
                setIsRehydrated(true);
            };
        };
        rehydrate();
    }, [activeUid]);

    useEffect(() => {
        if (!activeUid || !isRehydrated || isGenerating || isAnalyzing || isFinalizing) return;
        const saveDraft = async () => {
            const db = await getDB(); if (!db) return;
            const tx = db.transaction(PRODUCTION_STORE, 'readwrite');
            tx.objectStore(PRODUCTION_STORE).put({ 
                script, cleanScript, projectName, scriptState, 
                characters, scriptAnalysis, generatedLines: generatedLines.map(l => ({ ...l, audioDataUri: undefined })), 
                generatedAudioUrl, isPaid, currentProjectId, includeEmotion 
            }, `production_${activeUid}`);
        };
        saveDraft();
    }, [script, cleanScript, projectName, scriptState, characters, scriptAnalysis, generatedLines, generatedAudioUrl, isPaid, currentProjectId, includeEmotion, activeUid, isRehydrated, isGenerating, isAnalyzing, isFinalizing]);

    useEffect(() => {
        if (!database) return;
        onRtdbValue(ref(database, 'clone_studio'), (snap) => { 
            if (snap.exists()) { 
                const all = Object.entries(snap.val()).map(([id, val]: [string, any]) => ({ id, ...val })); 
                setGlobalLibrary(all); setStudioVoices(all.filter((v: any) => v.isDefault === true)); 
            } 
        });
        if (activeUid) onRtdbValue(ref(database, `users/${activeUid}/library_selections`), (snap) => { 
            if (snap.exists()) setUserVoices(Object.values(snap.val())); else setUserVoices([]);
        });
    }, [database, activeUid]);

    const finalizeMaster = async () => {
        const allDone = stateRef.current.generatedLines.every((l: any) => l.status === 'done');
        if (!allDone || !activeUid) return;

        setIsFinalizing(true);
        setFinalizingStatus('MASTERING...');
        setFinalizingProgress(10);
        try {
            const blobs = await Promise.all(stateRef.current.generatedLines.map(async (l: any) => {
                const blob = await getAudioNode(l.id);
                if (!blob) throw new Error("Sync node missing.");
                return blob;
            }));
            setFinalizingProgress(40);
            const merged = await mergeWavBlobs(blobs, 800);
            setFinalizingProgress(60);
            
            const fileName = `master_${stateRef.current.currentProjectId}.wav`;
            const signRes = await getSignedUploadUrlAction({
                fileName, contentType: 'audio/wav', bucketType: 'private',
                folder: `new_studio/${activeUid}`, userId: activeUid
            });

            if (!signRes.success || !signRes.signedUrl || !signRes.gcsPath) throw new Error(signRes.error || "GCS node failed.");

            const uploadRes = await fetch(signRes.signedUrl, { method: 'PUT', body: merged, headers: { 'Content-Type': 'audio/wav' } });
            if (!uploadRes.ok) throw new Error("GCS sync rejection.");
            
            setFinalizingProgress(90);
            const actualChars = stateRef.current.generatedLines.reduce((acc: number, l: any) => acc + l.dialogue.length, 0);

            await completeFastGenerationAction(
                activeUid!, user?.name || 'User', user?.email || '', 
                stateRef.current.projectName, stateRef.current.cleanScript || stateRef.current.script, 
                signRes.gcsPath, characters.map(({id, ...c}) => c), actualChars, 
                stateRef.current.currentProjectId!, false, 'Neural Node', 
                { dialogues: stateRef.current.generatedLines.map((l: any) => ({ character: l.characterName, line: l.dialogue })) }, 
                true
            );

            setGeneratedAudioUrl(signRes.gcsPath);
            toast({ title: 'Production Ready!' });
        } catch (e: any) {
            reportClientError('src/context/chatterbox-provider.tsx:244', e); toast({ variant: 'destructive', title: 'Mastering Failed', description: e.message }); }
        finally { setIsFinalizing(false); setIsGenerating(false); setFinalizingProgress(0); if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; } }
    };

    const processQueue = useCallback(async () => {
        if (isProcessingRef.current || !activeUid) return;
        const pending = stateRef.current.generatedLines.filter((l: any) => l.status === 'pending' || l.status === 'error');
        if (pending.length === 0) {
            if (stateRef.current.generatedLines.every((l: any) => l.status === 'done')) finalizeMaster();
            return;
        }

        isProcessingRef.current = true;
        setIsGenerating(true);
        queuePointer.current = 0;
        
        if ('wakeLock' in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request('screen').catch(() => null);

        const WORKERS = 25;
        const worker = async (workerId: number) => {
            while (true) {
                const idx = queuePointer.current++;
                const item = pending[idx];
                if (!item) break;

                setGeneratedLines(prev => prev.map(l => l.id === item.id ? { ...l, status: 'generating' } : l));
                try {
                    const char = characters.find(c => c.name === item.characterName);
                    const voice = [...studioVoices, ...userVoices].find(v => v.id === char?.voice);
                    if (!voice) throw new Error("Persona missing.");

                    const res = await generateChatterboxLineAction({ 
                        userId: activeUid, userEmail: user?.email || 'N/A', 
                        text: item.dialogue, refAudioUrl: getDisplayUrl(voice.link), workerId
                    });

                    if (res.success && res.audioDataUri) {
                        const audioRes = await fetch(res.audioDataUri);
                        const blob = await audioRes.blob();
                        await saveAudioNode(item.id, blob);
                        setGeneratedLines(prev => prev.map(l => l.id === item.id ? { ...l, status: 'done', audioDataUri: URL.createObjectURL(blob) } : l));
                    } else throw new Error(res.error || "Engine rejection");
                } catch (e: any) {
            reportClientError('src/context/chatterbox-provider.tsx:286', e);
                    setGeneratedLines(prev => prev.map(l => l.id === item.id ? { ...l, status: 'error', error: e.message } : l));
                } finally {
                    const current = stateRef.current.generatedLines;
                    setGenerationProgress((current.filter((l: any) => l.status === 'done').length / current.length) * 100);
                }
            }
        };

        await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
        isProcessingRef.current = false;
        if (stateRef.current.generatedLines.every((l: any) => l.status === 'done')) finalizeMaster();
        else setIsGenerating(false);
    }, [activeUid, characters, studioVoices, userVoices, user?.email, toast, finalizeMaster]);

    const handleGeneration = async () => {
        if (!activeUid || !scriptAnalysis || !currentProjectId || isGenerating) return;
        try {
            if (!isPaid) {
                const actualChars = stateRef.current.generatedLines.reduce((acc: number, l: any) => acc + l.dialogue.length, 0);
                const res = await deductNewStudioCreditsAction(activeUid, actualChars, projectName || 'CB Project', currentProjectId);
                if (!res.success) throw new Error(res.error);
                if (res.newCredits !== undefined) setUser({ ...user, credits: res.newCredits } as any);
                if (res.trialBalance !== undefined) setTrialBalance(res.trialBalance);
                setIsPaid(true); 
            }
            processQueue();
        } catch (e: any) {
            reportClientError('src/context/chatterbox-provider.tsx:313', e); toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };

    const analyzeScript = async () => {
        if (isAnalyzing || !script.trim() || !activeUid) return;

        const charCount = script.trim().length;
        const userCredits = Number((user as any)?.credits ?? 0);
        const isSponsorOrAdmin = (user as any)?.isSponsor === true || (user as any)?.role === 'admin';

        if (!isSponsorOrAdmin && userCredits < charCount) {
            toast({
                variant: 'destructive',
                title: 'Not Enough Credits',
                description: `Script requires ${charCount.toLocaleString()} credits, but you only have ${userCredits.toLocaleString()} credits.`
            });
            return;
        }

        if (!isSponsorOrAdmin && dailyAnalysisCount >= maxDailyAnalysisLimit) {
            toast({
                variant: 'destructive',
                title: 'Daily Analysis Limit Reached',
                description: `You have reached your daily script analysis limit (${dailyAnalysisCount}/${maxDailyAnalysisLimit}). ${isPaidUser ? 'Paid limit is 5/day.' : 'Free limit is 2/day. Upgrade to Paid for 5/day.'}`
            });
            return;
        }

        setIsAnalyzing(true);
        try {
            const result = await analyzeScriptStudio({ script, userId: activeUid, userEmail: user?.email || undefined, includeEmotion });
            const timestamp = Date.now();
            const lines: GeneratedLine[] = result.lines.map((l: any, i: number) => ({ 
                id: `line-${i}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`, 
                characterName: l.character, dialogue: l.text, status: 'pending' as const, emotion: 'Neutral' 
            }));
            const totalDialogueChars = result.lines.reduce((acc: number, l: any) => acc + l.text.length, 0);
            setCleanScript(result.lines.map((l: any) => `${l.character}: ${l.text}`).join('\n\n'));
            setGeneratedLines(lines);
            setCharacters(result.characters.map((char: any, i: number) => ({ 
                id: `char-${i}`, name: char.name, gender: char.gender as any, 
                emotion: char.emotion || 'Neutral', voice: studioVoices[0]?.id || '', age: 'Adult', dialogueCount: char.dialogueCount || 0 
            })));
            setScriptAnalysis({ characterCount: totalDialogueChars, dialogueCount: result.lines.length, cost: Math.ceil(totalDialogueChars * 0.5) });
            setScriptState('valid'); setIsPaid(false); setCurrentProjectId(`CB_${generateShortId()}`);
            if (!projectName.trim()) setProjectName(`Studio-${new Date().toLocaleDateString()}`);
        } catch (e: any) {
            reportClientError('src/context/chatterbox-provider.tsx:359', e); toast({ variant: 'destructive', title: 'Analysis Failed', description: e.message }); }
        finally { setIsAnalyzing(false); }
    };

    const clearStudioState = async () => {
        await deleteCurrentDB();
        setScript(''); setCleanScript(''); setProjectName(''); setCharacters([]); setGeneratedLines([]); setGeneratedAudioUrl(null); setScriptState('pristine'); setScriptAnalysis(null); setIsPaid(false);
    };

    const handleVoiceChange = (id: string, voiceId: string) => setCharacters(prev => prev.map(c => c.id === id ? { ...c, voice: voiceId } : c));
    const handleAgeChange = (id: string, age: Character['age']) => setCharacters(prev => prev.map(c => c.id === id ? { ...c, age } : c));

    const updateGeneratedLine = (lineId: string, updates: Partial<GeneratedLine>) => {
        setGeneratedLines(prev => {
            const next = prev.map(l => l.id === lineId ? { ...l, ...updates } : l);
            const totalChars = next.reduce((sum, l) => sum + (l.dialogue ? l.dialogue.length : 0), 0);
            setScriptAnalysis(sa => sa ? {
                ...sa,
                characterCount: totalChars,
                dialogueCount: next.length,
                cost: Math.ceil(totalChars * 0.5)
            } : null);
            return next;
        });
    };

    const deleteGeneratedLine = (lineId: string) => {
        setGeneratedLines(prev => {
            const next = prev.filter(l => l.id !== lineId);
            const totalChars = next.reduce((sum, l) => sum + (l.dialogue ? l.dialogue.length : 0), 0);
            setScriptAnalysis(sa => sa ? {
                ...sa,
                characterCount: totalChars,
                dialogueCount: next.length,
                cost: Math.ceil(totalChars * 0.5)
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
            status: 'pending' as const,
            voiceOverride: char?.voice
        };
        setGeneratedLines(prev => {
            const next = [...prev, newLine];
            const totalChars = next.reduce((sum, l) => sum + (l.dialogue ? l.dialogue.length : 0), 0);
            setScriptAnalysis(sa => sa ? {
                ...sa,
                characterCount: totalChars,
                dialogueCount: next.length,
                cost: Math.ceil(totalChars * 0.5)
            } : null);
            return next;
        });
    };

    const retryLineGeneration = async (lineId: string, updatedText?: string, updatedVoiceId?: string) => {
        const idx = generatedLines.findIndex(l => l.id === lineId);
        if (idx === -1 || !activeUid) return;
        const line = generatedLines[idx];
        const char = characters.find(c => c.name === line.characterName);
        const voiceId = updatedVoiceId || line.voiceOverride || char?.voice;
        const textToGen = updatedText || line.dialogue;

        if (!voiceId) return;

        const voice = [...studioVoices, ...userVoices].find(v => v.id === voiceId);
        if (!voice) return;

        // Cost is 1 credit per char if we already spent credits (meaning isPaid === true)
        const needsDeduction = isPaid && line.status === 'done';

        setGeneratedLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'generating' } : l));
        try {
            if (needsDeduction) {
                const actualChars = textToGen.length;
                const deductRes = await deductNewStudioCreditsAction(activeUid, actualChars, projectName || 'CB Project', currentProjectId || `CB_${generateShortId()}`);
                if (!deductRes.success) throw new Error(deductRes.error);
                if (deductRes.newCredits !== undefined) setUser({ ...user, credits: deductRes.newCredits } as any);
                if (deductRes.trialBalance !== undefined) setTrialBalance(deductRes.trialBalance);
            }

            const res = await generateChatterboxLineAction({ 
                userId: activeUid, userEmail: user?.email || 'N/A', 
                text: textToGen, refAudioUrl: getDisplayUrl(voice.link), workerId: 0
            });

            if (res.success && res.audioDataUri) {
                const audioRes = await fetch(res.audioDataUri);
                const blob = await audioRes.blob();
                await saveAudioNode(lineId, blob);
                setGeneratedLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'done' as const, audioDataUri: URL.createObjectURL(blob), dialogue: textToGen, voiceOverride: voiceId } : l));
            } else throw new Error(res.error || "Engine rejection");
        } catch (e: any) {
            reportClientError('src/context/chatterbox-provider.tsx:459', e);
            setGeneratedLines(prev => prev.map(l => l.id === lineId ? { ...l, status: 'error', error: e.message } : l));
            toast({ variant: 'destructive', title: 'Generation Failed', description: e.message });
        }
    };

    return (
        <ChatterboxContext.Provider value={{
            script, setScript, cleanScript, setCleanScript, projectName, setProjectName, scriptState, characters, isAnalyzing, analysisStatus: '', scriptAnalysis, isGenerating, generationProgress, 
            generatedLines, generatedAudioUrl, studioVoices, userVoices, globalLibrary, isFinalizing, finalizingStatus, finalizingProgress, isPaid, includeEmotion, setIncludeEmotion, trialBalance,
            analyzeScript, handleVoiceChange, handleAgeChange, handleGeneration, retryLineGeneration, clearStudioState, 
            addVoiceToLibrary: async (v) => { await rtdbSet(ref(database!, `users/${activeUid}/library_selections/${v.id}`), v); },
            removeVoiceFromLibrary: async (id) => { await remove(ref(database!, `users/${activeUid}/library_selections/${id}`)); },
            addPrivateVoice: async () => {},
            dailyAnalysisCount, maxDailyAnalysisLimit,
            updateGeneratedLine, deleteGeneratedLine, addGeneratedLine
        }}>{children}</ChatterboxContext.Provider>
    );
}

export const useChatterbox = () => {
    const context = useContext(ChatterboxContext);
    if (context === undefined) throw new Error("useChatterbox must be within ChatterboxProvider");
    return context;
};
