'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import type { Character, ScriptAnalysis, GeneratedLine, Project } from '@/lib/types';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { initializeFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { processProStudioGenerationAndDeductCredits } from '@/app/pro-studio/actions';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { analyzeScriptStudio } from '@/ai/flows/analyze-script-studio';
import { useRouter } from 'next/navigation';
import { proVoices } from '@/lib/pro-voices';
import { getISTDateString, checkIsPaidUser } from '@/lib/utils';
import { reportClientError } from '@/lib/report-client-error';

// --- 🔒 PRO PRODUCTION HUB (INDEXED DB) ---
const getProDBName = () => {
    if (typeof window === 'undefined') return '12Labs_Pro_Default';
    let name = localStorage.getItem('12labs_pro_active_bucket');
    if (!name) {
        name = `12Labs_Pro_${Math.random().toString(36).substring(7).toUpperCase()}`;
        localStorage.setItem('12labs_pro_active_bucket', name);
    }
    return name;
};

const PRO_STORE = 'pro_studio_state';

const getDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(null); return; }
    const dbName = getProDBName();
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PRO_STORE)) db.createObjectStore(PRO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
};

const deleteProDB = async () => {
    const dbName = localStorage.getItem('12labs_pro_active_bucket');
    if (dbName && typeof window !== 'undefined') {
        indexedDB.deleteDatabase(dbName);
        localStorage.removeItem('12labs_pro_active_bucket');
    }
};

interface RealtimeProgress {
    processed: number;
    total: number;
    rejected: number;
}

interface ProStudioContextType {
  script: string;
  setScript: (s: string) => void;
  cleanScript: string;
  projectName: string;
  setProjectName: (s: string) => void;
  scriptState: 'pristine' | 'valid';
  characters: Character[];
  generatedLines: GeneratedLine[];
  isAnalyzing: boolean;
  scriptAnalysis: ScriptAnalysis | null;
  isGenerating: boolean;
  analyzeScript: () => Promise<void>;
  applyExternalAnalysis: (rawInput: any) => boolean;
  handleVoiceChange: (id: string, voiceId: string) => void;
  handleAgeChange: (id: string, age: Character['age']) => void;
  handleGeneration: () => Promise<void>;
  clearStudioState: () => void;
  hqProjectId: string | null;
  hqProject: Project | null;
  realtimeProgress: RealtimeProgress | null;
  dailyAnalysisCount: number;
  maxDailyAnalysisLimit: number;
}

export const ProStudioContext = createContext<ProStudioContextType | undefined>(undefined);

export function ProStudioProvider({ children }: { children: ReactNode }) {
  const { user, activeUid, setUser } = useAuth();
  const { toast } = useToast();
  const { firestore, database } = initializeFirebase();
  const router = useRouter();

  const [script, setScript] = useState('');
  const [cleanScript, setCleanScript] = useState('');
  const [projectName, setProjectName] = useState('');
  const [scriptState, setScriptState] = useState<'pristine' | 'valid'>('pristine');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [generatedLines, setGeneratedLines] = useState<GeneratedLine[]>([]);
  const [scriptAnalysis, setScriptAnalysis] = useState<ScriptAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hqProjectId, setHqProjectId] = useState<string | null>(null);
  const [realtimeProgress, setRealtimeProgress] = useState<RealtimeProgress | null>(null);
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
  const [isRehydrated, setIsRehydrated] = useState(false);

  // 📡 Real-time Progress Monitor (Backend Path Sync)
  useEffect(() => {
    if (!database || !hqProjectId || hqProjectId === 'PENDING') return;
    const progressRef = ref(database, `pro_projects/${hqProjectId}`);
    const unsubscribe = onRtdbValue(progressRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            setRealtimeProgress({ 
                processed: data.processed_dialogues || 0, 
                total: data.total_dialogues || 0,
                rejected: data.rejected_nodes || 0
            });
        }
    });
    return () => unsubscribe();
  }, [database, hqProjectId]);

  const hqProjectRef = useMemoFirebase(() => (!firestore || !hqProjectId || hqProjectId === 'PENDING') ? null : doc(firestore, 'pro_projects', activeUid!, 'userProjects', hqProjectId), [firestore, hqProjectId, activeUid]);
  const { data: hqProject } = useDoc<Project>(hqProjectRef);

  // --- 💾 REHYDRATION ---
  useEffect(() => {
    if (!activeUid) { setIsRehydrated(true); return; }
    const rehydrate = async () => {
        const db = await getDB();
        if (!db) { setIsRehydrated(true); return; }
        const tx = db.transaction(PRO_STORE, 'readonly');
        const req = tx.objectStore(PRO_STORE).get(`pro_state_${activeUid}`);
        req.onsuccess = () => {
            const saved = req.result;
            if (saved) {
                setScript(saved.script || '');
                setCleanScript(saved.cleanScript || '');
                setProjectName(saved.projectName || '');
                setScriptState(saved.scriptState || 'pristine');
                setCharacters(saved.characters || []);
                setGeneratedLines(saved.generatedLines || []);
                setScriptAnalysis(saved.scriptAnalysis || null);
                setHqProjectId(saved.hqProjectId || null);
            }
            setIsRehydrated(true);
        };
    };
    rehydrate();
  }, [activeUid]);

  // --- 💾 AUTO-SAVE ---
  useEffect(() => {
    if (!activeUid || !isRehydrated || isGenerating || isAnalyzing) return;
    const saveState = async () => {
        const db = await getDB(); if (!db) return;
        const tx = db.transaction(PRO_STORE, 'readwrite');
        tx.objectStore(PRO_STORE).put({
            script, cleanScript, projectName, scriptState, 
            characters, generatedLines, scriptAnalysis, hqProjectId
        }, `pro_state_${activeUid}`);
    };
    saveState();
  }, [script, cleanScript, projectName, scriptState, characters, generatedLines, scriptAnalysis, hqProjectId, activeUid, isRehydrated, isGenerating, isAnalyzing]);

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

    if (isAlreadyFormattedScript(script)) {
      setTimeout(() => {
        try {
          const splitLines = script.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
          const extracted: { character: string; text: string; emotion: string }[] = [];
          for (let i = 0; i < splitLines.length; i++) {
            const rawLine = splitLines[i].replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\*\*/g, '').replace(/__/g, '').trim();
            if (rawLine.startsWith('//') || rawLine.startsWith('#') || rawLine.startsWith('---') || rawLine.startsWith('===')) continue;
            let colonIdx = rawLine.indexOf(':');
            if (colonIdx === -1) colonIdx = rawLine.indexOf('：');
            const dashIdx = rawLine.indexOf(' - ');
            let charName = '';
            let dialogueText = '';
            let emotion = 'Neutral';

            if (colonIdx > 0 && colonIdx < 80) {
              charName = rawLine.substring(0, colonIdx).trim().replace(/^\[|\]$/g, '');
              dialogueText = rawLine.substring(colonIdx + 1).trim();
            } else if (dashIdx > 0 && dashIdx < 80) {
              charName = rawLine.substring(0, dashIdx).trim().replace(/^\[|\]$/g, '');
              dialogueText = rawLine.substring(dashIdx + 3).trim();
            }

            if (charName) {
              const emotionMatch = charName.match(/^([^\(\)\[\]]+)\s*[\(\[]([^\)\]]+)[\)\]]$/);
              if (emotionMatch) {
                charName = emotionMatch[1].trim();
                emotion = emotionMatch[2].trim();
              }
            }
            if (dialogueText) {
              const emotionMatchText = dialogueText.match(/^[\(\[]([^\)\]]+)[\)\]]\s*(.*)$/);
              if (emotionMatchText) {
                emotion = emotionMatchText[1].trim();
                dialogueText = emotionMatchText[2].trim();
              }
            }

            if (charName && dialogueText) {
              extracted.push({ character: charName, text: dialogueText, emotion });
            } else if (extracted.length > 0 && rawLine.length > 0) {
              extracted[extracted.length - 1].text += ' ' + rawLine;
            }
          }

          if (extracted.length > 0) {
            const timestamp = Date.now();
            const lines = extracted.map((l, i) => ({
              id: `pro-line-${i}-${timestamp}`,
              characterName: l.character,
              dialogue: l.text,
              emotion: l.emotion || 'Neutral',
              status: 'pending' as const
            }));
            setGeneratedLines(lines);
            const formatCleanLine = (char: string, emotion: string | undefined, text: string) => {
              const emo = (emotion || '').trim();
              if (emo && emo.toLowerCase() !== 'neutral') {
                return `${char}: [ ${emo.toLowerCase()} ] ${text}`;
              }
              return `${char}: ${text}`;
            };
            setCleanScript(extracted.map(l => formatCleanLine(l.character, l.emotion, l.text)).join('\n\n'));

            const uniqueNames = Array.from(new Set(extracted.map(l => l.character)));
            setCharacters(uniqueNames.map((name, i) => ({
              id: `char-${i}`,
              name,
              gender: 'Male' as any,
              emotion: 'Neutral',
              voice: proVoices[0].id,
              age: 'Adult',
              dialogueCount: extracted.filter(l => l.character === name).length
            })));

            const totalChars = extracted.reduce((acc, l) => acc + l.text.length, 0);
            setScriptAnalysis({ characterCount: totalChars, dialogueCount: extracted.length, cost: Math.ceil(totalChars * 0.5) });
            setScriptState('valid');
            if (!projectName.trim()) setProjectName(`Pro-${new Date().toLocaleDateString()}`);
            setIsAnalyzing(false);
            toast({ title: 'Script Analyzed', description: 'Manuscript recognized and characters mapped instantly.' });
            return;
          }
        } catch (err) {
          console.warn('[ProStudio] Fast JS parser fallback to standard flow:', err);
        }
      }, 1400);
      return;
    }

    try {
        // 🧹 NEURAL SANITIZER: Remove directions (brackets) while preserving line breaks
        const sanitizedScript = script.replace(/\(.*?\)|\[.*?\]/g, '').replace(/[ \t]+/g, ' ').trim();
        
        const result = await analyzeScriptStudio({ 
          script: sanitizedScript, 
          userId: activeUid, 
          userEmail: user?.email || undefined, 
          includeEmotion: false 
        });
        
        const timestamp = Date.now();
        const lines = result.lines.map((l: any, i: number) => ({ 
            id: `pro-line-${i}-${timestamp}`, 
            characterName: l.character, 
            dialogue: l.text, 
            emotion: l.emotion || 'Neutral',
            status: 'pending' as const 
        }));
        setGeneratedLines(lines);

        setCleanScript(result.lines.map((l: any) => `${l.character}: ${l.text}`).join('\n\n'));
        setCharacters(result.characters.map((char: any, i: number) => ({ 
            id: `char-${i}`, name: char.name, gender: char.gender as any, 
            emotion: char.emotion || 'Neutral', voice: proVoices[0].id, age: 'Adult', dialogueCount: char.dialogueCount || 0 
        })));

        const totalChars = result.lines.reduce((acc: number, l: any) => acc + l.text.length, 0);
        // Cost: 0.5x multiplier (UPDATED per user request - Integer node)
        setScriptAnalysis({ characterCount: totalChars, dialogueCount: result.lines.length, cost: Math.ceil(totalChars * 0.5) });
        setScriptState('valid');
        if (!projectName.trim()) setProjectName(`Pro-${new Date().toLocaleDateString()}`);
    } catch (e: any) {
            reportClientError('src/context/pro-studio-provider.tsx:343', e); toast({ variant: 'destructive', title: 'Analysis Error', description: e.message }); }
    finally { setIsAnalyzing(false); }
  };

  const applyExternalAnalysis = (rawInput: any): boolean => {
    try {
      let rawLines: any[] = [];
      let rawChars: any[] = [];
      let isParsedFromJson = false;

      // 1. Check JSON format
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
            reportClientError('src/context/pro-studio-provider.tsx:367', jsonErr);
            isParsedFromJson = false;
          }
        }
      }

      // 2. If not JSON, parse text lines
      if (!isParsedFromJson) {
        const textContent = String(rawInput);
        const splitLines = textContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (splitLines.length === 0) {
          toast({ variant: 'destructive', title: 'Empty Script', description: 'The provided script is empty.' });
          return false;
        }

        const extractedDialogues: { character: string; text: string; emotion?: string }[] = [];
        for (let i = 0; i < splitLines.length; i++) {
          const rawLine = splitLines[i].replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\*\*/g, '').replace(/__/g, '').trim();
          if (
            rawLine.startsWith('//') || rawLine.startsWith('#') || rawLine.startsWith('---') || rawLine.startsWith('===') ||
            rawLine.toLowerCase().includes('script formatter') || rawLine.toLowerCase().includes('formatting instructions')
          ) continue;

          let colonIdx = rawLine.indexOf(':');
          if (colonIdx === -1) colonIdx = rawLine.indexOf('：');
          const dashIdx = rawLine.indexOf(' - ');
          let charName = '';
          let dialogueText = '';
          let emotion = 'Neutral';

          if (colonIdx > 0 && colonIdx <= 45) {
            const possibleChar = rawLine.substring(0, colonIdx).trim().replace(/^\[|\]$/g, '');
            const words = possibleChar.split(/\s+/).length;
            if (words >= 1 && words <= 5) {
              charName = possibleChar;
              dialogueText = rawLine.substring(colonIdx + 1).trim();
            }
          }

          if (!charName && dashIdx > 0 && dashIdx <= 45) {
            const leftPart = rawLine.substring(0, dashIdx).trim().replace(/^\[|\]$/g, '');
            const rightPart = rawLine.substring(dashIdx + 3).trim();
            const words = leftPart.split(/\s+/).length;
            const lastLeftWord = leftPart.split(/\s+/).pop()?.toLowerCase().replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '');
            const firstRightWord = rightPart.split(/\s+/)[0]?.toLowerCase().replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '');
            const isRepeating = lastLeftWord && firstRightWord && lastLeftWord === firstRightWord;
            if (!isRepeating && words >= 1 && words <= 5 && rightPart.length > 0) {
              charName = leftPart;
              dialogueText = rightPart;
            }
          }

          if (charName) {
            const emotionMatch = charName.match(/^([^\(\)\[\]]+)\s*[\(\[]([^\)\]]+)[\)\]]$/);
            if (emotionMatch) {
              charName = emotionMatch[1].trim();
              emotion = emotionMatch[2].trim();
            }
          }

          if (dialogueText) {
            const emotionMatchText = dialogueText.match(/^[\(\[]([^\)\]]+)[\)\]]\s*(.*)$/);
            if (emotionMatchText) {
              emotion = emotionMatchText[1].trim();
              dialogueText = emotionMatchText[2].trim();
            }
          }

          if (charName && dialogueText) {
            extractedDialogues.push({ character: charName, text: dialogueText, emotion });
          } else if (extractedDialogues.length > 0 && rawLine.length > 0) {
            extractedDialogues[extractedDialogues.length - 1].text += ' ' + rawLine;
          }
        }

        if (extractedDialogues.length === 0) {
          toast({ variant: 'destructive', title: 'No Dialogues Found', description: 'Could not detect dialogues.' });
          return false;
        }
        rawLines = extractedDialogues;
      }

      if (!Array.isArray(rawLines) || rawLines.length === 0) return false;

      const timestamp = Date.now();
      const lines: GeneratedLine[] = rawLines.map((l: any, i: number) => {
        const charName = (l.character || l.characterName || l.speaker || 'Narrator').trim();
        const textStr = (l.text || l.dialogue || l.line || '').trim();
        const emotionStr = l.emotion || 'Neutral';
        return {
          id: `pro-line-${i}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
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

      const getRandomVoiceId = (aiGender: string) => {
        const g = (aiGender || '').toLowerCase().trim();
        let target: 'Male' | 'Female' = 'Female';
        if (g === 'male' || g === 'boy') target = 'Male';
        else if (g === 'female' || g === 'girl') target = 'Female';
        const filtered = proVoices.filter(v => v.gender === target && !v.disabled);
        if (filtered.length === 0) return (proVoices.find(v => !v.disabled) || proVoices[0]).id;
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
            age: 'Adult' as any,
            dialogueCount: lines.filter(l => l.characterName === name).length
          };
        });
      }

      setCharacters(charList);
      setGeneratedLines(lines);
      setScriptAnalysis({
        characterCount: totalDialogueChars,
        dialogueCount: lines.length,
        cost: Math.ceil(totalDialogueChars * 0.5)
      });

      setScriptState('valid');
      if (!projectName.trim()) setProjectName(`Pro-${new Date().toLocaleDateString()}`);

      toast({
        title: 'External Script Loaded',
        description: `Recognized ${charList.length} character(s) and assigned voices.`
      });
      return true;
    } catch (err: any) {
            reportClientError('src/context/pro-studio-provider.tsx:543', err);
      toast({ variant: 'destructive', title: 'Import Failed', description: err.message || 'Failed to parse script.' });
      return false;
    }
  };

  const handleGeneration = async () => {
    if (!activeUid || !scriptAnalysis) return;
    setIsGenerating(true);
    setHqProjectId('PENDING');

    try {
        const dialogues = generatedLines.map(l => ({ 
            character: l.characterName, 
            line: l.dialogue,
            emotion: l.emotion
        }));

        const res = await processProStudioGenerationAndDeductCredits(
            activeUid, user?.name || 'User', user?.email || '',
            projectName, cleanScript || script, 
            characters.map(({id, ...c}) => c), scriptAnalysis.characterCount,
            dialogues
        );

        if (res.success && res.projectId) {
            setHqProjectId(res.projectId);
            if (res.newCredits !== undefined) setUser({ ...user, credits: res.newCredits } as any);
        } else throw new Error(res.error);
    } catch (e: any) {
            reportClientError('src/context/pro-studio-provider.tsx:572', e);
        setIsGenerating(false);
        setHqProjectId(null);
        toast({ variant: 'destructive', title: 'Dispatch Failed', description: e.message });
    }
  };

  const clearStudioState = async () => {
      await deleteProDB();
      setScript(''); setCleanScript(''); setProjectName(''); setCharacters([]); setGeneratedLines([]);
      setScriptState('pristine'); setScriptAnalysis(null); setHqProjectId(null); 
      setIsGenerating(false); setRealtimeProgress(null);
      toast({ title: 'Workspace Purged' });
  };

  const handleVoiceChange = (id: string, voiceId: string) => setCharacters(prev => prev.map(c => c.id === id ? { ...c, voice: voiceId } : c));
  const handleAgeChange = (id: string, age: Character['age']) => setCharacters(prev => prev.map(c => c.id === id ? { ...c, age } : c));

  return (
    <ProStudioContext.Provider value={{
      script, setScript, cleanScript, projectName, setProjectName, scriptState, characters, generatedLines,
      isAnalyzing, scriptAnalysis, isGenerating,
      analyzeScript, applyExternalAnalysis, handleVoiceChange, handleAgeChange, handleGeneration, clearStudioState,
      hqProjectId, hqProject: hqProject || null, realtimeProgress,
      dailyAnalysisCount, maxDailyAnalysisLimit
    }}>{children}</ProStudioContext.Provider>
  );
}

export const useProStudio = () => {
  const context = useContext(ProStudioContext);
  if (context === undefined) throw new Error('useProStudio must be within ProStudioProvider');
  return context;
};
