'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { User } from '@/lib/types';
import { Sparkles, ArrowRight, Radio } from 'lucide-react';
import { FeatureMarquee } from '@/components/landing/feature-marquee';

/**
 * The hero runs ONE orchestrated load sequence — pill, orb, headline,
 * copy, buttons, badges — using the shared anim-d-* stagger steps, so it
 * reads as a single considered moment instead of six independent
 * animations racing each other.
 *
 * Deliberately light: one background wash, one static grid, one orb.
 * Nothing loops in the hero except the single status dot — the earlier
 * version stacked a level meter, a halo, two counter-rotating rings and
 * four drifting blobs, which is a lot of movement to hand someone in
 * the first second of the page.
 */

export function HeroSection({ user }: { user: User | null }) {
  return (
    <section className="relative w-full min-h-[82vh] py-16 md:py-24 overflow-hidden flex flex-col items-center justify-center text-center px-4 font-['Poppins'] bg-background">
      {/* ---------- Ambient background layers ----------
          All three sit behind heavy blur at low opacity and drift on
          long, offset cycles, so nothing here ever competes with the
          text in front of it. */}
      <div className="absolute top-[22%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[820px] h-[520px] bg-primary/12 blur-[120px] rounded-full pointer-events-none -z-10" />

      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_38%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center">
        {/* 1 — Status pill */}
        <div className="anim-in-sink anim-d-0 inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-card/80 dark:bg-zinc-900/90 border border-primary/20 dark:border-white/10 shadow-lg backdrop-blur-2xl text-xs sm:text-sm font-semibold text-foreground mb-8 anim-surface-border">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 anim-pulse-dot" />
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-foreground font-extrabold tracking-wide text-[11px]">
            12Labs Voice Studio
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground font-medium text-xs">Ultra-fast AI sound engine</span>
        </div>

        {/* 2 — Brand orb. The rings rotate, but they are circles with no
             content in them, so a rotating circle is still a circle. */}
        <div className="relative mb-10 group anim-in-settle-scale anim-d-1">
          <div className="absolute -inset-6 rounded-full bg-primary/20 blur-2xl pointer-events-none" />

          <div className="relative w-[170px] h-[170px] sm:w-[190px] sm:h-[190px] rounded-full bg-[radial-gradient(circle_at_30%_30%,#3b82f6,#1d4ed8,#0f172a)] dark:bg-[radial-gradient(circle_at_30%_30%,#60a5fa,#2563eb,#020617)] flex items-center justify-center shadow-[0_0_90px_rgba(37,99,235,0.5),inset_0_8px_25px_rgba(255,255,255,0.7)] select-none overflow-hidden border border-white/20 anim-surface-depth anim-surface-sheen">
            <div className="absolute top-[20px] left-[30px] w-[60px] h-[60px] rounded-full bg-white/40 blur-[8px] pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none" />
            <h2 className="text-[76px] sm:text-[86px] font-black text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] font-logo leading-none select-none relative z-10 tracking-tighter">
              12
            </h2>
          </div>
        </div>

        {/* 4 — Headline. Each line is masked and slides up as a whole
             line — the glyphs themselves never stretch or warp. */}
        <h1 className="text-[40px] sm:text-[64px] md:text-[80px] font-black tracking-tight leading-[1.02] text-foreground font-headline max-w-4xl">
          <span className="anim-text-mask">
            <span className="anim-text-line-up anim-d-2 block">More content.</span>
          </span>
          <br />
          <span className="anim-text-mask">
            <span className="anim-text-line-up anim-d-3 block">Less effort.</span>
          </span>
        </h1>

        {/* 5 — Supporting copy */}
        <p className="anim-in-rise anim-d-5 text-base sm:text-xl text-muted-foreground dark:text-zinc-400 font-medium max-w-xl mx-auto leading-relaxed px-2 mt-5">
          The complete AI sound and script studio for modern creators. Generate
          studio-grade voiceovers, scripts, and video assets in seconds.
        </p>

        {/* Feature capsules. Moved up from below the buttons to sit right
            under the supporting copy: down there they were half off-screen
            on a phone and read as a stray band, while here they land in
            the first screenful where they actually sell something. */}
        <div className="pt-8 -mx-4 w-screen max-w-none anim-in-fade anim-d-6">
          <FeatureMarquee />
        </div>

        {/* 6 — Actions */}
        <div className="anim-in-rise anim-d-7 pt-9 flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto h-[58px] px-9 text-base sm:text-lg font-bold rounded-full shadow-2xl shadow-primary/30 bg-primary hover:bg-primary text-primary-foreground border-none group anim-surface-lift anim-surface-press anim-surface-sheen anim-surface-focus"
          >
            <Link href={user ? '/studio' : '/login'} className="flex items-center justify-center gap-2.5">
              <span>Launch Voice Studio</span>
              <ArrowRight className="w-5 h-5 anim-icon-shift" />
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full sm:w-auto h-[58px] px-8 text-base font-semibold rounded-full border-primary/20 bg-card/60 backdrop-blur-xl text-foreground group anim-surface-settle anim-surface-border anim-surface-press anim-surface-focus"
          >
            <Link href="/music-library" className="flex items-center justify-center gap-2.5">
              <Radio className="w-4 h-4 text-primary" />
              <span>Explore sound library</span>
            </Link>
          </Button>
        </div>

      </div>
    </section>
  );
}
