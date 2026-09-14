'use client';

import React, { useState, useEffect, useRef, ReactNode } from 'react';

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
  rootMargin = '150px',
}: LazySectionProps) {
  const [isIntersected, setIsIntersected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    // 🔧 Scroll-jump fix: this used to switch to `minHeight: 'auto'` the
    // INSTANT the section intersected — in the same render, before the
    // real content (often its own separately-downloaded next/dynamic
    // chunk) had actually mounted. That collapsed the box to ~0px for a
    // moment and then snapped back out once the content arrived, which is
    // exactly the kind of sudden layout shift that throws off your scroll
    // position mid-scroll (classic CLS). Keeping `minHeight` as a real
    // CSS min-height — permanently, not just before intersecting — means
    // the box can still grow if real content is taller, but it can never
    // collapse smaller than the space we already reserved for it, so nothing
    // suddenly moves while you're scrolling. Once you've scrolled past a
    // section once, its content is already mounted, so there's nothing
    // left to collapse — which is exactly why it felt "fine after one full
    // scroll" before this fix.
    <div ref={containerRef} style={{ minHeight }} className="w-full">
      {isIntersected ? (
        children
      ) : (
        fallback || (
          <div 
            className="w-full bg-muted/5 animate-pulse rounded-[2.5rem] border border-muted/50 flex items-center justify-center text-muted-foreground/30 text-sm font-medium"
            style={{ height: minHeight }}
          >
            Loading Section...
          </div>
        )
      )}
    </div>
  );
}
