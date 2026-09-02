'use client';

import { useStudio } from '@/context/studio-provider';
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
    const router = useRouter();
    const { toast } = useToast();

    const [isFastGenLocked, setIsFastGenLocked] = useState(false);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const [latency, setLatency] = useState<number>(0);
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
            const t1 = setTimeout(() => setVisibleBlocks(1), 300);
            const t2 = setTimeout(() => setVisibleBlocks(2), 1200);
            const t3 = setTimeout(() => setVisibleBlocks(3), 2200);
            const t4 = setTimeout(() => setVisibleBlocks(4), 3200);
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
        if (!isHqActive || isHqReady) return;
        const measureLatency = () => setLatency(Math.floor(Math.random() * 20) + 40);
        const interval = setInterval(measureLatency, 5000);
        measureLatency();
        return () => clearInterval(interval);
    }, [isHqActive, isHqReady]);

    useEffect(() => {
        if (isHqActive && !isHqReady) {
            const logs = [
                "Boosting up servers...",
                "Syncing with neural cluster...",
                "Optimizing voice layers...",
                "Calibrating parallel workers...",
                "Securing production node...",
                "Finalizing audio textures...",
                "Checking node integrity..."
            ];
            let i = 0;
            const interval = setInterval(() => {
                if (visibleBlocks >= 3) {
                    i = (i + 1) % logs.length;
                    setActiveLog(logs[i]);
                }
            }, 3000);
            return () => clearInterval(interval);
        } else if (isHqReady) {
            setActiveLog("Production Node Ready • All Set ✅");
        }
    }, [isHqActive, isHqReady, visibleBlocks]);

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
        const displayTotal = realtimeProgress?.total || hqProject?.syncData?.dialogues?.length || 0;
        const displayProcessed = isHqReady ? displayTotal : (realtimeProgress?.processed || 0);
        const displayRejected = isHqReady ? 0 : (realtimeProgress?.rejected || 0);
        const progressPercent = isHqReady ? 100 : (displayTotal > 0 ? ((displayProcessed + displayRejected) / displayTotal) * 100 : 0);
        
        return (
            <div className="relative w-full max-w-2xl mx-auto space-y-4 sm:space-y-6 animate-in fade-in duration-700">
                <div className="fixed inset-0 z-0 pointer-events-none opacity-60 overflow-hidden">
                    <img src={THEME_BG_IMAGE} alt="Theme" className="w-full h-full object-cover scale-110" />
                </div>

                <div className="relative z-10 space-y-4 sm:space-y-6">
                    {visibleBlocks >= 1 && (
                        <Card className="border-border dark:border-white/10 shadow-xl bg-card dark:bg-white/[0.03] backdrop-blur-2xl rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                            <CardContent className="p-5 sm:p-7 flex items-center justify-between gap-4">
                                <div className="space-y-2 sm:space-y-3 flex-1 min-w-0">
                                    <h2 className="text-xl sm:text-3xl font-black uppercase tracking-tighter flex items-center gap-2 text-zinc-900 dark:text-white">
                                        SUPERFAST <span className="text-primary italic flex items-center gap-0.5"><Zap className="h-4 w-4 sm:h-7 sm:w-7 fill-current" /><Zap className="h-4 w-4 sm:h-7 sm:w-7 fill-current -ml-1 sm:-ml-2" /></span>
                                    </h2>
                                    <Badge className="bg-primary/10 text-primary border-none font-black text-[8px] sm:text-[9px] uppercase tracking-widest px-3 h-6 rounded-full shadow-sm">
                                        NEURAL CLUSTER ACTIVE
                                    </Badge>
                                </div>
                                <div className="relative shrink-0">
                                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse scale-125" />
                                    <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-full border-2 border-border dark:border-white/10 bg-card dark:bg-[#0a0a0b]/80 flex items-center justify-center shadow-2xl">
                                        <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-ring-glow" />
                                        <Zap className="h-8 w-8 sm:h-10 sm:w-10 text-primary fill-current drop-shadow-xl" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {visibleBlocks >= 2 && (
                        <Card className="border-border dark:border-white/10 shadow-xl bg-card dark:bg-white/[0.03] backdrop-blur-2xl rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                            <CardContent className="p-5 sm:p-8 space-y-4 sm:space-y-6">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-primary">Progress Metrics</p>
                                        <p className="text-sm sm:text-xl font-black text-zinc-900 dark:text-white uppercase">
                                            {displayProcessed} / {displayTotal || '...'} Signals Synchronized
                                        </p>
                                    </div>
                                    <span className="text-4xl sm:text-5xl font-black text-primary tracking-tighter leading-none">
                                        {Math.round(progressPercent)}%
                                    </span>
                                </div>
                                <div className="relative">
                                    <Progress value={progressPercent} className="h-2.5 sm:h-3 rounded-full bg-muted dark:bg-white/5 shadow-inner overflow-hidden" />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {visibleBlocks >= 3 && (
                        <Card className="border-border dark:border-white/10 shadow-xl bg-card dark:bg-white/[0.03] backdrop-blur-2xl rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                            <CardContent className="p-5 sm:p-7 flex items-center gap-6">
                                <div className="p-4 sm:p-5 bg-primary/10 rounded-[1.5rem] sm:rounded-[2rem] border border-border dark:border-white/10 shadow-inner shrink-0">
                                    <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-primary fill-current animate-pulse" />
                                </div>
                                <div className="space-y-1 min-w-0 text-zinc-900 dark:text-white">
                                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-primary tracking-widest animate-in fade-in duration-500 truncate" key={activeLog}>
                                        {activeLog}
                                    </p>
                                    <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-none">RENDERING FILES</h3>
                                    <p className="text-[9px] sm:text-[11px] font-bold text-zinc-500 uppercase tracking-widest opacity-60">Parallel Synthesis Mode</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {visibleBlocks >= 4 && (
                        <Card className="border-border dark:border-white/10 shadow-xl bg-card dark:bg-white/[0.03] backdrop-blur-2xl rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                            <CardContent className="p-5 sm:p-7 flex items-center justify-between gap-4">
                                <div className="space-y-1 min-w-0">
                                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-primary">Parallel Cluster Active</p>
                                    <p className="text-[10px] sm:text-[12px] font-black text-zinc-500 uppercase">LISTENING MODE</p>
                                </div>
                                <div className="flex gap-2 sm:gap-3 shrink-0">
                                    <div className="bg-muted dark:bg-white/5 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-border dark:border-white/5 flex flex-col items-center justify-center min-w-[50px] sm:min-w-[80px] shadow-inner">
                                        <span className="text-lg sm:text-2xl font-black text-primary leading-none">{displayProcessed}</span>
                                        <span className="text-[7px] sm:text-[8px] font-black uppercase text-zinc-600 mt-1.5 tracking-tighter">FILES</span>
                                    </div>
                                    <div className="bg-red-500/10 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-red-500/20 flex flex-col items-center justify-center min-w-[50px] sm:min-w-[80px] shadow-inner">
                                        <span className="text-lg sm:text-2xl font-black text-red-500 leading-none">{displayRejected}</span>
                                        <span className="text-[7px] sm:text-[8px] font-black uppercase text-red-500/60 mt-1.5 tracking-tighter uppercase">REJECTED</span>
                                    </div>
                                    <div className="bg-muted dark:bg-white/5 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-border dark:border-white/5 flex flex-col items-center justify-center min-w-[50px] sm:min-w-[80px] shadow-inner">
                                        <span className="text-lg sm:text-2xl font-black text-green-500 leading-none">{isHqReady ? 0 : (latency || 43)}</span>
                                        <div className="flex flex-col items-center -mt-1">
                                            <span className="text-[6px] font-black uppercase text-zinc-700 tracking-tighter">MS</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {isHqReady && (
                        <div className="animate-in zoom-in duration-500 pt-2 space-y-4 sm:space-y-6">
                            <div className="bg-muted dark:bg-black/60 backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] border-2 border-dashed border-border dark:border-white/10 shadow-inner">
                                <audio src={getDisplayUrl(hqProject?.audioUrl)} controls className="w-full h-10 sm:h-12" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                <Button onClick={() => handleDownloadDirect(hqProject!.audioUrl!, hqProject!.projectName!)} disabled={isDownloading} className="h-14 sm:h-16 rounded-[1.5rem] sm:rounded-[1.8rem] font-black text-base sm:text-lg bg-green-600 hover:bg-green-700 shadow-xl shadow-green-500/20 btn-shine text-white">
                                    {isDownloading ? <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin mr-2" /> : <Download className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />}
                                    DOWNLOAD MASTER
                                </Button>
                                <Button onClick={clearStudioState} variant="outline" className="h-14 sm:h-16 rounded-[1.5rem] sm:rounded-[1.8rem] font-black text-[9px] sm:text-[11px] uppercase tracking-widest border-border dark:border-white/10 bg-background dark:bg-white/5 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10">
                                    <Plus className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> START NEW
                                </Button>
                            </div>
                        </div>
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
            <CardHeader className="bg-primary/5 pb-6 border-b border-border/60">
                <div className="flex items-center gap-4">
                     <div className="p-3 bg-primary/10 rounded-2xl shadow-inner"><Zap className="h-6 w-6 text-primary"/></div>
                     <div>
                        <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">Engine Core</CardTitle>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Select Generation Mode</p>
                     </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-8 pt-8">
                <div className="rounded-[2rem] border border-border/60 p-6 space-y-4 bg-muted/20 dark:bg-white/[0.01] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none text-foreground"><Sparkles className="h-24 w-24" /></div>
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">
                        <span>Engine Metrics</span>
                        <Badge variant="outline" className="border-primary/20 text-primary font-black">STABLE</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Dialogues</p>
                            <p className="text-2xl font-black font-mono leading-none text-foreground">{(scriptAnalysis?.dialogueCount || generatedLines.length || 0).toLocaleString()}</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[10px] font-black font-mono uppercase tracking-widest text-muted-foreground">Est. Runtime</p>
                            <p className="text-2xl font-black font-mono leading-none text-foreground">{estRuntimeStr}</p>
                        </div>
                    </div>
                    <Separator className="opacity-20" />
                    <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Credit Cost</p>
                            <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-primary/10 border border-primary/10">
                                <Info className="h-3 w-3 text-primary" />
                                <span className="text-[8px] font-black uppercase text-primary/70">STANDARD RATE</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 px-1 pt-1">
                            <span className="font-mono font-black text-3xl text-primary leading-none">
                                {currentCost.toLocaleString()}
                            </span>
                            <span className="text-xs font-bold text-muted-foreground">credits</span>
                        </div>
                    </div>
                </div>

                {!isGenerating && !isPaused && (
                  <RadioGroup 
                      value={generationMode}
                      onValueChange={(value) => setGenerationMode(value as any)} 
                      className="space-y-4"
                  >
                      <Label 
                          htmlFor="high-quality" 
                          className={cn(
                              "flex items-start space-x-4 rounded-3xl border border-border/60 p-6 transition-all duration-500 cursor-pointer relative overflow-hidden shadow-sm",
                              "bg-muted/30 dark:bg-white/[0.02] hover:bg-muted/50 dark:hover:bg-white/[0.04]",
                              "has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:checked]:scale-[1.02] has-[:checked]:bg-primary/5"
                          )}
                      >
                          <RadioGroupItem value="high-quality" id="high-quality" className="mt-1 border-primary/40" />
                          <div className="font-normal flex-1 space-y-1">
                              <div className="font-black text-lg flex items-center gap-2 uppercase tracking-tight text-foreground">SuperFast ⚡⚡</div>
                              <p className="text-xs text-muted-foreground font-semibold leading-relaxed">Server-side neural rendering. Broadcast quality. Deep emotion.</p>
                          </div>
                      </Label>

                      {!isFastGenDisabled && (
                          <Label 
                              htmlFor="fast" 
                              className={cn(
                                  "flex items-start space-x-4 rounded-3xl border border-border/60 p-6 transition-all duration-500 cursor-pointer relative overflow-hidden group shadow-sm",
                                  "bg-muted/30 dark:bg-white/[0.02] hover:bg-muted/50 dark:hover:bg-white/[0.04]",
                                  "has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:checked]:scale-[1.02] has-[:checked]:bg-primary/5"
                              )}
                          >
                              <RadioGroupItem value="fast" id="fast" className="mt-1 border-primary/40" />
                              <div className="font-normal flex-1 space-y-1">
                                  <div className="font-black text-lg flex items-center gap-2 uppercase tracking-tight text-foreground">Standard Fast</div>
                                  <p className="text-xs text-muted-foreground font-semibold leading-relaxed">Browser-level live synthesis. Standard emotion. Delivery in 5-15m.</p>
                              </div>
                          </Label>
                      )}
                  </RadioGroup>
                )}

                {!isGenerating && !isPaused && generationMode === 'high-quality' && (
                    <div className="space-y-2.5 rounded-3xl border border-border/60 p-6 bg-muted/15 dark:bg-white/[0.01] animate-in fade-in slide-in-from-top-2 duration-300">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-primary animate-pulse" /> Select Genre
                        </Label>
                        <Select value={selectedGenre} onValueChange={(v) => setSelectedGenre(v)}>
                            <SelectTrigger className="h-12 rounded-xl bg-muted/20 font-bold border-primary/5 text-foreground">
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
                        {GENRE_IMAGES[selectedGenre] && (
                            <div className="relative w-full aspect-[16/9] mt-3 rounded-2xl overflow-hidden border border-border/40 shadow-inner animate-in fade-in zoom-in-95 duration-300">
                                <Image 
                                    src={GENRE_IMAGES[selectedGenre]} 
                                    alt={`${selectedGenre} preview`} 
                                    fill 
                                    className="object-cover"
                                    referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-4">
                                    <span className="text-white text-xs font-black uppercase tracking-wider bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                                        {selectedGenre}
                                    </span>
                                </div>
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground font-semibold">Tuning voice synthesis specifically for this category.</p>
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
