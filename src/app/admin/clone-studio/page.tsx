'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, set, remove, push, update, get } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useToast } from '@/hooks/use-toast';
import { 
    MicVocal, Plus, Trash2, Edit, Save, 
    Loader2, Music, Check, X, ShieldCheck, 
    Activity, Globe, Search, Tag, Hash, Star
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn, getDisplayUrl } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { reportClientError } from '@/lib/report-client-error';

const PRESET_TAGS = [
    'documentary', 'horror', 'moral', 'old', 'kid', 
    'scary', 'serious', 'young', 'female', 'male'
];

export default function CloneStudioManager() {
    const { database } = initializeFirebase();
    const { toast } = useToast();
    
    const [voices, setVoices] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Edit State
    const [editingVoice, setEditingVoice] = useState<any | null>(null);

    // Form State for New Voice
    const [newVoice, setNewVoice] = useState({ name: '', link: '', gender: 'Female', age: 'Adult', tags: '', isDefault: false });

    useEffect(() => {
        if (!database) return;
        const voicesRef = ref(database, 'clone_studio');
        
        const unsub = onRtdbValue(voicesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setVoices(Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })));
            } else {
                setVoices([]);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Clone Hub fetch error:", error);
            setIsLoading(false);
        });
        
        return () => unsub();
    }, [database]);

    const handleAdd = async () => {
        if (!newVoice.name || !newVoice.link || !database) return;
        setIsSaving(true);
        try {
            const voicesRef = ref(database, 'clone_studio');
            const newRef = push(voicesRef);
            await set(newRef, { ...newVoice, createdAt: Date.now() });
            setNewVoice({ name: '', link: '', gender: 'Female', age: 'Adult', tags: '', isDefault: false });
            toast({ title: 'Persona Added to Hub' });
        } catch (e: any) {
            reportClientError('src/app/admin/clone-studio/page.tsx:80', e); 
            toast({ variant: 'destructive', title: 'Action Failed' }); 
        } finally { 
            setIsSaving(false); 
        }
    };

    const handleUpdate = async () => {
        if (!editingVoice || !database) return;
        setIsSaving(true);
        try {
            const { id, ...data } = editingVoice;
            await update(ref(database, `clone_studio/${id}`), data);
            toast({ title: 'Persona Node Updated' });
            setEditingVoice(null);
        } catch (e: any) {
            reportClientError('src/app/admin/clone-studio/page.tsx:95', e);
            toast({ variant: 'destructive', title: 'Update Failed' });
        } finally {
            setIsSaving(false);
        }
    };

    const toggleDefaultStatus = async (id: string, currentStatus: boolean) => {
        if (!database) return;
        try {
            await update(ref(database, `clone_studio/${id}`), { isDefault: !currentStatus });
            toast({ 
                title: !currentStatus ? 'Marked as Default' : 'Removed from Default',
                description: !currentStatus ? 'This voice is now live for all users in Studio.' : 'Moved to Global Hub.'
            });
        } catch (e) {
            reportClientError('src/app/admin/clone-studio/page.tsx:110', e);
            toast({ variant: 'destructive', title: 'Sync Failed' });
        }
    };

    const handleDelete = async (id: string) => {
        if (!database || !window.confirm("Purge this voice clone from production?")) return;
        try {
            await remove(ref(database, `clone_studio/${id}`));
            toast({ title: 'Persona Purged' });
        } catch (e: any) {
            reportClientError('src/app/admin/clone-studio/page.tsx:120', e); 
            toast({ variant: 'destructive', title: 'Delete Failed' }); 
        }
    };

    const toggleTag = (tag: string, target: 'new' | 'edit') => {
        const hashTag = `#${tag}`;
        if (target === 'new') {
            const currentTags = newVoice.tags || '';
            if (currentTags.includes(hashTag)) {
                setNewVoice({ ...newVoice, tags: currentTags.replace(new RegExp(`${hashTag}\\s?`, 'g'), '').trim() });
            } else {
                setNewVoice({ ...newVoice, tags: `${currentTags} ${hashTag}`.trim() });
            }
        } else if (editingVoice) {
            const currentTags = editingVoice.tags || '';
            if (currentTags.includes(hashTag)) {
                setEditingVoice({ ...editingVoice, tags: currentTags.replace(new RegExp(`${hashTag}\\s?`, 'g'), '').trim() });
            } else {
                setEditingVoice({ ...editingVoice, tags: `${currentTags} ${hashTag}`.trim() });
            }
        }
    };

    const filteredVoices = voices.filter(v => 
        (v.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
        (v.tags?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (v.gender?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3"><MicVocal className="h-8 w-8 text-primary" />Clone Studio Hub</h1>
                <p className="text-muted-foreground font-bold text-[10px] uppercase tracking-widest opacity-60">Production Voice Archives Manager</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
                    <CardHeader className="bg-primary/5 border-b pb-6">
                        <CardTitle className="text-lg font-black uppercase">Add Persona Node</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-8 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Display Name</Label>
                            <Input value={newVoice.name} onChange={e => setNewVoice({...newVoice, name: e.target.value})} className="h-11 rounded-xl bg-muted/20 border-primary/5 font-bold" placeholder="e.g. 'Aakash Deep'" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Audio Reference Link</Label>
                            <Input value={newVoice.link} onChange={e => setNewVoice({...newVoice, link: e.target.value})} className="h-11 rounded-xl bg-muted/20 border-primary/5 font-mono text-[10px]" placeholder="Paste link..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Gender</Label>
                                <Select value={newVoice.gender} onValueChange={v => setNewVoice({...newVoice, gender: v as any})}>
                                    <SelectTrigger className="rounded-xl h-11 bg-muted/20 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="Male">Male</SelectItem>
                                        <SelectItem value="Female">Female</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Maturity</Label>
                                <Select value={newVoice.age} onValueChange={v => setNewVoice({...newVoice, age: v as any})}>
                                    <SelectTrigger className="rounded-xl h-11 bg-muted/20 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl"><SelectItem value="Kid">Kid</SelectItem><SelectItem value="Adult">Adult</SelectItem><SelectItem value="Old">Old</SelectItem></SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1 flex items-center gap-2"><Tag className="h-3 w-3" /> Labels & Metadata</Label>
                            <Input 
                                value={newVoice.tags} 
                                onChange={e => setNewVoice({...newVoice, tags: e.target.value})} 
                                className="h-11 rounded-xl bg-muted/20 border-primary/5 font-bold text-xs" 
                                placeholder="#horror #story #calm" 
                            />
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {PRESET_TAGS.map(tag => (
                                    <button 
                                        key={tag} 
                                        type="button"
                                        onClick={() => toggleTag(tag, 'new')}
                                        className={cn(
                                            "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all",
                                            newVoice.tags?.includes(`#${tag}`) ? "bg-primary text-white" : "bg-muted hover:bg-primary/10 text-muted-foreground"
                                        )}
                                    >
                                        #{tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button onClick={handleAdd} disabled={isSaving || !newVoice.name || !newVoice.link} className="w-full h-12 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 btn-shine">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} DEPLOY PERSONA
                        </Button>
                    </CardContent>
                </Card>

                <div className="lg:col-span-2 space-y-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Filter nodes or tags..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-12 rounded-[1.5rem] bg-card border-none shadow-lg font-bold" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {isLoading ? [1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-[2rem]" />) : filteredVoices.length > 0 ? filteredVoices.map(voice => (
                            <Card key={voice.id} className="rounded-[2.2rem] border-none shadow-lg bg-card overflow-hidden group">
                                <div className="p-6 flex flex-col h-full">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-3 bg-primary/10 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all"><MicVocal className="h-5 w-5" /></div>
                                            <div className="min-w-0">
                                                <p className="font-black text-sm uppercase truncate">{voice.name}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Badge variant="secondary" className="h-4 px-1.5 text-[7px] font-black uppercase">{voice.gender}</Badge>
                                                    <Badge variant="secondary" className="h-4 px-1.5 text-[7px] font-black uppercase">{voice.age}</Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className={cn("h-8 w-8 transition-colors", voice.isDefault ? "text-yellow-500" : "text-muted-foreground/30 hover:text-yellow-500")}
                                                onClick={() => toggleDefaultStatus(voice.id, !!voice.isDefault)}
                                                title={voice.isDefault ? "Default Voice" : "Make Default"}
                                            >
                                                <Star className={cn("h-4 w-4", voice.isDefault && "fill-current")} />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary/40 hover:text-primary" onClick={() => setEditingVoice(voice)}><Edit className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/40 hover:text-destructive" onClick={() => handleDelete(voice.id)}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                    
                                    <div className="mb-4">
                                        <p className="text-[8px] font-black text-primary/50 uppercase tracking-widest line-clamp-1">{voice.tags || 'NO LABELS'}</p>
                                    </div>

                                    <div className="mt-auto space-y-3">
                                        <div className="p-2.5 rounded-xl bg-muted/30 border border-dashed text-[9px] font-mono truncate">{voice.link}</div>
                                        <audio src={getDisplayUrl(voice.link)} controls className="h-8 w-full filter brightness-100" controlsList="nodownload" />
                                    </div>
                                </div>
                            </Card>
                        )) : (
                            <div className="col-span-full py-20 text-center border-2 border-dashed rounded-[2rem] opacity-20">
                                <MicVocal className="mx-auto h-12 w-12 mb-4" />
                                <p className="font-black uppercase tracking-widest text-xs">Repository Empty</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Voice Dialog */}
            <Dialog open={!!editingVoice} onOpenChange={(open) => !open && setEditingVoice(null)}>
                <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-3xl bg-background">
                    <DialogHeader className="p-8 pb-4 bg-primary/5 border-b">
                        <DialogTitle className="text-xl font-black uppercase">Sync Persona Update</DialogTitle>
                        <DialogDescription className="font-bold text-[10px] uppercase">Modify production voice parameters.</DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Persona Name</Label>
                            <Input value={editingVoice?.name || ''} onChange={e => setEditingVoice({...editingVoice, name: e.target.value})} className="h-11 rounded-xl bg-muted/20 font-bold" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Reference URL</Label>
                            <Input value={editingVoice?.link || ''} onChange={e => setEditingVoice({...editingVoice, link: e.target.value})} className="h-11 rounded-xl bg-muted/20 font-mono text-[10px]" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Gender</Label>
                                <Select value={editingVoice?.gender} onValueChange={v => setEditingVoice({...editingVoice, gender: v})}>
                                    <SelectTrigger className="rounded-xl h-11 bg-muted/20 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="Male">Male</SelectItem>
                                        <SelectItem value="Female">Female</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Maturity</Label>
                                <Select value={editingVoice?.age} onValueChange={v => setEditingVoice({...editingVoice, age: v})}>
                                    <SelectTrigger className="rounded-xl h-11 bg-muted/20 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl"><SelectItem value="Kid">Kid</SelectItem><SelectItem value="Adult">Adult</SelectItem><SelectItem value="Old">Old</SelectItem></SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1 flex items-center gap-2"><Tag className="h-3 w-3" /> Labels & Metadata</Label>
                            <Input 
                                value={editingVoice?.tags || ''} 
                                onChange={e => setEditingVoice({...editingVoice, tags: e.target.value})} 
                                className="h-11 rounded-xl bg-muted/20 border-primary/5 font-bold text-xs" 
                                placeholder="#horror #story #calm" 
                            />
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {PRESET_TAGS.map(tag => (
                                    <button 
                                        key={tag} 
                                        type="button"
                                        onClick={() => toggleTag(tag, 'edit')}
                                        className={cn(
                                            "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight transition-all",
                                            editingVoice?.tags?.includes(`#${tag}`) ? "bg-primary text-white" : "bg-muted hover:bg-primary/10 text-muted-foreground"
                                        )}
                                    >
                                        #{tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="p-8 pt-0 flex gap-3">
                        <Button variant="ghost" onClick={() => setEditingVoice(null)} className="rounded-xl font-bold">Abort</Button>
                        <Button onClick={handleUpdate} disabled={isSaving} className="flex-1 h-12 rounded-xl font-black uppercase btn-shine shadow-xl shadow-primary/20">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} COMMIT UPDATES
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}