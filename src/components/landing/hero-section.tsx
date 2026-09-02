'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Mic, Radio, ShieldCheck, Zap, Globe2, Cpu, AudioWaveform, Sliders } from 'lucide-react';

export function HeroSection({ user }: { user: User | null }) {
  return (
    <section className="relative w-full min-h-[90vh] py-20 md:py-32 overflow-hidden flex flex-col items-center justify-center text-center px-4 font-['Poppins'] bg-background">
      {/* High-Tech Background Ambient Grid & Radial Glows */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18)_0%,rgba(147,51,234,0.14)_40%,transparent_75%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.25)_0%,rgba(168,85,247,0.18)_45%,transparent_80%)] blur-[110px] rounded-full pointer-events-none -z-10" />
      
      {/* Cyber Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.06)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      {/* Floating Animated Ambient Particles */}
      <div className="absolute top-1/4 left-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-10 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center">
        {/* Top Status Pill - Dark Luxury Glass */}
        <motion.div
          initial={{ opacity: 0, y: -15, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-card/80 dark:bg-zinc-900/90 border border-primary/20 dark:border-white/10 shadow-lg backdrop-blur-2xl text-xs sm:text-sm font-semibold text-foreground mb-8 hover:border-primary/40 transition-all cursor-default"
        >
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent font-extrabold uppercase tracking-wider text-[11px]">
            12Labs Voice Studio
          </span>
          <span className="text-muted-foreground/60">•</span>
          <span className="text-muted-foreground font-medium text-xs">Ultra-Fast AI Sound Engine</span>
        </motion.div>

        {/* Central Brand Orb with Audio Aura Ring */}
        <div className="relative mb-10 group">
          {/* Animated Glowing Outer Ring */}
          <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 opacity-40 blur-xl group-hover:opacity-70 transition-opacity duration-500 animate-pulse" />

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.1 }}
            whileHover={{ scale: 1.06, rotate: 1 }}
            className="relative w-[190px] h-[190px] sm:w-[220px] sm:h-[220px] rounded-full bg-[radial-gradient(circle_at_30%_30%,#3b82f6,#1d4ed8,#0f172a)] dark:bg-[radial-gradient(circle_at_30%_30%,#60a5fa,#2563eb,#020617)] flex items-center justify-center shadow-[0_0_90px_rgba(37,99,235,0.5),inset_0_8px_25px_rgba(255,255,255,0.7)] cursor-pointer select-none overflow-hidden border border-white/20"
          >
            {/* Glass Light Reflection Arc */}
            <div className="absolute top-[20px] left-[30px] w-[60px] h-[60px] rounded-full bg-white/40 blur-[8px] pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none" />

            {/* Central Brand Number */}
            <h2 className="text-[85px] sm:text-[100px] font-black text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] font-logo leading-none select-none relative z-10 tracking-tighter">
              12
            </h2>

            {/* Sound Wave Overlay Ring */}
            <div className="absolute inset-2 rounded-full border border-white/10 border-dashed animate-spin-slow pointer-events-none" />
          </motion.div>
        </div>

        {/* Main Display Headline */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.15 }}
          className="space-y-4 max-w-4xl"
        >
          <h1 className="text-[40px] sm:text-[64px] md:text-[80px] font-black tracking-tight leading-[1.02] text-foreground font-headline">
            More <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Content.</span><br />
            Less <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Effort.</span>
          </h1>

          <p className="text-base sm:text-xl text-muted-foreground dark:text-zinc-400 font-medium max-w-xl mx-auto leading-relaxed px-2">
            The complete AI sound & script studio designed for modern creators. Generate studio-grade voiceovers, scripts, and video assets in seconds.
          </p>

          {/* Primary & Secondary Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.25 }}
            className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto h-[58px] px-9 text-base sm:text-lg font-bold rounded-full shadow-2xl shadow-blue-500/30 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white transition-all duration-300 border-none group relative overflow-hidden active:scale-95"
            >
              <Link href={user ? "/studio" : "/login"} className="flex items-center justify-center gap-2.5">
                <span>Launch Voice Studio</span>
                <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full sm:w-auto h-[58px] px-8 text-base font-semibold rounded-full border-primary/20 hover:border-primary/40 bg-card/60 backdrop-blur-xl hover:bg-accent/60 text-foreground transition-all duration-200 active:scale-95 shadow-sm"
            >
              <Link href="/music-library" className="flex items-center justify-center gap-2.5">
                <Radio className="w-4 h-4 text-blue-500 animate-pulse" />
                <span>Explore Sound Library</span>
              </Link>
            </Button>
          </motion.div>

          {/* Feature Badge Bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="pt-12 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm font-semibold text-muted-foreground"
          >
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/80 dark:bg-zinc-900/60 border border-border/80 shadow-xs">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Instant AI Synthesis</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/80 dark:bg-zinc-900/60 border border-border/80 shadow-xs">
              <Globe2 className="w-3.5 h-3.5 text-blue-500" />
              <span>70+ Languages & Dialects</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/80 dark:bg-zinc-900/60 border border-border/80 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>100% Commercial Rights</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
