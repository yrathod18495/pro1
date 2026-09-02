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
    <div ref={containerRef} style={{ minHeight: isIntersected ? 'auto' : minHeight }} className="w-full">
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
