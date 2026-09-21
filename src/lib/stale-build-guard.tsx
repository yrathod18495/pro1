'use client';

import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

// 🔴 FIX: "An unexpected response was received from the server." (and its
// sibling "Failed to find Server Action") are Next.js's OWN built-in errors
// from the server-actions client runtime — thrown whenever a tab that
// loaded an older build calls a Server Action whose hashed action-ID no
// longer matches what the (now redeployed) server expects. Every call site
// across the app was catching this, toasting a generic failure (or nothing
// at all), and reporting it to Telegram individually — so users on a stale
// tab saw random features (follow, like, product loads, profile sync...)
// silently break with no indication a simple refresh would fix it.
//
// This is deliberately a narrow substring match, not a catch-all for any
// network/server error — a false positive here would nag a user to reload
// over an unrelated, real failure.
const STALE_BUILD_PATTERNS = [
    'An unexpected response was received from the server',
    'Failed to find Server Action',
];

export function isStaleBuildError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? '');
    return STALE_BUILD_PATTERNS.some((p) => message.includes(p));
}

let alreadyPrompted = false;

// One sticky toast per tab, no matter how many separate call sites hit this
// — once the user has been told to refresh, repeating it for every other
// background action that also fails the same way is just noise.
export function notifyStaleBuildIfNeeded(error: unknown): void {
    if (alreadyPrompted || !isStaleBuildError(error)) return;
    alreadyPrompted = true;

    toast({
        title: 'New Version Available',
        description: "This tab is running an older build of the app — some actions may silently fail until you refresh.",
        duration: 1000 * 60 * 60,
        action: (
            <Button
                variant="default"
                size="sm"
                className="font-black uppercase text-[10px] tracking-widest bg-primary text-white hover:bg-primary/90"
                onClick={() => window.location.reload()}
            >
                Refresh Now
            </Button>
        ),
    });
}
