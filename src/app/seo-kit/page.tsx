
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Youtube, Sparkles, Zap, Coins, CheckCircle2, Check, Copy, Trash2, Activity, Database, History } from 'lucide-react';
import { generateYouTubeSEO } from '@/ai/flows/generate-youtube-seo';
import { useAuth } from '@/context/auth-provider';
import { Badge } from '@/components/ui/badge';
import { cn, getDisplayUrl } from '@/lib/utils';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, remove, update } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';

import { Progress } from '@/components/ui/progress';
import { deductSeoCreditsAction } from './actions';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { reportClientError } from '@/lib/report-client-error';

interface SeoResult {
    titles: string[];
    description: string;
    tags: string[];
}

interface ProductionNode {
    mappingId: string;
    topic: string;
    projectName: string;
    scriptUrl?: string;
    timestamp: number;
    status: string;
    result?: SeoResult;
}

/**
 * 📦 SEO NODE CARD
 * Handles its own data fetching from GCS to ensure UI stability.
 */
function SeoNodeCard({ 
    node, 
    onPurge 
}: { 
    node: ProductionNode, 
    onPurge: (id: string) => Promise<void> 
}) {
    const { toast } = useToast();
    const [localResult, setLocalResult] = useState<SeoResult | null>(node.result || null);
    const [isFetching, setIsFetching] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (node.status === 'ready' && node.scriptUrl && !localResult) {
            const fetchResult = async () => {
                setIsFetching(true);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

                try {
                    const res = await fetch(getDisplayUrl(node.scriptUrl!), { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (res.ok) {
                        const text = await res.text();
                        if (text && text.trim().length > 0) {
                            try {
                                const data = JSON.parse(text);
                                setLocalResult(data);
                            } catch (parseErr) {
                                console.warn("Incomplete node data:", parseErr);
                            }
                        }
                    } else {
                        console.error("GCS Sync Failed with status:", res.status);
                    }
                } catch (e: any) {
                    if (e.name === 'AbortError') {
                        console.error("GCS Sync Timeout");
                    } else {
                        console.error("GCS Sync Error:", e);
                    }
                } finally {
                    setIsFetching(false);
                }
            };
            fetchResult();
        }
    }, [node.status, node.scriptUrl, localResult]);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        toast({ title: 'Copied!' });
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <Card className="rounded-[3rem] border-none shadow-3xl bg-card overflow-hidden animate-in slide-in-from-bottom-4 duration-700">
            <CardHeader className="p-8 pb-4">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <p className={cn(
                            "text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-2",
                            node.status === 'ready' ? "text-green-600" : "text-primary"
                        )}>
                            {node.status === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {node.status === 'ready' ? 'SEO NODE READY' : 'SYNCHRONIZING NODE'}
                        </p>
                        <h3 className="text-sm font-black uppercase truncate max-w-[220px] tracking-tight">{node.topic}</h3>
                    </div>
                    <button onClick={() => onPurge(node.mappingId)} className="text-destructive/30 hover:text-destructive transition-colors p-2 rounded-full hover:bg-destructive/5">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </CardHeader>
            
            <Separator className="bg-primary/5" />

            <CardContent className="p-8 space-y-8">
                {localResult ? (
                    <div className="space-y-8">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-primary tracking-widest px-1">Catchy Titles</Label>
                            <div className="space-y-2">
                                {localResult.titles.map((title, i) => (
                                    <div key={i} className="flex gap-2 p-3 bg-muted/20 rounded-xl border border-primary/5 group">
                                        <p className="text-sm font-bold flex-1">{title}</p>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => handleCopy(title, `t-${node.mappingId}-${i}`)}>
                                            {copiedId === `t-${node.mappingId}-${i}` ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <Label className="text-[10px] font-black uppercase text-primary tracking-widest">Optimized Description</Label>
                                <Button variant="ghost" size="sm" className="h-6 text-[9px] font-black uppercase" onClick={() => handleCopy(localResult!.description, `d-${node.mappingId}`)}>
                                    {copiedId === `d-${node.mappingId}` ? <Check className="h-3 w-3 text-green-600 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                                    Copy All
                                </Button>
                            </div>
                            <Textarea readOnly value={localResult.description} className="min-h-[150px] text-xs leading-relaxed bg-muted/10 rounded-xl" />
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <Label className="text-[10px] font-black uppercase text-primary tracking-widest">Viral Tags</Label>
                                <Button variant="ghost" size="sm" className="h-6 text-[9px] font-black uppercase" onClick={() => handleCopy(localResult!.tags.join(', '), `tag-${node.mappingId}`)}>
                                    <Copy className="h-3 w-3 mr-1" /> Copy All
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {localResult.tags.map((tag, i) => (
                                    <Badge key={i} variant="secondary" className="font-bold text-[10px] h-7 px-3 rounded-lg border-none shadow-sm">{tag}</Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="py-20 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in">
                        {isFetching ? (
                            <>
                                <Loader2 className="h-8 w-8 animate-spin text-primary opacity-30" />
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-30">
                                    Fetching Neural Data...
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="p-4 rounded-2xl bg-destructive/5 text-destructive mb-2">
                                    <Database className="h-6 w-6 opacity-40" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-destructive/60">
                                    Data Synchronization Failed
                                </p>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-[9px] font-black uppercase rounded-lg border-primary/20"
                                    onClick={() => window.location.reload()}
                                >
                                    <Sparkles className="h-3 w-3 mr-1" /> Retry Sync
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </CardContent>
            <CardFooter className="p-6 bg-muted/20 border-t text-center justify-center">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">Secure Production Node Dispatch</p>
            </CardFooter>
        </Card>
    );
}

export default function SeoKitPage() {
    const { user, setUser, activeUid, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const { database } = initializeFirebase();
    const router = useRouter();

    // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
    // silently rendering the full SEO kit while logged out.
    useEffect(() => {
        if (!authLoading && !user) {
            toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use the SEO Kit.' });
            router.push('/login');
        }
    }, [authLoading, user, router, toast]);
    
    const [topic, setTopic] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [activeMappingId, setActiveMappingId] = useState<string | null>(null);
    const [productionNodes, setProductionNodes] = useState<ProductionNode[]>([]);
    
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // --- 📡 REAL-TIME HUB MONITOR ---
    useEffect(() => {
        if (!activeUid || !database) return;
        
        const hubRef = ref(database, `tempScriptGenerations/${activeUid}`);
        const unsub = onRtdbValue(hubRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                
                const list: ProductionNode[] = Object.entries(data)
                    .filter(([id]) => id.startsWith('SEO_'))
                    .map(([id, val]: [string, any]): ProductionNode | null => {
                        const currentStatus = String(val.status || 'ready').toLowerCase();
                        
                        // If it's still in processing, don't show it in the final list yet
                        if (currentStatus === 'processing' && id !== activeMappingId) return null;

                        return {
                            mappingId: id,
                            topic: val.topic || 'Unknown Topic',
                            projectName: val.projectName || 'SEO Kit',
                            scriptUrl: val.scriptUrl,
                            timestamp: val.timestamp || Date.now(),
                            status: currentStatus,
                            result: val.result
                        };
                    })
                    .filter((item): item is ProductionNode => !!item);

                list.sort((a, b) => b.timestamp - a.timestamp);
                setProductionNodes(list);

                // --- 🏁 COMPLETION HANDSHAKE ---
                const activeItem = list.find(item => item.mappingId === activeMappingId);
                if (activeItem && activeItem.status === 'ready') {
                    setGenerationProgress(100);
                    setTimeout(() => {
                        setIsGenerating(false);
                        setActiveMappingId(null);
                        toast({ title: 'SEO Package Ready!', className: "bg-green-50 border-green-200 text-green-800" });
                    }, 800);
                }
            } else {
                setProductionNodes([]);
            }
        });

        return () => unsub();
    }, [activeUid, database, activeMappingId, toast]);

    // Progress bar logic
    useEffect(() => {
        if (isGenerating) {
            setGenerationProgress(0);
            progressIntervalRef.current = setInterval(() => {
                setGenerationProgress(prev => {
                    if (prev >= 98) return 98; 
                    return prev + (0.5 + Math.random() * 1.5);
                });
            }, 400);
        } else {
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        }
        return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
    }, [isGenerating]);

    const handleGenerate = async () => {
        if (!topic.trim() || !activeUid || !user?.email) return;

        if (user.credits < 200) {
            toast({ variant: 'destructive', title: 'Insufficient Credits' });
            return;
        }

        setIsGenerating(true);
        setGenerationProgress(0);

        try {
            const hubRes = await deductSeoCreditsAction(activeUid, user.email, topic);
            if (!hubRes.success || !hubRes.mappingId) throw new Error(hubRes.error);
            
            if (hubRes.newCredits !== undefined) setUser({ ...user, credits: hubRes.newCredits } as any);
            setActiveMappingId(hubRes.mappingId);

            const res = await generateYouTubeSEO({ 
                topic, 
                userEmail: user.email,
                mappingId: hubRes.mappingId 
            });

            // 🏁 DIRECT SYNC: If AI returned data directly, update RTDB
            if (!res.usedBridge && res.result && database) {
                const nodeId = hubRes.mappingId;
                await update(ref(database, `tempScriptGenerations/${activeUid}/${nodeId}`), {
                    status: 'ready',
                    result: res.result,
                    completedAt: Date.now()
                });
            }

        } catch (error: any) {
            reportClientError('src/app/seo-kit/page.tsx:314', error);
            toast({ variant: 'destructive', title: 'Dispatch Error', description: error.message });
            setIsGenerating(false);
            setActiveMappingId(null);
        }
    };
    
    const handlePurgeNode = async (mappingId: string) => {
        if (!activeUid || !database) return;
        if (!window.confirm("Purge this SEO node?")) return;
        try {
            await remove(ref(database, `tempScriptGenerations/${activeUid}/${mappingId}`));
            toast({ title: 'Node Purged' });
        } catch (e) {
            reportClientError('src/app/seo-kit/page.tsx:327', e);
            toast({ variant: 'destructive', title: 'Purge Failed' });
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
        <div className="container mx-auto max-w-6xl py-10 px-4 pb-32">

            
            <div className="flex flex-col items-center text-center mb-16 space-y-4">
                <div className="p-4 bg-primary/10 rounded-3xl shadow-inner">
                    <Youtube className="h-12 w-12 text-primary" />
                </div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase leading-none">SEO <span className="text-primary italic">Hub</span></h1>
                <p className="text-muted-foreground font-bold uppercase tracking-[0.3em] text-[10px] opacity-60">Persistent Optimization Nodes</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start max-w-5xl mx-auto">
                <div className="space-y-8">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
                        <CardHeader className="bg-primary/5 border-b p-8 text-center">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/40 text-center">INPUT SPECIFICATIONS</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase text-primary px-1">Video Topic</Label>
                                <Textarea 
                                    placeholder="e.g. How to make butter chicken, Unboxing iPhone 16..." 
                                    value={topic} 
                                    onChange={(e) => setTopic(e.target.value)} 
                                    className="min-h-[120px] rounded-2xl bg-muted/10 border-primary/5 p-6 font-bold shadow-inner focus-visible:ring-primary" 
                                />
                            </div>
                            <Button onClick={handleGenerate} disabled={isGenerating || !topic.trim()} className="w-full h-16 text-[11px] font-black uppercase shadow-xl btn-shine rounded-2xl flex flex-col gap-0.5 leading-tight shadow-primary/20">
                                <span className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> GENERATE SEO PACKAGE</span>
                                <span className="text-[10px] opacity-60 flex items-center gap-1 uppercase"><Coins className="h-3 w-3" /> 200 CREDITS</span>
                            </Button>
                        </CardContent>
                    </Card>

                    <div className="p-8 rounded-[2.5rem] border-4 border-dashed border-primary/10 bg-primary/[0.02] space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white dark:bg-zinc-950 rounded-xl shadow-lg text-primary"><History className="h-5 w-5" /></div>
                            <p className="text-[10px] font-black uppercase tracking-widest">Automatic Archiving</p>
                        </div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase leading-relaxed tracking-wider">
                            Every generated node is automatically secured in your persistent SEO history. No manual saving required.
                        </p>
                    </div>
                </div>

                <div className="space-y-10">
                    <div className="flex items-center justify-between px-6">
                        <h2 className="text-[28px] sm:text-[34px] font-black uppercase tracking-tighter leading-none">PRODUCTION <span className="text-primary italic">HUB</span></h2>
                        {productionNodes.length > 0 && (
                            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-black h-8 px-4 rounded-full text-[10px] tracking-widest">
                                {productionNodes.length} NODES
                            </Badge>
                        )}
                    </div>

                    {isGenerating && (
                        <Card className="rounded-[3rem] border-none shadow-3xl bg-card overflow-hidden p-10 text-center space-y-10 animate-in zoom-in-95 duration-500">
                            <div className="space-y-4">
                                <div className="flex justify-between items-end px-2">
                                    <p className="text-[11px] font-black uppercase text-primary flex items-center gap-3 animate-pulse">
                                        <Activity className="h-4 w-4" /> 
                                        CALIBRATING SEO...
                                    </p>
                                    <span className="text-2xl font-black font-mono text-primary">{Math.round(generationProgress)}%</span>
                                </div>
                                <Progress value={generationProgress} className="h-4 rounded-full bg-primary/10 shadow-inner" />
                            </div>
                            <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest leading-relaxed">
                                Our SEO node is analyzing the algorithm. <br/> Package will arrive in seconds.
                            </p>
                        </Card>
                    )}

                    <div className="space-y-10">
                        {productionNodes.map((node) => (
                            <SeoNodeCard 
                                key={node.mappingId} 
                                node={node} 
                                onPurge={handlePurgeNode} 
                            />
                        ))}
                    </div>

                    {!isGenerating && productionNodes.length === 0 && (
                        <div className="py-40 flex flex-col items-center justify-center text-center opacity-10 grayscale space-y-6">
                            <div className="p-12 border-4 border-dashed rounded-[4rem] border-primary/20">
                                <Zap className="h-24 w-24 text-primary animate-pulse" />
                            </div>
                            <p className="text-2xl font-black uppercase tracking-[0.4em] ml-[0.4em]">Node Standby</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
