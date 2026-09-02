'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
    Music, Plus, Trash2, Loader2, Save, Search, 
    Play, Pause, Download, Globe, ShieldCheck, 
    Check, Zap, Activity, Clock, Layers, Filter,
    Coins, Target, Music2, X, Edit3
} from 'lucide-react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, set } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { addMusicToLibraryAction, deleteLibraryMusicAction, updateLibraryMusicAction } from '@/app/admin/music-manager/actions';
import { uploadFileDirectly } from '@/lib/gcs-client';
import { cn, getDisplayUrl } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { IndianRupee } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { applyWatermarkToBlob } from '@/lib/audio-utils';
import { reportClientError } from '@/lib/report-client-error';

const CATEGORIES = ["Horror", "Moral", "Emotional", "Comedy", "Suspense", "Action", "Inspirational", "Lo-Fi", "Cinematic"];

export function MusicLibraryManager() {
    const { database } = initializeFirebase();
    const { user: adminUser } = useAuth();
    const { toast } = useToast();

    const [tracks, setTracks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [watermarkUrl, setWatermarkUrl] = useState('');

    // Watermark management state
    const [watermarkInputValue, setWatermarkInputValue] = useState('');
    const [isSavingWatermark, setIsSavingWatermark] = useState(false);
    const [isUploadingWatermark, setIsUploadingWatermark] = useState(false);
    const [playingWatermark, setPlayingWatermark] = useState(false);
    const wmAudioRef = useRef<HTMLAudioElement | null>(null);

    // Form State
    const [newTrack, setNewTrack] = useState({ prompt: '', category: 'Cinematic', price: 0 });
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [calibrationStatus, setCalibrationStatus] = useState('');
    
    // Edit Form State
    const [editingTrack, setEditingTrack] = useState<any>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ prompt: '', category: 'Cinematic', price: 0 });
    
    // Player State
    const [playingId, setPlayingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) return;
        const libraryRef = ref(db, 'publicMusicLibrary');
        const unsubLibrary = onRtdbValue(libraryRef, (snapshot) => {
            if (snapshot.exists()) {
                const list = Object.entries(snapshot.val()).map(([id, val]: [string, any]) => ({ id, ...val }));
                setTracks(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            } else setTracks([]);
            setIsLoading(false);
        });

        const wmRef = ref(db, 'settings/app/musicWatermarkUrl');
        const unsubWatermark = onRtdbValue(wmRef, (snap) => {
            if (snap.exists()) {
                const val = snap.val() || '';
                setWatermarkUrl(getDisplayUrl(val));
                setWatermarkInputValue(val);
            }
        });

        return () => {
            unsubLibrary();
            unsubWatermark();
            if (wmAudioRef.current) wmAudioRef.current.pause();
        };
    }, []);

    const handleSaveWatermarkText = async () => {
        if (!database) return;
        setIsSavingWatermark(true);
        try {
            const wmRef = ref(database, 'settings/app/musicWatermarkUrl');
            await set(wmRef, watermarkInputValue);
            toast({ title: 'Watermark Saved', description: 'Audio watermark URL updated successfully.' });
        } catch (e: any) {
            reportClientError('src/components/admin/music-library-manager.tsx:108', e);
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
        } finally {
            setIsSavingWatermark(false);
        }
    };

    const handleUploadWatermarkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !adminUser?.email || !adminUser?.uid) return;
        setIsUploadingWatermark(true);
        try {
            const uploadedUrl = await uploadFileDirectly({
                file,
                fileName: `watermark_${file.name}`,
                bucketType: 'public',
                folder: 'settings/watermarks',
                userId: adminUser.uid,
                userEmail: adminUser.email || 'Admin',
            });
            setWatermarkInputValue(uploadedUrl);
            const wmRef = ref(database, 'settings/app/musicWatermarkUrl');
            await set(wmRef, uploadedUrl);
            toast({ title: 'Watermark Uploaded', description: 'Audio watermark updated and synchronized.' });
        } catch (e: any) {
            reportClientError('src/components/admin/music-library-manager.tsx:132', e);
            toast({ variant: 'destructive', title: 'Upload Failed', description: e.message });
        } finally {
            setIsUploadingWatermark(false);
        }
    };

    const togglePlayWatermark = () => {
        if (!watermarkUrl) return;
        if (!wmAudioRef.current) wmAudioRef.current = new Audio();
        const a = wmAudioRef.current;
        if (playingWatermark) {
            a.pause();
            setPlayingWatermark(false);
        } else {
            a.pause();
            a.src = watermarkUrl;
            a.play().catch((err) => {
                reportClientError('src/components/admin/music-library-manager.tsx:152', err);
                toast({ variant: 'destructive', title: 'Stream Blocked' });
            });
            setPlayingWatermark(true);
            a.onended = () => setPlayingWatermark(false);
        }
    };

    const handleUpload = async () => {
        if (!audioFile) {
            toast({ variant: 'destructive', title: 'Audio Source Missing', description: 'Please select an audio file to upload.' });
            return;
        }
        if (!newTrack.prompt || !newTrack.prompt.trim()) {
            toast({ variant: 'destructive', title: 'Track Blueprint Missing', description: 'Please enter a title or description for the track.' });
            return;
        }

        const effectiveEmail = adminUser?.email || (activeUser as any)?.email || '12labofficial@gmail.com';
        const effectiveUid = adminUser?.uid || activeUid || (activeUser as any)?.uid || 'admin_master_node';

        setIsSubmitting(true);
        setCalibrationStatus('Preparing asset for sync...');

        try {
            // 🌊 DUAL-BUCKET WATERMARK LOGIC
            let previewBlob = audioFile as Blob;
            if (newTrack.price > 0 && watermarkUrl) {
                try {
                    setCalibrationStatus('Applying Protection Layer...');
                    previewBlob = await applyWatermarkToBlob(audioFile, watermarkUrl);
                } catch (wmErr) {
                    console.warn("[Watermark Skip]: Using original audio as preview fallback", wmErr);
                    previewBlob = audioFile as Blob;
                }
            }
            
            setCalibrationStatus('Uploading Audio Node (0%)...');
            const previewUrl = await uploadFileDirectly({
                file: previewBlob,
                fileName: `preview_${audioFile.name || 'track.mp3'}`,
                bucketType: 'public',
                folder: 'music/public/library',
                userId: effectiveUid,
                userEmail: effectiveEmail,
                onProgress: (pct) => {
                    setCalibrationStatus(`Uploading Preview Asset (${Math.round(pct)}%)...`);
                }
            });

            // Upload master file if it's priced
            let privateUrl = '';
            if (newTrack.price > 0) {
                setCalibrationStatus('Uploading Master Copy to Vault (0%)...');
                privateUrl = await uploadFileDirectly({
                    file: audioFile,
                    fileName: audioFile.name || 'master_track.mp3',
                    bucketType: 'private',
                    folder: `music/vault/${effectiveUid}`,
                    userId: effectiveUid,
                    userEmail: effectiveEmail,
                    onProgress: (pct) => {
                        setCalibrationStatus(`Uploading Master Vault (${Math.round(pct)}%)...`);
                    }
                });
            }

            setCalibrationStatus('Synchronizing Music Registry...');
            
            const payload: Record<string, any> = {
                prompt: newTrack.prompt.trim(),
                category: newTrack.category || 'Cinematic',
                price: Number(newTrack.price) || 0,
                url: previewUrl,
                adminEmail: effectiveEmail,
                adminUid: effectiveUid
            };
            if (privateUrl && typeof privateUrl === 'string' && privateUrl.trim() !== '') {
                payload.privateUrl = privateUrl.trim();
            }

            // Primary: REST API endpoint (Immune to Next.js Server Action hash mismatch / deployment drift)
            let res: { success: boolean; error?: string } = { success: false };
            try {
                const apiFetch = await fetch('/api/admin/music-library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                res = await apiFetch.json();
            } catch (apiErr) {
                console.warn("[API Dispatch failed, fallback to Server Action]:", apiErr);
                res = await addMusicToLibraryAction({
                    prompt: payload.prompt,
                    category: payload.category,
                    price: payload.price,
                    url: payload.url,
                    privateUrl: payload.privateUrl,
                    adminEmail: payload.adminEmail,
                    adminUid: payload.adminUid
                });
            }

            if (res.success) {
                toast({ title: 'Production Node Ready', description: 'Asset dispatched to public and private hubs.' });
                setIsUploadOpen(false);
                setNewTrack({ prompt: '', category: 'Cinematic', price: 0 });
                setAudioFile(null);
            } else {
                throw new Error(res.error || 'Failed to register track in database.');
            }
        } catch (e: any) {
            console.error("[Music Upload Failed]:", e);
            toast({ variant: 'destructive', title: 'Dispatch Failed', description: e.message || 'Error occurred while dispatching asset.' });
        } finally {
            setIsSubmitting(false);
            setCalibrationStatus('');
        }
    };

    const handleDelete = async (track: any) => {
        if (!window.confirm("Purge this track and its master from all nodes?")) return;
        try {
            const apiRes = await fetch(`/api/admin/music-library?id=${track.id}&url=${encodeURIComponent(track.url || '')}&privateUrl=${encodeURIComponent(track.privateUrl || '')}&adminEmail=${encodeURIComponent(adminUser?.email || 'Admin')}`, {
                method: 'DELETE'
            });
            const data = await apiRes.json();
            if (data.success) {
                toast({ title: 'Nodes Purged' });
                return;
            }
        } catch (e) {
            reportClientError('src/components/admin/music-library-manager.tsx:278', e);}
        
        const res = await deleteLibraryMusicAction(track.id, track.url, track.privateUrl, adminUser?.email || 'Admin');
        if (res.success) toast({ title: 'Nodes Purged' });
        else toast({ variant: 'destructive', title: 'Delete Failed' });
    };

    const handleSaveEdit = async () => {
        if (!editingTrack || !adminUser?.email) return;
        setIsSubmitting(true);
        try {
            let res: any = { success: false };
            try {
                const apiRes = await fetch('/api/admin/music-library', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: editingTrack.id,
                        prompt: editForm.prompt,
                        category: editForm.category,
                        price: editForm.price,
                        adminEmail: adminUser.email
                    })
                });
                res = await apiRes.json();
            } catch (e) {
            reportClientError('src/components/admin/music-library-manager.tsx:303', e);}

            if (!res.success) {
                res = await updateLibraryMusicAction({
                    id: editingTrack.id,
                    prompt: editForm.prompt,
                    category: editForm.category,
                    price: editForm.price,
                    adminEmail: adminUser.email
                });
            }

            if (res.success) {
                toast({ title: 'Asset Updated' });
                setIsEditOpen(false);
                setEditingTrack(null);
            } else throw new Error(res.error);
        } catch (e: any) {
            reportClientError('src/components/admin/music-library-manager.tsx:320', e);
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const togglePlay = (track: any) => {
        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        if (playingId === track.id) { a.pause(); setPlayingId(null); }
        else {
            a.pause(); a.src = getDisplayUrl(track.url);
            a.play().catch((err) => {
                reportClientError('src/components/admin/music-library-manager.tsx:339', err, { trackId: track.id });
                toast({ variant: 'destructive', title: 'Stream Blocked' });
            });
            setPlayingId(track.id);
            a.onended = () => setPlayingId(null);
        }
    };

    const filteredTracks = tracks.filter(t => 
        t.prompt.toLowerCase().includes(search.toLowerCase()) || 
        t.category?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                        <Music2 className="text-primary h-6 w-6" />
                        Music Repository
                    </h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">Manage production nodes in public hub.</p>
                </div>
                <Button onClick={() => setIsUploadOpen(true)} className="h-11 px-8 rounded-xl font-black uppercase text-[10px] tracking-widest gap-2 shadow-xl shadow-primary/20 btn-shine">
                    <Plus className="h-4 w-4" /> DISPATCH NEW ASSET
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Search & List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter library assets..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10 h-12 rounded-2xl bg-muted/20 border-primary/5 font-bold"
                        />
                    </div>

                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
                        <CardContent className="p-0">
                            <ScrollArea className="h-[600px]">
                                {isLoading ? (
                                    <div className="p-8 space-y-4">
                                        {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
                                    </div>
                                ) : filteredTracks.length > 0 ? (
                                    <div className="divide-y divide-dashed">
                                        {filteredTracks.map((track) => {
                                            const isPlaying = playingId === track.id;
                                            return (
                                                <div key={track.id} className={cn("p-6 flex items-center justify-between gap-6 hover:bg-muted/10 transition-all group", isPlaying && "bg-primary/[0.02]")}>
                                                    <div className="flex items-center gap-4 min-w-0">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => togglePlay(track)}
                                                            className={cn("h-12 w-12 rounded-full shrink-0 shadow-inner transition-all", isPlaying ? "bg-primary text-white" : "bg-muted text-muted-foreground")}
                                                        >
                                                            {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current ml-1" />}
                                                        </Button>
                                                        <div className="min-w-0">
                                                            <p className="font-black text-[13px] uppercase truncate tracking-tight group-hover:text-primary transition-colors">{track.prompt}</p>
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                <Badge variant="outline" className="h-4 px-1.5 text-[7px] font-black uppercase border-primary/10">{track.category}</Badge>
                                                                <span className="text-[14px] opacity-20">•</span>
                                                                <span className="text-[8px] font-black text-muted-foreground/40 uppercase">{track.price > 0 ? `₹${track.price}` : 'FREE'}</span>
                                                                {track.privateUrl && <Badge className="bg-primary/10 text-primary border-none text-[7px] h-4 px-1 uppercase font-black"><ShieldCheck className="h-2 w-2 mr-1" /> MASTER SECURED</Badge>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-9 w-9 rounded-xl text-primary/70 hover:text-primary hover:bg-primary/10"
                                                            onClick={() => {
                                                                const cleanTitle = (track.prompt || '12labs_music').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                                                                const filename = `${cleanTitle}.mp3`;
                                                                const link = document.createElement('a');
                                                                link.href = `/api/download?url=${encodeURIComponent(track.url)}&filename=${encodeURIComponent(filename)}`;
                                                                link.download = filename;
                                                                document.body.appendChild(link);
                                                                link.click();
                                                                document.body.removeChild(link);
                                                            }}
                                                            title="Download Track"
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-9 w-9 rounded-xl text-amber-500/70 hover:text-amber-500 hover:bg-amber-500/10"
                                                            onClick={() => {
                                                                setEditingTrack(track);
                                                                setEditForm({ prompt: track.prompt, category: track.category || 'Cinematic', price: track.price || 0 });
                                                                setIsEditOpen(true);
                                                            }}
                                                            title="Edit Track"
                                                        >
                                                            <Edit3 className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive/30 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(track)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-32 opacity-20 grayscale gap-6">
                                        <div className="p-8 border-4 border-dashed rounded-[3rem] border-primary/20"><Music className="h-16 w-16" /></div>
                                        <p className="font-black uppercase tracking-widest text-xl">Archive Empty</p>
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                {/* Dashboard Stats & Watermark Admin Option */}
                <div className="space-y-6 h-fit">
                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-white overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12"><Activity className="h-24 w-24" /></div>
                        <div className="p-8 relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-2">Total Library Nodes</p>
                            <div className="text-6xl font-black tracking-tighter">{tracks.length}</div>
                        </div>
                    </Card>
                    
                    <div className="p-8 rounded-[2.5rem] border-4 border-dashed border-primary/10 bg-primary/[0.02] space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white dark:bg-zinc-950 rounded-xl shadow-lg text-primary"><ShieldCheck className="h-5 w-5" /></div>
                            <p className="text-[10px] font-black uppercase tracking-widest">Storage Protocol</p>
                        </div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase leading-relaxed tracking-wider">
                            Paid tracks use dual-path storage. Master clean copy is secured in private vault, while watermarked preview is public.
                        </p>
                    </div>

                    {/* Audio Watermark Admin Control Panel */}
                    <Card className="rounded-[2rem] border border-primary/10 bg-card p-6 shadow-xl space-y-6">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9C27B0]">Watermark Protection Layer</p>
                            <h4 className="text-sm font-black uppercase tracking-tight text-foreground leading-none">AUDIO WATERMARK LAYER</h4>
                            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wide leading-normal pt-1">
                                This audio will automatically be mixed over the main track every few seconds for any priced/paid asset to generate a public preview.
                            </p>
                        </div>

                        {/* Audio Watermark Playback Preview */}
                        {watermarkUrl && (
                            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/5 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={togglePlayWatermark}
                                        className={cn("h-10 w-10 rounded-full shrink-0 shadow-sm transition-all", playingWatermark ? "bg-[#9C27B0] text-white" : "bg-muted text-muted-foreground")}
                                    >
                                        {playingWatermark ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                                    </Button>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black text-foreground uppercase tracking-widest">Active Watermark Track</p>
                                        <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-tight truncate max-w-[140px]">{watermarkUrl.split('/').pop()}</p>
                                    </div>
                                </div>
                                <Badge variant="outline" className="text-[7px] h-4 font-black uppercase tracking-widest text-[#9C27B0] bg-[#9C27B0]/5 border-[#9C27B0]/20 shrink-0">ACTIVE</Badge>
                            </div>
                        )}

                        {/* File Upload for new Watermark */}
                        <div className="space-y-2">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Upload New Watermark Audio</Label>
                            <div className="relative group">
                                <Input 
                                    type="file" 
                                    accept="audio/*" 
                                    onChange={handleUploadWatermarkFile} 
                                    disabled={isUploadingWatermark}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                />
                                <div className={cn(
                                    "h-20 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all",
                                    isUploadingWatermark ? "bg-muted/10 border-primary/20" : "border-primary/10 bg-muted/5 group-hover:bg-primary/5"
                                )}>
                                    {isUploadingWatermark ? (
                                        <>
                                            <Loader2 className="h-6 w-6 animate-spin text-primary mb-1" />
                                            <p className="text-[8px] font-black uppercase tracking-widest text-primary">Uploading watermark copy...</p>
                                        </>
                                    ) : (
                                        <>
                                            <Download className="h-5 w-5 text-primary/40 mb-1" />
                                            <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60">Upload Watermark MP3/WAV</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Text URL option */}
                        <div className="space-y-2 pt-2 border-t border-muted/25">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Watermark Public Link</Label>
                            <div className="flex gap-2">
                                <Input 
                                    value={watermarkInputValue} 
                                    onChange={e => setWatermarkInputValue(e.target.value)} 
                                    placeholder="Enter public audio watermark URL..." 
                                    className="h-9 rounded-xl text-[10px] bg-muted/20 font-mono border-primary/5"
                                    disabled={isSavingWatermark || isUploadingWatermark}
                                />
                                <Button 
                                    onClick={handleSaveWatermarkText} 
                                    disabled={isSavingWatermark || isUploadingWatermark || !watermarkInputValue.trim()}
                                    className="h-9 rounded-xl bg-primary text-white hover:bg-primary/90 text-[10px] font-black uppercase px-4 shrink-0 shadow-lg shadow-primary/15"
                                >
                                    {isSavingWatermark ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'SAVE'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Upload Dialog */}
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogContent className="w-[95vw] max-w-md rounded-[1.8rem] sm:rounded-[2.5rem] p-0 overflow-hidden border-none shadow-3xl bg-background max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="p-5 sm:p-8 pb-3 sm:pb-4 border-b bg-primary/5">
                        <DialogTitle className="text-lg sm:text-xl font-black uppercase tracking-tight flex items-center gap-2.5">
                            <Zap className="h-5 w-5 text-primary" />
                            Dispatch Asset
                        </DialogTitle>
                        <DialogDescription className="text-[9px] font-bold uppercase tracking-widest mt-0.5 opacity-50">Node Injection Hub</DialogDescription>
                    </DialogHeader>

                    <div className="p-5 sm:p-8 space-y-4 sm:space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Track Blueprint (Title/Prompt)</Label>
                            <Textarea 
                                value={newTrack.prompt} 
                                onChange={e => setNewTrack({...newTrack, prompt: e.target.value})} 
                                className="min-h-[90px] rounded-xl bg-muted/20 border-primary/5 font-bold p-3.5 leading-relaxed text-xs sm:text-sm" 
                                placeholder="Describe the track mood or title..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Category</Label>
                                <Select value={newTrack.category} onValueChange={v => setNewTrack({...newTrack, category: v})}>
                                    <SelectTrigger className="h-10 sm:h-11 rounded-xl bg-muted/20 font-bold text-xs sm:text-sm"><SelectValue placeholder="Select Category" /></SelectTrigger>
                                    <SelectContent className="rounded-xl z-[9999]" position="popper" sideOffset={5}>
                                        {CATEGORIES.map(c => <SelectItem key={c} value={c} className="font-bold text-xs sm:text-sm">{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Price (0 = FREE)</Label>
                                <div className="relative">
                                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/60" />
                                    <Input 
                                        type="number" 
                                        value={newTrack.price} 
                                        onChange={e => setNewTrack({...newTrack, price: Number(e.target.value)})} 
                                        className="pl-9 h-10 sm:h-11 rounded-xl bg-muted/20 font-black text-xs sm:text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 pt-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Binary Source (Audio)</Label>
                            {!audioFile ? (
                                <div className="relative group">
                                    <Input 
                                        type="file" 
                                        accept="audio/*" 
                                        onChange={e => setAudioFile(e.target.files?.[0] || null)} 
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="h-24 sm:h-28 border-2 border-dashed border-primary/10 bg-muted/10 rounded-2xl flex flex-col items-center justify-center transition-all group-hover:bg-primary/5 p-2">
                                        <Download className="h-6 w-6 sm:h-8 sm:w-8 text-primary/30 mb-1.5" />
                                        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center">Upload Master WAV/MP3</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3.5 rounded-xl bg-green-500/5 border-2 border-green-500/20 flex items-center justify-between animate-in zoom-in-95">
                                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                        <div className="p-1.5 bg-green-500 text-white rounded-lg shrink-0"><Check className="h-3.5 w-3.5" /></div>
                                        <p className="text-xs font-black truncate uppercase text-foreground">{audioFile.name}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setAudioFile(null)} className="text-destructive h-7 w-7 rounded-full hover:bg-destructive/10 shrink-0"><X className="h-3.5 w-3.5" /></Button>
                                </div>
                            )}
                        </div>

                        {isSubmitting && calibrationStatus && (
                            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-2.5 animate-pulse">
                                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                                <p className="text-[10px] font-black uppercase text-primary tracking-widest truncate">{calibrationStatus}</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="p-4 sm:p-6 border-t bg-muted/20">
                        <Button 
                            onClick={handleUpload} 
                            disabled={isSubmitting || !audioFile || !newTrack.prompt?.trim()} 
                            className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm btn-shine shadow-lg shadow-primary/20 uppercase tracking-wider gap-2 px-3"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2 truncate">
                                    <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin shrink-0" />
                                    <span className="truncate">INITIALIZING DISPATCH...</span>
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2 truncate">
                                    <Save className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                                    <span className="truncate">START SYNC PROCESS</span>
                                </span>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-3xl bg-background">
                    <DialogHeader className="p-8 pb-4 border-b bg-amber-500/5">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                            <Edit3 className="h-5 w-5 text-amber-500" />
                            Edit Asset Details
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-8 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Prompt / Title</Label>
                            <Textarea 
                                value={editForm.prompt} 
                                onChange={e => setEditForm({...editForm, prompt: e.target.value})} 
                                className="rounded-2xl bg-muted/20 border-primary/5 font-bold" 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Category</Label>
                                <Select value={editForm.category} onValueChange={v => setEditForm({...editForm, category: v})}>
                                    <SelectTrigger className="h-12 rounded-2xl bg-muted/20 border-primary/5 font-black uppercase text-[10px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Price (₹)</Label>
                                <Input 
                                    type="number" 
                                    value={editForm.price} 
                                    onChange={e => setEditForm({...editForm, price: Number(e.target.value)})} 
                                    className="h-12 rounded-2xl bg-muted/20 border-primary/5 font-bold" 
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-8 border-t bg-muted/20">
                        <Button 
                            onClick={handleSaveEdit} 
                            disabled={isSubmitting || !editForm.prompt} 
                            className="w-full h-14 rounded-2xl font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-zinc-950"
                        >
                            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'SAVE CHANGES'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
