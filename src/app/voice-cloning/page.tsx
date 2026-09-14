'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { 
    Loader2, 
    MicVocal, 
    Wand2, 
    Download, 
    Sparkles, 
    Upload, 
    Trash2, 
    Music, 
    Coins, 
    AlertTriangle, 
    Play, 
    Pause, 
    Check,
    ShieldCheck,
    Settings2,
    ChevronDown,
    ChevronUp,
    RotateCcw,
    Activity,
    History as HistoryIcon,
    X,
    Scissors,
    ShieldAlert,
    Copy,
    CheckCircle2
} from 'lucide-react';
import { checkAndDeductCloningCredits } from './actions';
// NOTE: generateVoiceCloningAction / saveClonedVoiceProjectAction are no longer called from
// here — generation now runs on the HF Space worker (server-files/voice_cloning.py), which
// writes the completed project itself. This page just submits a job to RTDB and listens.
import { logBotEventAction } from '@/app/actions';
import { cn, getDisplayUrl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { audioBufferToWav } from '@/lib/audio-utils';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, set, remove, query as rtdbQuery, orderByChild, equalTo } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { uploadFileDirectly } from '@/lib/gcs-client';
import { reportClientError } from '@/lib/report-client-error';

const DB_NAME = '12labs_cloning_hub_v3';
const STORE_NAME = 'cloning_history';

interface HistoryItem {
    id: string;
    text: string;
    language: string;
    audioDataUri: string; 
    cloudUrl?: string;    
    timestamp: string;
}

const languages = [
    { value: 'Auto', label: 'Auto Detect' },
];

const getBlobUrlFromBase64 = (base64Data: string): string => {
    try {
        const parts = base64Data.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        const blob = new Blob([uInt8Array], { type: contentType });
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error("Blob conversion failed:", e);
        return '';
    }
};

const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') return;
        const request = indexedDB.open(DB_NAME, 3);
        request.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e: any) => resolve(e.target.result);
        request.onerror = (e: any) => reject(e.target.error);
    });
};

const saveHistoryItemToLocalDB = async (item: HistoryItem) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(item);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
};

const loadHistoryItemsFromLocalDB = async (): Promise<HistoryItem[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const results = (request.result || []) as HistoryItem[];
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

const deleteHistoryItemFromLocalDB = async (id: string) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
};

const clearAllHistoryFromDB = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
};

export default function VoiceCloningPage() {
    const { user, setUser, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const { database } = initializeFirebase();

    // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
    // silently rendering the full voice cloning tool while logged out.
    useEffect(() => {
        if (!authLoading && !user) {
            toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use Voice Cloning.' });
            router.push('/login');
        }
    }, [authLoading, user, router, toast]);

    const [text, setText] = useState('Write your script here to clone your voice. The 12Labs neural engine will process your voice with complete accuracy.');
    const [language, setLanguage] = useState('Auto');
    const [referenceAudio, setReferenceAudio] = useState<string | null>(null);
    const [referenceAudioName, setReferenceAudioName] = useState<string | null>(null);
    const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
    const [speed, setSpeed] = useState(1.0);
    const [numStep, setNumStep] = useState(32);
    const [guidanceScale, setGuidanceScale] = useState(2.0);

    const [isTrimmerOpen, setIsTrimmerOpen] = useState(false);
    const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
    const [trimRange, setTrimRange] = useState<[number, number]>([0, 10]);
    const [isTrimming, setIsTrimming] = useState(false);
    const [isTrimmerPlaying, setIsTrimmerPlaying] = useState(false);
    const [trimmerCurrentTime, setTrimmerCurrentTime] = useState(0);
    const trimmerAudioRef = useRef<HTMLAudioElement | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
    const [showResetButton, setShowResetButton] = useState(false);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isMounted, setIsMounted] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [playingId, setPlayingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const blobUrls = useRef<Map<string, string>>(new Map());
    // Holds the Radix ScrollArea's outer wrapper for the "Synthesis History"
    // list. Used purely to reach into its scrollable viewport and force it
    // back to the top — see the effect below for why.
    const historyScrollAreaRef = useRef<HTMLDivElement | null>(null);

    // Tracks the RTDB voice_cloning job this tab is currently waiting on, so
    // the listener below (which sees ALL of this user's jobs) knows which
    // one is "ours" and ignores stale/other-tab jobs.
    const pendingJobId = useRef<string | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // 📱 PWA fix: installed/standalone PWAs keep this page's DOM alive in the
    // background instead of reloading it, so re-opening the app was landing
    // users wherever the "Synthesis History" list had last been scrolled —
    // which, since it's sorted newest-first, looked like it was defaulting
    // to their OLDEST clone instead of the newest one. Force that list's
    // viewport back to the top on mount, whenever fresh history data comes
    // in, and whenever the PWA is resumed from the background.
    const resetHistoryScroll = useCallback(() => {
        const viewport = historyScrollAreaRef.current?.querySelector<HTMLDivElement>(
            '[data-radix-scroll-area-viewport]'
        );
        if (viewport) viewport.scrollTop = 0;
    }, []);

    useEffect(() => {
        resetHistoryScroll();
    }, [history, resetHistoryScroll]);

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') resetHistoryScroll();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [resetHistoryScroll]);

    useEffect(() => {
        if (!isMounted || !user || !database) return;

        const historyRef = ref(database, `cloningHistory/${user.uid}`);
        const unsubscribe = onRtdbValue(historyRef, async (snapshot) => {
            const rtdbData = snapshot.val();
            const rtdbList: HistoryItem[] = rtdbData ? Object.entries(rtdbData).map(([id, val]: [string, any]) => ({ id, ...val })) : [];
            
            const localCache = await loadHistoryItemsFromLocalDB();
            const localMap = new Map(localCache.map(item => [item.id, item.audioDataUri]));

            const combinedList = rtdbList.map(item => ({
                ...item,
                audioDataUri: localMap.get(item.id) || item.cloudUrl || '' 
            }));

            setHistory(combinedList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        });

        return () => unsubscribe();
    }, [isMounted, user, database]);

    // 🔄 Realtime listener for RTDB voice_cloning jobs (same pattern as
    // voice-editor-dialog.tsx's voice_replacement listener). Generation now
    // runs on the HF Space worker (server-files/voice_cloning.py) — this
    // tab submits a job and just watches for it to flip to
    // "completed"/"error", instead of blocking on a direct server-action call.
    useEffect(() => {
        if (!isMounted || !user?.uid || !database) return;

        const voiceCloningRef = rtdbQuery(
            ref(database, 'voice_cloning'),
            orderByChild('userId'),
            equalTo(user.uid)
        );

        const unsubscribe = onRtdbValue(voiceCloningRef, async (snapshot) => {
            const jobId = pendingJobId.current;
            if (!jobId || !snapshot.exists()) return;

            const job = snapshot.val()?.[jobId];
            if (!job) return; // not ours, or already cleaned up server-side

            if (job.status === 'completed' && job.audioUrl) {
                pendingJobId.current = null;

                const historyId = crypto.randomUUID();
                const newItem: HistoryItem = {
                    id: historyId,
                    text: job.text || text,
                    language: job.language || language,
                    audioDataUri: job.audioUrl,
                    cloudUrl: job.audioUrl,
                    timestamp: new Date().toISOString(),
                };
                await saveHistoryItemToLocalDB(newItem);
                const rtdbEntry = { ...newItem };
                delete (rtdbEntry as any).audioDataUri;
                await set(ref(database, `cloningHistory/${user.uid}/${historyId}`), rtdbEntry);

                logBotEventAction({
                    moduleName: 'Voice Cloning',
                    userEmail: user?.email || 'N/A',
                    eventType: 'SUCCESS',
                    actionDetails: `Generated Voice Clone (${(job.language || language).toUpperCase()}) - ${(job.text || text).slice(0, 60)}...`,
                    assetUrl: job.audioUrl,
                }).catch(() => null);

                toast({ title: 'Synthesis Successful' });
                setIsLoading(false);
            } else if (job.status === 'error') {
                pendingJobId.current = null;
                toast({ variant: 'destructive', title: 'Engine Error', description: job.error || 'Voice cloning failed on the node.' });
                logBotEventAction({
                    moduleName: 'Voice Cloning',
                    userEmail: user?.email || 'N/A',
                    eventType: 'ERROR',
                    actionDetails: 'Voice clone generation failed on HF worker',
                    errorDetails: job.error || 'unknown',
                }).catch(() => null);
                setIsLoading(false);
                // Credits are refunded server-side (voice_cloning.py, same
                // refund_credits() path voice_replacement uses) — the auth
                // provider's own Firestore listener picks up the new balance,
                // nothing to do here.
            }
        }, 'voice-cloning:voice_cloning');

        return () => unsubscribe();
    }, [isMounted, user?.uid, database]);

    useEffect(() => {
        if (!isLoading) {
            setGenerationStartTime(null);
            setShowResetButton(false);
            return;
        }

        setGenerationStartTime(Date.now());
        const timer = setInterval(() => {
            if (generationStartTime) {
                const elapsed = Date.now() - generationStartTime;
                if (elapsed >= 3 * 60 * 1000) { // 3 minutes
                    setShowResetButton(true);
                    clearInterval(timer);
                }
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [isLoading, generationStartTime]);

    useEffect(() => {
        audioRef.current = new Audio();
        const player = audioRef.current;
        const handleEnded = () => setPlayingId(null);
        player.addEventListener('ended', handleEnded);
        const currentBlobUrls = blobUrls.current;
        
        return () => {
            player.pause();
            player.removeEventListener('ended', handleEnded);
            currentBlobUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    useEffect(() => {
        if (!isTrimmerPlaying) return;
        const interval = setInterval(() => {
            if (trimmerAudioRef.current) {
                setTrimmerCurrentTime(trimmerAudioRef.current.currentTime);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [isTrimmerPlaying]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        const arrayBuffer = await file.arrayBuffer();
        
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const buffer = await ctx.decodeAudioData(arrayBuffer);
            const duration = buffer.duration;

            if (duration < 3) {
                toast({ variant: 'destructive', title: 'Invalid Duration', description: `Reference audio must be at least 3 seconds. Your file is ${duration.toFixed(1)}s.` });
                setIsLoading(false);
                return;
            }

            setOriginalBuffer(buffer);
            setReferenceAudioName(file.name);
            setTrimRange([0, Math.min(10, duration)]);
            setIsTrimmerOpen(true);
            setIsLoading(false);

        } catch (err: any) {
            reportClientError('src/app/voice-cloning/page.tsx:255', err);
            toast({ variant: 'destructive', title: 'Scanner Error', description: 'Could not analyze audio file.' });
            setIsLoading(false);
        }
    };

    const handleSliderChange = (newValues: number[]) => {
        const start = newValues[0];
        const end = newValues[1];
        const duration = end - start;

        if (duration < 3) {
            if (start !== trimRange[0]) {
                const newEnd = Math.min(start + 3, originalBuffer?.duration || 10);
                setTrimRange([start, newEnd]);
            } else {
                const newStart = Math.max(end - 3, 0);
                setTrimRange([newStart, end]);
            }
        } 
        else if (duration > 10) {
            if (start !== trimRange[0]) {
                setTrimRange([start, start + 10]);
            } else {
                setTrimRange([end - 10, end]);
            }
        } 
        else {
            setTrimRange([start, end]);
        }
    };

    const handleApplyTrim = async () => {
        if (!originalBuffer) return;
        setIsTrimming(true);
        
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const start = trimRange[0];
            const end = trimRange[1];
            const duration = end - start;
            
            const frameCount = Math.round(duration * originalBuffer.sampleRate);
            const trimmedBuffer = ctx.createBuffer(originalBuffer.numberOfChannels, frameCount, originalBuffer.sampleRate);
            
            for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
                const nowBuffering = trimmedBuffer.getChannelData(channel);
                const originalData = originalBuffer.getChannelData(channel);
                const offset = Math.round(start * originalBuffer.sampleRate);
                for (let i = 0; i < frameCount; i++) {
                    nowBuffering[i] = originalData[offset + i];
                }
            }

            const wavBlob = audioBufferToWav(trimmedBuffer);
            const reader = new FileReader();
            reader.onloadend = () => {
                setReferenceAudio(reader.result as string);
                setDetectedDuration(duration);
                setIsTrimmerOpen(false);
                toast({ title: 'Acoustic Signature Saved', description: 'Trimmed segment calibrated to node.' });
            };
            reader.readAsDataURL(wavBlob);

        } catch (e: any) {
            reportClientError('src/app/voice-cloning/page.tsx:319', e);
            toast({ variant: 'destructive', title: 'Trimming Failed', description: e.message });
        } finally {
            setIsTrimming(false);
        }
    };

    const toggleTrimmerPlay = async () => {
        if (!originalBuffer) return;
        if (isTrimmerPlaying) {
            trimmerAudioRef.current?.pause();
            setIsTrimmerPlaying(false);
            return;
        }
        const start = trimRange[0];
        const duration = trimRange[1] - start;
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const frameCount = Math.round(duration * originalBuffer.sampleRate);
            const playBuffer = ctx.createBuffer(originalBuffer.numberOfChannels, frameCount, originalBuffer.sampleRate);
            for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
                playBuffer.getChannelData(channel).set(originalBuffer.getChannelData(channel).subarray(Math.round(start * originalBuffer.sampleRate), Math.round(start * originalBuffer.sampleRate) + frameCount));
            }
            const wavBlob = audioBufferToWav(playBuffer);
            const url = URL.createObjectURL(wavBlob);
            if (!trimmerAudioRef.current) trimmerAudioRef.current = new Audio();
            trimmerAudioRef.current.src = url;
            trimmerAudioRef.current.onended = () => { setIsTrimmerPlaying(false); URL.revokeObjectURL(url); };
            await trimmerAudioRef.current.play();
            setIsTrimmerPlaying(true);
        } catch (e) {
            reportClientError('src/app/voice-cloning/page.tsx:349', e); toast({ variant: 'destructive', title: 'Playback Failed' }); }
    };

    const cost = Math.ceil(text.length * 1.2);
    
    const handleGeneration = async () => {
        if (!user || !user.email || !referenceAudio || !database) return;
        setIsLoading(true);
        try {
            const creditResult = await checkAndDeductCloningCredits({ userId: user.uid, cost });
            if (!creditResult.success) throw new Error(creditResult.error);
            if (creditResult.newCredits !== undefined) setUser({ ...user, credits: creditResult.newCredits } as any);

            // 🚀 Upload the reference clip to R2 first — the RTDB job carries a
            // URL, never the raw base64 (a multi-MB string sitting in a realtime
            // node gets re-downloaded on every listener event; see
            // voice_cloning.py's module docstring for why).
            //
            // 🔴 FIX: this used to upload with bucketType 'private', which
            // returns an internal `gcs://...` pointer — that scheme only
            // means anything to THIS Next.js app (resolved via getDisplayUrl
            // / the /api/download proxy, both server-side). The HF Space
            // worker (server-files/voice_cloning.py) fetches the URL with
            // plain Python `requests.get()`, which has no idea what "gcs://"
            // is ("No connection adapters were found for 'gcs://...'").
            toast({ title: 'Uploading Reference Clip...', description: 'Preparing your sample for the cloning node.' });
            const refResponse = await fetch(referenceAudio);
            const refBlob = await refResponse.blob();
            const uploadedPointer = await uploadFileDirectly({
                file: refBlob,
                fileName: `ref_${Date.now()}.wav`,
                bucketType: 'public',
                folder: 'temp/voice_clone_ref',
                userId: user.uid,
                userEmail: user.email || 'N/A',
            });
            // 🔴 FIX: this used to resolve straight to the direct
            // storage.12labs.in CDN URL (resolvePublicAudioUrl) and hand
            // THAT to the Python worker — which then got a 403 Forbidden
            // fetching it. The R2 custom domain isn't actually serving
            // every "public/" prefix openly (this "temp/voice_clone_ref/"
            // one included) the way the rest of this fix assumed —
            // that's a bucket/CDN access-control setting outside this
            // codebase, not something fixable here directly. Routing
            // through our OWN /api/download proxy instead sidesteps the
            // problem entirely: that route fetches the object server-side
            // with real R2 credentials (see src/app/api/download/route.ts),
            // so it works regardless of whatever the CDN domain's public-
            // read policy is for a given prefix.
            //
            // Using the real production domain here (same env var + fallback
            // gcs-client.ts already uses), not window.location.origin — the
            // Python worker runs on a completely separate HF Space server,
            // so if this code ever ran from a preview/staging origin,
            // window.location.origin would hand back a URL that server
            // can't necessarily reach. A fixed, real public domain always
            // works regardless of what origin the browser session is on.
            const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.12labs.in').replace(/\/+$/, '');
            const refAudioUrl = `${siteUrl}/api/download?url=${encodeURIComponent(uploadedPointer)}`;

            // 📡 Submit the job — the HF Space worker (server-files/voice_cloning.py)
            // picks this up via its RTDB listener, runs the actual clone, and
            // writes the result back onto this same job. We just watch for it
            // (see the voice_cloning listener effect above).
            const jobId = `${user.uid}_${Date.now()}`;
            pendingJobId.current = jobId;
            await set(ref(database, `voice_cloning/${jobId}`), {
                userId: user.uid,
                userEmail: user.email,
                userName: user.name || 'User',
                status: 'pending',
                timestamp: Math.floor(Date.now() / 1000),
                text,
                language,
                refAudioUrl,
                numStep,
                guidanceScale,
                denoise: true,
                speed,
                preprocessPrompt: true,
                postprocessOutput: true,
                creditCost: cost,
            });

            toast({ title: 'Cloning Started', description: 'Voice worker ne request receive kar li hai.' });
            // isLoading stays true — the voice_cloning listener effect flips it
            // back off and shows the success/error toast once the job finishes.
        } catch (error: any) {
            reportClientError('src/app/voice-cloning/page.tsx:412', error);
            toast({ variant: 'destructive', title: 'Engine Error', description: error.message });
            logBotEventAction({
                moduleName: 'Voice Cloning',
                userEmail: user?.email || 'N/A',
                eventType: 'ERROR',
                actionDetails: 'Voice clone job submission failed',
                errorDetails: error.message
            }).catch(() => null);
            setIsLoading(false);
        }
    };
    
    const togglePlay = (item: HistoryItem) => {
        const player = audioRef.current; if (!player) return;
        if (playingId === item.id) { player.pause(); setPlayingId(null); }
        else {
            player.pause();
            let url = blobUrls.current.get(item.id);
            if (!url) { 
                url = item.audioDataUri.startsWith('data:') ? getBlobUrlFromBase64(item.audioDataUri) : getDisplayUrl(item.cloudUrl || item.audioDataUri);
                blobUrls.current.set(item.id, url); 
            }
            if (url) {
                player.src = url;
                player.play().then(() => setPlayingId(item.id)).catch((err) => {
                    reportClientError('src/app/voice-cloning/page.tsx:440', err, { itemId: item.id });
                    toast({ variant: 'destructive', title: 'Playback Interrupted' });
                });
            }
        }
    };

    const handleDeleteHistory = async (id: string) => {
        if (!user || !database) return;
        if (playingId === id) { audioRef.current?.pause(); setPlayingId(null); }
        const url = blobUrls.current.get(id); if (url) { URL.revokeObjectURL(url); blobUrls.current.delete(id); }
        
        await deleteHistoryItemFromLocalDB(id);
        await remove(ref(database, `cloningHistory/${user.uid}/${id}`));
        toast({ title: 'Node Purged' });
    };

    const handleClearAllHistory = async () => {
        if (!user || !database || !window.confirm("Purge all synthesis records?")) return;
        await clearAllHistoryFromDB();
        await remove(ref(database, `cloningHistory/${user.uid}`));
        toast({ title: 'Archive Purged' });
    };

    const handleResetSettings = () => {
        setNumStep(32);
        setGuidanceScale(2.0);
        setSpeed(1.0);
        toast({ title: 'Calibration Reset', description: 'Restored to engine defaults.' });
    };

    const handleResetGeneration = () => {
        setIsLoading(false);
        setGenerationStartTime(null);
        setShowResetButton(false);
        toast({ title: 'Generation Terminated', description: 'Process has been reset. You can start a new generation.' });
    };

    const handleDownload = (item: HistoryItem) => {
        const url = item.audioDataUri.startsWith('data:') ? getBlobUrlFromBase64(item.audioDataUri) : getDisplayUrl(item.cloudUrl || item.audioDataUri);
        const a = document.createElement('a');
        a.href = url;
        a.download = `12labs_clone_${item.id.slice(0, 8)}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (item.audioDataUri.startsWith('data:')) URL.revokeObjectURL(url);
    };

    const handleCopyScript = (scriptText: string) => {
        navigator.clipboard.writeText(scriptText);
        toast({ title: 'Script copied!', description: 'Full text available in clipboard.' });
    };

    if (!isMounted) return null;

    if (authLoading || !user) {
        return (
            <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const charCount = text.length;
    const isOverLimit = charCount > 1000;
    const insufficientCredits = !user || (user.credits < cost);

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <div className="container mx-auto max-w-7xl py-10 px-4 pb-32">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-primary/10 rounded-[1.5rem] shadow-inner"><MicVocal className="h-10 w-10 text-primary" /></div>
                    <div><h1 className="text-3xl font-black uppercase tracking-tight">Cloning Studio</h1><p className="text-muted-foreground font-bold text-[10px] uppercase tracking-widest opacity-60">Neural Engine Production Hub</p></div>
                </div>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black h-8 px-4 rounded-full text-[10px] tracking-widest uppercase"><Activity className="h-3 w-3 mr-2 animate-pulse" /> Status: Operational</Badge>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                <div className="space-y-8">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
                        <CardHeader className="bg-primary/5 border-b pb-6">
                            <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" />Production Logic</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-8 pt-8">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Synthesis Manuscript</Label>
                                <Textarea value={text} onChange={(e) => setText(e.target.value)} disabled={isLoading} className="min-h-[140px] text-base font-medium rounded-2xl bg-muted/20 border-primary/5 p-6 leading-relaxed shadow-inner"/>
                                <div className="flex justify-between items-center px-1"><p className="text-[9px] font-bold text-muted-foreground uppercase opacity-40">Min 20 chars</p><span className={cn("text-[10px] font-black font-mono", isOverLimit ? "text-destructive" : "text-primary/60")}>{charCount}/1000</span></div>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1"><Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Source Reference Node</Label><div className="flex items-center gap-3"><Badge variant="secondary" className="h-7 px-4 text-[10px] font-black uppercase bg-muted/50 border-none shadow-sm text-muted-foreground">3 SEC MIN</Badge><Badge variant="secondary" className="h-7 px-4 text-[10px] font-black uppercase bg-muted/50 border-none shadow-sm text-muted-foreground">10 SEC MAX</Badge></div></div>
                                <input id="audio-upload" type="file" className="hidden" onChange={handleFileChange} accept="audio/*" disabled={isLoading}/>
                                {referenceAudio ? (
                                    <div className="p-5 rounded-2xl border-2 border-primary/20 bg-primary/5 flex items-center justify-between group animate-in zoom-in-95 shadow-inner">
                                        <div className="flex items-center gap-4 min-w-0"><div className="p-3 bg-primary text-white rounded-xl shadow-lg"><Music className="h-5 w-5" /></div><div className="min-w-0"><p className="text-xs font-black truncate uppercase tracking-tight">{referenceAudioName}</p><div className="flex items-center gap-2 mt-1"><Badge variant="outline" className="h-6 px-3 text-[9px] font-black uppercase border-primary/30 text-primary">{detectedDuration?.toFixed(1)}S CALIBRATED</Badge></div></div></div>
                                        <button className="text-destructive/40 hover:text-destructive transition-colors p-2" onClick={() => { setReferenceAudio(null); setReferenceAudioName(null); setDetectedDuration(null); }} disabled={isLoading}><Trash2 className="h-5 w-5" /></button>
                                    </div>
                                ) : (
                                    <Label htmlFor="audio-upload" className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-primary/20 rounded-2xl cursor-pointer hover:bg-primary/5 hover:border-primary/50 transition-all group bg-muted/10 shadow-sm">
                                        <Upload className="w-10 h-10 mb-2 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                                        <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">MAP REFERENCE VOICE</p>
                                    </Label>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Linguistic Target</Label><Select value={language} onValueChange={setLanguage} disabled={isLoading}><SelectTrigger className="h-11 rounded-xl bg-muted/20 font-bold border-primary/5 shadow-inner"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl font-bold">{languages.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent></Select></div>
                                <div className="flex flex-col justify-center gap-4 bg-muted/10 p-5 rounded-2xl border border-primary/5 shadow-inner"><div className="space-y-3"><div className="flex justify-between items-center px-1"><Label className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Synthesis Speed</Label><span className="text-[11px] font-black text-primary bg-background px-2 py-0.5 rounded-lg shadow-sm border border-primary/10">{speed.toFixed(2)}x</span></div><Slider min={0.5} max={2.5} step={0.1} value={[speed]} onValueChange={([val]) => setSpeed(val)} disabled={isLoading} className="h-2"/></div></div>
                            </div>
                        </CardContent>
                        <CardFooter className="p-8 border-t bg-muted/10 flex flex-col gap-4">
                            {insufficientCredits && !isLoading && (
                                <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-2xl border border-destructive/20 w-full animate-in slide-in-from-top-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                                    <div className="space-y-1"><p className="text-[10px] font-black uppercase text-destructive tracking-widest">Insufficient Energy</p><Button variant="link" className="p-0 h-auto text-[10px] font-black text-primary uppercase underline" onClick={() => router.push('/buy-credits')}>Refill balance</Button></div>
                                </div>
                            )}
                            <Button onClick={handleGeneration} disabled={isLoading || !text.trim() || !referenceAudio || isOverLimit || insufficientCredits} className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine uppercase transition-all active:scale-95 flex flex-col gap-0.5 leading-tight">
                                {isLoading ? <span className="flex items-center gap-2"><Loader2 className="mr-3 h-6 w-6 animate-spin" /> SYNCHRONIZING...</span> : (<><span className="flex items-center gap-2"><Wand2 className="h-6 w-6 fill-current" /> COMMENCE CLONING</span><span className="text-[10px] opacity-60 font-black tracking-widest flex items-center gap-1 uppercase"><Coins className="h-3 w-3" /> {cost.toLocaleString()} CREDITS</span></>)}
                            </Button>
                            {showResetButton && isLoading && (
                                <Button onClick={handleResetGeneration} variant="destructive" className="w-full h-12 text-sm font-black rounded-2xl shadow-lg uppercase transition-all active:scale-95 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-4">
                                    <X className="h-4 w-4" /> RESET GENERATION
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                    <div className="space-y-4">
                        <Button variant="ghost" onClick={() => setShowAdvanced(!showAdvanced)} className="w-full h-12 rounded-2xl font-black uppercase tracking-[0.2em] text-[9px] text-muted-foreground/60 gap-3 border border-dashed border-primary/5 hover:bg-primary/5"><Settings2 className="h-4 w-4" />{showAdvanced ? 'Hide Advanced Settings' : 'Advanced Tuning Node'}{showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</Button>
                        {showAdvanced && (
                            <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden animate-in slide-in-from-top-4 duration-500">
                                <CardHeader className="bg-muted/30 border-b pb-4">
                                    <div className="flex justify-between items-center px-1">
                                        <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-muted-foreground/60"><Settings2 className="h-4 w-4" /> Synthesis Calibration</CardTitle>
                                        <Button variant="ghost" size="sm" className="h-7 text-[8px] font-black uppercase text-primary/60 hover:text-primary gap-1.5" onClick={handleResetSettings}>
                                            <RotateCcw className="h-3 w-3" /> RESET
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-8 space-y-8"><div className="space-y-4"><div className="flex justify-between items-center px-1"><Label className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Synthesis Steps (Fidelity)</Label><span className="text-[11px] font-black font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/5">{numStep}</span></div><Slider min={10} max={64} step={1} value={[numStep]} onValueChange={([v]) => setNumStep(v)} disabled={isLoading} className="h-1.5" /></div><Separator className="opacity-40" /><div className="space-y-4"><div className="flex justify-between items-center px-1"><Label className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Guidance Scale (Strictness)</Label><span className="text-[11px] font-black font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/5">{guidanceScale.toFixed(1)}</span></div><Slider min={0.1} max={4.0} step={0.1} value={[guidanceScale]} onValueChange={([v]) => setGuidanceScale(v)} disabled={isLoading} className="h-1.5" /></div></CardContent>
                            </Card>
                        )}
                    </div>
                </div>

                <div className="space-y-8 h-full flex flex-col">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden flex flex-col flex-1 min-h-[600px] border-t-4 border-t-primary">
                        <CardHeader className="bg-muted/30 border-b p-6 flex flex-row items-center justify-between">
                            <div className="space-y-1"><CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3"><HistoryIcon className="h-4 w-4 text-primary" />Synthesis History</CardTitle><CardDescription className="text-[9px] font-bold uppercase opacity-50">Secure Cloud Persistence</CardDescription></div>
                            {history.length > 0 && <Button variant="ghost" size="sm" onClick={handleClearAllHistory} className="h-7 text-[8px] font-black uppercase text-muted-foreground hover:text-destructive">Clear All</Button>}
                        </CardHeader>
                        <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
                            {/* 📱 5-Item Viewport Optimization */}
                            <ScrollArea ref={historyScrollAreaRef} className="h-[540px]">
                                <div className="p-4 sm:p-6 space-y-4">
                                    {history.length > 0 ? history.map((item) => {
                                        const isPlaying = playingId === item.id;
                                        return (
                                            <div key={item.id} className={cn("group p-4 rounded-[1.8rem] bg-white dark:bg-zinc-950 border border-primary/5 shadow-sm transition-all duration-300 hover:shadow-xl hover:border-primary/20", isPlaying && "ring-2 ring-primary bg-primary/[0.02]")}>
                                                <div className="flex items-start gap-4">
                                                    <Button variant="ghost" size="icon" className={cn("h-12 w-12 rounded-2xl flex-shrink-0 shadow-inner transition-all", isPlaying ? "bg-primary text-white scale-95" : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary")} onClick={() => togglePlay(item)}>{isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current ml-1" />}</Button>
                                                    <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                                                        <div className="flex justify-between items-start gap-4">
                                                            <button onClick={() => handleCopyScript(item.text)} className="text-left group/text">
                                                                <p className="font-bold text-sm leading-tight line-clamp-2 uppercase tracking-tight group-hover/text:text-primary transition-colors">{item.text}</p>
                                                            </button>
                                                            <span className="text-[8px] font-black text-muted-foreground/40 uppercase whitespace-nowrap">{format(new Date(item.timestamp), 'p')}</span>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge variant="secondary" className="h-5 px-2 text-[8px] font-black uppercase bg-primary/5 text-primary border-none shadow-inner"><Sparkles className="h-2 w-2 mr-1" /> Cloned</Badge>
                                                            <span className="text-[14px] opacity-20">•</span>
                                                            <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">{item.language}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10" onClick={() => handleDownload(item)}><Download className="h-4 w-4 text-muted-foreground" /></Button>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive/40 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteHistory(item.id)}><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="flex flex-col items-center justify-center py-32 text-center opacity-20 grayscale select-none gap-6"><div className="p-8 bg-muted rounded-[2.5rem] border-4 border-dashed border-primary/20"><RotateCcw className="h-16 w-16" /></div><div className="space-y-1"><p className="text-xl font-black uppercase tracking-widest">Archive Empty</p><p className="text-xs font-bold uppercase tracking-tight opacity-60">Generate clones to build history</p></div></div>
                                    )}
                                </div>
                            </ScrollArea>
                            <div className="p-6 bg-muted/20 border-t flex items-center justify-center gap-4">
                                <Badge variant="outline" className="h-6 px-3 rounded-full border-primary/10 bg-background text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                                    <ShieldCheck className="h-3 w-3 mr-2 text-green-500" /> SECURE HUB ARCHIVE ACTIVE
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <Dialog open={isTrimmerOpen} onOpenChange={setIsTrimmerOpen}>
                <DialogContent className="max-w-xl w-[95vw] rounded-[2.5rem] p-0 overflow-hidden border-none shadow-3xl bg-background">
                    <DialogHeader className="p-6 sm:p-8 pb-4 border-b bg-primary/5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary text-white rounded-2xl shadow-xl"><Scissors className="h-6 w-6" /></div>
                            <div>
                                <DialogTitle className="text-2xl font-black uppercase tracking-tight leading-none">CALIBRATION NODE</DialogTitle>
                                <DialogDescription className="font-bold text-[10px] uppercase opacity-40 tracking-widest mt-1">SELECT YOUR 3-10S VOICE SIGNATURE</DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="p-8 space-y-10">
                        <div className="flex flex-col items-center justify-center gap-6 py-4">
                            <div className="relative">
                                <div className={cn("absolute inset-0 bg-primary/20 rounded-full blur-3xl transition-all duration-500", isTrimmerPlaying ? "opacity-100 scale-125" : "opacity-0 scale-100")} />
                                <Button 
                                    size="icon" 
                                    variant="outline" 
                                    className="relative z-10 h-28 w-28 rounded-full border-4 border-primary/20 bg-background shadow-2xl active:scale-95 transition-all group"
                                    onClick={toggleTrimmerPlay}
                                >
                                    <div className="absolute inset-0 rounded-full border-2 border-primary/10 animate-ping opacity-20" />
                                    {isTrimmerPlaying ? <Pause className="h-12 w-12 fill-current text-primary" /> : <Play className="h-12 w-12 fill-current text-primary ml-1.5" />}
                                </Button>
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-primary">PREVIEW SELECTION</p>
                                <p className="text-4xl font-black font-mono tracking-tighter">
                                    {(trimRange[1] - trimRange[0]).toFixed(1)}S
                                </p>
                            </div>
                        </div>

                        <Card className="rounded-[2.2rem] border-primary/5 bg-muted/20 p-8 shadow-inner relative overflow-hidden">
                            <div className="space-y-8 relative z-10">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase text-muted-foreground/60 px-1">
                                    <span>START: {trimRange[0].toFixed(1)}S</span>
                                    <span>END: {trimRange[1].toFixed(1)}S</span>
                                </div>
                                
                                <div className="relative pt-2 pb-6">
                                    <Slider 
                                        min={0} 
                                        max={originalBuffer?.duration || 10} 
                                        step={0.1} 
                                        value={trimRange} 
                                        onValueChange={handleSliderChange}
                                        className="h-3"
                                    />
                                    {isTrimmerPlaying && (
                                        <div 
                                            className="absolute top-0 h-1.5 bg-primary/40 rounded-full pointer-events-none transition-all duration-100"
                                            style={{ 
                                                left: `${(trimmerCurrentTime / (originalBuffer?.duration || 10)) * 100}%`,
                                                width: '2px'
                                            }}
                                        />
                                    )}
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-background/80 rounded-2xl border border-primary/10 shadow-sm">
                                    <ShieldAlert className="h-4 w-4 text-primary shrink-0" />
                                    <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/80 leading-snug">
                                        OPTIMAL SIGNATURE IS 5-8 SECONDS FOR HIGH FIDELITY.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <DialogFooter className="p-8 border-t bg-muted/10 flex flex-col gap-4">
                        <Button 
                            onClick={handleApplyTrim} 
                            disabled={isTrimming} 
                            className="w-full h-16 rounded-[1.8rem] font-black text-lg btn-shine shadow-2xl shadow-primary/30 uppercase tracking-tighter gap-3"
                        >
                            {isTrimming ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}
                            FINALIZE & DOWNLOAD
                        </Button>
                        <Button 
                            variant="ghost" 
                            onClick={() => setIsTrimmerOpen(false)} 
                            className="w-full h-10 font-black uppercase text-[10px] tracking-[0.3em] text-muted-foreground/60 hover:text-destructive transition-colors"
                        >
                            ABORT
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="mt-16 text-center space-y-4 opacity-30">
                <Separator className="max-w-xs mx-auto" /><p className="text-[9px] font-bold uppercase tracking-widest leading-relaxed">Powered by the 12Labs Neural Architecture • Broadcast Grade WAV Standard</p>
            </div>
            </div>
        </div>
    );
}

function saveAs(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
