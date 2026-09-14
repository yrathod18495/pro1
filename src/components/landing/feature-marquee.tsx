'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * A drifting field of feature capsules under the hero.
 *
 * WHAT GOES IN HERE — and what never does.
 * Every phrase below is a BENEFIT the customer receives. None of them
 * name a vendor, a model, a provider, an API, an architecture, a
 * pipeline, or anything about how the product is built internally.
 * That's deliberate: "one-click voice generation" tells someone what
 * they get; naming the engine behind it tells competitors how to copy
 * it and tells customers nothing useful. If you add rows later, keep to
 * outcomes — capability, speed, support, price, reliability.
 *
 * Four rows drift at different speeds and in alternating directions, so
 * the capsules read as a loose crowd — some ahead, some behind — rather
 * than four tidy conveyor belts moving in lockstep.
 */

const ROW_1 = [
  'One-click voice generation ⚡',
  'Instant credit adjustment',
  '24×7 help & support',
  'Studio-grade output',
  'No watermarks, ever',
  '70+ languages',
  'Multi-character scripts',
  'Emotion & tone control',
  'Commercial rights included',
  'Pay only for what you use',
  'Unlimited downloads',
  'Natural Hindi & Hinglish',
];

const ROW_2 = [
  'Bulk generation 🚀',
  'Automatic voice assignment',
  'Regional Indian accents',
  'Refunds on failed lines',
  'Credits never expire',
  'Script writing built in',
  'Thumbnail generator',
  'Background music library',
  'Instant delivery',
  'No subscription lock-in',
  'Works on mobile & desktop',
  'Preview before you spend',
];

const ROW_3 = [
  'Full project history 📂',
  'Re-edit any past project',
  'Voice replacement in one tap',
  'Long manuscripts supported',
  'Precise pacing & pauses',
  'Sound effects library',
  'Team-friendly workflows',
  'Export ready-to-upload audio',
  'SEO kit for your videos',
  'Priority queue for pro users',
  'Zero setup required',
  'Transparent credit pricing',
];

const ROW_4 = [
  'Human-like delivery 🎙️',
  'Consistent character voices',
  'Automatic quality checks',
  'Fast turnaround on long scripts',
  'Free credits to start',
  'Secure payments',
  'Promo codes & bonuses',
  'Creator-first pricing',
  'Regular new voices added',
  'Simple, honest billing',
  'Responsive support team',
  'Built for Indian creators',
];

function Capsule({ label }: { label: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap select-none',
        'px-4 py-2 rounded-full',
        'text-[13px] sm:text-sm font-semibold',
        // A single light purple family — tinted background, matching
        // border, deeper text. One hue, three weights.
        'bg-violet-500/[0.07] dark:bg-violet-400/10',
        'border border-violet-500/15 dark:border-violet-300/15',
        'text-violet-900/80 dark:text-violet-100/85'
      )}
    >
      {label}
    </span>
  );
}

function MarqueeRow({
  items,
  reverse = false,
  duration,
  className,
}: {
  items: string[];
  reverse?: boolean;
  duration: number;
  className?: string;
}) {
  return (
    <div className={cn('flex overflow-hidden', className)} aria-hidden="true">
      <div
        className={cn(
          'flex items-center gap-3 shrink-0',
          reverse ? 'anim-amb-marquee-x-rev' : 'anim-amb-marquee-x'
        )}
        style={{ animationDuration: `${duration}s` }}
      >
        {/* Rendered twice so the loop has no visible seam — the second
            copy is already on screen when the first scrolls off. */}
        {[...items, ...items].map((label, i) => (
          <Capsule key={`${label}-${i}`} label={label} />
        ))}
      </div>
    </div>
  );
}

export function FeatureMarquee() {
  return (
    <div className="relative w-full py-2">
      {/* Edges fade out so capsules enter and leave rather than being
          clipped mid-word at the viewport border. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28 z-10 bg-gradient-to-l from-background to-transparent" />

      {/* Four rows, four speeds, alternating directions. */}
      <div className="flex flex-col gap-3">
        <MarqueeRow items={ROW_1} duration={46} />
        <MarqueeRow items={ROW_2} duration={62} reverse />
        <MarqueeRow items={ROW_3} duration={54} />
        <MarqueeRow items={ROW_4} duration={70} reverse className="hidden sm:flex" />
      </div>

      {/* The visible list is decorative and aria-hidden, so the same
          information is offered once, plainly, to screen readers. */}
      <p className="sr-only">
        12Labs features: one-click voice generation, instant credit adjustment, 24x7 help
        and support, 70+ languages, multi-character scripts, commercial rights included,
        credits that do not expire, script writing, thumbnail generation, a background
        music library, and full project history.
      </p>
    </div>
  );
}
