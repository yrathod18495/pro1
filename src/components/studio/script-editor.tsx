
'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useStudio } from '@/context/studio-provider';
import { useAuth } from '@/context/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, FileUp, Trash2, Copy, Check, FilePenLine, RotateCcw, Zap, Coins, AlertCircle, ShieldAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import mammoth from 'mammoth';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ScriptGuidelinesDialog } from './script-guidelines-dialog';
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

export function ScriptEditor() {
  const { user } = useAuth();
  const { 
    script, setScript, cleanScript, analyzeScript, isAnalyzing, 
    scriptState, clearStudioState, includeEmotion, setIncludeEmotion,
    dailyAnalysisCount = 0, maxDailyAnalysisLimit = 2, pricing
  } = useStudio();
  const { toast } = useToast();
  const [isCopied, setIsCopied] = useState(false);
  const [showCopyButton, setShowCopyButton] = useState(false);
  const [viewMode, setViewMode] = useState<'original' | 'clean'>('clean');
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const isAnalyzed = scriptState === 'valid';

  // --- AI SCANNING & RANDOMIZED LOGIC ---
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [isThinking, setIsThinking] = useState(false);
  const scriptLines = useMemo(() => script.split('\n').filter(l => l.trim().length > 0), [script]);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const runRandomizedScan = useCallback((index: number) => {
    if (!isAnalyzing || index >= scriptLines.length) {
        setActiveLineIndex(-1);
        setIsThinking(false);
        return;
    }

    setActiveLineIndex(index);
    setIsThinking(false);

    // Randomize next step
    const rand = Math.random();
    let nextIndex = index + 1;
    let delay = 600 + Math.random() * 800; // Standard delay

    if (rand > 0.8) {
        // Multi-line jump (Speed up)
        nextIndex = Math.min(index + Math.ceil(Math.random() * 2), scriptLines.length - 1);
        delay = 400;
    } else if (rand < 0.15) {
        // Thinking pause
        setIsThinking(true);
        delay = 1500 + Math.random() * 1000;
    }

    // Contained Scroll: Only scroll the box, not the window
    lineRefs.current[index]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
    });

    timerRef.current = setTimeout(() => runRandomizedScan(nextIndex), delay);
  }, [isAnalyzing, scriptLines.length]);

  useEffect(() => {
    if (isAnalyzing) {
        runRandomizedScan(0);
    } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        setActiveLineIndex(-1);
        setIsThinking(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isAnalyzing, runRandomizedScan]);

  useEffect(() => {
    if (isAnalyzed) {
        setIsTransitioning(true);
        setTimeout(() => {
            setViewMode('clean');
            setIsTransitioning(false);
        }, 300);
    }
  }, [isAnalyzed]);

  const handleToggleView = (mode: 'original' | 'clean') => {
      if (mode === viewMode) return;
      setIsTransitioning(true);
      setTimeout(() => {
          setViewMode(mode);
          setIsTransitioning(false);
      }, 300);
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
  
  const handleCopyToClipboard = () => {
    const textToCopy = isAnalyzed && viewMode === 'clean' ? cleanScript : script;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    toast({ title: 'Script copied!' });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const characterCount = script.length;
  const isMinCharCountValid = characterCount >= 100;
  const isMaxCharCountValid = characterCount <= 30000;
  // Admin panel sets a per-character cost multiplier (e.g. 1.3x). The counter
  // shown to the user should reflect that weighted/billable count, not the
  // raw pasted-text length — this stays in sync with the credits that will
  // actually be deducted. Anything derived from *real* characters (min/max
  // input limits, audio-runtime/minute estimates) must keep using the true
  // `characterCount` and never this weighted number.
  const billableCharacterCount = Math.ceil(characterCount * (pricing?.normal ?? 1.2));

  return (
    <Card className="border-border/60 shadow-2xl shadow-primary/5 bg-card/95 backdrop-blur-3xl overflow-hidden rounded-[2.5rem]">
      <CardHeader className="text-center pb-8 border-b border-border/60 bg-muted/20 relative overflow-hidden">
          {/* Blueprint background pattern for header */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          
          <div className="flex justify-center mb-4 relative z-10">
              <div className="p-4 bg-primary/10 rounded-[2rem] shadow-inner relative group">
                  <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <FilePenLine className="h-10 w-10 text-primary relative z-10" />
              </div>
          </div>
          <CardTitle className="text-3xl md:text-4xl font-black tracking-tight uppercase relative z-10 text-foreground">
            Production <span className="text-primary italic">Manuscript</span>
          </CardTitle>
          <CardDescription className="text-sm md:text-base font-medium max-w-lg mx-auto text-muted-foreground relative z-10 mt-1">
            {isAnalyzing ? (
              <span>Neural engine is scanning your script...</span>
            ) : isAnalyzed ? (
              <span>Your script is processed. Compare versions below.</span>
            ) : (
              <span>Paste your script or upload a file. AI analysis requires at least 100 characters.</span>
            )}
          </CardDescription>

          {isAnalyzed && !isAnalyzing && (
            <div className="mt-5 flex justify-center relative z-20">
               <div className="flex bg-muted/80 backdrop-blur-md p-1.5 rounded-full border border-border shadow-md">
                 <button 
                  className={cn(
                      "h-9 px-6 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300",
                      viewMode === 'original' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleToggleView('original')}
                 >
                   Original
                 </button>
                 <button 
                  className={cn(
                      "h-9 px-6 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300",
                      viewMode === 'clean' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => handleToggleView('clean')}
                 >
                   Cleaned
                 </button>
               </div>
            </div>
          )}
      </CardHeader>
      <CardContent className="pt-8">
        <div className="relative group min-h-[350px] md:min-h-[500px]">
            
            {isAnalyzing ? (
              <div 
                ref={scrollRef}
                className="h-[350px] md:h-[500px] overflow-y-auto rounded-3xl border-2 border-border/60 bg-muted/20 p-6 sm:p-8 space-y-4 shadow-inner custom-scrollbar"
              >
                {scriptLines.map((line, idx) => (
                  <div 
                    key={idx}
                    ref={el => { lineRefs.current[idx] = el; }}
                    className={cn(
                      "p-3 rounded-2xl transition-all duration-500 text-lg font-medium border border-transparent leading-relaxed",
                      activeLineIndex === idx 
                        ? "bg-primary/15 dark:bg-primary/25 text-foreground border-primary/30 shadow-md font-bold ring-1 ring-primary/30" 
                        : "text-foreground/80 dark:text-foreground/70 font-medium opacity-80 dark:opacity-60"
                    )}
                  >
                    {activeLineIndex === idx && (
                        isThinking ? <Loader2 className="h-4 w-4 inline-block mr-3 animate-spin text-primary/60" /> : <Zap className="h-4 w-4 inline-block mr-3 animate-pulse fill-primary text-primary" />
                    )}
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative h-full">
                <Textarea
                  placeholder="Paste your script here... (e.g. Aarav: Hello, how are you? \nNarrator: The journey starts here.)"
                  className={cn(
                      "min-h-[380px] md:min-h-[500px] text-lg leading-relaxed font-medium transition-all focus-visible:ring-primary p-6 sm:p-8 rounded-3xl",
                      "border-2 border-border bg-card shadow-inner text-foreground placeholder:text-muted-foreground", 
                      isAnalyzed ? "bg-muted/40 text-foreground/90 cursor-default" : "opacity-100",
                      isTransitioning ? "opacity-0 blur-sm scale-95" : "opacity-100 blur-0 scale-100"
                  )}
                  value={isAnalyzed && viewMode === 'clean' ? cleanScript : script}
                  onChange={(e) => {
                      if (isAnalyzed) return;
                      setScript(e.target.value);
                      if (e.target.value.length === 0) setShowCopyButton(false);
                      else if (!showCopyButton) setShowCopyButton(true);
                  }}
                  readOnly={isAnalyzed}
                  onFocus={() => script.length > 0 && setShowCopyButton(true)}
                  onBlur={() => setTimeout(() => setShowCopyButton(false), 200)}
                />
                
                {/* Floating copy action only; Script Rules is available in
                    the toolbar below the editor, so it should not cover the
                    script input itself. */}
                <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                    {showCopyButton && characterCount > 0 && (
                        <Button
                            size="sm"
                            variant="secondary"
                            className="animate-in fade-in zoom-in duration-300 shadow-xl rounded-full px-5 h-9 font-bold bg-background/90 backdrop-blur-sm border border-border text-foreground hover:bg-accent"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleCopyToClipboard}
                        >
                            {isCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4 text-primary" />}
                            {isCopied ? 'Copied!' : 'Copy'}
                        </Button>
                    )}
                </div>
              </div>
            )}
        </div>
      </CardContent>
      <CardFooter className="p-6 md:p-10 border-t border-border/60 bg-muted/20 relative overflow-hidden">
        {/* Decorative blueprint lines */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        
        {isAnalyzed ? (
            <div className="w-full flex flex-col items-center gap-3 relative z-10">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button className="w-full h-16 text-xl font-black shadow-2xl shadow-destructive/20 transition-all hover:scale-[1.01] active:scale-95 rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground uppercase gap-3">
                            <RotateCcw className="h-6 w-6" /> RESET STUDIO
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-[2.5rem] border-border p-8 md:p-10 shadow-3xl bg-card text-card-foreground">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-3xl font-black tracking-tight uppercase text-destructive">Full Studio Reset?</AlertDialogTitle>
                            <AlertDialogDescription className="text-base font-medium text-muted-foreground mt-2">
                                This protocol will purge the entire production state including script, characters, and any generated fragments.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl font-bold h-12 px-8 bg-muted border-border text-foreground hover:bg-muted/80 transition-colors">Abort</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-2xl font-black h-12 px-10" onClick={clearStudioState}>Confirm Reset</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        ) : (
            <div className="w-full flex flex-col gap-6 relative z-10">
                {/* Compact Toolbar Grid / Flex */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl bg-muted/20 border border-border/70 shadow-xs">
                    {/* Left: Quick Actions */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                        <Label htmlFor="file-upload" className={cn(isAnalyzed || isAnalyzing ? "cursor-not-allowed" : "cursor-pointer")}>
                            <div className={cn(
                                "flex items-center gap-1.5 text-[11px] font-bold tracking-wider transition-all whitespace-nowrap border border-border px-3.5 py-2 rounded-xl bg-background/80 hover:bg-muted shadow-2xs",
                                (isAnalyzed || isAnalyzing) ? "text-muted-foreground opacity-30 pointer-events-none" : "text-foreground hover:text-primary active:scale-95"
                            )}>
                                <FileUp className="h-3.5 w-3.5 text-primary" /> Import
                            </div>
                        </Label>
                        <input id="file-upload" type="file" className="hidden" accept=".txt,.docx" onChange={handleFileChange} disabled={isAnalyzed || isAnalyzing} />
                        
                        <ScriptGuidelinesDialog variant="button" className="px-3 py-2 rounded-xl text-[11px] h-auto tracking-normal font-bold border-amber-500/30" />

                        <label htmlFor="include-emotion-chk" className="flex items-center gap-2 bg-background/80 px-3 py-2 rounded-xl border border-border transition-all hover:bg-muted cursor-pointer select-none">
                            <Checkbox 
                                id="include-emotion-chk" 
                                checked={includeEmotion} 
                                onCheckedChange={(val) => setIncludeEmotion(val as boolean)}
                                disabled={isAnalyzing}
                                className="border-border h-4 w-4 rounded-md data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                            <span className="text-[11px] font-bold text-foreground/80 cursor-pointer">
                                Emotions
                            </span>
                        </label>
                    </div>

                    {/* Right: Counters & Balances in Single Line */}
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                        {/* Character count pill */}
                        <div className="flex items-center gap-1.5 bg-background/80 border border-border px-3 py-1.5 rounded-xl text-foreground shadow-2xs">
                            <Zap className={cn("h-3.5 w-3.5 fill-primary text-primary", characterCount > 0 ? "animate-pulse" : "opacity-30")} />
                            <div className="text-[11px] font-bold font-mono whitespace-nowrap">
                                <span className={cn(
                                    (!isMinCharCountValid && characterCount > 0 && !isAnalyzed) || !isMaxCharCountValid ? "text-destructive" : "text-foreground font-extrabold"
                                )}>
                                    {billableCharacterCount.toLocaleString()}
                                </span>
                                <span className="text-muted-foreground text-[10px]">/30k</span>
                            </div>
                            {characterCount > 0 && !isAnalyzed && (
                                <button disabled={isAnalyzing} className="text-destructive/60 hover:text-destructive transition-colors ml-1 p-0.5 rounded" onClick={() => setScript('')} title="Clear Text">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Available Credits pill */}
                        {(() => {
                            const userCredits = Number(user?.credits ?? 0);
                            return (
                                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-xl shadow-2xs">
                                    <Coins className="h-3.5 w-3.5 text-amber-500" />
                                    <div className="flex items-baseline gap-1 font-mono">
                                        <span className="text-xs font-black text-foreground">
                                            {userCredits.toLocaleString()}
                                        </span>
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                            Credits
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Main Action Area */}
                {(() => {
                    const isSponsorOrAdmin = user?.isSponsor === true || user?.role === 'admin';
                    const userCredits = Number(user?.credits ?? 0);
                    const charCount = script.trim().length;
                    const requiredCredits = Math.ceil(charCount * (pricing?.normal ?? 1.2));
                    const isNotEnoughCredits = !isSponsorOrAdmin && charCount > 0 && userCredits < requiredCredits;
                    const isDailyLimitReached = !isSponsorOrAdmin && dailyAnalysisCount >= maxDailyAnalysisLimit;
                    const isAnalyzeDisabled = !script.trim() || isAnalyzing || !isMinCharCountValid || !isMaxCharCountValid || isNotEnoughCredits || isDailyLimitReached || isAnalyzed;

                    return (
                        <div className="w-full space-y-6">
                            {!isAnalyzed && (
                                <div className="w-full space-y-3">
                                    {isDailyLimitReached && (
                                        <div className="flex items-center justify-center">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 shadow-sm">
                                                Daily Analysis Quota: {dailyAnalysisCount} / {maxDailyAnalysisLimit} Used
                                            </span>
                                        </div>
                                    )}

                                    {isNotEnoughCredits && (
                                        <div className="flex items-center gap-3 p-5 rounded-2xl bg-destructive/5 border border-destructive/20 text-destructive text-sm font-black uppercase tracking-wide animate-in slide-in-from-bottom-2">
                                            <AlertCircle className="h-5 w-5 shrink-0" />
                                            <span>Insufficient Credits — Please top up or shorten your script</span>
                                        </div>
                                    )}

                                    {isDailyLimitReached && !isNotEnoughCredits && (
                                        <div className="flex items-center gap-3 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-amber-500 text-sm font-black uppercase tracking-wide animate-in slide-in-from-bottom-2">
                                            <ShieldAlert className="h-5 w-5 shrink-0" />
                                            <span>Daily Analysis Limit Reached — Reset at 00:00 UTC</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <Button 
                                onClick={analyzeScript} 
                                disabled={isAnalyzeDisabled} 
                                className={cn(
                                    "w-full h-14 sm:h-16 text-lg sm:text-xl font-black shadow-xl transition-all rounded-2xl uppercase tracking-[0.05em]",
                                    isNotEnoughCredits || isDailyLimitReached 
                                        ? "bg-muted text-muted-foreground cursor-not-allowed border-2 border-dashed border-border shadow-none hover:scale-100" 
                                        : "shadow-primary/30 hover:scale-[1.01] active:scale-95 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground"
                                )}
                            >
                                {isAnalyzing ? (
                                    <span className="flex items-center justify-center gap-2"><Loader2 className="h-6 w-6 animate-spin" /> <span>ANALYZING SCRIPT...</span></span>
                                ) : isNotEnoughCredits ? (
                                    <span className="flex items-center justify-center gap-2"><AlertCircle className="h-6 w-6 text-destructive" /> <span>INSUFFICIENT CREDITS</span></span>
                                ) : isDailyLimitReached ? (
                                    <span className="flex items-center justify-center gap-2"><ShieldAlert className="h-6 w-6 text-amber-500" /> <span>QUOTA EXCEEDED</span></span>
                                ) : isAnalyzed ? (
                                    <span className="flex items-center justify-center gap-2"><Check className="h-6 w-6" /> <span>ANALYSIS COMPLETE</span></span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2"><Wand2 className="h-6 w-6 text-white" /> <span>START AI ANALYSIS</span></span>
                                )}
                            </Button>
                        </div>
                    );
                })()}
            </div>
        )}
      </CardFooter>
    </Card>
  );
}
