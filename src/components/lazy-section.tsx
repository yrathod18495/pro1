'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, ReactNode } from 'react';

interface LazySectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  minHeight?: string;
  threshold?: number;
  rootMargin?: string;
}

export function LazySection({
  children,
  fallback,
  minHeight = '300px',
  threshold = 0.01,
  // Bumped from 150px: on a fast fling (confirmed via a screen recording —
  // the observer simply can't keep up with a hard scroll before the
  // section is already in view), a bigger buffer means more sections have
  // already started mounting by the time they'd otherwise come on screen.
  rootMargin = '600px',
}: LazySectionProps) {
  const [isIntersected, setIsIntersected] = useState(false);
  // 🔴 FIX: minHeight is a per-section GUESS, and some sections' real
  // height is genuinely variable (e.g. DemoSection renders 1-3 audio demo
  // cards depending on how many an admin has configured in RTDB) — a
  // guess sized for the tallest case leaves a large dead gap under
  // shorter real content, which read as "data is coming in pieces" every
  // bit as much as the original too-small guess did. Once real content is
  // in AND has stopped changing size (settledHeight, below), the box
  // adopts that actual height instead of staying pinned to the guess.
  const [settledHeight, setSettledHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // The height value currently reflected in the box, so each settle knows
  // its OWN delta from whatever was there before — starts at the initial
  // guess (parsed once) so the FIRST settle's delta is measured against
  // that guess, not against itself.
  const lastAppliedHeightRef = useRef<number | null>(null);
  if (lastAppliedHeightRef.current === null) {
    const parsed = parseFloat(minHeight);
    lastAppliedHeightRef.current = Number.isNaN(parsed) ? 0 : parsed;
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersected(true);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin]);

  // Tracks the CONTENT's own natural height (contentRef has no min-height
  // of its own, so it reports the real size regardless of what the outer
  // box is currently pinned to). Only acts once that height has stopped
  // changing for a beat — reacting to every intermediate frame while data
  // is still arriving would just recreate the same "box keeps resizing"
  // jank this file already fixed once, in the opposite direction.
  useEffect(() => {
    if (!isIntersected || typeof ResizeObserver === 'undefined') return;
    const el = contentRef.current;
    if (!el) return;

    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastHeight = -1;

    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (!h || Math.abs(h - lastHeight) < 1) return;
      lastHeight = h;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => setSettledHeight(h), 400);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [isIntersected]);

  // Before intersecting, or before real content has settled: the original
  // guess (prevents the collapse-then-snap-back this file was first fixed
  // for). After settling: the real measured height — smaller OR larger
  // than the guess, whichever content actually needs. Growth past the
  // guess already worked for free via plain CSS min-height; this only
  // changes what happens when content turns out to be SHORTER than
  // guessed, which used to just leave empty space below it.
  const effectiveMinHeight = settledHeight != null ? `${settledHeight}px` : minHeight;

  // 🔴 FIX: CSS scroll anchoring (the browser's own compensation for
  // off-screen layout shifts) turned out NOT reliable enough on a real
  // slow connection — on a fast link, one section settles almost
  // immediately after mount and anchoring tracks the single small
  // adjustment fine; on a genuinely slow one (confirmed against a
  // throttled-network repro), several sections above the user's current
  // position can each settle minutes apart, at different times, and the
  // browser doesn't reliably keep re-anchoring across that whole span —
  // which is exactly "my scroll position changes on its own, I end up
  // looking at different content than I was."
  //
  // This replaces that implicit behavior with an explicit, guaranteed
  // one: whenever a section that starts ABOVE the current viewport
  // (rect.top < 0 — the user has already scrolled past where it begins)
  // changes size, immediately scroll by the exact same delta, with no
  // animation, in the same paint frame as the resize — so nothing the
  // user is actually looking at moves by even a pixel. A section that's
  // still visible or below the viewport resizes normally (with the CSS
  // transition), since the user can see that happen and there's nothing
  // to compensate for.
  useLayoutEffect(() => {
    if (settledHeight == null) return;
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') return;

    const prevHeight = lastAppliedHeightRef.current ?? settledHeight;
    const delta = settledHeight - prevHeight;
    lastAppliedHeightRef.current = settledHeight;
    if (!delta) return;

    const rect = container.getBoundingClientRect();
    if (rect.top < 0) {
      const prevTransition = container.style.transition;
      container.style.transition = 'none';
      container.style.minHeight = `${settledHeight}px`;
      window.scrollBy(0, delta);
      // Flush the above before transitions can apply to anything else —
      // otherwise a later, genuinely-visible resize could inherit this
      // "none" and lose its intended animation.
      void container.offsetHeight;
      container.style.transition = prevTransition;
    }
  }, [settledHeight]);

  return (
    // 🔧 Scroll-jump fix: this used to switch to `minHeight: 'auto'` the
    // INSTANT the section intersected — in the same render, before the
    // real content (often its own separately-downloaded next/dynamic
    // chunk) had actually mounted. That collapsed the box to ~0px for a
    // moment and then snapped back out once the content arrived, which is
    // exactly the kind of sudden layout shift that throws off your scroll
    // position mid-scroll (classic CLS). Keeping `minHeight` as a real
    // CSS min-height means the box can still grow if real content is
    // taller, but it can never collapse smaller than the space we've
    // reserved for it at that moment — settledHeight (above) is what lets
    // that reserved amount itself shrink, smoothly (transition below),
    // once real content says it's safe to.
    <div
      ref={containerRef}
      style={{ minHeight: effectiveMinHeight, transition: 'min-height 300ms ease' }}
      className="w-full"
    >
      {isIntersected ? (
        <div ref={contentRef}>{children}</div>
      ) : (
        fallback || (
          // 🔴 A screen recording showed this: on a fast scroll, sections
          // that hadn't mounted yet weren't just "not there for a moment" —
          // bg-muted/5 (5% opacity) is close enough to the page background
          // that it reads as a blank/broken gap, not a loading state. A
          // real, visibly-pulsing skeleton (bg-muted, same as the rest of
          // the site's loading states) makes it obviously "still loading"
          // instead of looking like the page hung.
          <div
            className="w-full bg-muted animate-pulse rounded-[2.5rem] flex items-center justify-center text-muted-foreground/50 text-sm font-medium"
            style={{ height: minHeight }}
          >
            Loading Section...
          </div>
        )
      )}
    </div>
  );
}
