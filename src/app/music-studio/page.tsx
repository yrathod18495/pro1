'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import {
    Music, Sparkles, Loader2, Zap, Trash2,
    CheckCircle2, Clock, Mic2, Volume2,
    Radio, FileText, Headphones, Disc, ChevronDown,
    ExternalLink, Download, Copy, Link as LinkIcon, X, Check
} from 'lucide-react';
import { submitMusicProjectRequestAction, deleteMusicProjectRequestAction } from './actions';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { cn, getDisplayUrl } from '@/lib/utils';
import { initializeFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { reportClientError } from '@/lib/report-client-error';

export default function MusicStudioPage() {
    const { user, setUser, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const { firestore } = initializeFirebase();
    const router = useRouter();

    // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
    // silently rendering the full music studio while logged out.
    useEffect(() => {
        if (!authLoading && !user) {
            toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use Music Studio.' });
            router.push('/login');
        }
    }, [authLoading, user, router, toast]);

    // 🔀 Active Tab Choice: 'vocal' (Song) vs 'instrumental' (Background Music)
    const [productionMode, setProductionMode] = useState<'vocal' | 'instrumental'>('vocal');

    // 🎤 Song State Variables
    const [songPrompt, setSongPrompt] = useState('');
    const [songLyrics, setSongLyrics] = useState('');

    // 🎹 BGM State Variables
    const [bgmPrompt, setBgmPrompt] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [historyLimit, setHistoryLimit] = useState(5);
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [readyProject, setReadyProject] = useState<any | null>(null);
    const [copiedTrackId, setCopiedTrackId] = useState<string | null>(null);

    // 📡 Realtime query for submitted requests from Firestore `music_project`
    const musicProjectsQuery = useMemoFirebase(() => {
        if (!firestore || !user?.uid) return null;
        return query(
            collection(firestore, 'music_project', user.uid, 'userProjects'),
            orderBy('createdAt', 'desc'),
            limit(historyLimit)
        );
    }, [firestore, user?.uid, historyLimit]);

    const { data: myMusicRequests, isLoading: isLoadingRequests } = useCollection<any>(musicProjectsQuery);

    // ⚡ Realtime listener for active job completion
    useEffect(() => {
        if (!myMusicRequests || myMusicRequests.length === 0) return;

        if (activeJobId) {
            const found = myMusicRequests.find((r: any) => (r.projectId === activeJobId || r.id === activeJobId));
            if (found) {
                const rawAudioUrl = found.audioUrl || found.musicUrl || found.url || found.downloadUrl || found.outputUrl || found.audio;
                const isDone = found.status === 'completed' || !!rawAudioUrl;
                if (isDone && rawAudioUrl) {
                    setIsSubmitting(false);
                    setReadyProject(found);
                    setActiveJobId(null);
                    toast({
                        title: '🎉 Your Track is Ready!',
                        description: `"${found.projectName || 'AI Track'}" has been generated and is ready to play!`,
                    });
                }
            }
        }
    }, [myMusicRequests, activeJobId, toast]);

    const cost = 2000;
    const insufficientCredits = !user || (user.credits < cost);

    // Handle Music Generation Submit
    const handleGenerateMusic = async () => {
        if (!user?.uid) {
            toast({ variant: 'destructive', title: 'Authentication Required', description: 'Please sign in to generate music.' });
            return;
        }

        const activePrompt = productionMode === 'vocal' ? songPrompt : bgmPrompt;
        if (!activePrompt || activePrompt.trim().length < 3) {
            toast({ variant: 'destructive', title: 'Prompt Required', description: 'Please write a prompt describing your music track.' });
            return;
        }

        if (insufficientCredits) {
            toast({ variant: 'destructive', title: 'Insufficient Credits', description: `You need ${cost.toLocaleString()} credits to generate music.` });
            return;
        }

        setIsSubmitting(true);

        // Package params based on production mode. Style/category/mood/duration
        // are no longer picked in the UI — the backend action already falls
        // back to sensible defaults (English, 2:00, Medium, etc.) when omitted.
        const finalPrompt = activePrompt.trim();
        const finalLyrics = productionMode === 'vocal' ? songLyrics.trim() : '';

        try {
            const res = await submitMusicProjectRequestAction({
                userId: user.uid,
                userName: user.name || 'User',
                userEmail: user.email || 'N/A',
                prompt: finalPrompt,
                productionMode,
                selectedLanguage: 'English',
                selectedTags: [],
                lyrics: finalLyrics,
            });

            if (res.success && res.projectId) {
                if (res.newCredits !== undefined) {
                    setUser(prev => prev ? { ...prev, credits: res.newCredits! } : null);
                }
                setActiveJobId(res.projectId);
                toast({ 
                    title: '🎵 Request Dispatched!', 
                    description: `Audio synthesis node started (-${cost.toLocaleString()} credits). Listening for output...` 
                });
                
                // Clear active fields
                if (productionMode === 'vocal') {
                    setSongPrompt('');
                    setSongLyrics('');
                } else {
                    setBgmPrompt('');
                }
            } else {
                throw new Error(res.error || 'Failed to generate music.');
            }
        } catch (e: any) {
            reportClientError('src/app/music-studio/page.tsx:274', e);
            toast({ variant: 'destructive', title: 'Generation Failed', description: e.message || 'Error processing request.' });
            setIsSubmitting(false);
        }
    };

    const handleDeleteRequest = async (projectId: string) => {
        if (!user?.uid) return;
        setDeletingId(projectId);
        try {
            const res = await deleteMusicProjectRequestAction(projectId, user.uid);
            if (res.success) {
                toast({ title: 'Request Removed' });
            } else {
                throw new Error(res.error || 'Failed to remove project');
            }
        } catch (e: any) {
            reportClientError('src/app/music-studio/page.tsx:290', e);
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setDeletingId(null);
        }
    };

    if (authLoading || !user) {
        return (
            <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#121212] text-slate-900 dark:text-[#E0E0E0] pb-32 transition-colors">

            <div className="container mx-auto max-w-5xl py-8 px-4 space-y-10">
                
                {/* Simplified Header */}
                <div className="text-center space-y-3 max-w-2xl mx-auto pt-4">
                    <Badge variant="outline" className="h-7 px-4 rounded-full border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-[0.2em] text-[9px] shadow-sm">
                        <Zap className="mr-1.5 h-3 w-3 fill-current text-indigo-500 dark:text-indigo-400" /> Professional AI Audio Generation
                    </Badge>
                    <h1 className="text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white leading-tight">
                        Instant Song & Music <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-indigo-500 to-purple-500 dark:from-pink-500 dark:via-indigo-400 dark:to-purple-400">Creator</span>
                    </h1>
                    <p className="text-slate-600 dark:text-zinc-400 font-medium text-xs sm:text-sm max-w-lg mx-auto">
                        Toggle between Vocal Song or Background Music to access custom parameters tailored precisely to your production needs.
                    </p>
                </div>

                {/* 🔀 Premium Mode Segmented Switcher */}
                <div className="max-w-md mx-auto grid grid-cols-2 p-1.5 bg-slate-200/80 dark:bg-[#1a1a1a] border border-slate-300 dark:border-white/10 rounded-2xl shadow-md dark:shadow-xl">
                    <button
                        id="btn-vocal-mode"
                        onClick={() => setProductionMode('vocal')}
                        className={cn(
                            "py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                            productionMode === 'vocal'
                                ? "bg-gradient-to-r from-pink-600 to-rose-700 text-white shadow-lg shadow-pink-500/15"
                                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5"
                        )}
                    >
                        <Mic2 className="h-3.5 w-3.5" /> Vocal Song
                    </button>
                    <button
                        id="btn-bgm-mode"
                        onClick={() => setProductionMode('instrumental')}
                        className={cn(
                            "py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                            productionMode === 'instrumental'
                                ? "bg-gradient-to-r from-indigo-600 to-purple-700 text-white shadow-lg shadow-indigo-500/15"
                                : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5"
                        )}
                    >
                        <Volume2 className="h-3.5 w-3.5" /> Background Music
                    </button>
                </div>

                {/* 🎨 Main Form Container with dynamic styling based on mode */}
                <Card className={cn(
                    "rounded-[2rem] border shadow-2xl transition-all duration-300 bg-white dark:bg-[#1e1e1e] overflow-hidden",
                    productionMode === 'vocal' 
                        ? "border-pink-500/20 shadow-pink-900/5" 
                        : "border-indigo-500/20 shadow-indigo-900/5"
                )}>
                    {/* Header */}
                    <CardHeader className="p-6 sm:p-8 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                {productionMode === 'vocal' ? (
                                    <>
                                        <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
                                            <Mic2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Vocal Song Creator</CardTitle>
                                            <CardDescription className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Generate songs with distinct vocal lyrics, melodies, and dynamic verse-chorus structure.</CardDescription>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                                            <Volume2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Background Music Studio</CardTitle>
                                            <CardDescription className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Generate rich instrumental tracks, soundscapes, cartoon scores, or video backdrops.</CardDescription>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#2d2d2d] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/5 shrink-0 self-start sm:self-center">
                                <Zap className="h-3.5 w-3.5 text-amber-400" />
                                <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">{cost.toLocaleString()} CREDITS / GENERATION</span>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-6 sm:p-8 space-y-8">
                        
                        {/* ========================================================= */}
                        {/* 🎤 MODE: VOCAL SONG DESIGN                                */}
                        {/* ========================================================= */}
                        {productionMode === 'vocal' && (
                            <div className="space-y-8 animate-in fade-in duration-300">

                                {/* A. Song Prompt Description */}
                                <div className="space-y-3">
                                    <Label className="text-[11px] font-bold uppercase tracking-wider text-pink-400 flex items-center gap-1.5">
                                        <Headphones className="h-3.5 w-3.5" /> What should the song be about?
                                    </Label>
                                    <Textarea
                                        id="input-song-prompt"
                                        placeholder="Describe the mood, topic, story, and style of your song (e.g., 'An upbeat pop song with bright synthesizer drums about driving down the highway at sunset with happy female vocals')..."
                                        value={songPrompt}
                                        onChange={e => setSongPrompt(e.target.value)}
                                        className="min-h-[110px] text-xs sm:text-sm font-medium rounded-2xl bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 p-4 focus-visible:ring-pink-500 text-slate-900 dark:text-white"
                                    />
                                </div>

                                {/* B. Song Custom Lyrics */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-[11px] font-bold uppercase tracking-wider text-pink-400 flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5" /> Custom Lyrics
                                        </Label>
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase">Optional</span>
                                    </div>
                                    <Textarea
                                        id="input-song-lyrics"
                                        placeholder="Enter your custom lyrics line-by-line (or leave blank to let the AI auto-generate professional lyrics for you)..."
                                        value={songLyrics}
                                        onChange={e => setSongLyrics(e.target.value)}
                                        className="min-h-[110px] text-xs font-mono rounded-2xl bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 p-4 focus-visible:ring-pink-500 text-slate-900 dark:text-white"
                                    />
                                </div>

                            </div>
                        )}

                        {/* ========================================================= */}
                        {/* 🎹 MODE: BACKGROUND MUSIC DESIGN                         */}
                        {/* ========================================================= */}
                        {productionMode === 'instrumental' && (
                            <div className="space-y-8 animate-in fade-in duration-300">

                                {/* BGM Scene/Vibe Prompt */}
                                <div className="space-y-3">
                                    <Label className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                                        <Headphones className="h-3.5 w-3.5" /> Describe the Scene or Vibe
                                    </Label>
                                    <Textarea
                                        id="input-bgm-prompt"
                                        placeholder="Describe where this background music will be played (e.g., 'A dramatic cinematic trailer opening with intense slow drum buildup and haunting solo cello melodies for a thriller movie')..."
                                        value={bgmPrompt}
                                        onChange={e => setBgmPrompt(e.target.value)}
                                        className="min-h-[110px] text-xs sm:text-sm font-medium rounded-2xl bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 p-4 focus-visible:ring-indigo-500 text-slate-900 dark:text-white"
                                    />
                                </div>

                            </div>
                        )}

                        {/* Divider */}
                        <div className="h-px bg-slate-200 dark:bg-white/5 my-4" />

                        {/* Cost & Submit Button Section (Highly simplified as requested) */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-xs px-2 font-semibold text-slate-500 dark:text-zinc-400">
                                <span>Total Production Cost</span>
                                <span className={cn(
                                    "font-black tracking-wider",
                                    productionMode === 'vocal' ? "text-pink-400" : "text-indigo-400"
                                )}>
                                    {cost.toLocaleString()} CREDITS
                                </span>
                            </div>

                            <Button 
                                id="btn-generate-music"
                                onClick={handleGenerateMusic} 
                                disabled={isSubmitting || insufficientCredits} 
                                className={cn(
                                    "w-full h-14 rounded-2xl text-xs sm:text-sm font-extrabold uppercase tracking-widest shadow-xl transition-all active:scale-[0.99] border-none text-white",
                                    productionMode === 'vocal'
                                        ? "bg-gradient-to-r from-pink-600 via-rose-600 to-indigo-600 shadow-pink-500/10 hover:opacity-95"
                                        : "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-indigo-500/10 hover:opacity-95"
                                )}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center gap-2 justify-center">
                                        <Loader2 className="h-4 w-4 animate-spin" /> GENERATING...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2 justify-center">
                                        <Sparkles className="h-4 w-4 fill-current" /> GENERATE
                                    </span>
                                )}
                            </Button>

                            {insufficientCredits && (
                                <p className="text-center text-xs font-bold text-red-400 animate-pulse">
                                    Insufficient balance. You need {cost.toLocaleString()} credits to generate.
                                </p>
                            )}
                        </div>

                    </CardContent>
                </Card>

                {/* ⚡ LIVE RENDER & TRACK READY STAGE */}
                {(activeJobId || isSubmitting) && (
                    <Card className="rounded-3xl border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-50 via-purple-50 to-slate-100 dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-slate-950/60 backdrop-blur-xl shadow-2xl p-8 text-center space-y-6 animate-in zoom-in-95 duration-500">
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <div className="relative">
                                <div className="h-16 w-16 rounded-3xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/40 animate-pulse">
                                    <Music className="h-8 w-8 text-indigo-400 animate-bounce" />
                                </div>
                                <div className="absolute -top-1 -right-1 h-4 w-4 bg-pink-500 rounded-full animate-ping" />
                            </div>
                            <div className="space-y-1">
                                <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-extrabold text-[10px] uppercase tracking-widest px-3 py-1">
                                    SYNTHESIS NODE ACTIVE
                                </Badge>
                                <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white">Composing Your Track</h3>
                                <p className="text-xs text-indigo-700/80 dark:text-indigo-200/70 max-w-md mx-auto">
                                    Generating soundscapes, harmonic arrangement, and mixing audio layers. Track will load automatically upon completion.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-mono text-indigo-700 dark:text-indigo-400/80 bg-indigo-100 dark:bg-indigo-950/60 px-4 py-1.5 rounded-full border border-indigo-500/20">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Listening for audio stream: {activeJobId || 'Active Task'}</span>
                            </div>
                        </div>
                    </Card>
                )}

                {/* 🎉 YOUR TRACK IS READY PREVIEW CARD */}
                {readyProject && !activeJobId && !isSubmitting && (
                    <Card className="rounded-3xl border-2 border-green-500/40 bg-gradient-to-br from-emerald-50 via-white to-indigo-50 dark:from-emerald-950/30 dark:via-slate-900 dark:to-indigo-950/30 backdrop-blur-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                        <CardHeader className="bg-emerald-500/10 border-b border-emerald-500/20 p-6 sm:p-8 flex flex-row items-center justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-emerald-500 text-slate-950 font-black text-[10px] uppercase tracking-wider px-3 py-1">
                                        READY TO PLAY
                                    </Badge>
                                    <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400/80 uppercase tracking-widest">
                                        ID: {readyProject.projectId || readyProject.id || 'NEW'}
                                    </span>
                                </div>
                                <CardTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                                    🎉 Your Track is Ready!
                                </CardTitle>
                                <CardDescription className="text-xs font-medium text-emerald-700/80 dark:text-emerald-200/70">
                                    High fidelity audio generated successfully. Listen, stream, or download below.
                                </CardDescription>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => setReadyProject(null)}
                                className="h-8 w-8 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
                                title="Dismiss card"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="p-6 sm:p-8 space-y-6">
                            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 space-y-3">
                                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    <span className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                                        <Disc className="h-4 w-4 text-indigo-400" />
                                        {readyProject.projectName || readyProject.category || 'AI Composition'}
                                    </span>
                                    <span>{readyProject.duration || 'Full Track'}</span>
                                </div>
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 italic">
                                    "{readyProject.prompt || readyProject.script || 'Custom Composition'}"
                                </p>
                            </div>

                            {/* Audio Player */}
                            {(() => {
                                const rawAudio = readyProject.audioUrl || readyProject.musicUrl || readyProject.url || readyProject.downloadUrl || readyProject.outputUrl || readyProject.audio;
                                const displayAudio = rawAudio ? getDisplayUrl(rawAudio) : null;
                                return (
                                    <div className="space-y-4">
                                        {displayAudio ? (
                                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
                                                <audio src={displayAudio} controls autoPlay className="w-full h-11 rounded-xl shadow-md" />
                                                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                                    <div className="flex items-center gap-2">
                                                        <a 
                                                            href={displayAudio}
                                                            download={`track_${readyProject.projectId || 'track'}.mp3`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            <Button className="h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 gap-2 shadow-lg shadow-emerald-500/20">
                                                                <Download className="h-4 w-4" /> Download MP3
                                                            </Button>
                                                        </a>
                                                        <Button 
                                                            variant="outline" 
                                                            className="h-9 px-4 rounded-xl text-xs font-bold uppercase tracking-wider border-slate-300 dark:border-white/20 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-900 dark:text-white gap-2"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(displayAudio);
                                                                setCopiedTrackId(readyProject.projectId || readyProject.id);
                                                                toast({ title: 'Link Copied!', description: 'Audio URL copied to clipboard.' });
                                                                setTimeout(() => setCopiedTrackId(null), 2000);
                                                            }}
                                                        >
                                                            {copiedTrackId === (readyProject.projectId || readyProject.id) ? (
                                                                <>
                                                                    <Check className="h-4 w-4 text-emerald-400" /> Copied!
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="h-4 w-4" /> Copy Link
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>

                                                    <a 
                                                        href={displayAudio}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-mono text-indigo-400 hover:underline flex items-center gap-1"
                                                    >
                                                        <span>Open Direct Link</span>
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </a>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 text-center text-xs text-amber-400 bg-amber-950/20 border border-amber-500/20 rounded-2xl">
                                                Audio URL is syncing... Check generation history below.
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </CardContent>
                    </Card>
                )}

                {/* Submitted Requests Section */}
                <div className="space-y-6 pt-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                                <Clock className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                                Your Generations History
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-0.5">View and manage your recent audio compositions</p>
                        </div>
                        {myMusicRequests && myMusicRequests.length > 0 && (
                            <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 font-bold text-xs px-3 py-1">
                                {myMusicRequests.length} TOTAL SAMPLES
                            </Badge>
                        )}
                    </div>

                    {isLoadingRequests ? (
                        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-[#1a1a1a] rounded-3xl border border-slate-200 dark:border-white/5 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Loading history...</p>
                        </div>
                    ) : myMusicRequests && myMusicRequests.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 gap-4">
                                {myMusicRequests.map((req: any) => {
                                    const rawAudioUrl = req.audioUrl || req.musicUrl || req.url || req.downloadUrl || req.scriptUrl || req.outputUrl || req.audio;
                                    const displayAudioUrl = rawAudioUrl ? getDisplayUrl(rawAudioUrl) : null;
                                    const isCompleted = req.status === 'completed' || !!rawAudioUrl;
                                    const isPending = (req.status === 'pending' || req.status === 'processing') && !rawAudioUrl;
                                    const formattedDate = req.createdAt 
                                        ? new Date(req.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                                        : 'Recently';

                                    return (
                                        <Card key={req.id} className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#1a1a1a]/60 backdrop-blur-md overflow-hidden hover:border-indigo-500/30 transition-all p-5 sm:p-6 space-y-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-white/5">
                                                            ID: {req.projectId || req.id}
                                                        </span>
                                                        <Badge variant="outline" className={cn(
                                                            "text-[9px] font-bold uppercase",
                                                            req.productionMode === 'vocal' 
                                                                ? "border-pink-500/30 text-pink-600 dark:text-pink-400 bg-pink-500/5" 
                                                                : "border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5"
                                                        )}>
                                                            {req.productionMode === 'vocal' ? '🎤 Song' : '🎵 BGM'}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[9px] font-bold uppercase border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5">
                                                            {req.language || 'Instrumental'}
                                                        </Badge>
                                                        {req.duration && (
                                                            <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-500">⏱️ {req.duration}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-500 flex items-center gap-1.5 pt-1">
                                                        <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                                                        <span>{formattedDate}</span>
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {isPending && (
                                                        <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold text-[10px] uppercase tracking-wider px-3 py-1 flex items-center gap-1.5 animate-pulse">
                                                            <Radio className="h-3 w-3 text-amber-500 dark:text-amber-400 animate-spin" />
                                                            <span>Processing...</span>
                                                        </Badge>
                                                    )}
                                                    {isCompleted && (
                                                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold text-[10px] uppercase tracking-wider px-3 py-1 flex items-center gap-1">
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            <span>Track Ready</span>
                                                        </Badge>
                                                    )}
                                                    {req.status === 'error' && (
                                                        <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 font-bold text-[10px] uppercase tracking-wider px-3 py-1">
                                                            Failed
                                                        </Badge>
                                                    )}

                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        id={`btn-delete-${req.id}`}
                                                        onClick={() => handleDeleteRequest(req.id)}
                                                        disabled={deletingId === req.id}
                                                        className="h-8 w-8 rounded-xl text-slate-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                        title="Delete request"
                                                    >
                                                        {deletingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                                                    "{req.prompt || req.script}"
                                                </p>

                                                {req.tags && req.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                        {req.tags.map((t: string) => (
                                                            <span key={t} className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/5">
                                                                #{t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {req.lyrics && (
                                                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 text-xs font-mono text-slate-600 dark:text-zinc-400 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                                        <span className="text-[9px] font-bold uppercase text-pink-600 dark:text-pink-400 block mb-1">Lyrics Content:</span>
                                                        {req.lyrics}
                                                    </div>
                                                )}
                                            </div>

                                            {/* 🎵 AUDIO PLAYER & DIRECT LINK SECTION */}
                                            {rawAudioUrl ? (
                                                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 mt-3 space-y-3">
                                                    {displayAudioUrl && (
                                                        <audio src={displayAudioUrl} controls className="w-full h-10 rounded-xl" />
                                                    )}
                                                    
                                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-white/5">
                                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                            <LinkIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                                            <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-zinc-400 shrink-0">
                                                                Audio Link:
                                                            </span>
                                                            <a 
                                                                href={displayAudioUrl || '#'} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[180px] sm:max-w-xs flex items-center gap-1"
                                                                title={rawAudioUrl}
                                                            >
                                                                <span className="truncate">{rawAudioUrl}</span>
                                                                <ExternalLink className="h-3 w-3 shrink-0" />
                                                            </a>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 text-[10px] font-bold rounded-lg px-2.5 gap-1 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(displayAudioUrl || rawAudioUrl);
                                                                    toast({ title: 'Link Copied!', description: 'Audio URL copied to clipboard.' });
                                                                }}
                                                            >
                                                                <Copy className="h-3 w-3" />
                                                                Copy Link
                                                            </Button>
                                                            {displayAudioUrl && (
                                                                <a 
                                                                    href={displayAudioUrl} 
                                                                    download={`music_${req.projectId || req.id || 'track'}.mp3`}
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <Button
                                                                        variant="default"
                                                                        size="sm"
                                                                        className="h-7 text-[10px] font-bold rounded-lg px-2.5 gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                                                                    >
                                                                        <Download className="h-3 w-3" />
                                                                        Download
                                                                    </Button>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : isPending ? (
                                                <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-3">
                                                    <div className="flex items-center gap-2">
                                                        <Radio className="h-4 w-4 animate-spin text-amber-500 shrink-0" />
                                                        <span className="font-medium">AI Music Generator is synthesizing audio...</span>
                                                    </div>
                                                    <span className="font-mono text-[10px] text-amber-600/90 dark:text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 shrink-0">
                                                        Job ID: {req.projectId || req.id}
                                                    </span>
                                                </div>
                                            ) : null}
                                        </Card>
                                    );
                                })}
                            </div>
                            {myMusicRequests && myMusicRequests.length >= historyLimit && (
                                <div className="flex justify-center pt-6">
                                    <Button
                                        variant="outline"
                                        onClick={() => setHistoryLimit(prev => prev + 10)}
                                        className="rounded-2xl px-8 py-3 text-xs font-black uppercase tracking-widest border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 gap-2 shadow-lg"
                                    >
                                        <ChevronDown className="h-4 w-4" /> Load More History
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-16 border border-dashed border-slate-300 dark:border-white/10 rounded-3xl opacity-60 flex flex-col items-center justify-center space-y-3 bg-slate-50 dark:bg-[#1a1a1a]/40">
                            <Music className="h-12 w-12 text-indigo-500 opacity-50" />
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">No Audio History Yet</h3>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-500 max-w-xs">
                                Configure your prompt, choose the style and tap "Generate" to create your first track.
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
