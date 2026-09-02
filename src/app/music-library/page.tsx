'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { MusicEntry } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-provider';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, getDisplayUrl } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
    addMusicToLibraryAction, 
    deleteLibraryMusicAction, 
    updateLibraryMusicAction 
} from '@/app/admin/music-manager/actions';
import { uploadFileDirectly } from '@/lib/gcs-client';
import { applyWatermarkToBlob } from '@/lib/audio-utils';

import { 
    Music, 
    Play, 
    Pause, 
    Download,
    Loader2,
    X,
    Search,
    ShieldCheck,
    Check,
    Volume2,
    VolumeX,
    Repeat,
    SkipForward,
    SkipBack,
    Plus,
    Trash2,
    Edit3,
    Save,
    Zap,
    IndianRupee,
    Music2,
    Sparkles,
    Filter,
    ArrowUpDown
} from 'lucide-react';
import { reportClientError } from '@/lib/report-client-error';

const CATEGORIES = ['ALL', 'CINEMATIC', 'EMOTIONAL', 'HORROR', 'COMEDY', 'LO-FI', 'ACTION', 'SUSPENSE', 'INSPIRATIONAL', 'DEVOTIONAL'];

const iconGradients = [
    "bg-gradient-to-br from-purple-600 to-indigo-700",
    "bg-gradient-to-br from-blue-600 to-cyan-700",
    "bg-gradient-to-br from-rose-600 to-pink-700",
    "bg-gradient-to-br from-amber-500 to-orange-700",
    "bg-gradient-to-br from-emerald-600 to-teal-700"
];

const getTrackGradient = (id: string) => {
    const index = (id || '0').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % iconGradients.length;
    return iconGradients[index];
};

function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function MusicLibraryPage() {
    const { user } = useAuth();
    const { database } = initializeFirebase();
    const { toast } = useToast();
    
    const isAdmin = user?.role === 'admin' || user?.email === '12labofficial@gmail.com';

    const [music, setMusic] = useState<MusicEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('ALL');
    const [sortBy, setSortBy] = useState<'newest' | 'title' | 'price'>('newest');

    // Player State
    const [currentTrack, setCurrentTrack] = useState<MusicEntry | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isLooping, setIsLooping] = useState(false);

    // Downloading States
    const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});

    // Admin Dialogs State
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [newTrack, setNewTrack] = useState({ prompt: '', category: 'CINEMATIC', price: 0 });
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [watermarkUrl, setWatermarkUrl] = useState('');

    const [editingTrack, setEditingTrack] = useState<MusicEntry | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ prompt: '', category: 'CINEMATIC', price: 0 });

    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 1. Subscribe to Firebase Music Library
    useEffect(() => {
        if (!database) return;
        const libraryRef = ref(database, 'publicMusicLibrary');
        const unsubscribe = onRtdbValue(libraryRef, (snapshot) => {
            if (snapshot.exists()) {
                const list = Object.entries(snapshot.val()).map(([id, val]: [string, any]) => ({ id, ...val }));
                setMusic(list);
            } else {
                setMusic([]);
            }
            setIsLoading(false);
        });

        const wmRef = ref(database, 'settings/app/musicWatermarkUrl');
        const unsubWatermark = onRtdbValue(wmRef, (snap) => {
            if (snap.exists()) setWatermarkUrl(snap.val());
        });

        return () => {
            unsubscribe();
            unsubWatermark();
        };
    }, [database]);

    // 2. Initialize Audio Instance once
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const audio = new Audio();
        audioRef.current = audio;

        const handleTimeUpdate = () => {
            if (audio.duration && isFinite(audio.duration)) {
                setCurrentTime(audio.currentTime);
                setDuration(audio.duration);
                setProgress((audio.currentTime / audio.duration) * 100);
            }
        };

        const handleWaiting = () => setIsBuffering(true);
        const handlePlaying = () => {
            setIsBuffering(false);
            setIsPlaying(true);
        };
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
            // Auto play next track if available
            handleNextTrack();
        };

        const handleError = () => {
            setIsBuffering(false);
            setIsPlaying(false);
            toast({
                variant: 'destructive',
                title: 'Audio Playback Error',
                description: 'Failed to stream audio file. Please try again.'
            });
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('waiting', handleWaiting);
        audio.addEventListener('playing', handlePlaying);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('error', handleError);

        return () => {
            audio.pause();
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('waiting', handleWaiting);
            audio.removeEventListener('playing', handlePlaying);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('error', handleError);
        };
    }, []);

    // 3. Sync volume and loop settings
    useEffect(() => {
        if (!audioRef.current) return;
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current.loop = isLooping;
    }, [volume, isMuted, isLooping]);

    // 4. Play/Pause toggle handler
    const handleTogglePlay = (track: MusicEntry) => {
        const audio = audioRef.current;
        if (!audio) return;

        if (currentTrack?.id === track.id) {
            if (isPlaying) {
                audio.pause();
            } else {
                audio.play().catch(() => {
                    toast({ variant: 'destructive', title: 'Playback Blocked by Browser' });
                });
            }
        } else {
            audio.pause();
            setCurrentTrack(track);
            setIsBuffering(true);
            setProgress(0);
            setCurrentTime(0);

            const streamUrl = getDisplayUrl(track.url, false);
            audio.src = streamUrl;
            audio.load();
            audio.play().catch((e) => {
                console.error("Audio play error:", e);
                setIsBuffering(false);
                toast({ variant: 'destructive', title: 'Unable to stream track' });
            });
        }
    };

    const handleSeek = (value: number[]) => {
        const audio = audioRef.current;
        if (audio && audio.duration && isFinite(audio.duration)) {
            const newTime = (value[0] / 100) * audio.duration;
            audio.currentTime = newTime;
            setProgress(value[0]);
            setCurrentTime(newTime);
        }
    };

    const handleVolumeChange = (value: number[]) => {
        const newVol = value[0] / 100;
        setVolume(newVol);
        if (newVol > 0 && isMuted) setIsMuted(false);
    };

    // Filter & Sort tracks
    const filteredTracks = useMemo(() => {
        let result = music.filter(t => {
            const matchesSearch = t.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  t.category?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = activeCategory === 'ALL' || (t.category?.toUpperCase() === activeCategory);
            return matchesSearch && matchesCategory;
        });

        if (sortBy === 'newest') {
            result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        } else if (sortBy === 'title') {
            result.sort((a, b) => (a.prompt || '').localeCompare(b.prompt || ''));
        } else if (sortBy === 'price') {
            result.sort((a, b) => (a.price || 0) - (b.price || 0));
        }

        return result;
    }, [music, searchQuery, activeCategory, sortBy]);

    // Next / Previous navigation
    const handleNextTrack = () => {
        if (!currentTrack || filteredTracks.length === 0) return;
        const currentIndex = filteredTracks.findIndex(t => t.id === currentTrack.id);
        const nextIndex = (currentIndex + 1) % filteredTracks.length;
        handleTogglePlay(filteredTracks[nextIndex]);
    };

    const handlePrevTrack = () => {
        if (!currentTrack || filteredTracks.length === 0) return;
        const currentIndex = filteredTracks.findIndex(t => t.id === currentTrack.id);
        const prevIndex = (currentIndex - 1 + filteredTracks.length) % filteredTracks.length;
        handleTogglePlay(filteredTracks[prevIndex]);
    };

    // 📥 Robust Download Handler
    const handleDownloadTrack = async (track: MusicEntry, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        
        setDownloadingIds(prev => ({ ...prev, [track.id]: true }));
        toast({
            title: 'Starting Download...',
            description: `Preparing ${track.prompt.slice(0, 30)}...`
        });

        try {
            const cleanTitle = (track.prompt || '12labs_music').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40);
            const filename = `${cleanTitle}.mp3`;
            const downloadApiUrl = `/api/download?url=${encodeURIComponent(track.url)}&filename=${encodeURIComponent(filename)}`;

            const link = document.createElement('a');
            link.href = downloadApiUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast({
                title: 'Download Dispatched',
                description: 'File saved successfully.',
                className: "bg-emerald-600 text-white font-bold"
            });
        } catch (err: any) {
            reportClientError('src/app/music-library/page.tsx:318', err);
            toast({
                variant: 'destructive',
                title: 'Download Failed',
                description: err.message || 'Could not download audio file.'
            });
        } finally {
            setDownloadingIds(prev => ({ ...prev, [track.id]: false }));
        }
    };

    // Admin Dispatch / Upload Handler
    const handleUploadNewTrack = async () => {
        if (!audioFile) {
            toast({ variant: 'destructive', title: 'Audio Missing', description: 'Please select an audio file to upload.' });
            return;
        }
        if (!newTrack.prompt?.trim()) {
            toast({ variant: 'destructive', title: 'Title Missing', description: 'Please enter a title or prompt for this track.' });
            return;
        }

        const effectiveEmail = user?.email || '12labofficial@gmail.com';
        const effectiveUid = user?.uid || 'admin_user';

        setIsSubmitting(true);

        try {
            let previewBlob = audioFile as Blob;
            if (newTrack.price > 0 && watermarkUrl) {
                try {
                    previewBlob = await applyWatermarkToBlob(audioFile, watermarkUrl);
                } catch (wmErr) {
                    console.warn("[Watermark Skip]: Using original audio as preview", wmErr);
                    previewBlob = audioFile as Blob;
                }
            }

            const previewUrl = await uploadFileDirectly({
                file: previewBlob,
                fileName: `preview_${audioFile.name || 'track.mp3'}`,
                bucketType: 'public',
                folder: 'music/public/library',
                userId: effectiveUid,
                userEmail: effectiveEmail,
            });

            let privateUrl = '';
            if (newTrack.price > 0) {
                privateUrl = await uploadFileDirectly({
                    file: audioFile,
                    fileName: audioFile.name || 'master_track.mp3',
                    bucketType: 'private',
                    folder: `music/vault/${effectiveUid}`,
                    userId: effectiveUid,
                    userEmail: effectiveEmail,
                });
            }

            let res: { success: boolean; error?: string } = { success: false };
            try {
                const apiFetch = await fetch('/api/admin/music-library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: newTrack.prompt.trim(),
                        category: newTrack.category || 'Cinematic',
                        price: Number(newTrack.price) || 0,
                        url: previewUrl,
                        privateUrl: privateUrl || undefined,
                        adminEmail: effectiveEmail,
                        adminUid: effectiveUid
                    })
                });
                res = await apiFetch.json();
            } catch (apiErr) {
                console.warn("[API Dispatch failed, fallback to Server Action]:", apiErr);
                res = await addMusicToLibraryAction({
                    prompt: newTrack.prompt.trim(),
                    category: newTrack.category || 'Cinematic',
                    price: Number(newTrack.price) || 0,
                    url: previewUrl,
                    privateUrl: privateUrl || undefined,
                    adminEmail: effectiveEmail,
                    adminUid: effectiveUid
                });
            }

            if (res.success) {
                toast({ title: 'Track Added', description: 'New music node dispatched to library.' });
                setIsUploadOpen(false);
                setNewTrack({ prompt: '', category: 'CINEMATIC', price: 0 });
                setAudioFile(null);
            } else throw new Error(res.error || 'Database registry failed.');
        } catch (e: any) {
            console.error("[Music Upload Failed]:", e);
            toast({ variant: 'destructive', title: 'Dispatch Failed', description: e.message || 'Error uploading music file.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Admin Edit Track Handler
    const handleSaveEdit = async () => {
        if (!editingTrack || !user?.email) return;
        setIsSubmitting(true);

        try {
            const res = await updateLibraryMusicAction({
                id: editingTrack.id,
                prompt: editForm.prompt,
                category: editForm.category,
                price: editForm.price,
                adminEmail: user.email
            });

            if (res.success) {
                toast({ title: 'Track Updated', description: 'Music entry updated successfully.' });
                setIsEditOpen(false);
                setEditingTrack(null);
            } else throw new Error(res.error);
        } catch (e: any) {
            reportClientError('src/app/music-library/page.tsx:439', e);
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Admin Delete Track Handler
    const handleDeleteTrack = async (track: MusicEntry, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!window.confirm("Delete this track from music library?")) return;
        
        const res = await deleteLibraryMusicAction(track.id, track.url, track.privateUrl, user?.email || 'Admin');
        if (res.success) {
            toast({ title: 'Track Removed' });
            if (currentTrack?.id === track.id) {
                audioRef.current?.pause();
                setCurrentTrack(null);
            }
        } else {
            toast({ variant: 'destructive', title: 'Delete Failed' });
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground pb-36 font-sans">

            <main className="container max-w-4xl mx-auto pt-8 px-4 space-y-8">
                {/* Header Banner */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-black uppercase tracking-wider">
                            <Sparkles className="h-3.5 w-3.5" /> Official Studio Vault
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-foreground flex items-center gap-3">
                            Music <span className="text-primary italic">Repository</span>
                        </h1>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                            Royalty-free production music & atmospheric soundtracks
                        </p>
                    </div>

                    {isAdmin && (
                        <Button 
                            onClick={() => setIsUploadOpen(true)}
                            className="h-12 px-6 rounded-2xl font-black uppercase text-xs tracking-wider gap-2 shadow-xl shadow-primary/20 btn-shine"
                        >
                            <Plus className="h-4 w-4 stroke-[3]" /> Dispatch Asset
                        </Button>
                    )}
                </div>

                {/* Filter & Search Bar */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search soundtracks by title or vibe..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-12 h-12 rounded-2xl bg-card/90 border-border text-sm font-bold text-foreground placeholder:text-muted-foreground focus:border-primary"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                                <SelectTrigger className="w-[160px] h-12 rounded-2xl bg-card border-border text-xs font-black uppercase text-muted-foreground">
                                    <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-primary" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    <SelectItem value="newest">Newest First</SelectItem>
                                    <SelectItem value="title">Title (A-Z)</SelectItem>
                                    <SelectItem value="price">Price (Free First)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Category Tabs */}
                    <ScrollArea className="w-full whitespace-nowrap">
                        <div className="flex gap-2 pb-2">
                            {CATEGORIES.map(cat => (
                                <button 
                                    key={cat} 
                                    onClick={() => setActiveCategory(cat)}
                                    className={cn(
                                        "px-5 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                                        activeCategory === cat 
                                            ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                                            : "bg-card/80 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                                    )}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <ScrollBar orientation="horizontal" className="invisible" />
                    </ScrollArea>
                </div>

                {/* Track List */}
                <div className="space-y-3">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 w-full rounded-3xl bg-card/60" />
                        ))
                    ) : filteredTracks.length > 0 ? (
                        filteredTracks.map(item => {
                            const isCurrent = currentTrack?.id === item.id;
                            const isCurrentPlaying = isCurrent && isPlaying;
                            const isDownloading = downloadingIds[item.id];

                            return (
                                <div 
                                    key={item.id} 
                                    onClick={() => handleTogglePlay(item)}
                                    className={cn(
                                        "group flex items-center justify-between gap-4 p-4 rounded-3xl border transition-all duration-300 cursor-pointer",
                                        "bg-card/80 border-border/80 hover:border-primary/40 hover:bg-card shadow-md",
                                        isCurrent && "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                                    )}
                                >
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                        {/* Album Play Button */}
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg relative overflow-hidden transition-transform group-hover:scale-105",
                                            getTrackGradient(item.id)
                                        )}>
                                            {isCurrentPlaying ? (
                                                <div className="flex items-end gap-0.5 h-5">
                                                    <span className="w-1 bg-white animate-[bounce_1s_infinite_100ms] rounded-full h-full" />
                                                    <span className="w-1 bg-white animate-[bounce_1s_infinite_300ms] rounded-full h-3/4" />
                                                    <span className="w-1 bg-white animate-[bounce_1s_infinite_200ms] rounded-full h-1/2" />
                                                </div>
                                            ) : (
                                                <Play className="h-5 w-5 text-white fill-current ml-0.5" />
                                            )}
                                        </div>

                                        {/* Track Info */}
                                        <div className="min-w-0 flex flex-col gap-1">
                                            <h4 className={cn(
                                                "text-sm font-black truncate uppercase tracking-tight transition-colors",
                                                isCurrent ? "text-primary" : "text-foreground group-hover:text-primary"
                                            )}>
                                                {item.prompt}
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="bg-muted/80 text-muted-foreground border-border/50 font-black text-[9px] h-4 px-1.5 uppercase">
                                                    {item.category || 'CINEMATIC'}
                                                </Badge>
                                                <span className="text-muted-foreground">•</span>
                                                <span className="text-[10px] font-black text-emerald-400 uppercase">
                                                    {item.price && item.price > 0 ? `₹${item.price}` : 'FREE'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button 
                                            size="icon" 
                                            variant="ghost"
                                            onClick={(e) => handleDownloadTrack(item, e)}
                                            disabled={isDownloading}
                                            className="h-10 w-10 rounded-2xl bg-muted/50 hover:bg-primary/20 hover:text-primary text-muted-foreground transition-all active:scale-95"
                                            title="Download track"
                                        >
                                            {isDownloading ? (
                                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                            ) : (
                                                <Download className="h-4 w-4" />
                                            )}
                                        </Button>

                                        {/* Admin Inline Actions */}
                                        {isAdmin && (
                                            <>
                                                <Button 
                                                    size="icon" 
                                                    variant="ghost" 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingTrack(item);
                                                        setEditForm({ prompt: item.prompt, category: item.category || 'CINEMATIC', price: item.price || 0 });
                                                        setIsEditOpen(true);
                                                    }}
                                                    className="h-10 w-10 rounded-2xl bg-muted/50 hover:bg-amber-500/20 hover:text-amber-400 text-muted-foreground"
                                                    title="Edit track"
                                                >
                                                    <Edit3 className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    size="icon" 
                                                    variant="ghost" 
                                                    onClick={(e) => handleDeleteTrack(item, e)}
                                                    className="h-10 w-10 rounded-2xl bg-muted/50 hover:bg-rose-500/20 hover:text-rose-400 text-muted-foreground"
                                                    title="Delete track"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="py-24 text-center border-2 border-dashed border-border rounded-3xl flex flex-col items-center gap-4 text-muted-foreground">
                            <Music2 className="h-12 w-12 stroke-[1.5]" />
                            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">No Tracks Found</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Persistent Bottom Player Bar */}
            {currentTrack && (
                <div className="fixed bottom-0 left-0 right-0 z-[110] bg-background/95 border-t border-border backdrop-blur-xl p-4 shadow-2xl animate-in slide-in-from-bottom-5">
                    <div className="container max-w-4xl mx-auto flex flex-col gap-3">
                        {/* Top row: Track Info & Controls */}
                        <div className="flex items-center justify-between gap-4">
                            {/* Track details */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={cn(
                                    "h-11 w-11 rounded-xl shrink-0 flex items-center justify-center shadow-lg", 
                                    getTrackGradient(currentTrack.id)
                                )}>
                                    <Music className="h-5 w-5 text-white" />
                                </div>
                                <div className="min-w-0 flex flex-col">
                                    <h5 className="font-black text-sm uppercase truncate text-foreground">{currentTrack.prompt}</h5>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-primary uppercase">{currentTrack.category || 'CINEMATIC'}</span>
                                        <span className="text-muted-foreground">•</span>
                                        <span className="text-[10px] font-mono text-muted-foreground">
                                            {formatTime(currentTime)} / {formatTime(duration)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Player Controls */}
                            <div className="flex items-center gap-2">
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={handlePrevTrack}
                                    className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
                                >
                                    <SkipBack className="h-4 w-4" />
                                </Button>

                                <Button 
                                    size="icon"
                                    onClick={() => handleTogglePlay(currentTrack)} 
                                    className="h-11 w-11 rounded-2xl bg-primary text-white shadow-lg active:scale-95"
                                >
                                    {isBuffering ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : isPlaying ? (
                                        <Pause className="h-5 w-5 fill-current" />
                                    ) : (
                                        <Play className="h-5 w-5 fill-current ml-0.5" />
                                    )}
                                </Button>

                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={handleNextTrack}
                                    className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground"
                                >
                                    <SkipForward className="h-4 w-4" />
                                </Button>

                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => setIsLooping(!isLooping)}
                                    className={cn("h-9 w-9 rounded-xl transition-colors", isLooping ? "text-primary bg-primary/10" : "text-muted-foreground")}
                                    title="Repeat track"
                                >
                                    <Repeat className="h-4 w-4" />
                                </Button>

                                <Button 
                                    size="icon" 
                                    variant="ghost"
                                    onClick={(e) => handleDownloadTrack(currentTrack, e)}
                                    className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10"
                                    title="Download track"
                                >
                                    <Download className="h-4 w-4" />
                                </Button>

                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => {
                                        audioRef.current?.pause();
                                        setCurrentTrack(null);
                                    }}
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full ml-2"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Seekbar Progress Slider */}
                        <div className="flex items-center gap-3 px-1">
                            <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{formatTime(currentTime)}</span>
                            <Slider 
                                value={[progress]} 
                                max={100} 
                                step={0.1} 
                                onValueChange={handleSeek}
                                className="flex-1 cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-muted-foreground w-10">{formatTime(duration)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Upload Modal */}
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogContent className="max-w-md rounded-3xl bg-card border-border text-foreground p-6">
                    <DialogHeader className="pb-4 border-b border-border">
                        <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-foreground">
                            <Zap className="h-5 w-5 text-primary" /> Dispatch New Music Asset
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-muted-foreground">
                            Upload a soundtrack to the public music library
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase text-muted-foreground">Track Title / Prompt</Label>
                            <Textarea 
                                value={newTrack.prompt}
                                onChange={e => setNewTrack({...newTrack, prompt: e.target.value})}
                                placeholder="e.g. Sitar & Bansuri Symphony..."
                                className="bg-background border-border text-foreground rounded-xl"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-muted-foreground">Category</Label>
                                <Select value={newTrack.category} onValueChange={v => setNewTrack({...newTrack, category: v})}>
                                    <SelectTrigger className="bg-background border-border text-foreground rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground">
                                        {CATEGORIES.filter(c => c !== 'ALL').map(c => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-muted-foreground">Price (₹0 = FREE)</Label>
                                <Input 
                                    type="number"
                                    value={newTrack.price}
                                    onChange={e => setNewTrack({...newTrack, price: Number(e.target.value)})}
                                    className="bg-background border-border text-foreground rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase text-muted-foreground">Audio File (MP3 / WAV)</Label>
                            <Input 
                                type="file"
                                accept="audio/*"
                                onChange={e => setAudioFile(e.target.files?.[0] || null)}
                                className="bg-background border-border text-foreground rounded-xl cursor-pointer"
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-2 border-t border-border">
                        <Button 
                            onClick={handleUploadNewTrack}
                            disabled={isSubmitting || !audioFile || !newTrack.prompt?.trim()}
                            className="w-full h-12 rounded-2xl font-black uppercase tracking-wider btn-shine"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span>Dispatching Sound...</span>
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <span>Dispatch Sound</span>
                                </span>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Admin Edit Modal */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-w-md rounded-3xl bg-card border-border text-foreground p-6">
                    <DialogHeader className="pb-4 border-b border-border">
                        <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-foreground">
                            <Edit3 className="h-5 w-5 text-amber-400" /> Edit Music Details
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-black uppercase text-muted-foreground">Track Title / Prompt</Label>
                            <Textarea 
                                value={editForm.prompt}
                                onChange={e => setEditForm({...editForm, prompt: e.target.value})}
                                className="bg-background border-border text-foreground rounded-xl"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-muted-foreground">Category</Label>
                                <Select value={editForm.category} onValueChange={v => setEditForm({...editForm, category: v})}>
                                    <SelectTrigger className="bg-background border-border text-white rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground">
                                        {CATEGORIES.filter(c => c !== 'ALL').map(c => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase text-muted-foreground">Price (₹0 = FREE)</Label>
                                <Input 
                                    type="number"
                                    value={editForm.price}
                                    onChange={e => setEditForm({...editForm, price: Number(e.target.value)})}
                                    className="bg-background border-border text-foreground rounded-xl"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-2 border-t border-border">
                        <Button 
                            onClick={handleSaveEdit}
                            disabled={isSubmitting || !editForm.prompt}
                            className="w-full h-12 rounded-2xl font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-zinc-950"
                        >
                            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
