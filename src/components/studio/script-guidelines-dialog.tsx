'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, XCircle, HelpCircle, BookOpen, Sparkles, Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScriptGuidelinesDialogProps {
  variant?: 'button' | 'badge' | 'icon';
  className?: string;
}

export function ScriptGuidelinesDialog({ variant = 'button', className }: ScriptGuidelinesDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeLang, setActiveLang] = useState<'both' | 'en' | 'hi'>('both');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'icon' ? (
          <button
            type="button"
            className={cn(
              "p-2 rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 border border-amber-500/30 transition-all flex items-center gap-1.5 active:scale-95",
              className
            )}
            title="Script Guidelines / डायलॉग नियम"
          >
            <AlertCircle className="h-4 w-4 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">Rules</span>
          </button>
        ) : variant === 'badge' ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-xs",
              className
            )}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>⚠️ Script Rules</span>
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-bold tracking-wider transition-all whitespace-nowrap border border-amber-500/30 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 shadow-2xs active:scale-95 cursor-pointer",
              className
            )}
          >
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Rules</span>
          </button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-[2rem] border border-border bg-card text-card-foreground p-6 sm:p-8 shadow-2xl">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-2xl">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-black uppercase tracking-tight text-foreground">
                  Script Guidelines & Rules
                </DialogTitle>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                  डायलॉग फॉर्मेट नियम (Dialogue Quality Rules)
                </p>
              </div>
            </div>

            {/* Language Selector */}
            <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setActiveLang('both')}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all",
                  activeLang === 'both' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setActiveLang('en')}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all",
                  activeLang === 'en' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setActiveLang('hi')}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all",
                  activeLang === 'hi' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                हिंदी
              </button>
            </div>
          </div>
          <DialogDescription className="text-xs sm:text-sm font-medium text-muted-foreground">
            Please follow standard script formatting for flawless AI voice synthesis and character consistency.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Main Golden Rule */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-black text-xs sm:text-sm uppercase tracking-wide">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>Golden Rule: Full Sentences Only / केवल पूरे वाक्य</span>
            </div>
            
            {(activeLang === 'both' || activeLang === 'en') && (
              <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                <strong className="text-amber-700 dark:text-amber-300">English:</strong> Each dialogue line must be a complete, well-formed sentence. Very short lines (single words or 1-2 words) are automatically rejected because AI voice actors require phonetic context to generate natural tone and emotion.
              </p>
            )}

            {(activeLang === 'both' || activeLang === 'hi') && (
              <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                <strong className="text-amber-700 dark:text-amber-300">हिंदी:</strong> डायलॉग हमेशा एक पूरी और स्पष्ट लाइन होना चाहिए। बहुत छोटे डायलॉग्स (1-2 शब्द जैसे &ldquo;हाँ&rdquo;, &ldquo;ना&rdquo;, &ldquo;तीसरी तस्वीर&rdquo;) AI वॉइस इंजन द्वारा रिजेक्ट कर दिए जाते हैं क्योंकि बिना पूरे वाक्य के सही भाव और पिच नहीं बन पाती।
              </p>
            )}
          </div>

          {/* Comparison Grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Rejected Format */}
            <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/25 space-y-3">
              <div className="flex items-center gap-2 text-destructive font-black text-xs sm:text-sm uppercase tracking-wider">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>❌ Rejected Format (गलत)</span>
              </div>

              {(activeLang === 'both' || activeLang === 'en') && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-destructive/80">English Example:</p>
                  <div className="font-mono text-[11px] space-y-1 p-2.5 rounded-xl bg-background/80 border border-destructive/20 text-foreground/90">
                    <p className="text-destructive font-semibold">John: Me? <span className="text-[10px] text-muted-foreground">(Too short)</span></p>
                    <p className="text-destructive font-semibold">Narrator: Second photo. <span className="text-[10px] text-muted-foreground">(Only 2 words)</span></p>
                    <p className="text-destructive font-semibold">John: But why... <span className="text-[10px] text-muted-foreground">(Incomplete)</span></p>
                  </div>
                </div>
              )}

              {(activeLang === 'both' || activeLang === 'hi') && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-destructive/80">हिंदी उदाहरण:</p>
                  <div className="font-mono text-[11px] space-y-1 p-2.5 rounded-xl bg-background/80 border border-destructive/20 text-foreground/90">
                    <p className="text-destructive font-semibold">आरव: ये... मैं हूँ? <span className="text-[10px] text-muted-foreground">(बहुत छोटा)</span></p>
                    <p className="text-destructive font-semibold">Narrator: दूसरी तस्वीर। <span className="text-[10px] text-muted-foreground">(सिर्फ 2 शब्द)</span></p>
                    <p className="text-destructive font-semibold">आरव: ये भी मैं... <span className="text-[10px] text-muted-foreground">(अधूरा)</span></p>
                  </div>
                </div>
              )}
            </div>

            {/* Approved Format */}
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black text-xs sm:text-sm uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>✅ Approved Format (सही)</span>
              </div>

              {(activeLang === 'both' || activeLang === 'en') && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">English Example:</p>
                  <div className="font-mono text-[11px] space-y-1.5 p-2.5 rounded-xl bg-background/80 border border-emerald-500/20 text-foreground/90">
                    <p><strong>John:</strong> Look closely at this photograph, is this really me?</p>
                    <p><strong>Narrator:</strong> As he looked at the second picture, his entire body began to tremble.</p>
                    <p><strong>John:</strong> Yes, this truly is my photograph, but how did it get here?</p>
                  </div>
                </div>
              )}

              {(activeLang === 'both' || activeLang === 'hi') && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">हिंदी उदाहरण:</p>
                  <div className="font-mono text-[11px] space-y-1.5 p-2.5 rounded-xl bg-background/80 border border-emerald-500/20 text-foreground/90">
                    <p><strong>आरव:</strong> इस तस्वीर को ध्यान से देखो, क्या यह वाकई मैं हूँ?</p>
                    <p><strong>Narrator:</strong> जैसे ही उसने दूसरी तस्वीर को देखा, उसका पूरा शरीर कांप उठा।</p>
                    <p><strong>आरव:</strong> हाँ, यह सचमुच मेरी ही तस्वीर है, लेकिन यह यहाँ कैसे आई?</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Formatting Tips (महत्वपूर्ण टिप्स)
            </p>
            <ul className="text-xs font-medium text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>Use the standard <code className="text-foreground bg-muted px-1.5 py-0.5 rounded font-mono font-bold">Character: Dialogue</code> syntax on each line.</li>
              <li>Production notes like <code className="text-muted-foreground font-mono">[Camera zooms in]</code> are automatically stripped.</li>
              <li>Minimum characters required for AI analysis is 100 characters.</li>
            </ul>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              className="px-8 h-11 rounded-xl font-black uppercase text-xs tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
            >
              Got it / समझ गया
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
