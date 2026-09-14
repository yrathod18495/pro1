'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { User } from '@/lib/types';
import { ArrowRight, Gift, Rocket } from 'lucide-react';
import { Reveal } from '@/components/landing/reveal';

export function FinalCtaSection({ user }: { user: User | null }) {
  return (
    <section className="relative w-full py-16 md:py-24 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary/10 blur-[100px] pointer-events-none -z-10 anim-amb-bloom-slow" />

      <div className="container px-4 md:px-6 text-center mx-auto">
        <Reveal animation="anim-in-settle-scale">
          <div className="max-w-3xl mx-auto p-8 sm:p-14 rounded-3xl bg-card/80 dark:bg-zinc-900/80 border border-primary/20 dark:border-white/10 shadow-2xl backdrop-blur-2xl relative overflow-hidden">
            {/* Top rule draws itself across the card once, then rests. */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary anim-in-line-grow anim-d-4" />

            <div className="flex justify-center mb-6">
              {/* The icon scales and lifts on hover. It does NOT rotate —
                  a tilted rocket in a tilted box reads as a mistake, not
                  as motion. */}
              <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary anim-surface-grow anim-surface-border">
                <Rocket className="h-10 w-10 text-primary anim-pulse-nudge-up" />
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground font-headline anim-in-rise anim-d-2">
                Ready to accelerate your content?
              </h2>
              <p className="text-base sm:text-xl text-muted-foreground font-medium max-w-xl mx-auto leading-relaxed anim-in-rise anim-d-4">
                Join thousands of Indian creators using 12Labs to produce high-impact
                voiceovers and scripts in seconds.
              </p>
            </div>

            <div className="flex flex-col items-center gap-5 pt-8">
              <Button
                asChild
                size="lg"
                className="h-16 px-10 text-lg font-bold rounded-full shadow-xl shadow-primary/25 bg-primary hover:bg-primary text-primary-foreground border-none group w-full sm:w-auto anim-in-rise anim-d-6 anim-surface-lift anim-surface-press anim-surface-sheen anim-surface-focus"
              >
                <Link
                  href={user ? '/studio' : '/login'}
                  prefetch={false}
                  className="flex items-center justify-center gap-3"
                >
                  <span>{user ? 'Go to Voice Studio' : 'Create free account'}</span>
                  <ArrowRight className="h-5 w-5 anim-icon-shift" />
                </Link>
              </Button>

              {!user && (
                <div className="flex items-center gap-2 text-primary font-bold text-sm bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20 anim-pulse-badge-in anim-d-8">
                  <Gift className="h-4 w-4 anim-pulse-soft" />
                  <span>Get 2,000 free credits instantly</span>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
