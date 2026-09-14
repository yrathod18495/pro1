'use client';

import React from 'react';
import { BrainCircuit, Sparkles, Film, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/landing/reveal';

/**
 * Three cards, one accent. The previous version gave each card its own
 * hue (blue / purple / emerald), which is what makes a page look
 * "rang-birangi" — the colour carried no information, it was just
 * decoration. Now the accent is the single --primary token and the
 * cards are differentiated by their content, which is the part that
 * actually differs.
 */
const whyChooseUsItems = [
  {
    icon: BrainCircuit,
    badge: '70+ languages',
    title: 'State-of-the-art neural AI',
    description:
      'Next-gen acoustic synthesis with automated verification, delivering ultra-realistic voice emotion across 70+ global languages.',
  },
  {
    icon: Sparkles,
    badge: 'Creator craft',
    title: 'Creator-first workflows',
    description:
      'Multi-character script analysis, automatic voice assignment, and timeline sync built for fast-paced video editing.',
  },
  {
    icon: Film,
    badge: 'Indian accents',
    title: 'Tailored for Indian content',
    description:
      'Authentic Hindi, Hinglish, and regional voice profiles with natural pacing, emotion, and dramatic pauses.',
  },
];

export function WhyChooseUsSection() {
  return (
    <section className="w-full py-16 md:py-24 bg-background relative overflow-hidden">
      {/* Ambient wash — one hue, heavily blurred, drifting slowly */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/5 blur-[120px] pointer-events-none -z-10 anim-amb-bloom-slow" />

      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Reveal animation="anim-in-scale" delay={0}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide mb-4">
              <Zap className="w-3.5 h-3.5 anim-pulse-soft" /> Why creators choose us
            </div>
          </Reveal>

          <Reveal animation="anim-in-blur-rise" delay={1}>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground font-headline">
              Built for speed.{' '}
              <br className="hidden sm:inline" />
              Engineered for expression.
            </h2>
          </Reveal>

          <Reveal animation="anim-in-rise" delay={3}>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground font-medium">
              Everything you need to turn a raw script into studio-grade audio in seconds.
            </p>
          </Reveal>

          {/* A rule that draws itself in — a divider that arrives rather
              than just being there. */}
          <Reveal animation="anim-in-line-grow-center" delay={5}>
            <div className="h-px w-24 mx-auto mt-8 bg-primary/30" />
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {whyChooseUsItems.map((item, index) => {
            const IconComponent = item.icon;
            return (
              <Reveal key={item.title} animation="anim-in-rise-scale" delay={index * 2}>
                <div
                  className={cn(
                    'group relative h-full rounded-3xl p-8 bg-card/80 dark:bg-zinc-900/60',
                    'border border-border/80 dark:border-white/10 shadow-sm backdrop-blur-xl',
                    'flex flex-col justify-between overflow-hidden',
                    'anim-surface-lift anim-surface-border anim-surface-sheen anim-surface-reveal-child'
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="p-3.5 rounded-2xl bg-secondary dark:bg-white/5 border border-border/50 anim-surface-border">
                        <IconComponent className="w-7 h-7 text-primary anim-icon-grow" />
                      </div>
                      <span className="text-[10px] font-extrabold tracking-wide text-muted-foreground px-2.5 py-1 rounded-full bg-secondary/80 border border-border/40">
                        {item.badge}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-foreground mb-3">{item.title}</h3>

                    <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                      {item.description}
                    </p>
                  </div>

                  {/* Appears on hover — answers the pointer instead of
                      looping at people unprompted. */}
                  <div className="mt-8 pt-4 border-t border-border/40 flex items-center gap-2 text-xs font-semibold text-primary anim-surface-reveal-target">
                    <span className="anim-surface-rule">Explore capabilities</span>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
