'use client';

import { useChatterbox, ChatterboxProvider, type ChatterboxVoice } from '@/context/chatterbox-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { 
    MicVocal, Wand2, Sparkles, Loader2, Zap, Trash2, 
    FilePenLine, Check, Copy, Download, Play, Pause, 
    ChevronsUpDown, Activity, RotateCcw, Edit, RefreshCw, X,
    Archive, Search, Plus, Library, Volume2,
    Coins, Star, ShieldCheck, Clock, Gift, Mic, Upload, AlertCircle
} from 'lucide-react';
import { cn, generateAvatarColor, getDisplayUrl, localSaveFile, safeJsonStringify } from '@/lib/utils';
import { trimAudioBlob } from '@/lib/audio-utils';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/auth-provider';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { studioVoices as staticStudioVoices } from '@/lib/new-studio-voices';
import { reportClientError } from '@/lib/report-client-error';

function VoicePicker({ currentVoiceId, onVoiceChange, playingVoice, onTogglePlay, userVoices }: { currentVoiceId: string, onVoiceChange: (voiceId: string) => void, playingVoice: string | null, onTogglePlay: any, userVoices: ChatterboxVoice[] }) {
    const [open, setOpen] = useState(false);
    
    // Combine static studio voices with user cloned voices
    const allAvailable = useMemo(() => {
        const voiceMap = new Map<string, any>();
        staticStudioVoices.forEach(v => voiceMap.set(v.id, v));
        userVoices.forEach(v => voiceMap.set(v.id, v));
        return Array.from(voiceMap.values());
    }, [userVoices]);

    const grouped = useMemo(() => ({
        male: allAvailable.filter(v => v.gender === 'Male'),
        female: allAvailable.filter(v => v.gender === 'Female')
    }), [allAvailable]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-11 px-4 rounded-xl border-primary/10 bg-background/50">
                    <span className="truncate font-bold text-[13px]">{allAvailable.find(v => v.id === currentVoiceId)?.name || 'Assign persona...'}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[95vw] sm:w-[650px] p-0 rounded-2xl shadow-3xl border-primary/10 overflow-hidden z-[300]" align="start">
                <div className="flex flex-row h-96 divide-x border-primary/5">
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-2 text-[9px] font-black uppercase text-blue-600/60 bg-blue-500/5 border-b">MALE</div>
                        <ScrollArea className="flex-1">
                            <div className="p-3 space-y-3">
                                {grouped.male.map(v => (
                                    <VoiceItem key={v.id} voice={v} selected={currentVoiceId === v.id} playingVoice={playingVoice} onTogglePlay={onTogglePlay} onSelect={() => { onVoiceChange(v.id); setOpen(false); }} />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-2 text-[9px] font-black uppercase text-primary/60 bg-primary/5 border-b">FEMALE</div>
                        <ScrollArea className="flex-1">
                            <div className="p-3 space-y-3">
                                {grouped.female.map(v => (
                                    <VoiceItem key={v.id} voice={v} selected={currentVoiceId === v.id} playingVoice={playingVoice} onTogglePlay={onTogglePlay} onSelect={() => { onVoiceChange(v.id); setOpen(false); }} />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function VoiceItem({ voice, selected, playingVoice, onTogglePlay, onSelect }: { voice: any, selected: boolean, playingVoice: string | null, onTogglePlay: any, onSelect: () => void }) {
    return (
        <div className={cn("flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300 cursor-pointer", selected ? "ring-4 bg-background shadow-lg border-primary/20" : "bg-muted/5 border-primary/5 hover:border-primary/20")} onClick={onSelect}>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-primary/10 text-primary" onClick={(e) => onTogglePlay(e, voice)}>
                {playingVoice === voice.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
            </Button>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black truncate uppercase text-primary">
                        {voice.name}{voice.isPrivate && <ShieldCheck className="h-3 w-3 ml-1.5" />}
                    </span>
                    {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
            </div>
        </div>
    );
}

function StudioContent() {
    const { 
        script, setScript, cleanScript, projectName, setProjectName, scriptState, 
        characters, isAnalyzing, trialBalance, includeEmotion, setIncludeEmotion,
        analyzeScript, handleVoiceChange, handleAgeChange, handleGeneration, clearStudioState,
        isGenerating, generationProgress, generatedLines, generatedAudioUrl,
        userVoices, isFinalizing, finalizingStatus, finalizingProgress, scriptAnalysis,
        dailyAnalysisCount = 0, maxDailyAnalysisLimit = 2
    } = useChatterbox();
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
    // silently rendering the full studio (previously this page had no guard
    // at all, so anyone could open and use the editor while logged out —
    // and hitting "Analyze" would silently no-op since analyzeScript()
    // bails out early when activeUid is missing, with no feedback).
    useEffect(() => {
        if (!authLoading && !user) {
            toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use the AI Studio.' });
            router.push('/login');
        }
    }, [authLoading, user, router, toast]);

    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [isZipGenerating, setIsZipGenerating] = useState(false);
    const [viewMode, setViewMode] = useState<'original' | 'clean'>('clean');
    const [activeScanLine, setActiveScanLine] = useState(-1);
    const [isThinking, setIsThinking] = useState(false);

    const [masterCurrentTime, setMasterCurrentTime] = useState(0);
    const [masterIsPlaying, setMasterIsPlaying] = useState(false);
    const dialogueCardRefs = useRef<Record<number, HTMLDivElement | null>>({});

    const calibrationAudioRef = useRef<HTMLAudioElement | null>(null);
    const nodePlayerRef = useRef<HTMLAudioElement | null>(null);
    const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const isAnalyzed = scriptState === 'valid';
    const scriptLines = useMemo(() => script.split('\n').filter(l => l.trim().length > 0), [script]);

    // Timestamps for each dialogue line in timeline
    const linesWithTimeline = useMemo(() => {
        let accumulated = 0;
        return generatedLines.map((line, idx) => {
            const estDuration = Math.max(1.5, line.dialogue.length * 0.08);
            const startTime = accumulated;
            const endTime = startTime + estDuration;
            accumulated = endTime + 0.8; // 0.8s silence gap between lines in master
            return { ...line, startTime, endTime, duration: estDuration, originalIndex: idx };
        });
    }, [generatedLines]);

    // Currently playing dialogue index during main voice playback
    const activeMasterLineIndex = useMemo(() => {
        if (!masterIsPlaying) return -1;
        const active = linesWithTimeline.find(
            l => masterCurrentTime >= l.startTime && masterCurrentTime < l.endTime
        );
        return active ? active.originalIndex : -1;
    }, [masterCurrentTime, masterIsPlaying, linesWithTimeline]);

    // Scroll active dialogue into view when main voice plays it
    useEffect(() => {
        if (activeMasterLineIndex !== -1 && dialogueCardRefs.current[activeMasterLineIndex]) {
            dialogueCardRefs.current[activeMasterLineIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [activeMasterLineIndex]);

    const runRandomizedScan = useCallback((index: number) => {
        if (!isAnalyzing || index >= scriptLines.length) {
            setActiveScanLine(-1); setIsThinking(false); return;
        }
        setActiveScanLine(index); setIsThinking(false);
        const rand = Math.random(); 
        let nextIndex = index + 1; 
        let delay = 700 + Math.random() * 600;
        if (rand > 0.8) { nextIndex = Math.min(index + Math.ceil(Math.random() * 2), scriptLines.length - 1); delay = 400; }
        else if (rand < 0.15) { setIsThinking(true); delay = 1800 + Math.random() * 1000; }
        
        lineRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        timerRef.current = setTimeout(() => runRandomizedScan(nextIndex), delay);
    }, [isAnalyzing, scriptLines.length]);

    useEffect(() => {
        if (isAnalyzing) runRandomizedScan(0);
        else { if (timerRef.current) clearTimeout(timerRef.current); setActiveScanLine(-1); setIsThinking(false); }
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [isAnalyzing, runRandomizedScan]);

    const togglePlayNode = async (index: number, audioData?: string) => {
        if (!audioData) return;
        if (!nodePlayerRef.current) nodePlayerRef.current = new Audio();
        const player = nodePlayerRef.current;
        if (playingIndex === index) { player.pause(); setPlayingIndex(null); }
        else {
            try { 
                player.pause(); 
                player.src = getDisplayUrl(audioData); 
                await player.play(); 
                setPlayingIndex(index); 
                player.onended = () => setPlayingIndex(null); 
            }
            catch (e) {
            reportClientError('src/app/new-ai-studio/page.tsx:198', e); setPlayingIndex(null); }
        }
    };

    const toggleVoicePreview = async (e: React.MouseEvent, voice: any) => {
        e.stopPropagation(); e.preventDefault();
        if (!calibrationAudioRef.current) calibrationAudioRef.current = new Audio();
        const a = calibrationAudioRef.current;
        if (playingVoiceId === voice.id) { a.pause(); setPlayingVoiceId(null); }
        else {
            try { a.pause(); a.src = getDisplayUrl(voice.demoUrl || voice.link); await a.play(); setPlayingVoiceId(voice.id); a.onended = () => setPlayingVoiceId(null); }
            catch (err) { console.warn("Preview blocked", err); }
        }
    };

    const handleDownloadZip = async () => {
        const validLines = generatedLines.filter(l => l.status === 'done' && l.audioDataUri);
        if (validLines.length === 0) {
            toast({ variant: 'destructive', title: 'No Audio Generated', description: 'Please generate audio before downloading ZIP bundle.' });
            return;
        }
        setIsZipGenerating(true);
        toast({ title: 'Preparing ZIP Bundle...', description: 'Trimming audio nodes according to timeline.' });
        try {
            const zip = new JSZip();
            const jsonManifestData = {
                projectName: projectName || 'Untitled Project',
                exportDate: new Date().toISOString(),
                totalDialogues: validLines.length,
                dialogues: [] as any[]
            };

            let timelineAcc = 0;

            await Promise.all(validLines.map(async (line, i) => {
                const res = await fetch(getDisplayUrl(line.audioDataUri!));
                const rawBlob = await res.blob();
                
                // Trim audio accurately using Web Audio API
                const { blob: trimmedBlob, duration } = await trimAudioBlob(rawBlob);
                const startSec = timelineAcc;
                const endSec = startSec + (duration || Math.max(1.5, line.dialogue.length * 0.08));
                timelineAcc = endSec + 0.8;

                const startFormatted = `${Math.floor(startSec / 60)}m${Math.floor(startSec % 60).toString().padStart(2, '0')}s`;
                const endFormatted = `${Math.floor(endSec / 60)}m${Math.floor(endSec % 60).toString().padStart(2, '0')}s`;

                const cleanCharName = (line.characterName || 'Character').replace(/[^a-zA-Z0-9_-]/g, '_');
                const filename = `${String(i + 1).padStart(3, '0')}_${cleanCharName}_${startFormatted}-${endFormatted}.wav`;

                zip.file(filename, trimmedBlob);

                jsonManifestData.dialogues.push({
                    index: i + 1,
                    id: line.id,
                    filename,
                    characterName: line.characterName,
                    dialogue: line.dialogue,
                    voiceId: line.voiceOverride || 'default',
                    emotion: line.emotion || 'Normal',
                    startTimeSeconds: Number(startSec.toFixed(2)),
                    endTimeSeconds: Number(endSec.toFixed(2)),
                    durationSeconds: Number((duration || (endSec - startSec)).toFixed(2)),
                    audioUrl: line.audioDataUri,
                    voiceReplacementMetadata: {
                        allowVoiceReplacement: true,
                        hfBackendSupport: true
                    }
                });
            }));

            jsonManifestData.dialogues.sort((a, b) => a.index - b.index);

            zip.file('timeline_manifest.json', safeJsonStringify(jsonManifestData, 2));
            zip.file('voice_replacement_schema.json', safeJsonStringify({
                instructions: "Send POST request to configured Editing HF Backend URL to regenerate or edit voice for any line ID.",
                project: jsonManifestData.projectName,
                dialogues: jsonManifestData.dialogues
            }, 2));

            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, `12labs_trimmed_${projectName.replace(/\s+/g, '_')}_${Date.now()}.zip`);
            toast({ title: 'ZIP Bundle Saved', description: 'Trimmed dialogue audio & JSON manifest downloaded.' });
        } catch (e: any) {
            reportClientError('src/app/new-ai-studio/page.tsx:281', e);
            toast({ variant: 'destructive', title: 'ZIP Generation Failed', description: e.message });
        } finally { setIsZipGenerating(false); }
    };

    // Block rendering the full studio UI until we know the user is signed
    // in — prevents the "opens without login" flash seen previously.
    if (authLoading || !user) {
        return (
            <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="relative w-full min-h-screen bg-background/50">
            <main className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 pb-32">
                
                <div className="flex items-center justify-between mb-10">
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-muted/20 hover:bg-muted/40 transition-all" onClick={() => router.back()}>
                        <X className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="h-7 px-4 rounded-full border-primary/20 bg-primary/5 text-primary font-black uppercase tracking-[0.2em] text-[9px]">
                            <Zap className="mr-1.5 h-3.5 w-3.5 fill-current" /> NEURAL ENGINE
                        </Badge>
                        {trialBalance !== null && trialBalance > 0 && (
                            <Badge className="bg-green-500 text-white font-black text-[9px] h-7 px-3 uppercase tracking-widest rounded-full shadow-sm animate-pulse">
                                <Gift className="h-3.5 w-3.5" /> {trialBalance} Left
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-10">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card/80 backdrop-blur-xl overflow-hidden">
                        <CardHeader className="bg-primary/5 border-b pb-6 text-center relative">
                            <CardTitle className="text-lg font-black uppercase flex items-center justify-center gap-3"><FilePenLine className="h-5 w-5 text-primary" /> Production Manuscript</CardTitle>
                            {isAnalyzed && !isAnalyzing && (
                                <div className="absolute bottom-4 right-8 flex bg-background/50 backdrop-blur-md p-1 rounded-full border border-primary/10 shadow-sm animate-in zoom-in duration-500">
                                    <button className={cn("h-8 px-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300", viewMode === 'original' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-primary")} onClick={() => setViewMode('original')}>Original</button>
                                    <button className={cn("h-8 px-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300", viewMode === 'clean' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-primary")} onClick={() => setViewMode('clean')}>Cleaned</button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="p-6 sm:p-8 space-y-6">
                            <div className="relative min-h-[350px]">
                                {isAnalyzing ? (
                                <div className="h-[350px] md:h-[500px] overflow-y-auto rounded-3xl border-2 border-primary/20 bg-muted/10 p-6 sm:p-8 space-y-4 shadow-inner custom-scrollbar" style={{ scrollBehavior: 'smooth' }}>
                                    {scriptLines.map((line, idx) => (
                                    <div key={idx} ref={el => { lineRefs.current[idx] = el; }} className={cn("p-3 rounded-2xl transition-all duration-500 text-lg font-medium border border-transparent leading-relaxed", activeScanLine === idx ? "bg-primary/10 text-primary border-primary/10 shadow-sm" : "opacity-40 blur-[0.2px]")}>
                                        {activeScanLine === idx && (isThinking ? <Loader2 className="h-4 w-4 inline-block mr-3 animate-spin text-primary/30" /> : <Zap className="h-4 w-4 inline-block mr-3 animate-pulse fill-current" />)}{line}
                                    </div>
                                    ))}
                                </div>
                                ) : (
                                <Textarea value={isAnalyzed && viewMode === 'clean' ? cleanScript : script} onChange={e => !isAnalyzed && setScript(e.target.value)} readOnly={isAnalyzed} className="min-h-[350px] text-lg font-medium leading-relaxed p-6 rounded-[2rem] bg-muted/10 border-primary/5 shadow-inner" />
                                )}
                            </div>
                            {!isAnalyzed && !isAnalyzing && (
                                (() => {
                                    const isSponsorOrAdmin = user?.isSponsor === true || user?.role === 'admin';
                                    const userCredits = Number(user?.credits ?? 0);
                                    const charCount = script.trim().length;
                                    const isNotEnoughCredits = !isSponsorOrAdmin && charCount > 0 && userCredits < charCount;
                                    const isDailyLimitReached = !isSponsorOrAdmin && dailyAnalysisCount >= maxDailyAnalysisLimit;
                                    const isAnalyzeDisabled = isAnalyzing || script.length < 20 || isNotEnoughCredits || isDailyLimitReached;

                                    return (
                                        <div className="flex flex-col gap-4">
                                            <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox id="include-emotion" checked={includeEmotion} onCheckedChange={(val) => setIncludeEmotion(val as boolean)} disabled={isAnalyzing} />
                                                    <Label htmlFor="include-emotion" className="text-[10px] font-black uppercase tracking-widest text-primary/70 cursor-pointer">Include Emotion Analysis</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                                                        Daily Analysis: {dailyAnalysisCount}/{maxDailyAnalysisLimit}
                                                    </span>
                                                </div>
                                            </div>

                                            {isNotEnoughCredits && (
                                                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold">
                                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                                    <span>Not Enough Credits! Script has {charCount.toLocaleString()} chars, but you have {userCredits.toLocaleString()} credits.</span>
                                                </div>
                                            )}

                                            {isDailyLimitReached && !isNotEnoughCredits && (
                                                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold">
                                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                                    <span>Daily Analysis Limit Reached ({dailyAnalysisCount}/{maxDailyAnalysisLimit}). Free users get 2/day, Paid users get 5/day.</span>
                                                </div>
                                            )}

                                            <Button 
                                                onClick={analyzeScript} 
                                                disabled={isAnalyzeDisabled} 
                                                className={cn(
                                                    "w-full h-16 text-lg font-black rounded-2xl shadow-xl uppercase transition-all",
                                                    isNotEnoughCredits || isDailyLimitReached 
                                                        ? "bg-muted text-muted-foreground border-2 border-dashed border-destructive/30 shadow-none cursor-not-allowed" 
                                                        : "shadow-primary/20 btn-shine"
                                                )}
                                            >
                                                {isAnalyzing ? (
                                                    <span className="flex items-center justify-center gap-2"><Loader2 className="h-6 w-6 animate-spin" /> <span>ANALYZING...</span></span>
                                                ) : isNotEnoughCredits ? (
                                                    <span className="flex items-center justify-center gap-2"><AlertCircle className="h-6 w-6 text-destructive" /> <span>NOT ENOUGH CREDITS</span></span>
                                                ) : isDailyLimitReached ? (
                                                    <span className="flex items-center justify-center gap-2"><AlertCircle className="h-6 w-6 text-amber-500" /> <span>DAILY LIMIT REACHED ({dailyAnalysisCount}/{maxDailyAnalysisLimit})</span></span>
                                                ) : (
                                                    <span className="flex items-center justify-center gap-2"><Wand2 className="h-6 w-6" /> <span>START AI ANALYSIS</span></span>
                                                )}
                                            </Button>
                                        </div>
                                    );
                                })()
                            )}
                        </CardContent>
                        {isAnalyzed && !isAnalyzing && (
                            <CardFooter className="p-6 border-t bg-muted/5">
                                <Button variant="ghost" className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-[10px] text-destructive/60 hover:text-destructive gap-2" onClick={clearStudioState}>
                                    <RotateCcw className="h-4 w-4" /> RESET STUDIO
                                </Button>
                            </CardFooter>
                        )}
                    </Card>

                    {isAnalyzed && !isAnalyzing && (
                        <div className="space-y-10 animate-in fade-in duration-500">
                            <div className="space-y-6">
                                <h3 className="text-xl font-black uppercase tracking-tight px-3">Cast Persona Hub</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {characters.map(char => (
                                        <div key={char.id} className="p-5 rounded-[2rem] border bg-card/80 backdrop-blur-md space-y-4 shadow-sm border-primary/5">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Avatar className="h-10 w-10 border-2 shadow-lg">
                                                    <AvatarFallback className={cn("font-black text-sm", generateAvatarColor(char.name).bg, generateAvatarColor(char.name).text)}>{char.name?.charAt(0).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <p className="font-black text-sm uppercase truncate">{char.name}</p>
                                                    <Badge variant="outline" className="h-5 px-1.5 text-[8px] font-black uppercase border-primary/20 text-primary/70">{char.dialogueCount} Lines</Badge>
                                                </div>
                                            </div>
                                            <VoicePicker currentVoiceId={char.voice} onVoiceChange={(v) => handleVoiceChange(char.id, v)} userVoices={userVoices} playingVoice={playingVoiceId} onTogglePlay={toggleVoicePreview} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <Card className="rounded-[2.5rem] border-none shadow-xl bg-card/80 backdrop-blur-sm overflow-hidden">
                                    <CardHeader className="bg-primary/5 border-b pb-4"><CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary/60">PROJECT NAME</CardTitle></CardHeader>
                                    <CardContent className="p-6"><Input value={projectName} onChange={e => setProjectName(e.target.value)} className="h-14 rounded-2xl font-black bg-muted/20 border-primary/5 text-lg" placeholder="Enter project name..." /></CardContent>
                                </Card>
                                <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card/80 backdrop-blur-sm overflow-hidden border-t-4 border-t-primary">
                                    <CardHeader className="bg-primary/5 border-b pb-4">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary/60">GENERATION CORE</CardTitle>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-6">
                                        <div className="p-6 rounded-[2rem] border-2 border-dashed border-primary/10 text-center space-y-2 bg-muted/5 shadow-inner">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">ESTIMATED PRODUCTION COST</p>
                                            <div className="text-3xl font-black flex items-center justify-center gap-3">
                                                <Coins className="h-7 w-7 text-primary" />
                                                <span>{scriptAnalysis?.cost?.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        {generatedAudioUrl ? (
                                            <div className="space-y-6 animate-in zoom-in-95">
                                                <div className="bg-muted/30 p-4 rounded-2xl border border-dashed">
                                                    <audio 
                                                        src={getDisplayUrl(generatedAudioUrl)} 
                                                        controls 
                                                        className="w-full h-10" 
                                                        onTimeUpdate={(e) => setMasterCurrentTime(e.currentTarget.currentTime)}
                                                        onPlay={() => setMasterIsPlaying(true)}
                                                        onPause={() => setMasterIsPlaying(false)}
                                                        onEnded={() => { setMasterIsPlaying(false); setMasterCurrentTime(0); }}
                                                    />
                                                </div>
                                                <Button className="w-full h-14 rounded-2xl bg-green-600 hover:bg-green-700 shadow-xl font-black uppercase text-[11px] gap-3 btn-shine" onClick={() => localSaveFile(generatedAudioUrl, 'master.wav')}>
                                                    <Download className="h-4 w-4" /> SAVE MASTER
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {(isGenerating || isFinalizing) && (
                                                    <div className="space-y-4 animate-in fade-in">
                                                        <div className="flex justify-between items-center text-[10px] font-black uppercase"><span className="text-primary">{isFinalizing ? finalizingStatus : "SYNCHRONIZING LAYERS..."}</span><span>{Math.round(isFinalizing ? finalizingProgress : generationProgress)}%</span></div>
                                                        <Progress value={isFinalizing ? finalizingProgress : generationProgress} className="h-2" />
                                                    </div>
                                                )}
                                                <Button onClick={handleGeneration} disabled={isGenerating || isFinalizing || characters.some(c => !c.voice)} className="w-full h-16 text-[11px] font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine uppercase">
                                                    {isGenerating || isFinalizing ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : <><Sparkles className="mr-3 h-6 w-6" /> START PRODUCTION</>}
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="space-y-6 mt-6 animate-in fade-in duration-1000">
                                <div className="flex items-center justify-between px-3">
                                    <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3"><Activity className="h-5 w-5 text-primary animate-pulse" />Production Index</h3>
                                    <Button variant="ghost" size="sm" className="h-9 text-[9px] font-black uppercase tracking-widest gap-2 bg-primary/5 text-primary rounded-xl px-6" onClick={handleDownloadZip} disabled={isZipGenerating}><Archive className="h-3.5 w-3.5" /> ZIP BUNDLE</Button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {generatedLines.map((line, idx) => {
                                        const isActiveInMaster = activeMasterLineIndex === idx;
                                        const isPlayingNode = playingIndex === idx;
                                        const isHighlighted = isActiveInMaster || isPlayingNode;

                                        return (
                                            <Card 
                                                key={line.id || idx} 
                                                ref={el => { dialogueCardRefs.current[idx] = el; }}
                                                className={cn(
                                                    "rounded-[2rem] border transition-all duration-300 p-5 relative overflow-hidden", 
                                                    isHighlighted 
                                                        ? "border-primary bg-primary/10 ring-4 ring-primary/30 scale-[1.02] shadow-2xl z-20" 
                                                        : "bg-white/80 dark:bg-card/80 backdrop-blur-md border-primary/5 shadow-sm"
                                                )}
                                            >
                                                <div className="relative z-10">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-4">
                                                            <Avatar className="h-8 w-8 border shadow-sm">
                                                                <AvatarFallback className={cn("font-black text-[10px]", generateAvatarColor(line.characterName).bg, generateAvatarColor(line.characterName).text)}>{line.characterName?.charAt(0).toUpperCase()}</AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0">
                                                                <p className="font-black text-[11px] uppercase truncate">{line.characterName}</p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <p className="text-[7px] font-bold text-muted-foreground uppercase opacity-40">NODE {idx + 1}</p>
                                                                    {isActiveInMaster && (
                                                                        <Badge className="bg-primary text-white font-black text-[7px] uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm animate-pulse">
                                                                            <Volume2 className="h-2.5 w-2.5 animate-bounce" /> PLAYING
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {line.status === 'done' && line.audioDataUri && (
                                                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-primary/10 text-primary" onClick={() => togglePlayNode(idx, line.audioDataUri)}>{playingIndex === idx ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}</Button>
                                                            )}
                                                            {line.status === 'generating' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                                            {line.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground opacity-30" />}
                                                            {line.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                                                        </div>
                                                    </div>
                                                    <p className="text-[13px] font-medium text-foreground/80 leading-relaxed italic line-clamp-4">"{line.dialogue}"</p>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function NewAiStudioPage() { return <ChatterboxProvider><StudioContent /></ChatterboxProvider>; }
