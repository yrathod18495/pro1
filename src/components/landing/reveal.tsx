'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: React.ReactNode;
  /**
   * Any entrance utility from motion.css — e.g. "anim-in-rise",
   * "anim-in-blur-rise", "anim-in-wipe-up". Defaults to a plain rise.
   */
  animation?: string;
  /** Stagger index. Maps to the .anim-d-* delay steps (0–11). */
  delay?: number;
  /** How much of the element must be visible before it animates. */
  threshold?: number;
  /** Re-run every time it scrolls back into view. Off by default. */
  repeat?: boolean;
  className?: string;
  as?: 'div' | 'section' | 'span' | 'li';
}

/**
 * Holds its child in the "before" state ([data-reveal="out"], which
 * motion.css pauses) until it scrolls into view, then flips to "in" and
 * lets the animation run once.
 *
 * The point is restraint: without this, 100+ animation classes would all
 * fire on page load and the page would look like it was shaking itself
 * awake. With it, each section resolves as you reach it and then sits
 * still.
 */
export function Reveal({
  children,
  animation = 'anim-in-rise',
  delay = 0,
  threshold = 0.15,
  repeat = false,
  className,
  as = 'div',
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If the browser can't observe, just show the content — never leave
    // it stuck at opacity 0.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (!repeat) observer.unobserve(el);
        } else if (repeat) {
          setShown(false);
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, repeat]);

  const Tag = as as any;
  const delayClass = delay > 0 ? `anim-d-${Math.min(delay, 11)}` : undefined;

  return (
    <Tag
      ref={ref as any}
      data-reveal={shown ? 'in' : 'out'}
      className={cn(animation, delayClass, className)}
    >
      {children}
    </Tag>
  );
}

/**
 * Convenience wrapper for a list of siblings that should resolve one
 * after another (feature cards, pricing tiers, FAQ rows). Each child
 * gets the next delay step automatically instead of you hand-numbering
 * a dozen `delay` props.
 */
export function RevealGroup({
  children,
  animation = 'anim-in-rise',
  startDelay = 0,
  step = 1,
  className,
}: {
  children: React.ReactNode;
  animation?: string;
  startDelay?: number;
  step?: number;
  className?: string;
}) {
  return (
    <>
      {React.Children.map(children, (child, i) => (
        <Reveal animation={animation} delay={startDelay + i * step} className={className}>
          {child}
        </Reveal>
      ))}
    </>
  );
}
