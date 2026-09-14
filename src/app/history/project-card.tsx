
'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Project } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Music, Calendar, FilePenLine, Loader2, Edit, Trash2, Hourglass, FolderSearch, Copy, Coins, Cpu, ChevronsUpDown, Check, Play, Pause, ChevronDown, Archive, Sliders, Activity, AlertCircle, RotateCcw, Save } from 'lucide-react';
import { cn, generateAvatarColor, getDisplayUrl, localSaveFile, formatSafeDate } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-provider';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { EditProjectDialog } from '@/components/history/edit-project-dialog';
import { adminDeleteProjectAction, deleteUserProjectAction, userUpdateProjectVoicesAction } from '@/app/history/actions';
import type { WithIdAndRef } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { convertMp3ToWav, audioBufferToWav } from '@/lib/audio-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { voices } from '@/lib/voices';
import { VoiceEditorDialog } from '@/components/history/voice-editor-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { downloadScriptAsPdf, downloadScriptAsTxt, downloadScriptAsDocx } from '@/lib/export-script-pdf';
import { reportClientError } from '@/lib/report-client-error';

const cleanDisplayId = (id: string) => id.replace(/^12LABS-PROJ-/i, '').toUpperCase();

function VoiceEditDialog({ project, onUpdate }: { project: Project, onUpdate: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [chars, setChars] = useState<any[]>(project.characters || []);
    const [isSaving, setIsSaving] = useState(false);
    const [open, setOpen] = useState(false);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const groupedVoices = useMemo(() => {
        return {
            male: voices.filter(v => v.gender === 'Male'),
            female: voices.filter(v => v.gender === 'Female'),
            neutral: voices.filter(v => v.gender !== 'Male' && v.gender !== 'Female')
        };
    }, []);

    const handleVoiceChange = (charIndex: number, voiceId: string) => {
        setChars(prev => prev.map((c, i) => i === charIndex ? { ...c, voice: voiceId } : c));
    };

    const handleSave = async () => {
        if (!user) return;
        setIsSaving(true);
        const result = await userUpdateProjectVoicesAction(project.id, user.uid, chars);
        if (result.success) {
            toast({ title: 'Voices Updated' });
            onUpdate();
            setOpen(false);
        } else {
            toast({ variant: 'destructive', title: 'Update Failed', description: result.message });
        }
        setIsSaving(false);
    };

    const togglePlay = async (e: React.MouseEvent, url: string, voiceId: string) => {
        e.stopPropagation();
        if (!audioRef.current) audioRef.current = new Audio();
        const audio = audioRef.current;
        if (playingVoiceId === voiceId) {
            audio.pause();
            setPlayingVoiceId(null);
        } else {
            audio.pause(); 
            audio.src = url;
            try {
                await audio.play();
                setPlayingVoiceId(voiceId);
                audio.onended = () => setPlayingVoiceId(null);
            } catch (error) {
                if (error instanceof Error && error.name !== 'AbortError') {
                    console.error("Voice preview failed:", error);
                }
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl border-primary/20 hover:bg-primary/5 shadow-sm">
                    <Sliders className="h-6 w-6 text-primary" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md w-[95vw] sm:max-w-2xl overflow-hidden p-0 rounded-[2rem]">
                <DialogHeader className="p-6 border-b">
                    <DialogTitle className="text-xl font-black uppercase">Edit Cast Personas</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh]">
                    <div className="p-6 space-y-6">
                        {chars.map((char, idx) => (
                            <div key={idx} className="flex flex-col gap-3 p-5 border rounded-[1.5rem] bg-muted/10 shadow-inner">
                                <p className="font-black text-xs uppercase tracking-widest text-primary/60 px-1">{char.name}</p>
                                <Popover modal={true}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-12 rounded-xl bg-background shadow-sm border-primary/5">
                                            <span className="truncate font-bold">{voices.find(v => v.id === char.voice)?.name || 'Select Persona'}</span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[90vw] sm:w-[500px] p-0 rounded-2xl shadow-3xl overflow-hidden border-primary/10" align="start">
                                        <div className="flex flex-row h-72 divide-x">
                                            <div className="flex-1 flex flex-col min-w-0">
                                                <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 border-b shrink-0">Female</div>
                                                <ScrollArea className="flex-1">
                                                    <div className="p-2 space-y-1">
                                                        {groupedVoices.female.map(v => (
                                                            <div key={v.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-primary/5 cursor-pointer group" onClick={() => handleVoiceChange(idx, v.id)}>
                                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => togglePlay(e, v.demoUrl!, v.id)}>
                                                                    {playingVoiceId === v.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                                                </Button>
                                                                <span className="text-xs font-bold truncate flex-grow">{v.name}</span>
                                                                {char.voice === v.id && <Check className="h-3 w-3 text-primary" />}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                            <div className="flex-1 flex flex-col min-w-0">
                                                <div className="px-3 py-2 text-[9px] font-black uppercase bg-blue-500/5 border-b shrink-0">Male</div>
                                                <ScrollArea className="flex-1">
                                                    <div className="p-2 space-y-1">
                                                        {groupedVoices.male.map(v => (
                                                            <div key={v.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-primary/5 cursor-pointer group" onClick={() => handleVoiceChange(idx, v.id)}>
                                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => togglePlay(e, v.demoUrl!, v.id)}>
                                                                    {playingVoiceId === v.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                                                </Button>
                                                                <span className="text-xs font-bold truncate flex-grow">{v.name}</span>
                                                                {char.voice === v.id && <Check className="h-3 w-3 text-primary" />}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <DialogFooter className="p-6 bg-muted/20 border-t">
                    <Button onClick={handleSave} disabled={isSaving} className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs btn-shine">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        SYNC CAST UPDATES
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function ProjectCard({
  project,
  onViewProject,
  onProjectDeleted,
  onProjectUpdated,
}: {
  project: WithIdAndRef<Project>;
  onViewProject: (project: Project) => void;
  onProjectDeleted: (projectId: string) => void;
  onProjectUpdated: () => void;
}) {
  const { user, isImpersonating } = useAuth();
  const [isDownloadingMp3, setIsDownloadingMp3] = useState(false);
  const [isDownloadingWav, setIsDownloadingWav] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<'original' | 'edited'>('original');
  const { toast } = useToast();

  const editedUrl = project.editedAudioUrl || project.edited_audio_url;
  const activeTrackUrl = selectedTrack === 'edited' && editedUrl ? editedUrl : project.audioUrl;

  const isAdmin = user?.role === 'admin' || isImpersonating;
  const isOwner = user?.uid === project.userId;

  /**
   * 🛰️ ROBUST LOCAL DOWNLOAD NODE (v2.0)
   * Fetches the file locally into a Blob before saving to bypass origin restrictions and allow renaming.
   */
  const handleDownload = async (format: 'mp3' | 'wav', customUrl?: string, trackType: string = 'master') => {
    const rawTarget = customUrl || activeTrackUrl || project.audioUrl;
    if (!rawTarget) return;

    if (format === 'mp3') setIsDownloadingMp3(true); else setIsDownloadingWav(true);
    
    try {
        const safeName = project.projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || '12labs_audio';
        const finalFileName = `12labs_${trackType}_${safeName}.${format}`;
        await localSaveFile(rawTarget, finalFileName);
        toast({ title: 'Download Successful' });
    } catch (error: any) { 
        console.error("[Download Failed]:", error.message);
        toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not fetch file from cloud.' }); 
    }
    finally { setIsDownloadingMp3(false); setIsDownloadingWav(false); }
  };

  const handleDownloadZip = async () => {
    const audioUrl = getDisplayUrl(project.audioUrl);
    if (!audioUrl || !project.syncData) {
        toast({ variant: 'destructive', title: 'Download Error', description: 'Production data not available.' });
        return;
    }
    setIsExportingZip(true);
    try {
        const downloadApiUrl = `/api/download?url=${encodeURIComponent(audioUrl)}&filename=audio.mp3`;
        const response = await fetch(downloadApiUrl);
        const arrayBuffer = await response.arrayBuffer();
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const zip = new JSZip();
        
        const { timeline, dialogues, characterSettings } = project.syncData;
        
        for (let i = 0; i < dialogues.length; i++) {
            const d = dialogues[i]; 
            const s = timeline[i];
            const set = characterSettings?.[d.character] || { pitch: 0, speed: 1 };
            
            const renderedDuration = s.duration / (set.speed || 1);
            const offlineCtx = new OfflineAudioContext(
                audioBuffer.numberOfChannels || 1, 
                Math.ceil(renderedDuration * audioBuffer.sampleRate), 
                audioBuffer.sampleRate
            );
            
            const src = offlineCtx.createBufferSource();
            src.buffer = audioBuffer; 
            src.detune.value = (set.pitch || 0) * 100; 
            src.playbackRate.value = set.speed || 1;
            
            src.connect(offlineCtx.destination); 
            src.start(0, s.startTime, s.duration);
            
            const renderedBuffer = await offlineCtx.startRendering();
            zip.file(`${String(i + 1).padStart(3, '0')}-${d.character}.wav`, audioBufferToWav(renderedBuffer));
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `12labs_bundle_${project.projectName.replace(/\s+/g, '_')}.zip`);
        toast({ title: 'ZIP Bundle Ready' });
    } catch (e: any) { 
        console.error("[ZIP Failed]:", e.message);
        toast({ variant: 'destructive', title: 'ZIP Failed' }); 
    }
    finally { setIsExportingZip(false); }
  };

  const fetchFullScript = async () => {
    if (project.scriptUrl) {
        try {
            const url = getDisplayUrl(project.scriptUrl);
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().length > 0) {
                    return text;
                }
            }
        } catch (e) {
            console.error("Fetch full script failed:", e);
        }
    }
    return project.script || (typeof project.generationParams === 'string' ? project.generationParams : '') || '';
  };

  const handleDownloadScriptTxt = async () => {
    toast({ title: 'Preparing Text File...' });
    const text = await fetchFullScript();
    if (!text) {
        toast({ variant: 'destructive', title: 'No script content available' });
        return;
    }
    downloadScriptAsTxt(project.projectName || 'Script', text);
    toast({ title: 'Downloaded .TXT' });
  };

  const handleDownloadScriptDocx = async () => {
    toast({ title: 'Preparing Word File...' });
    const text = await fetchFullScript();
    if (!text) {
        toast({ variant: 'destructive', title: 'No script content available' });
        return;
    }
    try {
        await downloadScriptAsDocx(project.projectName || 'Script', text);
        toast({ title: 'Downloaded .DOCX' });
    } catch (err) {
            reportClientError('src/app/history/project-card.tsx:301', err);
        toast({ variant: 'destructive', title: 'DOCX generation failed' });
    }
  };

  const handleDownloadScriptPdf = async () => {
    toast({ title: 'Preparing PDF...' });
    const text = await fetchFullScript();
    if (!text) {
        toast({ variant: 'destructive', title: 'No script content available' });
        return;
    }
    try {
        toast({ title: 'Generating PDF...' });
        await downloadScriptAsPdf(project.projectName || 'Script', text);
        toast({ title: 'Downloaded .PDF' });
    } catch (err) {
        console.error("PDF Export Error:", err);
        toast({ variant: 'destructive', title: 'PDF generation failed' });
    }
  };

  const canAccessVoiceEditor = useMemo(() => {
    if (isAdmin) return true;
    if (!user) return false;
    const plans = (user as any).purchasedPlans || {};
    return !!(plans["336"] || plans["331"] || plans["540"] || plans["534"] || plans["999"] || plans["700"] || user.subscription);
  }, [user, isAdmin]);

  const handleDelete = async () => {
    setIsDeleting(true);
    const adminUid = (isImpersonating ? sessionStorage.getItem('admin_uid') : user?.uid) || '';
    const result = isAdmin 
        ? await adminDeleteProjectAction(project.id, adminUid, project.userId)
        : await deleteUserProjectAction(project.id, user?.uid || '');
    if (result.success) { toast({ title: result.message }); onProjectDeleted(project.id); }
    else { toast({ variant: 'destructive', title: 'Deletion Failed', description: result.message }); }
    setIsDeleting(false);
  };
  
  const isProcessing = project.status === 'processing';
  const isInQueue = project.status === 'in_queue';
  const isRejected = project.status === 'rejected';
  const isCompleted = project.status === 'completed' || (!!project.audioUrl && !isProcessing && !isInQueue && !isRejected);
  const isScriptOnly = project.projectType === 'script' || (!project.audioUrl && !!project.generationParams && !isProcessing && !isInQueue && !isRejected);
  const canDelete = isAdmin || (isOwner && (isCompleted || isRejected || project.projectType === 'voice-clone' || isScriptOnly));

  const safeDate = useMemo(() => {
    return formatSafeDate(project.createdAt, "do MMM, yyyy");
  }, [project.createdAt]);

  // Determine Project Category for clear visual distinction
  const projectCategory = useMemo(() => {
    const type = (project.projectType || '').toLowerCase();
    if (type.includes('music') || (project as any).isMusic || (project as any).tags?.includes('music')) return 'music';
    if (type === 'video' || (project as any).videoUrl) return 'video';
    if (type === 'script' || (!project.audioUrl && (project.script || project.generationParams))) return 'script';
    return 'voice';
  }, [project]);

  const categoryMeta = useMemo(() => {
    switch (projectCategory) {
      case 'music':
        return {
          label: 'AI Music',
          badgeClass: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30',
          icon: <Music className="h-4 w-4 text-cyan-300" />,
        };
      case 'video':
        return {
          label: 'AI Video',
          badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
          icon: <Activity className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
        };
      case 'script':
        return {
          label: 'AI Script',
          badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: <FilePenLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
        };
      default:
        return {
          label: 'AI Voice Studio',
          badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
          icon: <Cpu className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
        };
    }
  }, [projectCategory]);

  const scriptPreview = useMemo(() => {
    if (!project) return null;
    const text = typeof project.script === 'string' 
      ? project.script 
      : (typeof project.generationParams === 'string' 
          ? project.generationParams 
          : (typeof (project.generationParams as any)?.prompt === 'string' 
              ? (project.generationParams as any).prompt 
              : ''));
    if (!text || typeof text !== 'string') return null;
    return text.slice(0, 110) + (text.length > 110 ? '...' : '');
  }, [project]);

  const isMusic = projectCategory === 'music';

  return (
    <>
      <Card className={cn(
          "relative flex flex-col border shadow-md hover:shadow-xl transition-all duration-300 rounded-[2rem] overflow-hidden bg-card touch-manipulation select-none sm:select-auto", 
          (isProcessing || isInQueue) && "border-primary/30 ring-2 ring-primary/10",
          isProcessing && "ring-4 ring-primary/20 shadow-xl shadow-primary/20 animate-in zoom-in-95",
          isRejected && "border-amber-500/40 bg-amber-50/5 ring-amber-500/10"
      )}>
          {/* Music Background Banner Image if Music project */}
          {isMusic && (
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
              <img 
                src="https://pub-043ad602bb36492cb3242a4db09814fd.r2.dev/photo_2026-07-22_08-19-36.jpg" 
                alt="Music Card Background" 
                className="w-full h-full object-cover object-center opacity-40 dark:opacity-50 scale-105 filter blur-[0.5px]"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-card" />
            </div>
          )}

          <div className="relative z-10 flex flex-col h-full">
            {/* Top Category Header */}
            <div className={cn(
              "p-5 pb-3 flex items-center justify-between gap-2 border-b border-border/40",
              isMusic ? "bg-black/50 backdrop-blur-md" : "bg-muted/20"
            )}>
                <Badge variant="outline" className={cn("px-3 py-1 font-black text-[10px] uppercase tracking-wider gap-1.5 rounded-full border shadow-2xs", categoryMeta.badgeClass)}>
                    {categoryMeta.icon}
                    {categoryMeta.label}
                </Badge>

                <div className="flex items-center gap-2 shrink-0">
                    {isProcessing ? (
                        <Badge className="bg-primary text-primary-foreground animate-pulse h-6 px-2.5 text-[9px] font-black rounded-full uppercase tracking-wider">Active</Badge>
                    ) : isInQueue ? (
                        <Badge variant="outline" className="border-primary/30 text-primary h-6 px-2.5 text-[9px] font-black rounded-full uppercase tracking-wider">In Queue</Badge>
                    ) : isRejected ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600 h-6 px-2.5 text-[9px] font-black rounded-full uppercase tracking-wider">Returned</Badge>
                    ) : (
                        <Badge variant="secondary" className={cn("h-6 px-2.5 text-[9px] font-black rounded-full uppercase tracking-wider gap-1", isMusic ? "bg-white/10 text-white/90 border border-white/20" : "text-muted-foreground")}>
                            <Calendar className="h-3 w-3" />
                            {safeDate}
                        </Badge>
                    )}

                    {project.cost && project.cost > 0 && (
                        <Badge variant="secondary" className="font-black text-[10px] px-2.5 h-6 rounded-full gap-1 border-primary/5 text-amber-500">
                            <Coins className="h-3 w-3" />
                            {project.cost.toLocaleString()}
                        </Badge>
                    )}
                </div>
            </div>

            {/* Project Title & Script Preview */}
            <div className="p-5 pb-2 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={cn("font-black text-base sm:text-lg tracking-tight leading-snug line-clamp-1", isMusic ? "text-white" : "text-foreground")}>
                        {project?.projectName || 'HQ AI Project'}
                    </h3>
                    {((project as any)?.edited || (project as any)?.editedAudioUrl || (project as any)?.edited_audio_url) && (
                        <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[9px] font-black uppercase rounded-full tracking-wider px-2 h-5 flex items-center">
                            Edited
                        </Badge>
                    )}
                </div>
                
                {scriptPreview && (
                    <p className={cn("text-xs line-clamp-2 leading-relaxed p-2.5 rounded-xl font-medium border border-border/30", isMusic ? "bg-black/60 text-white/90 border-white/20" : "bg-muted/30 text-muted-foreground")}>
                        "{scriptPreview}"
                    </p>
                )}
            </div>

            {/* ID Bar with Copy trigger */}
            <div className="px-5 pt-1 pb-2">
                <div className={cn("w-full flex items-center justify-between text-[10px] font-mono font-bold px-3 py-2 rounded-xl", isMusic ? "bg-black/60 border border-white/20 text-white/80" : "bg-muted/40 border border-border/50 text-muted-foreground")}>
                    <span className="truncate max-w-[200px]">ID: {cleanDisplayId(project?.id)}</span>
                    <button 
                        type="button" 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            if (project?.id && navigator?.clipboard?.writeText) { 
                                navigator.clipboard.writeText(project.id); 
                                toast({ title: 'ID Copied' }); 
                            } 
                        }}
                        className="p-1.5 -mr-1 rounded-lg hover:bg-primary/20 text-primary transition-colors touch-manipulation flex items-center gap-1 font-sans text-[9px] font-black uppercase"
                        title="Copy Project ID"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                    </button>
                </div>
            </div>

            {/* Audio Player */}
            {isCompleted && (project.audioUrl || editedUrl) && (
                <div className="px-5 py-2 space-y-2">
                    {editedUrl && (
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider bg-primary/10 border border-primary/20 p-1.5 rounded-xl">
                            <span className="text-primary px-1">Audio Track:</span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedTrack('original'); }}
                                    className={cn("px-2.5 py-1 rounded-lg transition-all font-bold", selectedTrack === 'original' ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-primary/20 text-muted-foreground")}
                                >
                                    Original
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedTrack('edited'); }}
                                    className={cn("px-2.5 py-1 rounded-lg transition-all font-bold flex items-center gap-1", selectedTrack === 'edited' ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-primary/20 text-muted-foreground")}
                                >
                                    <span>Edited Voice</span>
                                </button>
                            </div>
                        </div>
                    )}
                    <div className={cn("p-2 rounded-xl border touch-manipulation", isMusic ? "bg-black/70 border-white/20" : "bg-muted/30 border-border/40")}>
                        <audio src={getDisplayUrl(activeTrackUrl)} preload="none" className="w-full h-9 rounded-lg" controls controlsList="nodownload" />
                    </div>
                </div>
            )}

            {/* Action Buttons Row */}
            <div className="mt-auto p-5 pt-3 border-t border-border/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 shrink-0">
                    <Button 
                        type="button"
                        variant="outline" 
                        size="sm" 
                        className={cn("h-11 px-3.5 rounded-xl hover:bg-primary/10 touch-manipulation gap-1.5 font-black text-xs", isMusic ? "border-white/30 text-white hover:text-white bg-black/40" : "border-border/60")} 
                        onClick={(e) => { e.stopPropagation(); onViewProject(project); }} 
                        title="View Script & Details"
                    >
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="hidden xs:inline uppercase text-[10px] tracking-wider">Script</span>
                    </Button>

                    {canDelete && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button 
                                    type="button"
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-11 w-11 rounded-xl text-destructive hover:bg-destructive/10 touch-manipulation p-0"
                                    title="Delete Project"
                                >
                                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4.5 w-4.5" />}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-[2rem] border-destructive/20 p-6 sm:p-8">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="text-xl font-black uppercase">Delete Project?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-sm font-medium">Remove this project data from your history archive?</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="mt-6 gap-3">
                                    <AlertDialogCancel className="rounded-xl font-bold h-11">Keep</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 rounded-xl font-black h-11">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {isInQueue && isOwner && <VoiceEditDialog project={project} onUpdate={onProjectUpdated} />}
                    
                    {isCompleted && project.audioUrl ? (
                        <div className="flex items-center gap-2">
                             {project.syncData && canAccessVoiceEditor && (
                                 <VoiceEditorDialog project={project}>
                                     <Button type="button" variant="outline" size="sm" className="h-11 w-11 rounded-xl border-border/60 hover:bg-primary/5 touch-manipulation p-0">
                                         <Sliders className="h-4.5 w-4.5 text-primary" />
                                     </Button>
                                 </VoiceEditorDialog>
                             )}
                             <DropdownMenu>
                                 <DropdownMenuTrigger asChild>
                                     <Button type="button" className="h-11 px-4 sm:px-5 rounded-xl font-black uppercase text-[10px] tracking-wider gap-2 shadow-md shadow-primary/20 btn-shine touch-manipulation">
                                         {isDownloadingMp3 || isDownloadingWav ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                         Download
                                         <ChevronDown className="h-3 w-3 opacity-60" />
                                     </Button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 border-border/60 shadow-xl">
                                     <DropdownMenuItem className="h-11 rounded-xl cursor-pointer font-bold text-xs" onClick={() => handleDownload('mp3')}>MP3 Audio File</DropdownMenuItem>
                                     <DropdownMenuItem className="h-11 rounded-xl cursor-pointer font-bold text-xs" onClick={() => handleDownload('wav')}>WAV Lossless Audio</DropdownMenuItem>
                                     {project.syncData && (
                                         <DropdownMenuItem className="h-11 rounded-xl cursor-pointer text-primary bg-primary/5 font-black uppercase text-[9px] tracking-widest mt-1" onClick={handleDownloadZip} disabled={isExportingZip}>Dialogue ZIP Bundle</DropdownMenuItem>
                                     )}
                                     <DropdownMenuSeparator />
                                     <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-2 py-1">Script Document</DropdownMenuLabel>
                                     <DropdownMenuItem className="h-10 rounded-xl cursor-pointer font-bold text-xs" onClick={handleDownloadScriptTxt}>.TXT Text File</DropdownMenuItem>
                                     <DropdownMenuItem className="h-10 rounded-xl cursor-pointer font-bold text-xs" onClick={handleDownloadScriptPdf}>.PDF Document</DropdownMenuItem>
                                     <DropdownMenuItem className="h-10 rounded-xl cursor-pointer font-bold text-xs" onClick={handleDownloadScriptDocx}>.DOCX Word File</DropdownMenuItem>
                                 </DropdownMenuContent>
                             </DropdownMenu>
                        </div>
                    ) : (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" className="h-11 px-4 sm:px-5 rounded-xl font-black uppercase text-[10px] tracking-wider gap-2 shadow-md shadow-primary/20 btn-shine touch-manipulation">
                                    <Download className="h-4 w-4" />
                                    Download
                                    <ChevronDown className="h-3 w-3 opacity-60" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 rounded-2xl p-2 border-border/60 shadow-xl">
                                <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-2 py-1">Export Script</DropdownMenuLabel>
                                <DropdownMenuItem className="h-11 rounded-xl cursor-pointer font-bold text-xs" onClick={handleDownloadScriptTxt}>.TXT Text File</DropdownMenuItem>
                                <DropdownMenuItem className="h-11 rounded-xl cursor-pointer font-bold text-xs" onClick={handleDownloadScriptPdf}>.PDF Document</DropdownMenuItem>
                                <DropdownMenuItem className="h-11 rounded-xl cursor-pointer font-bold text-xs" onClick={handleDownloadScriptDocx}>.DOCX Word File</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
            
            {isAdmin && (
                <div className="px-5 pb-5 pt-0">
                    <Button type="button" variant="outline" className="w-full h-10 rounded-xl font-black uppercase tracking-widest text-[9px] border-border/60 text-primary/80 hover:bg-primary hover:text-white transition-all gap-2 touch-manipulation" onClick={() => setIsEditDialogOpen(true)}>
                        <Edit className="h-3.5 w-3.5" /> Admin Metadata Override
                    </Button>
                </div>
            )}
          </div>
      </Card>
      {isAdmin && <EditProjectDialog project={project} open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} onUpdate={onProjectUpdated} />}
    </>
  );
}
