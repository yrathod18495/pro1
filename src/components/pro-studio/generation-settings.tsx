
'use client';

import { useProStudio } from '@/context/pro-studio-provider';
import { useAuth } from '@/context/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, Sparkles, Coins, CheckCircle, Loader2, Activity, Download, Save, RefreshCw, Info } from 'lucide-react';
import { Badge } from '../ui/badge';
import React, { useState, useEffect } from 'react';
import { cn, getDisplayUrl, localSaveFile } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export function GenerationSettings() {
    const { user } = useAuth();
    const { 
        characters, handleGeneration, isGenerating, hqProject, 
        scriptAnalysis, projectName, hqProjectId, realtimeProgress, clearStudioState
    } = useProStudio();

    const [isDownloading, setIsDownloading] = useState(false);
    const isHqActive = hqProjectId || (hqProject && (hqProject.status === 'in_queue' || hqProject.status === 'processing'));
    const isHqReady = hqProject?.status === 'completed' && !!hqProject.audioUrl;

    if (isHqActive || isHqReady) {
        const progress = isHqReady ? 100 : (realtimeProgress ? (realtimeProgress.processed / realtimeProgress.total) * 100 : 0);
        return (
            <div className="space-y-6 animate-in fade-in duration-700">
                <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
                    <CardHeader className="bg-primary/5 p-8 border-b text-center">
                        <div className="relative w-24 h-24 mx-auto mb-4">
                            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-20" />
                            <div className="relative w-full h-full rounded-full border-4 border-primary/20 bg-background flex items-center justify-center">
                                <Zap className={cn("h-10 w-10 text-primary fill-current", !isHqReady && "animate-pulse")} />
                            </div>
                        </div>
                        <CardTitle className="text-2xl font-black uppercase tracking-tight">
                            {isHqReady ? 'Production Complete' : 'Pro Hub Processing'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8 space-y-8">
                        <div className="space-y-4">
                            <div className="flex justify-between items-end px-1">
                                <p className="text-[10px] font-black uppercase text-primary">ENGINE SYNC</p>
                                <span className="text-3xl font-black text-primary font-mono">{Math.round(progress)}%</span>
                            </div>
                            <Progress value={progress} className="h-3 rounded-full" />
                            <p className="text-center text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                                {isHqReady ? 'Master node secured in private vault.' : 'Neural cluster is synthesizing your pro script.'}
                            </p>
                        </div>

                        {isHqReady && (
                            <div className="space-y-6 pt-4 animate-in zoom-in-95">
                                <div className="bg-muted/30 p-4 rounded-2xl border border-dashed">
                                    <audio src={getDisplayUrl(hqProject?.audioUrl)} controls className="w-full h-10" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Button onClick={() => localSaveFile(hqProject!.audioUrl!, 'pro_master.wav')} disabled={isDownloading} className="h-14 rounded-2xl font-black bg-green-600 hover:bg-green-700 shadow-xl btn-shine">
                                        <Download className="mr-2 h-5 w-5" /> DOWNLOAD MASTER
                                    </Button>
                                    <Button onClick={clearStudioState} variant="outline" className="h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest">START NEW</Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!scriptAnalysis) return null;

    const isReady = characters.every(c => c.voice) && projectName.trim().length > 0;

    return (
        <Card className="border-none shadow-2xl bg-card overflow-hidden rounded-[2.5rem]">
            <CardHeader className="bg-primary/5 pb-6 border-b">
                <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3"><Zap className="h-5 w-5 text-primary" />Engine Settings</CardTitle>
            </CardHeader>
            <CardContent className="pt-8 space-y-6">
                <div className="p-6 rounded-[2rem] border bg-muted/20 space-y-4">
                    <div className="flex justify-between">
                        <span className="text-[10px] font-black uppercase opacity-40">Linguistic Node</span>
                        <Badge variant="outline" className="text-primary border-primary/20 font-black">NEURAL HUB</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase text-muted-foreground">Production Bounty</p>
                            <div className="flex items-center gap-2">
                                <p className="text-3xl font-black text-primary flex items-center gap-2">
                                    <Coins className="h-6 w-6" /> {scriptAnalysis.cost.toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black uppercase text-muted-foreground">Manuscript Chars</p>
                            <p className="text-xl font-black">{scriptAnalysis.characterCount.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex gap-3">
                    <Info className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-[10px] font-bold text-amber-800 uppercase leading-relaxed">Pro Studio doesn&apos;t support emotions, don&apos;t worry we don&apos;t charge for extra stuffs</p>
                </div>
            </CardContent>
            <CardFooter className="p-8 pt-0">
                <Button 
                    onClick={handleGeneration} 
                    disabled={isGenerating || !isReady} 
                    className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine uppercase gap-3"
                >
                    {isGenerating ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6 fill-current" />}
                    INITIATE PRO PRODUCTION
                </Button>
            </CardFooter>
        </Card>
    );
}
