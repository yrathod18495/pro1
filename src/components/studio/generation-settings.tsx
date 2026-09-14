'use client';

import { useStudio } from '@/context/studio-provider';
import { GenerationFeedback } from '@/components/studio/generation-feedback';
import { useAuth } from '@/context/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, AlertTriangle, Sparkles, Clock, Coins, Play, Pause, FileText, Loader2, Cpu, CheckCircle, Download, Activity, ShieldCheck, History, Plus, Radio, X, Info } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { cn, getDisplayUrl, localSaveFile } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect, useRef } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { reportClientError } from '@/lib/report-client-error';

const GENRE_IMAGES: Record<string, string> = {
  'horror': 'https://storage.12labs.in/Uploaded%20previews/horror_story_preview.webp',
  'documentary': 'https://storage.12labs.in/Uploaded%20previews/20260820_095435.jpg',
  'tooni chidiya': 'https://storage.12labs.in/Uploaded%20previews/tooni_chidiya_stories_preview-1.webp',
  'animals': 'https://storage.12labs.in/Uploaded%20previews/animals_story_preview.webp',
  'moral': 'https://storage.12labs.in/Uploaded%20previews/moral_story_preview.webp'
};

export function GenerationSettings() {
    const { user } = useAuth();
    const { 
        characters, 
        handleGeneration, 
        isGenerating, 
        hqProject, 
        isHqProjectLoading, 
        generatedAudio, 
        generatedAudioUrl,
        scriptAnalysis, 
        generationMode, 
        setGenerationMode, 
        isPaused, 
        togglePause,
        isFinalizing,
        projectName,
        generatedLines,
        isPremiumOnlyMode,
        showPremiumBlock,
        hqProjectId,
        realtimeProgress,
        clearStudioState,
        pricing,
        charsPerMinute,
        selectedGenre,
        setSelectedGenre
    } = useStudio();
    const { voiceEngine } = useStudio();
    const router = useRouter();
    const { toast } = useToast();

    const [isFastGenLocked, setIsFastGenLocked] = useState(false);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const { database } = initializeFirebase();

    const [visibleBlocks, setVisibleBlocks] = useState(0);
    const [activeLog, setActiveLog] = useState('Initializing Production Hub...');
    const introSequenceStarted = useRef(false);

    const isAdmin = user?.role === 'admin';
    const isSponsor = user?.isSponsor === true;
    const isPaidUser = user?.hasMadeFirstPurchase === true || (user?.totalInvestment || 0) > 0;
    
    const isHqActive = !!hqProjectId || (hqProject && (hqProject.status === 'in_queue' || hqProject.status === 'processing'));
    const isHqReady = hqProject?.status === 'completed' && !!hqProject.audioUrl;
    const THEME_BG_IMAGE = "https://storage.googleapis.com/12labspublic/store/previews/20260721_134259.jpg";

    useEffect(() => {
        if (isHqActive && !isHqReady && !introSequenceStarted.current) {
            introSequenceStarted.current = true;
            const t1 = setTimeout(() => setVisibleBlocks(1), 150);
            const t2 = setTimeout(() => setVisibleBlocks(2), 500);
            const t3 = setTimeout(() => setVisibleBlocks(3), 850);
            const t4 = setTimeout(() => setVisibleBlocks(4), 1100);
            return () => {
                clearTimeout(t1); clearTimeout(t2);
                clearTimeout(t3); clearTimeout(t4);
            };
        } else if (!isHqActive) {
            setVisibleBlocks(0);
            introSequenceStarted.current = false;
        } else if (isHqReady) {
            setVisibleBlocks(4); 
        }
    }, [isHqActive, isHqReady]);

    useEffect(() => {
        if (isHqActive && !isHqReady) {
            const logs = [
                "Warming up the voice engine…",
                "Syncing with the neural cluster…",
                "Rendering character voices…",
                "Matching emotion and pacing…",
                "Stitching audio segments…",
                "Aligning the timeline…",
                "Balancing levels…",
                "Running quality checks…",
                "Finalizing the master track…",
            ];
            let i = 0;
            const interval = setInterval(() => {
                if (visibleBlocks >= 3) {
                    // Slip in a real progress line every few ticks so the
                    // feed reads as this generation's actual work, not just
                    // generic flavour text.
                    const total = realtimeProgress?.total || 0;
                    const done = realtimeProgress?.processed || 0;
                    if (total > 0 && i % 3 === 1) {
                        setActiveLog(`Rendered ${done} of ${total} lines…`);
                    } else {
                        setActiveLog(logs[i % logs.length]);
                    }
                    i += 1;
                }
            }, 2400);
            return () => clearInterval(interval);
        } else if (isHqReady) {
            setActiveLog("Master ready • all lines rendered ✅");
        }
    }, [isHqActive, isHqReady, visibleBlocks, realtimeProgress]);

    useEffect(() => {
        if (!database) {
            setIsLoadingSettings(false);
            return;
        }
        const fastGenLockRef = ref(database, 'toolSettings/fast-generation');
        const unsubscribe = onRtdbValue(fastGenLockRef, (snapshot) => {
            const setting = snapshot.val();
            const locked = setting?.locked === true;
            if (isAdmin) {
                setIsFastGenLocked(false);
            } else {
                setIsFastGenLocked(locked);
                if (locked && generationMode === 'fast') {
                    setGenerationMode('high-quality');
                }
            }
            setIsLoadingSettings(false);
        });
        return () => unsubscribe();
    }, [database, generationMode, setGenerationMode, isAdmin]);

    const handleDownloadDirect = async (url: string, name: string) => {
        if (!url) return;
        setIsDownloading(true);
        try {
            const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'master';
            await localSaveFile(url, `12labs_master_${safeName}.wav`);
        } catch (e) {
            reportClientError('src/components/studio/generation-settings.tsx:160', e);
            toast({ variant: 'destructive', title: 'Download Failed' });
        } finally {
            setIsDownloading(false);
        }
    };

    if (isHqActive || isHqReady) {
        const displayTotal = realtimeProgress?.total || hqProject?.syncData?.dialogues?.length || (hqProject as any)?.totalDialogues || 0;
        const displayProcessed = isHqReady ? displayTotal : (realtimeProgress?.processed || 0);
        // Rejected count: while running it comes live from RTDB; once done
        // the RTDB queue node is gone, so read the value 11.py/studio.py
        // persist to the Firestore doc (rejectedNodes). The old code forced
        // this to 0 on completion, which is why a finished project always
        // showed "0 REJECTED" even when lines really failed.
        const displayRejected = isHqReady
            ? ((hqProject as any)?.rejectedNodes || 0)
            : (realtimeProgress?.rejected || 0);
        // processed_dialogues already counts EVERY finished line, including
        // rejected ones, so don't add rejected again — that pushed the bar
        // past 100%. Clamp for safety.
        const progressPercent = isHqReady
            ? 100
            : (displayTotal > 0 ? Math.min(100, (displayProcessed / displayTotal) * 100) : 0);
        const succeeded = Math.max(0, displayProcessed - displayRejected);

        return (
            <div className="relative w-full max-w-xl mx-auto space-y-3 animate-in fade-in duration-700">
                <div className="fixed inset-0 z-0 pointer-events-none opacity-60 overflow-hidden">
                    <img src={THEME_BG_IMAGE} alt="Theme" className="w-full h-full object-cover scale-110" />
                </div>

                <div className="relative z-10 space-y-3">
                    {/* 1 — Header: brand + status. Compact. */}
                    {visibleBlocks >= 1 && (
                        <Card className="border-border dark:border-white/10 shadow-lg bg-card dark:bg-white/[0.03] backdrop-blur-2xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                            <CardContent className="p-4 flex items-center justify-between gap-3">
                                <div className="space-y-1.5 flex-1 min-w-0">
                                    <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tighter flex items-center gap-1.5 text-zinc-900 dark:text-white">
                                        SUPERFAST <span className="text-primary italic flex items-center"><Zap className="h-4 w-4 sm:h-6 sm:w-6 fill-current" /><Zap className="h-4 w-4 sm:h-6 sm:w-6 fill-current -ml-1.5" /></span>
                                    </h2>
                                    <Badge className="bg-primary/10 text-primary border-none font-black text-[8px] uppercase tracking-widest px-2.5 h-5 rounded-full">
                                        {isHqReady ? 'RENDER COMPLETE' : 'NEURAL CLUSTER ACTIVE'}
                                    </Badge>
                                </div>
                                <div className="relative shrink-0">
                                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse scale-125" />
                                    <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-full border-2 border-border dark:border-white/10 bg-card dark:bg-[#0a0a0b]/80 flex items-center justify-center shadow-xl">
                                        <Zap className="h-6 w-6 sm:h-7 sm:w-7 text-primary fill-current" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 2 — Progress metrics. Compact. */}
                    {visibleBlocks >= 2 && (
                        <Card className="border-border dark:border-white/10 shadow-lg bg-card dark:bg-white/[0.03] backdrop-blur-2xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-0.5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-primary">Progress</p>
                                        <p className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white uppercase">
                                            {displayProcessed} / {displayTotal || '...'} Signals
                                        </p>
                                    </div>
                                    <span className="text-3xl sm:text-4xl font-black text-primary tracking-tighter leading-none">
                                        {Math.round(progressPercent)}%
                                    </span>
                                </div>
                                <Progress value={progressPercent} className="h-2 rounded-full bg-muted dark:bg-white/5 overflow-hidden" />
                            </CardContent>
                        </Card>
                    )}

                    {/* 3 — Status + live counters MERGED into one card (was two:
                        "Rendering Files" and "Listening Mode"). */}
                    {visibleBlocks >= 3 && (
                        <Card className="border-border dark:border-white/10 shadow-lg bg-card dark:bg-white/[0.03] backdrop-blur-2xl rounded-3xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-primary/10 rounded-2xl border border-border dark:border-white/10 shrink-0">
                                        <Zap className={cn("h-5 w-5 sm:h-6 sm:w-6 text-primary fill-current", !isHqReady && "animate-pulse")} />
                                    </div>
                                    <div className="space-y-0.5 min-w-0 text-zinc-900 dark:text-white flex-1">
                                        <p className="text-[9px] font-black uppercase text-primary tracking-widest animate-in fade-in duration-500 truncate" key={activeLog}>
                                            {activeLog}
                                        </p>
                                        <h3 className="text-base sm:text-lg font-black uppercase tracking-tight leading-none">
                                            {isHqReady ? 'RENDER COMPLETE' : 'RENDERING FILES'}
                                        </h3>
                                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest opacity-60">Parallel Synthesis Mode</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-muted dark:bg-white/5 py-2.5 rounded-2xl border border-border dark:border-white/5 flex flex-col items-center justify-center">
                                        <span className="text-lg sm:text-xl font-black text-green-600 leading-none">{succeeded}</span>
                                        <span className="text-[7px] font-black uppercase text-zinc-600 mt-1 tracking-tighter">DONE</span>
                                    </div>
                                    <div className={cn("py-2.5 rounded-2xl border flex flex-col items-center justify-center", displayRejected > 0 ? "bg-red-500/10 border-red-500/20" : "bg-muted dark:bg-white/5 border-border dark:border-white/5")}>
                                        <span className={cn("text-lg sm:text-xl font-black leading-none", displayRejected > 0 ? "text-red-500" : "text-zinc-400")}>{displayRejected}</span>
                                        <span className={cn("text-[7px] font-black uppercase mt-1 tracking-tighter", displayRejected > 0 ? "text-red-500/70" : "text-zinc-500")}>REJECTED</span>
                                    </div>
                                    <div className="bg-muted dark:bg-white/5 py-2.5 rounded-2xl border border-border dark:border-white/5 flex flex-col items-center justify-center">
                                        <span className="text-lg sm:text-xl font-black text-primary leading-none">{displayTotal || 0}</span>
                                        <span className="text-[7px] font-black uppercase text-zinc-600 mt-1 tracking-tighter">TOTAL</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 4 — Completed: player + download + new, all in ONE card. */}
                    {isHqReady && (
                        <Card className="border-border dark:border-white/10 shadow-lg bg-card dark:bg-white/[0.03] backdrop-blur-2xl rounded-3xl overflow-hidden animate-in zoom-in duration-500">
                            <CardContent className="p-4 space-y-3">
                                <div className="bg-muted dark:bg-black/60 backdrop-blur-xl p-3 rounded-2xl border border-border dark:border-white/10">
                                    <audio src={getDisplayUrl(hqProject?.audioUrl)} controls className="w-full h-10" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                                    <Button onClick={() => handleDownloadDirect(hqProject!.audioUrl!, hqProject!.projectName!)} disabled={isDownloading} className="h-12 rounded-2xl font-black text-sm sm:text-base bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20 btn-shine text-white">
                                        {isDownloading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Download className="h-5 w-5 mr-2" />}
                                        DOWNLOAD MASTER
                                    </Button>
                                    <Button onClick={clearStudioState} variant="outline" className="h-12 px-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border-border dark:border-white/10 bg-background dark:bg-white/5 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10">
                                        <Plus className="mr-1.5 h-4 w-4" /> NEW
                                    </Button>
                                </div>
                                <GenerationFeedback
                                    projectName={hqProject?.projectName || projectName}
                                    mode="high-quality"
                                    engine={voiceEngine}
                                />
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        );
    }

    const isStandardAudioReady = !isGenerating && !isFinalizing && (!!generatedAudio || !!generatedAudioUrl || (generatedLines.length > 0 && generatedLines.every(l => l.status === 'done')));
    const masterAudioUrl = hqProject?.audioUrl || generatedAudioUrl || (generatedAudio ? URL.createObjectURL(generatedAudio) : null);

    if (isStandardAudioReady && !isHqActive) {
        const displayMasterUrl = masterAudioUrl ? getDisplayUrl(masterAudioUrl) : null;
        return (
            <Card className="border-border dark:border-white/10 shadow-2xl bg-card dark:bg-white/[0.02] backdrop-blur-3xl overflow-hidden rounded-[2rem] border-emerald-500/20">
                <CardHeader className="bg-emerald-500/5 pb-6 border-b border-emerald-500/10">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl shadow-inner">
                                <CheckCircle className="h-6 w-6" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground dark:text-white">Voice Master Ready ✅</CardTitle>
                                <CardDescription className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
                                    {projectName || 'Master Project'} • Synthesis Complete
                                </CardDescription>
                            </div>
                        </div>
                        <Badge className="bg-emerald-600 text-white font-black text-[9px] uppercase px-3 py-1 rounded-full shadow-sm">
                            COMPLETED
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    {displayMasterUrl ? (
                        <div className="bg-muted dark:bg-black/40 p-4 sm:p-5 rounded-[2rem] border-2 border-dashed border-emerald-500/20 space-y-2 shadow-inner">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">
                                <span className="flex items-center gap-1.5 text-emerald-500"><Play className="h-3 w-3 fill-current" /> Play Master Audio</span>
                                <span>100% Complete</span>
                            </div>
                            <audio src={displayMasterUrl} controls className="w-full h-10 sm:h-12" />
                        </div>
                    ) : (
                        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold text-center">
                            All dialogue nodes generated successfully. Scroll down to listen or download individual nodes.
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {displayMasterUrl && (
                            <Button 
                                onClick={() => handleDownloadDirect(displayMasterUrl, projectName || 'master')} 
                                disabled={isDownloading} 
                                className="h-14 rounded-2xl font-black text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20 btn-shine uppercase"
                            >
                                {isDownloading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Download className="h-5 w-5 mr-2" />}
                                DOWNLOAD MASTER
                            </Button>
                        )}
                        <Button 
                            onClick={() => router.push('/history')} 
                            variant="outline" 
                            className="h-14 rounded-2xl font-black text-xs uppercase tracking-wider border-border dark:border-white/10 bg-background dark:bg-white/5 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10"
                        >
                            <History className="mr-2 h-4 w-4 text-primary" /> VIEW IN HISTORY
                        </Button>
                    </div>

                    <div className="pt-2 border-t border-border dark:border-white/5 flex flex-col gap-2">
                        <Button 
                            onClick={clearStudioState} 
                            variant="default" 
                            className="w-full h-12 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary hover:bg-primary/90 text-white shadow-md"
                        >
                            <Plus className="mr-2 h-4 w-4" /> START NEW SCRIPT
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const currentCost = scriptAnalysis?.cost || 0;
    const totalChars = scriptAnalysis?.characterCount || 0;
    const isCostTooHighForFastGen = totalChars > 5000;
    const isFastGenDisabled = isFastGenLocked || (isCostTooHighForFastGen && !isAdmin && !isSponsor);
    const isProjectNameSet = projectName && projectName.trim() !== '';
    const allVoicesAssigned = characters.length > 0 && characters.every(c => c.voice && c.voice.trim() !== '');
    const isReady = allVoicesAssigned && isProjectNameSet;
    const canAfford = isAdmin || isSponsor || (user ? Number((user as any).credits ?? 0) >= currentCost : false);

    // Dynamic Estimated Audio Runtime based on Admin setting (charsPerMinute, e.g. 700 chars = 1 min)
    const charsPerMin = charsPerMinute || 800;
    const estTotalSeconds = Math.max(1, Math.round((totalChars / charsPerMin) * 60));
    const formatRuntime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) {
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    const estRuntimeStr = formatRuntime(estTotalSeconds);

    if (!scriptAnalysis || isGenerating || isFinalizing) {
        return null;
    }

    return (
        <Card className="border-border/60 shadow-2xl bg-card/90 dark:bg-white/[0.02] backdrop-blur-3xl overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-primary/5 pb-5 border-b border-border/60">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                         <div className="p-3 bg-primary/10 rounded-2xl shadow-inner"><Zap className="h-6 w-6 text-primary"/></div>
                         <div>
                            <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">Engine Core</CardTitle>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">SuperFast Neural Rendering</p>
                         </div>
                    </div>
                    {/* 🔴 NEW: shows which VOICE engine (Gemini / 11Labs) is
                        currently selected — this toggle lives on the
                        character-assignments screen, not here, so this is
                        a read-only indicator so it's never ambiguous which
                        one a generation will use. */}
                    <Badge className={cn(
                        "shrink-0 font-black text-[10px] uppercase tracking-wider px-3 h-7 rounded-full flex items-center gap-1 border-none",
                        voiceEngine === 'elevenlabs' ? "bg-purple-500/15 text-purple-500" : "bg-blue-500/15 text-blue-500"
                    )}>
                        <Zap className="h-3 w-3 fill-current" /><Zap className="h-3 w-3 fill-current -ml-2" />
                        {voiceEngine === 'elevenlabs' ? '11Labs Engine' : 'Google Engine'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
                {/* 🔴 NEW: mode is always SuperFast now — the
                    SuperFast/Standard-Fast RadioGroup that used to live
                    here is gone; generationMode defaults to 'high-quality'
                    and there's nothing left for the user to pick. */}
                <div className="rounded-[1.75rem] border border-border/60 p-5 space-y-3 bg-muted/20 dark:bg-white/[0.01] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-[0.03] pointer-events-none text-foreground"><Sparkles className="h-20 w-20" /></div>
                    <div className="flex justify-between items-center gap-3">
                        <div className="space-y-0.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Credit Cost</p>
                            <div className="flex items-center gap-1.5">
                                <span className="font-mono font-black text-2xl text-primary leading-none">{currentCost.toLocaleString()}</span>
                                <span className="text-[10px] font-bold text-muted-foreground">credits</span>
                            </div>
                        </div>
                        <div className="space-y-0.5 text-right">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Est. Time</p>
                            <p className="text-xl font-black font-mono leading-none text-foreground">{estRuntimeStr}</p>
                        </div>
                    </div>
                    <Separator className="opacity-20" />
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground px-0.5">
                        <span>{(scriptAnalysis?.dialogueCount || generatedLines.length || 0).toLocaleString()} dialogues</span>
                        <Badge variant="outline" className="border-primary/20 text-primary font-black text-[8px] h-5">STANDARD RATE</Badge>
                    </div>
                </div>

                {!isGenerating && !isPaused && (
                    <div className="rounded-[1.75rem] border border-border/60 p-4 bg-muted/15 dark:bg-white/[0.01] animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex gap-4 items-start">
                            {/* Genre picker — left column */}
                            <div className="flex-1 min-w-0 space-y-2">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                    <Sparkles className="h-3 w-3 text-primary animate-pulse" /> Select Genre
                                </Label>
                                <Select value={selectedGenre} onValueChange={(v) => setSelectedGenre(v)}>
                                    <SelectTrigger className="h-11 rounded-xl bg-muted/20 font-bold border-primary/5 text-foreground text-sm">
                                        <SelectValue placeholder="Select genre" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl bg-popover text-popover-foreground border border-border">
                                        <SelectItem value="horror">Horror</SelectItem>
                                        <SelectItem value="documentary">Documentary</SelectItem>
                                        <SelectItem value="tooni chidiya">Tooni Chidiya</SelectItem>
                                        <SelectItem value="animals">Animals</SelectItem>
                                        <SelectItem value="moral">Moral</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[9px] text-muted-foreground font-semibold leading-snug">Tuning voice synthesis specifically for this category.</p>
                            </div>

                            {/* 🔴 NEW: small square thumbnail, right column —
                                was a full-width 16:9 banner before. */}
                            {GENRE_IMAGES[selectedGenre] && (
                                <div className="relative w-20 h-20 shrink-0 rounded-2xl overflow-hidden border border-border/40 shadow-inner animate-in fade-in zoom-in-95 duration-300">
                                    <Image 
                                        src={GENRE_IMAGES[selectedGenre]} 
                                        alt={`${selectedGenre} preview`} 
                                        fill 
                                        className="object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm py-0.5">
                                        <span className="block text-white text-[6px] font-black uppercase tracking-wider text-center truncate px-1">
                                            {selectedGenre}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {isPremiumOnlyMode && !isAdmin && !isSponsor && !isPaidUser && (
                    <div className="flex items-center gap-4 text-xs font-black text-destructive p-5 bg-destructive/10 rounded-[2rem] border border-destructive/20 animate-in slide-in-from-top-2">
                        <AlertTriangle className="h-6 w-6 flex-shrink-0" />
                        <div className="space-y-1">
                            <p className="uppercase tracking-widest text-destructive">Premium Node Restricted</p>
                            <p className="text-[10px] font-bold opacity-70">Purchase credits to unlock this tool.</p>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter className="p-8 pt-0 flex flex-col gap-4">
                <Button 
                    onClick={() => { if (isPremiumOnlyMode && !isAdmin && !isSponsor && !isPaidUser) showPremiumBlock(); else handleGeneration(); }} 
                    disabled={isFinalizing || !isReady || !canAfford || (isFastGenDisabled && generationMode === 'fast')} 
                    className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine uppercase transition-all active:scale-95 group text-white"
                >
                    {isFinalizing ? <Loader2 className="mr-3 h-8 w-8 animate-spin" /> : <Sparkles className="mr-3 h-8 w-8 fill-current group-hover:rotate-12 transition-transform" />}
                    <span>Start {generationMode === 'high-quality' ? 'SuperFast' : 'Generation'}</span>
                </Button>

                {!canAfford && isReady && !isGenerating && !isPaused && (
                    <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-[1.5rem] bg-destructive/10 text-destructive border border-destructive/20 w-full animate-in fade-in duration-500">
                        <div className="flex items-center gap-2">
                             <AlertTriangle className="h-4 w-4 shrink-0" />
                             <p className="text-[10px] font-black uppercase tracking-widest text-center">NOT ENOUGH CREDITS</p>
                        </div>
                        <p className="text-[9px] font-bold uppercase opacity-80">REQUIRED {currentCost.toLocaleString()} · AVAILABLE {Number((user as any)?.credits ?? 0).toLocaleString()}</p>
                        <Button variant="link" className="p-0 h-auto text-[10px] font-black text-primary underline uppercase tracking-widest" onClick={() => router.push('/buy-credits')}>
                            Buy Credits
                        </Button>
                    </div>
                )}

                {!isReady && !isGenerating && !isPaused && (
                    <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-[1.5rem] bg-destructive/10 text-destructive border border-destructive/20 w-full animate-in fade-in duration-500">
                        <div className="flex items-center gap-2">
                             <AlertTriangle className="h-4 w-4 shrink-0" />
                             <p className="text-[10px] font-black uppercase tracking-widest text-center">VALIDATION ERROR</p>
                        </div>
                        <p className="text-[9px] font-bold uppercase opacity-80">ENTER PROJECT NAME & ASSIGN VOICES</p>
                    </div>
                )}
            </CardFooter>
        </Card>
    );
}
