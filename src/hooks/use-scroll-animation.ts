
'use client';

import { useEffect, useRef, useState } from 'react';

interface ScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useScrollAnimation(options: ScrollAnimationOptions = {}) {
  const {
    threshold = 0.1,
    // 🔴 This had no rootMargin at all (defaults to '0px'), so an element
    // only started its entrance animation once 10% of it was ALREADY on
    // screen — with zero buffer. On a fast scroll (audio demo cards,
    // the showcase video block) that reads as "blank container, then a
    // sudden pop" — the same class of bug fixed in Reveal, but this is a
    // separate hook so that fix never touched it. Triggering 300px early
    // means it's already visible by the time it's actually on screen.
    rootMargin = '300px 0px -5% 0px',
    triggerOnce = true,
  } = options;
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce && ref.current) {
            observer.unobserve(ref.current);
          }
        }
      },
      { threshold, rootMargin }
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [ref, threshold, rootMargin, triggerOnce]);

  return { ref, isVisible };
}
