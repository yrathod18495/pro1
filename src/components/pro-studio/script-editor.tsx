
'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useProStudio } from '@/context/pro-studio-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, FileUp, Trash2, Copy, Check, FilePenLine, RotateCcw, Zap, Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import mammoth from 'mammoth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '../ui/badge';

export function ScriptEditor() {
  const { 
    script, setScript, analyzeScript, isAnalyzing, 
    scriptState, clearStudioState
  } = useProStudio();
  const { toast } = useToast();
  
  const isAnalyzed = scriptState === 'valid';
  const characterCount = script.length;
  const isMinCharCountValid = characterCount >= 100;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // --- 🔍 AI SCANNING & RANDOMIZED LOGIC ---
  const [activeScanLine, setActiveScanLine] = useState(-1);
  const [isThinking, setIsThinking] = useState(false);
  const scriptLines = useMemo(() => script.split('\n').filter(l => l.trim().length > 0), [script]);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);

  const runRandomizedScan = useCallback((index: number) => {
    if (!isAnalyzing || index >= scriptLines.length) {
        setActiveScanLine(-1);
        setIsThinking(false);
        return;
    }

    setActiveScanLine(index);
    setIsThinking(false);

    const rand = Math.random();
    let nextIndex = index + 1;
    let delay = 600 + Math.random() * 800; 

    if (rand > 0.8) {
        nextIndex = Math.min(index + Math.ceil(Math.random() * 2), scriptLines.length - 1);
        delay = 400;
    } else if (rand < 0.15) {
        setIsThinking(true);
        delay = 1500 + Math.random() * 1000;
    }

    const lineEl = document.getElementById(`pro-scan-line-${index}`);
    lineEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    scanTimerRef.current = setTimeout(() => runRandomizedScan(nextIndex), delay);
  }, [isAnalyzing, scriptLines.length]);

  useEffect(() => {
    if (isAnalyzing) {
        runRandomizedScan(0);
    } else {
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        setActiveScanLine(-1);
        setIsThinking(false);
    }
    return () => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current); };
  }, [isAnalyzing, runRandomizedScan]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = e.currentTarget.scrollTop;
      overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const renderHighlightedContent = () => {
    if (!script) return null;
    const parts = script.split(/(\(.*?\)|\[.*?\])/g);
    return parts.map((part, index) => {
      const isBracketed = /^(\(.*?\)|\[.*?\])$/.test(part);
      if (isBracketed) {
        return (
          <span key={index} className="text-amber-600 font-black bg-amber-100/50 px-0.5 rounded underline decoration-amber-400 decoration-2 underline-offset-2">
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setScript(e.target?.result as string);
        toast({ title: 'File loaded successfully.' });
      };
      reader.readAsText(file);
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const result = await mammoth.extractRawText({ arrayBuffer });
          setScript(result.value);
          toast({ title: 'DOCX file loaded successfully.' });
        } catch (error) {
          console.error('Error parsing .docx file:', error);
          toast({ variant: 'destructive', title: 'Error reading .docx file.' });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast({ variant: 'destructive', title: 'Unsupported file type', description: 'Please upload a .txt or .docx file.' });
    }
    if (event.target) event.target.value = '';
  };

  return (
    <Card className="border-none shadow-2xl bg-card overflow-hidden rounded-[2.5rem]">
      <CardHeader className="text-center pb-8 border-b bg-primary/5">
          <div className="flex justify-center mb-4">
              <div className="p-4 bg-primary/10 rounded-3xl shadow-inner">
                  <FilePenLine className="h-10 w-10 text-primary" />
              </div>
          </div>
          <CardTitle className="text-3xl font-black uppercase tracking-tight">Pro Manuscript</CardTitle>
          <CardDescription className="font-bold text-xs uppercase opacity-60">
            {isAnalyzing ? <span>Neural engine is reading your script...</span> : <span>High-Fidelity Neural Hub</span>}
          </CardDescription>
      </CardHeader>
      <CardContent className="pt-8 space-y-6">
        <div className="relative group min-h-[450px]">
            {isAnalyzing ? (
              <div className="h-[450px] md:h-[550px] overflow-y-auto rounded-3xl border-2 border-primary/20 bg-muted/10 p-8 space-y-4 shadow-inner custom-scrollbar" style={{ scrollBehavior: 'smooth' }}>
                {scriptLines.map((line, idx) => (
                  <div 
                    key={idx} 
                    id={`pro-scan-line-${idx}`}
                    className={cn(
                      "p-3 rounded-2xl transition-all duration-500 text-lg font-medium border border-transparent leading-relaxed",
                      activeScanLine === idx ? "bg-primary/10 text-primary border-primary/10 shadow-sm" : "opacity-40 blur-[0.2px]"
                    )}
                  >
                    {activeScanLine === idx && (
                        isThinking ? <Loader2 className="h-4 w-4 inline-block mr-3 animate-spin text-primary/30" /> : <Zap className="h-4 w-4 inline-block mr-3 animate-pulse fill-current text-primary" />
                    )}
                    {line}
                  </div>
                ))}
              </div>
            ) : (
                <div className="relative h-full">
                    <div 
                        ref={overlayRef}
                        aria-hidden="true"
                        className={cn(
                        "absolute inset-0 p-8 text-lg leading-relaxed font-medium pointer-events-none whitespace-pre-wrap break-words overflow-hidden border-2 border-transparent",
                        isAnalyzed && "opacity-50 grayscale"
                        )}
                        style={{ color: 'transparent' }}
                    >
                        {renderHighlightedContent()}
                        <span className="invisible text-transparent"> </span>
                    </div>

                    <Textarea
                        ref={textareaRef}
                        placeholder="Paste your professional script here..."
                        className={cn(
                            "min-h-[450px] text-lg leading-relaxed font-medium p-8 rounded-3xl border-2 border-primary/10 bg-muted/10 shadow-inner custom-scrollbar",
                            "relative z-10 bg-transparent text-foreground caret-primary",
                            isAnalyzed && "opacity-50 grayscale cursor-default"
                        )}
                        value={script}
                        onChange={(e) => !isAnalyzed && setScript(e.target.value)}
                        onScroll={handleScroll}
                        readOnly={isAnalyzed}
                    />
                </div>
            )}
        </div>

        <div className="flex items-center gap-3 p-4 rounded-[1.5rem] bg-amber-50 border border-amber-100">
            <Zap className="h-4 w-4 text-amber-600 fill-current" />
            <p className="text-[10px] font-bold text-amber-800 uppercase leading-tight">
                Pro Studio doesn&apos;t support emotions, don&apos;t worry we don&apos;t charge for extra stuffs
            </p>
        </div>
      </CardContent>
      <CardFooter className="p-8 border-t bg-muted/10 flex flex-col gap-6">
        {isAnalyzed ? (
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button className="w-full h-16 text-xl font-black rounded-2xl bg-destructive hover:bg-destructive/90 uppercase gap-3 shadow-xl shadow-destructive/10">
                        <RotateCcw className="h-6 w-6" /> RESET WORKSPACE
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[2.5rem] p-10 shadow-3xl bg-background border-none">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-3xl font-black tracking-tight uppercase">Purge Workspace?</AlertDialogTitle>
                        <AlertDialogDescription className="text-lg font-medium opacity-80 mt-2">
                            This protocol will delete your script and cast assignments from the local vault. This action is irreversible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl h-12 font-bold px-8">ABORT</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90 rounded-xl h-12 px-10 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-destructive/20" onClick={clearStudioState}>CONFIRM RESET</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        ) : (
            <div className="w-full space-y-6">
                <div className="flex items-center justify-between px-4 flex-wrap gap-2">
                    <div className="flex items-center gap-4 flex-wrap">
                        <Label htmlFor="pro-file-upload" className="cursor-pointer">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/70 hover:text-primary transition-all border border-primary/20 px-3 py-1.5 rounded-xl bg-muted/20">
                                <FileUp className="h-4 w-4" /> IMPORT SCRIPT
                            </div>
                        </Label>
                        <input id="pro-file-upload" type="file" className="hidden" accept=".txt,.docx" onChange={handleFileChange} disabled={isAnalyzing} />
                        
                    </div>
                    <span className="text-[10px] font-black font-mono opacity-40">{characterCount.toLocaleString()} / 30,000</span>
                </div>
                <Button 
                    onClick={analyzeScript} 
                    disabled={isAnalyzing || !isMinCharCountValid} 
                    className="w-full h-16 text-xl font-black rounded-2xl shadow-xl shadow-primary/20 btn-shine uppercase"
                >
                    {isAnalyzing ? (
                        <span className="flex items-center justify-center gap-2"><Loader2 className="h-6 w-6 animate-spin" /> <span>ANALYZING SCRIPT...</span></span>
                    ) : (
                        <span className="flex items-center justify-center gap-2"><Wand2 className="h-6 w-6" /> <span>START PRO ANALYSIS</span></span>
                    )}
                </Button>
            </div>
        )}
      </CardFooter>
    </Card>
  );
}
