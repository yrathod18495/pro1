
'use client';

import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  className?: string;
}

/**
 * A professional verified badge component featuring a 24-point scalloped seal
 * similar to Instagram and Twitter badges.
 */
export function VerifiedBadge({ className }: VerifiedBadgeProps) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      aria-label="Verified account" 
      className={cn("text-primary fill-current h-[1.1em] w-[1.1em] inline-block align-text-bottom", className)}
    >
      <path d="M22.5 12.5c0-1.58-.88-2.95-2.18-3.65c.54-1.53.2-3.23-1.04-4.48c-1.24-1.24-2.95-1.58-4.48-1.04c-.7-1.3-2.07-2.18-3.65-2.18s-2.95.88-3.65 2.18c-1.53-.54-3.23-.2-4.48 1.04c-1.24 1.24-1.58 2.95-1.04 4.48c-1.3.7-2.18 2.07-2.18 3.65c0 1.58.88 2.95 2.18 3.65c-.54 1.53-.2 3.23 1.04 4.48c1.24 1.24 2.95 1.58 4.48 1.04c.7 1.3 2.07 2.18 3.65 2.18s2.95-.88 3.65-2.18c1.53.54 3.23.2 4.48-1.04c1.24-1.24 1.58-2.95 1.04-4.48c1.3-.7 2.18-2.07 2.18-3.65zM10 17.5l-3.5-3.5l1.41-1.41L10 14.67l6.59-6.59L18 9.5l-8 8z" />
    </svg>
  );
}
