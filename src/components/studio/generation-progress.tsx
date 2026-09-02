
'use client';

import { useStudio } from '@/context/studio-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Clock, Music, Download, CheckCircle, History, Cpu, Sparkles, Activity, Layers, Plus, Coins, ShieldCheck, Zap } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Skeleton } from '../ui/skeleton';
import { getDisplayUrl, cn } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { saveAs } from 'file-saver';

const CircularProgress = ({ progress, label = "Active" }: { progress: number; label?: string }) => {
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative h-32 w-32">
      <svg className="absolute top-0 left-0 h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="text-muted/40 dark:text-white/5"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="text-primary transition-all duration-1000 ease-in-out"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-foreground tracking-tighter">
          {Math.round(progress)}%
        </span>
        <span className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">{label}</span>
      </div>
    </div>
  );
};


export function GenerationProgress() {
    const { 
        generationProgress, 
        isGenerating, 
        generationMode,
        isFinalizing,
        generatedAudio,
        clearStudioState,
        projectName
    } = useStudio();

    const [dots, setDots] = useState('');
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (isGenerating || isFinalizing) {
            const interval = setInterval(() => {
                setDots(prev => (prev.length >= 3 ? '.' : prev + '.'));
            }, 400);
            return () => clearInterval(interval);
        }
    }, [isGenerating, isFinalizing]);

     useEffect(() => {
        if (generatedAudio) {
            const url = URL.createObjectURL(generatedAudio);
            setAudioUrl(url);
            return () => { URL.revokeObjectURL(url); };
        } else {
            setAudioUrl(null);
        }
    }, [generatedAudio]);

    // ONLY for 'fast' generation mode. HQ is handled in GenerationSettings.
    if (generationMode === 'high-quality') return null;
    
    /**
     * 🛰️ ROBUST LOCAL SAVE NODE
     */
    const handleDownload = async () => {
        if (!generatedAudio) return;
        setIsDownloading(true);
        toast({ title: 'Preparing file...', description: 'Your AI master is being exported.' });

        try {
            const safeProjectName = projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || '12labs_fast_gen';
            saveAs(generatedAudio, `12labs_master_${safeProjectName}.wav`);
            toast({ title: 'Download Successful' });
        } catch (error) {
            console.error("Save failed:", error);
            toast({ variant: 'destructive', title: 'Save Failed' });
        } finally {
            setIsDownloading(false);
        }
    };

    if (isFinalizing) {
        return (
             <Card className="shadow-2xl animate-in fade-in duration-500 mt-8 rounded-[2rem] border-primary/20 bg-card text-card-foreground">
                <CardHeader className="text-center p-10">
                    <div className="mx-auto w-fit mb-6">
                        <CircularProgress progress={98} label="Merging" />
                    </div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight text-foreground">Finalizing Master</CardTitle>
                    <CardDescription className="font-bold opacity-80 mt-2 text-muted-foreground">Merging and mastering audio layers{dots}</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    if (audioUrl) {
        return (
            <Card className="shadow-2xl animate-in zoom-in-95 duration-500 mt-8 border-green-500/20 bg-card text-card-foreground rounded-[2rem]">
                 <CardHeader className="text-center p-10">
                    <div className="mx-auto bg-green-500/10 p-5 rounded-3xl w-fit mb-6"><CheckCircle className="h-12 w-12 text-green-500" /></div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight text-foreground">Generation Ready</CardTitle>
                    <CardDescription className="font-bold opacity-80 mt-2 text-muted-foreground">Master file successfully synchronized.</CardDescription>
                </CardHeader>
                <CardContent className="p-10 pt-0 space-y-6">
                    <div className="bg-muted/40 p-4 rounded-2xl border border-border shadow-inner"><audio src={audioUrl} controls className="w-full h-10 filter" /></div>
                    <div className="flex flex-col gap-3">
                        <Button onClick={handleDownload} disabled={isDownloading} className="w-full h-16 text-xl font-black rounded-2xl bg-green-600 hover:bg-green-700 shadow-xl shadow-green-500/20 btn-shine uppercase text-white">
                            {isDownloading ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : <Download className="mr-3 h-6 w-6" />} DOWNLOAD MASTER
                        </Button>
                        <Button variant="ghost" onClick={clearStudioState} className="font-bold text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">Dismiss & Start New</Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (isGenerating) {
        return (
            <Card className="shadow-2xl animate-in slide-in-from-right-4 duration-700 mt-8 rounded-[2rem] border-border bg-card text-card-foreground">
                <CardHeader className="text-center p-10">
                     <div className="mx-auto w-fit mb-8 relative">
                        <CircularProgress progress={generationProgress} />
                        <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-primary animate-pulse" />
                    </div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight tracking-widest text-foreground">Fast Synthesis</CardTitle>
                    <CardDescription className="font-black text-primary uppercase text-[10px] tracking-[0.2em] mt-2">Engaging parallel synthesis{dots}</CardDescription>
                </CardHeader>
            </Card>
        );
    }
    
    return null;
}
