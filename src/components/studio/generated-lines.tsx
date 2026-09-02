'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '@/context/studio-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, generateAvatarColor, safeJsonStringify } from '@/lib/utils';
import { Play, Pause, Loader2, Link as LinkIcon, Download, Music, Archive, RefreshCw, AlertCircle, ChevronDown, Edit, User, Check, ChevronsUpDown, Save, Activity, Plus, Trash2, Mic } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import JSZip from 'jszip';
import type { GeneratedLine as GeneratedLineType, Character } from '@/lib/types';
import { useAuth } from '@/context/auth-provider';
import { convertMp3ToWav, trimAudioBlob } from '@/lib/audio-utils';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { voices } from '@/lib/voices';
import { saveAs } from 'file-saver';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { reportClientError } from '@/lib/report-client-error';

const THEME_BG_IMAGE = "https://storage.googleapis.com/12labspublic/store/previews/20260721_134259.jpg";

function VoicePicker({ 
    currentVoiceId, 
    onVoiceChange, 
    playingVoice, 
    onTogglePlay 
}: { 
    currentVoiceId: string, 
    onVoiceChange: (voiceId: string) => void, 
    playingVoice: string | null, 
    onTogglePlay: (e: React.MouseEvent, voice: typeof voices[0]) => void 
}) {
    const [open, setOpen] = useState(false);

    const getVoiceName = (voiceId: string) => {
        const voice = voices.find(v => v.id === voiceId);
        if (!voice) return 'Assign persona...';
        return `${voice.name} (${voice.gender})`;
    };

    const groupedVoices = useMemo(() => {
        return {
            male: voices.filter(v => v.gender === 'Male'),
            female: voices.filter(v => v.gender === 'Female'),
            neutral: voices.filter(v => v.gender !== 'Male' && v.gender !== 'Female')
        };
    }, []);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-10 px-3 rounded-xl border-border dark:border-white/10 shadow-sm bg-background dark:bg-white/5 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10"
                >
                    <span className="truncate font-bold text-xs">{getVoiceName(currentVoiceId)}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 rounded-xl shadow-2xl border-border dark:border-white/10 overflow-hidden z-[300] bg-popover text-popover-foreground dark:bg-[#0a0a0b]/95 dark:backdrop-blur-3xl" align="start">
                <div className="flex flex-row h-72 divide-x divide-border dark:divide-white/5 border-border dark:border-white/5">
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-1.5 text-[9px] font-black uppercase bg-muted dark:bg-white/5 border-b border-border dark:border-white/5 shrink-0 text-primary/60">Female</div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {groupedVoices.female.map(voice => {
                                    const isDisabled = (voice as any).disabled;
                                    return (
                                        <div 
                                            key={voice.id} 
                                            className={cn(
                                                "flex items-center gap-1 rounded-lg transition-colors", 
                                                isDisabled ? "opacity-40 cursor-not-allowed bg-muted dark:bg-white/5" : "hover:bg-muted dark:hover:bg-white/5",
                                                currentVoiceId === voice.id && "bg-primary/10"
                                            )}
                                        >
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-7 w-7 rounded-full shrink-0 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTogglePlay(e, voice);
                                                }} 
                                                disabled={!voice.demoUrl}
                                            >
                                                {playingVoice === voice.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                            </Button>
                                            <div 
                                                className={cn("flex-1 text-[11px] font-bold py-2 truncate", isDisabled ? "cursor-not-allowed text-zinc-500" : "cursor-pointer", currentVoiceId === voice.id ? "text-primary" : "text-muted-foreground hover:text-foreground dark:text-zinc-400 dark:hover:text-white")} 
                                                onClick={() => { 
                                                    if (isDisabled) return;
                                                    onVoiceChange(voice.id); 
                                                    setOpen(false); 
                                                }}
                                            >
                                                {voice.name}
                                            </div>
                                            {isDisabled && <Badge variant="outline" className="text-[7px] font-black uppercase py-0 px-1 border-destructive/30 text-destructive mr-1">Off</Badge>}
                                            {currentVoiceId === voice.id && !isDisabled && <Check className="h-3 w-3 mr-2 text-primary shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-1.5 text-[9px] font-black uppercase bg-muted dark:bg-white/5 border-b border-border dark:border-white/5 shrink-0 text-blue-400/60">Male</div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {groupedVoices.male.map(voice => {
                                    const isDisabled = (voice as any).disabled;
                                    return (
                                        <div 
                                            key={voice.id} 
                                            className={cn(
                                                "flex items-center gap-1 rounded-lg transition-colors", 
                                                isDisabled ? "opacity-40 cursor-not-allowed bg-muted dark:bg-white/5" : "hover:bg-muted dark:hover:bg-white/5",
                                                currentVoiceId === voice.id && "bg-primary/10"
                                            )}
                                        >
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-7 w-7 rounded-full shrink-0 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTogglePlay(e, voice);
                                                }} 
                                                disabled={!voice.demoUrl}
                                            >
                                                {playingVoice === voice.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                            </Button>
                                            <div 
                                                className={cn("flex-1 text-[11px] font-bold py-2 truncate", isDisabled ? "cursor-not-allowed text-zinc-500" : "cursor-pointer", currentVoiceId === voice.id ? "text-primary" : "text-muted-foreground hover:text-foreground dark:text-zinc-400 dark:hover:text-white")} 
                                                onClick={() => { 
                                                    if (isDisabled) return;
                                                    onVoiceChange(voice.id); 
                                                    setOpen(false); 
                                                }}
                                            >
                                                {voice.name}
                                            </div>
                                            {isDisabled && <Badge variant="outline" className="text-[7px] font-black uppercase py-0 px-1 border-destructive/30 text-destructive mr-1">Off</Badge>}
                                            {currentVoiceId === voice.id && !isDisabled && <Check className="h-3 w-3 mr-2 text-primary shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function DownloadOptions() {
    const { generatedLines, generatedAudio, projectName, handleGeneration, isFinalizing } = useStudio();
    const { user, isImpersonating } = useAuth();
    const { toast } = useToast();
    const [isDownloadingMp3, setIsDownloadingMp3] = useState(false);
    const [isProcessingWav, setIsProcessingWav] = useState(false);

    const isAdmin = user?.role === 'admin' || isImpersonating;
    const isEligibleForDualFormat = user?.hasMadeFirstPurchase || isAdmin;

    const onDownloadFormat = async (format: 'mp3' | 'wav') => {
        if (!generatedAudio) {
            const allDone = generatedLines.length > 0 && generatedLines.every(l => l.status === 'done');
            if (allDone) {
                toast({ title: 'Finalizing Master...', description: 'Please wait while we merge your local audio nodes.' });
                await handleGeneration({ forceLocalFinalize: true });
                return;
            }
            toast({ variant: 'destructive', title: 'Generation in progress.' });
            return;
        }

        if (format === 'mp3') setIsDownloadingMp3(true);
        else setIsProcessingWav(true);

        let blobToDownload = generatedAudio;

        if (format === 'wav' && generatedAudio.type.includes('mpeg')) {
            toast({ title: 'Converting to WAV...', description: '12Labs local engine is processing your master file.' });
            try {
                blobToDownload = await convertMp3ToWav(generatedAudio);
            } catch (e) {
            reportClientError('src/components/studio/generated-lines.tsx:197', e);
                toast({ variant: 'destructive', title: 'Conversion Failed' });
                setIsProcessingWav(false);
                return;
            }
        }

        const url = URL.createObjectURL(blobToDownload);
        const a = document.createElement('a');
        a.href = url;
        const safeName = projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'audio_project';
        a.download = `12labs_master_${safeName}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: 'Download Started' });
        
        setIsDownloadingMp3(false);
        setIsProcessingWav(false);
    };

    const onDownloadZip = async () => {
        toast({ title: 'Preparing ZIP...', description: 'Trimming audio nodes according to timeline.' });
        const zip = new JSZip();
        const validLines = generatedLines.filter((item): item is GeneratedLineType & { audioDataUri: string } => item.status === 'done' && !!item.audioDataUri);

        if (validLines.length === 0) {
            toast({ variant: 'destructive', title: 'Nothing to download.' });
            return;
        }

        const jsonManifestData = {
            projectName: projectName || 'Untitled Project',
            exportDate: new Date().toISOString(),
            totalDialogues: validLines.length,
            dialogues: [] as any[]
        };

        let timelineAcc = 0;

        await Promise.all(
            validLines.map(async (line, index) => {
                const response = await fetch(line.audioDataUri);
                const rawBlob = await response.blob();
                
                const { blob: trimmedBlob, duration } = await trimAudioBlob(rawBlob);
                const startSec = timelineAcc;
                const endSec = startSec + (duration || Math.max(1.5, line.dialogue.length * 0.08));
                timelineAcc = endSec + 0.8;

                const startFormatted = `${Math.floor(startSec / 60)}m${Math.floor(startSec % 60).toString().padStart(2, '0')}s`;
                const endFormatted = `${Math.floor(endSec / 60)}m${Math.floor(endSec % 60).toString().padStart(2, '0')}s`;

                const cleanCharName = (line.characterName || 'Character').replace(/[^a-zA-Z0-9_-]/g, '_');
                const fileName = `${String(index + 1).padStart(3, '0')}_${cleanCharName}_${startFormatted}-${endFormatted}.wav`;

                zip.file(fileName, trimmedBlob);

                jsonManifestData.dialogues.push({
                    index: index + 1,
                    id: line.id,
                    filename: fileName,
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
            })
        );

        jsonManifestData.dialogues.sort((a, b) => a.index - b.index);

        zip.file('timeline_manifest.json', safeJsonStringify(jsonManifestData, 2));
        zip.file('voice_replacement_schema.json', safeJsonStringify({
            instructions: "Send POST request to configured Editing HF Backend URL to regenerate or edit voice for any line ID.",
            project: jsonManifestData.projectName,
            dialogues: jsonManifestData.dialogues
        }, 2));

        zip.generateAsync({ type: 'blob' }).then((content) => {
            saveAs(content, `12labs_trimmed_${(projectName || 'project').replace(/\s+/g, '_')}_${Date.now()}.zip`);
            toast({ title: 'ZIP Bundle Downloaded', description: 'Includes trimmed dialogue audio and replacement JSON.' });
        });
    };
    
    const generatedCount = generatedLines.filter(u => u.status === 'done').length;
    const totalCount = generatedLines.length;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="secondary" disabled={generatedCount === 0} className="h-9 bg-muted hover:bg-muted/80 text-foreground dark:bg-white/10 dark:text-white dark:hover:bg-white/20 border-border dark:border-white/10">
                    <Download className="mr-2 h-4 w-4" /> 
                    <span className="text-xs sm:text-sm">Download ({generatedCount}/{totalCount})</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-popover text-popover-foreground border-border dark:bg-[#0a0a0b]/95 dark:backdrop-blur-3xl dark:border-white/10 dark:text-white">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Download Master File</h4>
                        <p className="text-sm text-zinc-500">
                            {isEligibleForDualFormat ? 'Dual format enabled for your account.' : 'Upgrade for WAV lossless support.'}
                        </p>
                    </div>
                    <div className="grid gap-2">
                        <Button onClick={() => onDownloadFormat('mp3')} disabled={!generatedAudio || isDownloadingMp3 || isProcessingWav} className="bg-primary text-white hover:bg-primary/90">
                             {isDownloadingMp3 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music className="mr-2 h-4 w-4" />}
                             {isDownloadingMp3 ? 'Wait' : 'Download MP3'}
                        </Button>
                        {isEligibleForDualFormat && (
                            <Button onClick={() => onDownloadFormat('wav')} disabled={!generatedAudio || isProcessingWav || isDownloadingMp3} variant="outline" className="border-border dark:border-white/10 bg-background dark:bg-white/5 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10">
                                {isProcessingWav ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music className="mr-2 h-4 w-4" />}
                                {isProcessingWav ? 'Wait' : 'Download WAV'}
                            </Button>
                        )}
                        <Separator className="bg-border dark:bg-white/5" />
                        <Button onClick={onDownloadZip} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5">
                             <Archive className="mr-2 h-4 w-4" /> Download Nodes (.zip)
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}


export function GeneratedLines() {
    const { generatedLines, retryLineGeneration, characters, updateGeneratedLine, deleteGeneratedLine, addGeneratedLine } = useStudio();
    const { user, isImpersonating } = useAuth();
    const { toast } = useToast();
    
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    const [editVoiceId, setEditVoiceId] = useState('');
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const calibrationAudioRef = useRef<HTMLAudioElement | null>(null);

    const isAdmin = user?.role === 'admin' || isImpersonating;
    const canDownloadSingle = useMemo(() => {
        if (isAdmin) return true;
        if (!user) return false;
        const plans = (user as any).purchasedPlans || {};
        return plans["336"] > 0 || plans["331"] > 0 || plans["540"] > 0 || plans["534"] > 0 || plans["999"] > 0 || plans["700"] > 0;
    }, [user, isAdmin]);

    useEffect(() => {
        audioRef.current = new Audio();
        const audio = audioRef.current;
        const onEnded = () => setPlayingIndex(null);
        audio.addEventListener('ended', onEnded);
        return () => {
            audio?.pause();
            audio?.removeEventListener('ended', onEnded);
        }
    }, []);

    const togglePlay = (index: number, url: string | undefined) => {
        const audio = audioRef.current;
        if (!audio || !url) return;
        if (playingIndex === index) {
            audio.pause();
            setPlayingIndex(null);
        } else {
            audio.src = url;
            audio.play();
            setPlayingIndex(index);
        }
    };

    const toggleVoicePreview = async (e: React.MouseEvent, voice: any) => {
        e.stopPropagation();
        if (!calibrationAudioRef.current) calibrationAudioRef.current = new Audio();
        const audio = calibrationAudioRef.current;
        try {
            if (playingVoiceId === voice.id) {
                audio.pause(); setPlayingVoiceId(null);
            } else {
                audio.pause(); audio.src = voice.demoUrl; await audio.play();
                setPlayingVoiceId(voice.id);
                audio.onended = () => setPlayingVoiceId(null);
            }
        } catch (err) { console.warn("Preview blocked", err); }
    };

    const handleDownload = (url: string | undefined, line: GeneratedLineType) => {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        const format = url.toLowerCase().includes('.mp3') ? 'mp3' : 'wav';
        a.download = `12labs_${line.characterName}_${line.dialogue.slice(0, 15).replace(/\s/g, '_')}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const startEditing = (index: number, line: GeneratedLineType) => {
        setEditingIndex(index);
        setEditText(line.dialogue);
        const char = characters.find((c: Character) => c.name === line.characterName);
        setEditVoiceId(line.voiceOverride || char?.voice || '');
    };

    const handleSaveDraftUpdate = (lineId: string) => {
        updateGeneratedLine(lineId, {
            dialogue: editText,
            voiceOverride: editVoiceId
        });
        setEditingIndex(null);
        toast({ title: 'Draft Node Saved', description: 'Saved locally. Generation will execute when you start project.' });
    };

    const handleSyncLine = async (lineId: string) => {
        if (!editText.trim() || !editVoiceId) {
            toast({ variant: 'destructive', title: 'Details Missing', description: 'Dialogue text and persona are required.' });
            return;
        }
        await retryLineGeneration(lineId, editText, editVoiceId);
        setEditingIndex(null);
    };

    return (
        <Card className="mt-8 border-border dark:border-white/10 shadow-2xl bg-card dark:bg-white/[0.02] backdrop-blur-3xl overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-primary/5 pb-6 border-b border-border/50 dark:border-white/5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Activity className="h-5 w-5 text-primary animate-pulse" />
                        <div>
                            <CardTitle className="text-lg font-black uppercase tracking-tight text-foreground dark:text-white">Production Hub</CardTitle>
                            <CardDescription className="text-[8px] font-bold uppercase tracking-widest opacity-60">Manage each dialogue node.</CardDescription>
                        </div>
                    </div>
                    <DownloadOptions />
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <ScrollArea className="h-[500px] pr-2">
                <div className="space-y-6">
                    {generatedLines.map((line, index) => {
                        const characterName = line.characterName || 'Narrator';
                        const avatarColor = generateAvatarColor(characterName);
                        const isPlaying = playingIndex === index;
                        const isEditing = editingIndex === index;
                        const isGenerating = line.status === 'generating';
                        const isDone = line.status === 'done';

                        const isLinked = index > 0 &&
                                         line.status === 'done' &&
                                         line.audioDataUri &&
                                         generatedLines[index - 1].status === 'done' &&
                                         line.audioDataUri === generatedLines[index - 1].audioDataUri;

                         return (
                             <div key={line.id} className={cn(
                                "p-5 rounded-[2rem] border transition-all duration-300 shadow-sm relative overflow-hidden",
                                isPlaying ? "border-primary bg-primary/10 ring-4 ring-primary/5" : "bg-card dark:bg-white/[0.02] border-border dark:border-white/5 hover:border-border-hover dark:hover:border-white/10"
                             )}>
                                <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]">
                                    <img src={THEME_BG_IMAGE} alt="Voice" className="w-full h-full object-cover" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between gap-4 mb-4">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-10 w-10 border border-border dark:border-white/10 shadow-md shrink-0">
                                                <AvatarFallback className={cn("font-black text-xs", avatarColor.bg, avatarColor.text)}>
                                                    {characterName?.charAt(0).toUpperCase() || 'U'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <p className="font-black text-[13px] uppercase truncate tracking-tight leading-none text-foreground dark:text-white">{characterName}</p>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                    <Badge variant="outline" className="h-4 px-1.5 text-[7px] font-black uppercase border-border dark:border-white/10 text-zinc-500">{line.emotion || 'Neutral'}</Badge>
                                                    <p className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest opacity-40">NODE {index + 1}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isGenerating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                            {line.status === 'done' && line.audioDataUri && (
                                                isLinked ? (
                                                    <Badge variant="secondary" className="h-5 px-2 text-[8px] font-black uppercase bg-primary/10 text-primary border-primary/10">LINKED</Badge>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-primary/20 text-primary shadow-sm hover:bg-primary hover:text-white transition-all active:scale-90" onClick={() => togglePlay(index, line.audioDataUri)}>
                                                            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                                                        </Button>
                                                        {canDownloadSingle && (
                                                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-zinc-500 hover:text-foreground dark:hover:text-white hover:bg-muted dark:hover:bg-white/5" onClick={() => handleDownload(line.audioDataUri, line)}>
                                                                <Download className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )
                                            )}
                                            {!isGenerating && !isDone && (
                                                <Badge variant="outline" className="h-5 px-2 text-[8px] font-black uppercase text-zinc-700">DRAFT</Badge>
                                            )}
                                        </div>
                                    </div>

                                    {isEditing ? (
                                        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="space-y-2">
                                                <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-1">Neural Performance Script</Label>
                                                <Textarea 
                                                    value={editText} 
                                                    onChange={(e) => setEditText(e.target.value)} 
                                                    className="min-h-[120px] rounded-2xl bg-background dark:bg-white/5 border-border dark:border-white/10 text-[14px] font-medium p-4 leading-relaxed shadow-inner text-foreground dark:text-white"
                                                    placeholder="Sync updated dialogue..."
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-1">Assigned Persona</Label>
                                                    <VoicePicker 
                                                        currentVoiceId={editVoiceId} 
                                                        onVoiceChange={setEditVoiceId} 
                                                        playingVoice={playingVoiceId} 
                                                        onTogglePlay={toggleVoicePreview} 
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button onClick={() => isDone ? handleSyncLine(line.id) : handleSaveDraftUpdate(line.id)} disabled={isGenerating} className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 btn-shine gap-3 text-white">
                                                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin"/> : (isDone ? <RefreshCw className="h-4 w-4" /> : <Save className="h-4 w-4" />)}
                                                        {isDone ? 'RE-SYNC CORE' : 'SAVE DRAFT NODE'}
                                                    </Button>
                                                    <Button variant="ghost" className="h-12 w-12 rounded-xl text-red-500 hover:bg-red-500/10" onClick={() => deleteGeneratedLine(line.id)}>
                                                        <Trash2 className="h-5 w-5" />
                                                    </Button>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-8 text-[9px] font-black uppercase text-zinc-600" onClick={() => setEditingIndex(null)}>Cancel Edit</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="rounded-2xl bg-muted/30 dark:bg-white/[0.01] border border-border dark:border-white/5 hover:border-border-hover dark:hover:border-white/10 transition-all shadow-inner p-4 group/text">
                                                <p className="text-[15px] font-medium leading-relaxed text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap italic line-clamp-4">
                                                    &quot;{line.dialogue}&quot;
                                                </p>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <Button variant="ghost" size="sm" className="h-8 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest text-primary/60 hover:bg-primary/10 hover:text-primary transition-all gap-2 border border-border dark:border-white/5 hover:border-primary/20" onClick={() => startEditing(index, line)}>
                                                    <Edit className="h-3.5 w-3.5" /> {isDone ? 'Edit Performance' : 'Edit Draft Node'}
                                                </Button>
                                                
                                                {!isDone && (
                                                    <div className="flex items-center gap-1.5 opacity-40">
                                                        <Mic className="h-3 w-3 text-zinc-500" />
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                                                            {voices.find((v) => v.id === (line.voiceOverride || characters.find(c => c.name === line.characterName)?.voice))?.name || line.voiceOverride || 'Ready'}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                             </div>
                        )
                    })}
                </div>
                </ScrollArea>
                
                 <div className="mt-6 pt-6 border-t border-dashed border-border dark:border-white/10">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full h-14 rounded-2xl border-2 border-dashed border-border dark:border-white/10 font-black uppercase tracking-widest text-xs gap-3 hover:bg-muted dark:hover:bg-white/5 hover:border-primary/30 text-zinc-500 hover:text-primary transition-all">
                                <Plus className="h-5 w-5" /> ADD DIALOGUE NODE
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2 rounded-xl shadow-2xl border-border dark:border-white/10 bg-popover text-popover-foreground dark:bg-[#0a0a0b]/95 dark:backdrop-blur-3xl dark:text-white">
                            <p className="px-3 py-2 text-[10px] font-black uppercase text-zinc-600 tracking-widest">Select Speaker</p>
                            <ScrollArea className="h-48">
                                <div className="space-y-1">
                                    {characters.map((char: Character) => (
                                        <Button key={char.id} variant="ghost" className="w-full justify-start font-bold text-xs uppercase h-10 rounded-lg text-muted-foreground hover:text-foreground dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5" onClick={() => addGeneratedLine(char.name)}>
                                            <Avatar className="h-6 w-6 mr-3">
                                                <AvatarFallback className={cn("text-[8px]", generateAvatarColor(char.name).bg, generateAvatarColor(char.name).text)}>{char.name[0]}</AvatarFallback>
                                            </Avatar>
                                            {char.name}
                                        </Button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </PopoverContent>
                    </Popover>
                </div>
            </CardContent>
        </Card>
    )
}
