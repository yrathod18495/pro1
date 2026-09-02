'use client';

import { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase, useMemoFirebase, useCollection } from '@/firebase';
import { collection, query, where, orderBy, limit, doc } from 'firebase/firestore';
import type { Project, Thumbnail } from '@/lib/types';
import { ProjectCard } from '@/app/history/project-card';
import { ThumbnailCard } from '@/components/history/thumbnail-card';
import { History as HistoryIcon, ShoppingBag, ClipboardCopy, Check, FileText, Loader2, Plus, X, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
  } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PurchaseHistory } from '@/components/history/purchase-history';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { WithIdAndRef } from '@/firebase/firestore/use-collection';
import { cn, getDisplayUrl, generateAvatarColor } from '@/lib/utils';
import { voices } from '@/lib/voices';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { reportClientError } from '@/lib/report-client-error';

/**
 * 🕵️‍♂️ UNIVERSAL TIMESTAMP RESOLVER
 */
const getTimestamp = (val: any) => {
    if (!val) return 0;
    try {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (typeof val === 'string') {
            const t = new Date(val).getTime();
            return isNaN(t) ? 0 : t;
        }
        if (val.toDate && typeof val.toDate === 'function') {
            const t = val.toDate().getTime();
            return isNaN(t) ? 0 : t;
        }
        if (typeof val.seconds === 'number') return val.seconds * 1000;
        const t = new Date(val).getTime();
        return isNaN(t) ? 0 : t;
    } catch (e) {
            reportClientError('src/app/history/page.tsx:54', e);
        return 0;
    }
};

const resolveItemTimestamp = (item: any) => {
    if (!item) return 0;
    const direct = getTimestamp(item.createdAt) ||
        getTimestamp(item.timestamp) ||
        getTimestamp(item.queuedAt) ||
        getTimestamp(item.clientTimestamp) ||
        getTimestamp(item.updatedAt);
    if (direct > 0) return direct;

    if (typeof item.id === 'string') {
        const match = item.id.match(/\d{10,13}/);
        if (match) {
            const parsed = parseInt(match[0], 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }
    return 0;
};

function HistoryPageContent() {
  const { activeUid, loading: authLoading } = useAuth();
  const { firestore } = initializeFirebase();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [isMounted, setIsMounted] = useState(false);
  const [viewingProject, setViewingProject] = useState<Project | null>(null);
  const [fullScript, setFullScript] = useState<string | null>(null);
  const [isFetchingFull, setIsFetchingFull] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [itemsLimit, setItemsLimit] = useState(12);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'projects');

  // 🔒 AUTH GUARD: this is personal history/purchase data — redirect
  // unauthenticated visitors to /login instead of silently rendering it.
  useEffect(() => {
    if (!authLoading && !activeUid) {
      router.push('/login');
    }
  }, [authLoading, activeUid, router]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams, activeTab]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // --- 📂 MULTI-PATH FETCH LOGIC (Root Collections & Partitioned) ---
  const rootProjectsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'projects'),
        where('userId', '==', activeUid),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const rootProProjectsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'pro_projects'),
        where('userId', '==', activeUid),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const rootMusicProjectsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'music_project'),
        where('userId', '==', activeUid),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const rootScriptProjectsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'script_projects'),
        where('userId', '==', activeUid),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const partitionedProjectsQuery = useMemoFirebase(() => {
      if (authLoading || !firestore || !activeUid) return null;
      return query(
          collection(firestore, 'projects', activeUid, 'userProjects'),
          limit(itemsLimit * 2)
      );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const proProjectsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'pro_projects', activeUid, 'userProjects'),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const chatterboxProjectsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'chatterbox_projects', activeUid, 'userProjects'),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const musicPartitionedQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'music_project', activeUid, 'userProjects'),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const scriptProjectsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'script_projects', activeUid, 'userProjects'),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);
  
  const { data: rootProjects } = useCollection<Project>(rootProjectsQuery);
  const { data: rootProProjects } = useCollection<Project>(rootProProjectsQuery);
  const { data: rootMusicProjects } = useCollection<Project>(rootMusicProjectsQuery);
  const { data: rootScriptProjects } = useCollection<Project>(rootScriptProjectsQuery);
  const { data: partitionedProjects, isLoading: partitionedLoading } = useCollection<Project>(partitionedProjectsQuery);
  const { data: proProjects, isLoading: proLoading } = useCollection<Project>(proProjectsQuery);
  const { data: chatterboxProjects, isLoading: chatterboxLoading } = useCollection<Project>(chatterboxProjectsQuery);
  const { data: musicPartitionedProjects, isLoading: musicPartitionedLoading } = useCollection<Project>(musicPartitionedQuery);
  const { data: scriptProjects, isLoading: scriptProjectsLoading } = useCollection<Project>(scriptProjectsQuery);

  const thumbnailsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'users', activeUid, 'thumbnails'),
        limit(itemsLimit)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const partitionedThumbnailsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'thumbnailProjects', activeUid, 'userProjects'),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const snakeCaseThumbnailsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'thumbnail_projects', activeUid, 'userProjects'),
        limit(itemsLimit * 2)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);

  const rootThumbnailsQuery = useMemoFirebase(() => {
    if (authLoading || !firestore || !activeUid) return null;
    return query(
        collection(firestore, 'thumbnailProjects'),
        where('userId', '==', activeUid),
        limit(itemsLimit)
    );
  }, [firestore, activeUid, authLoading, itemsLimit]);
  
  const { data: thumbnails, isLoading: thumbnailsLoading } = useCollection<Thumbnail>(thumbnailsQuery);
  const { data: partitionedThumbnails } = useCollection<Thumbnail>(partitionedThumbnailsQuery);
  const { data: snakeCaseThumbnails } = useCollection<Thumbnail>(snakeCaseThumbnailsQuery);
  const { data: rootThumbnails } = useCollection<Thumbnail>(rootThumbnailsQuery);

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'voice' | 'music' | 'script' | 'thumbnail'>('all');

  const allHistoryItems = useMemo(() => {
    const combinedProjects = [
        ...(rootProjects || []),
        ...(rootProProjects || []),
        ...(rootMusicProjects || []),
        ...(rootScriptProjects || []),
        ...(partitionedProjects || []),
        ...(proProjects || []),
        ...(chatterboxProjects || []),
        ...(musicPartitionedProjects || []),
        ...(scriptProjects || [])
    ].filter((p): p is Project => !!p && typeof p === 'object' && !!p.id);
    const uniqueProjects = Array.from(new Map(combinedProjects.map(p => [p.id, p])).values());
    
    const combinedThumbnails = [
        ...(thumbnails || []),
        ...(partitionedThumbnails || []),
        ...(snakeCaseThumbnails || []),
        ...(rootThumbnails || [])
    ].filter((t): t is Thumbnail => !!t && typeof t === 'object' && !!t.id).map(t => {
        const rawUrl = t.imageUrl || (t as any).link || (t as any).url || (t as any).image || (t as any).thumbnailUrl || (t as any).mediaUrl || (t as any).audioUrl || (t as any).outputUrl || (t as any).imageDataUri || '';
        return {
            ...t,
            imageUrl: rawUrl,
            prompt: t.prompt || (t as any).title || (t as any).projectName || 'AI Thumbnail'
        };
    });
    
    const thumbnailMap = new Map<string, any>();
    for (const t of combinedThumbnails) {
        if (!t || !t.id) continue;
        const existing = thumbnailMap.get(t.id);
        if (!existing) {
            thumbnailMap.set(t.id, t);
        } else {
            thumbnailMap.set(t.id, {
                ...existing,
                ...t,
                imageUrl: t.imageUrl || existing.imageUrl || '',
                prompt: t.prompt || existing.prompt || 'AI Thumbnail',
            });
        }
    }
    const uniqueThumbnails = Array.from(thumbnailMap.values());

    const combined = [
        ...uniqueProjects.filter(p => p && !p.userDeleted).map(p => {
            const isThumb = p.projectType === 'thumbnail' || (p as any).type === 'thumbnail_generation';
            if (isThumb) {
                const img = (p as any).imageUrl || (p as any).link || (p as any).url || (p as any).image || (p as any).thumbnailUrl || (p as any).mediaUrl || (p as any).audioUrl || '';
                return {
                    ...p,
                    imageUrl: img,
                    prompt: p.script || (p as any).prompt || p.projectName || 'AI Thumbnail',
                    type: 'thumbnail' as const
                };
            }
            return { ...p, type: 'project' as const };
        }),
        ...uniqueThumbnails.map(t => ({ ...t, type: 'thumbnail' as const }))
    ];
    return combined.sort((a, b) => resolveItemTimestamp(b) - resolveItemTimestamp(a));
  }, [rootProjects, rootProProjects, rootMusicProjects, rootScriptProjects, partitionedProjects, proProjects, chatterboxProjects, musicPartitionedProjects, scriptProjects, thumbnails, partitionedThumbnails, snakeCaseThumbnails, rootThumbnails]);

  const filteredHistoryItems = useMemo(() => {
    if (categoryFilter === 'all') return allHistoryItems;
    return allHistoryItems.filter(item => {
      if (!item) return false;
      if (categoryFilter === 'thumbnail') return item.type === 'thumbnail';
      if (item.type !== 'project') return false;
      const type = (item.projectType || '').toLowerCase();
      const isMusic = type.includes('music') || (item as any).isMusic || (item as any).tags?.includes('music');
      const isScript = type === 'script' || (!item.audioUrl && (item.script || item.generationParams));
      if (categoryFilter === 'music') return isMusic;
      if (categoryFilter === 'script') return isScript;
      if (categoryFilter === 'voice') return !isMusic && !isScript;
      return true;
    });
  }, [allHistoryItems, categoryFilter]);

  const handleLoadMore = () => {
    setIsFetchingMore(true);
    setItemsLimit(prev => prev + 12);
    setTimeout(() => setIsFetchingMore(false), 800);
  };

  const isInitialLoading = authLoading || (partitionedLoading && proLoading);
  
  const handleOpenProject = useCallback(async (project: Project) => {
    if (!project) return;
    setViewingProject(project);
    
    // 🚀 FULL NODE SYNC: Always try to fetch script from URL if it exists
    if (project.scriptUrl) {
        setIsFetchingFull(true);
        const initialScript = typeof project.script === 'string' ? project.script : (typeof project.generationParams === 'string' ? project.generationParams : '');
        setFullScript(initialScript); // Show current snippet while loading
        try {
            const url = getDisplayUrl(project.scriptUrl);
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().length > 0) {
                    setFullScript(text);
                    setIsFetchingFull(false);
                    return;
                }
            }
        } catch (e) {
            console.error("GCS Sync Failure:", e);
        } finally {
            setIsFetchingFull(false);
        }
    } else {
        const initialScript = typeof project.script === 'string' ? project.script : (typeof project.generationParams === 'string' ? project.generationParams : (typeof project.generationParams === 'object' && project.generationParams ? JSON.stringify(project.generationParams, null, 2) : ''));
        setFullScript(initialScript);
    }
  }, []);

  const handleCopyScript = () => {
    if (!viewingProject) return;
    const scriptText = fullScript || (typeof viewingProject.script === 'string' ? viewingProject.script : (typeof viewingProject.generationParams === 'string' ? viewingProject.generationParams : '')) || '';
    
    let voiceSummary = '';
    if (Array.isArray(viewingProject.characters) && viewingProject.characters.length > 0) {
        voiceSummary = '\n\nVOICE ASSIGNMENTS:\n';
        viewingProject.characters.forEach((char: any, i: number) => {
            if (!char) return;
            const voiceName = voices.find(v => v?.id === char.voice)?.name || char.voice || 'Voice';
            voiceSummary += `${char.name || `Character ${i + 1}`} (${char.emotion || 'Neutral'}): ${voiceName}\n`;
        });
    }

    const textToCopy = scriptText + voiceSummary;
    if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(textToCopy);
    }
    setIsCopied(true);
    toast({ title: 'Script & Voices copied!' });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const setTab = (tab: string) => {
    setActiveTab(tab);
    router.replace(`/history?tab=${tab}`, { scroll: false });
  };

  if (!isMounted) return null;

  if (authLoading || !activeUid) {
    return (
        <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  const showLoadMore = !isInitialLoading && allHistoryItems.length > 0 && allHistoryItems.length >= itemsLimit;

  return (
    <>
    <div className="container mx-auto max-w-7xl py-10 px-4">
        <div className="mb-8 space-y-1">
            <h1 className="text-4xl font-black uppercase tracking-tighter">History Hub</h1>
            <p className="text-muted-foreground font-bold text-[10px] uppercase tracking-[0.2em] opacity-60 px-1">Secure Asset Archive & Production Logs</p>
        </div>
      
        <Tabs defaultValue="projects" value={activeTab} onValueChange={setTab} className="w-full">
            <TabsList className="bg-muted/30 p-1.5 h-12 rounded-2xl border border-primary/5 inline-flex w-auto mb-8">
                <TabsTrigger value="projects" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest"><HistoryIcon className="mr-2 h-4 w-4" />AI Projects</TabsTrigger>
                <TabsTrigger value="purchases" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest"><ShoppingBag className="mr-2 h-4 w-4" />Marketplace</TabsTrigger>
            </TabsList>
            
            <TabsContent value="projects" className="mt-0 space-y-8">
                {/* Section Category Filters */}
                <div className="flex flex-wrap items-center gap-2 pb-2">
                    {[
                        { id: 'all', label: 'All Assets' },
                        { id: 'voice', label: 'Voice AI' },
                        { id: 'music', label: '🎵 Music AI' },
                        { id: 'script', label: 'Script AI' },
                        { id: 'thumbnail', label: 'Thumbnails' }
                    ].map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setCategoryFilter(cat.id as any)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border",
                                categoryFilter === cat.id
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40"
                            )}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {(isInitialLoading && itemsLimit === 12 && allHistoryItems.length === 0) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-[4/3] w-full rounded-[2.5rem]" />)}
                    </div>
                ) : filteredHistoryItems.length > 0 ? (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredHistoryItems.map((item) => (
                            item.type === 'project' 
                            ? <ProjectCard key={item.id} project={item as WithIdAndRef<Project>} onViewProject={handleOpenProject} onProjectDeleted={() => {}} onProjectUpdated={() => {}} />
                            : <ThumbnailCard key={item.id} thumbnail={item as Thumbnail} />
                        ))}
                        </div>
                        {showLoadMore && (
                            <div className="flex justify-center pt-8">
                                <Button 
                                    variant="outline" 
                                    size="lg" 
                                    onClick={handleLoadMore} 
                                    disabled={isFetchingMore}
                                    className="h-14 px-10 rounded-2xl border-primary/20 hover:bg-primary/5 font-black uppercase tracking-widest text-xs gap-3"
                                >
                                    {isFetchingMore ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
                                    Load More Projects
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-32 border-4 border-dashed rounded-[4rem] opacity-30 flex flex-col items-center justify-center"><HistoryIcon className="mx-auto h-20 w-20 text-muted-foreground mb-6" /><h3 className="text-2xl font-black uppercase tracking-widest">No Projects Found</h3><Button asChild className="mt-8 rounded-2xl h-14 px-10 font-black uppercase"><Link href="/studio">Open Studio Node</Link></Button></div>
                )}
            </TabsContent>
            <TabsContent value="purchases" className="mt-0">
                <PurchaseHistory />
            </TabsContent>
        </Tabs>
    </div>

    <Dialog open={viewingProject !== null} onOpenChange={() => { setViewingProject(null); setFullScript(null); }}>
        <DialogContent className="max-w-4xl w-[95vw] sm:w-full h-[90vh] flex flex-col p-0 overflow-hidden rounded-[3rem] border-none shadow-3xl bg-background">
            <DialogHeader className="p-8 sm:p-10 pb-4 border-b bg-muted/20 relative">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-2xl shadow-inner"><FileText className="h-7 w-7 text-primary" /></div>
                    <div className="min-w-0 flex-1 pr-8">
                        <DialogTitle className="text-xl sm:text-2xl font-black uppercase tracking-tight truncate">{viewingProject?.projectName || 'Project Details'}</DialogTitle>
                        <div className="flex items-center gap-2 mt-1">
                            <DialogDescription className="font-black text-[10px] uppercase tracking-[0.2em] text-primary/60">NARRATIVE LOG SOURCE</DialogDescription>
                            {isFetchingFull && <Badge variant="outline" className="h-4 px-1 text-[7px] font-black uppercase border-primary/20 animate-pulse">Syncing Full Node...</Badge>}
                        </div>
                    </div>
                </div>
                <DialogClose className="absolute right-6 top-6 rounded-full p-2 hover:bg-muted transition-colors">
                    <X className="h-5 w-5 sm:h-6 sm:w-6" />
                </DialogClose>
            </DialogHeader>
            
            <ScrollArea className="flex-1 bg-background">
                <div className="p-8 sm:p-12 space-y-12">
                    {Array.isArray(viewingProject?.characters) && viewingProject.characters.length > 0 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-500">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 border-l-4 border-primary/20 pl-4">
                                <Sparkles className="h-4 w-4" /> Cast Persona Mapping
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {viewingProject.characters.map((char: any, i: number) => {
                                    if (!char) return null;
                                    const charName = (typeof char.name === 'string' && char.name.trim().length > 0) ? char.name : `Character ${i + 1}`;
                                    const voiceName = voices.find(v => v?.id === char.voice)?.name || char.voice || 'Voice';
                                    const avatarColor = generateAvatarColor(charName);
                                    return (
                                        <div key={i} className="flex justify-between items-center p-4 px-6 rounded-[1.5rem] bg-muted/30 border border-primary/5 shadow-sm transition-all hover:bg-muted/40">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Avatar className="h-8 w-8 shrink-0">
                                                    <AvatarFallback className={cn("font-black text-[10px]", avatarColor?.bg, avatarColor?.text)}>
                                                        {charName.charAt(0).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0 flex flex-col">
                                                    <span className="font-black text-sm truncate uppercase tracking-tight">{charName}</span>
                                                    <span className="text-[8px] font-bold text-muted-foreground uppercase">{char.emotion || 'Neutral'}</span>
                                                </div>
                                            </div>
                                            <Badge className="text-[9px] font-black uppercase tracking-widest bg-primary text-white border-none h-6 px-3 shadow-md">{voiceName}</Badge>
                                        </div>
                                    );
                                })}
                            </div>
                            <Separator className="opacity-40" />
                        </div>
                    )}

                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-l-4 border-muted-foreground/20 pl-4">
                            <FileText className="h-4 w-4" /> Manuscript Content
                        </div>
                        <div className="border-2 border-primary/5 rounded-[2rem] p-8 sm:p-10 bg-muted/10 font-mono text-base leading-relaxed shadow-inner">
                            <pre className="text-base sm:text-lg leading-relaxed font-medium whitespace-pre-wrap font-sans text-foreground/90">
                                {fullScript || (typeof viewingProject?.script === 'string' ? viewingProject.script : (typeof viewingProject?.generationParams === 'string' ? viewingProject.generationParams : '')) || 'No script content available.'}
                            </pre>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <DialogFooter className="p-6 sm:p-8 bg-muted/20 border-t flex flex-col sm:flex-row items-center gap-4">
                <Button 
                    variant="outline" 
                    onClick={handleCopyScript} 
                    className="w-full sm:w-auto font-black h-14 rounded-2xl px-12 border-primary/20 gap-3 bg-white hover:bg-muted"
                >
                    {isCopied ? <Check className="h-5 w-5 text-green-600" /> : <ClipboardCopy className="h-5 w-5 text-primary" />}
                    COPY SCRIPT
                </Button>
                <Button 
                    onClick={() => { setViewingProject(null); setFullScript(null); }} 
                    className="w-full sm:w-64 h-14 rounded-2xl font-black bg-primary text-white shadow-xl shadow-primary/20 uppercase tracking-widest text-xs btn-shine"
                >
                    EXIT VIEW
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}

export default function HistoryPage() {
  return <Suspense fallback={null}><HistoryPageContent /></Suspense>;
}
