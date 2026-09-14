'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useRouter, usePathname } from 'next/navigation';
import { getDisplayUrl } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * MaintenanceGuard - The ultimate sentry for the 12Labs node.
 * Hardened for Production: Prevents redirect-to-home on refresh by waiting for Auth sync.
 *
 * 🔧 Update: this used to block the ENTIRE app behind a bare spinner until
 * two Firebase reads finished, with no timeout — so a slow network or a
 * dropped RTDB listener meant an infinite spinner. It now:
 *   1. Renders instantly from the last-known cached result (localStorage)
 *      instead of starting from nothing every time.
 *   2. Times out after a few seconds and falls back to "no maintenance"
 *      if Firebase hasn't answered yet, while the live listener keeps
 *      running in the background and will correct the state the moment
 *      real data arrives.
 *   3. Shows a branded skeleton instead of a plain spinner for the rare
 *      true-first-visit case where there's no cache yet.
 */

const MAINTENANCE_CACHE_KEY = '12labs_maintenance_cache_v1';
const LOGO_CACHE_KEY = '12labs_logo_cache_v1';
const RTDB_TIMEOUT_MS = 3000;
const DEFAULT_LOGO_URL = 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png';

type MaintenanceState = { enabled: boolean; endTime: string; mode?: string };

function readCachedMaintenance(): MaintenanceState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MAINTENANCE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as MaintenanceState) : null;
  } catch {
    return null;
  }
}

function writeCachedMaintenance(value: MaintenanceState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MAINTENANCE_CACHE_KEY, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private browsing, etc) — non-fatal,
    // we just skip caching this round.
  }
}

function readCachedLogo(): string {
  if (typeof window === 'undefined') return DEFAULT_LOGO_URL;
  try {
    return localStorage.getItem(LOGO_CACHE_KEY) || DEFAULT_LOGO_URL;
  } catch {
    return DEFAULT_LOGO_URL;
  }
}

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { database } = initializeFirebase();
  const router = useRouter();
  const pathname = usePathname();

  // Seed from whatever we learned last time, so a repeat visit never has to
  // sit on a blank spinner while we wait on a fresh network round trip.
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(() => readCachedMaintenance());
  const [logoUrl, setLogoUrl] = useState<string>(() => readCachedLogo());

  useEffect(() => {
    if (!database) return;

    // Safety net: don't let a slow/broken connection hang the whole app
    // forever behind this gate. If nothing has come back within
    // RTDB_TIMEOUT_MS, assume "no maintenance" (or keep whatever cached
    // value we already have) and let real content render. The listener
    // below is still live and will correct this the instant data arrives.
    const timeout = setTimeout(() => {
      setMaintenance((current) => current ?? { enabled: false, endTime: '' });
    }, RTDB_TIMEOUT_MS);

    const maintenanceRef = ref(database, 'settings/maintenance');
    const unsubscribe = onRtdbValue(maintenanceRef, (snapshot) => {
      clearTimeout(timeout);
      const value: MaintenanceState = snapshot.exists()
        ? snapshot.val()
        : { enabled: false, endTime: '' };
      setMaintenance(value);
      writeCachedMaintenance(value);
    });

    const logoRef = ref(database, 'settings/landingPage/masterLogoUrl');
    const unsubLogo = onRtdbValue(logoRef, (snapshot) => {
      const url = snapshot.val();
      if (url) {
        const displayUrl = getDisplayUrl(url);
        setLogoUrl(displayUrl);
        try {
          localStorage.setItem(LOGO_CACHE_KEY, displayUrl);
        } catch {
          // non-fatal
        }
      }
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
      unsubLogo();
    };
  }, [database]);

  const isMaintenanceActive = maintenance?.enabled === true && maintenance?.mode !== 'toolsOnly';
  const isAdmin = user?.role === 'admin';

  // Tools-only maintenance: the site stays up, but every tool ROUTE is
  // blocked so users can still reach their library, history and downloads.
  // The list is the path prefixes that are "tools" (generation/creation);
  // everything else — library, account, store, buy-credits — stays open.
  const TOOL_ROUTE_PREFIXES = [
    '/studio', '/music-studio',
    '/script-generator', '/voice-cloning', '/thumbnail-generator',
    '/sound-search', '/pdf-tools',
    '/youtube-thumbnail-downloader', '/clone-studio',
  ];
  const isToolsOnlyMaintenance = maintenance?.enabled === true && maintenance?.mode === 'toolsOnly';
  const isOnToolRoute = TOOL_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  const blockForToolsOnly = isToolsOnlyMaintenance && isOnToolRoute && !isAdmin;

  useEffect(() => {
    // CRITICAL: Wait for both Maintenance state and Auth state to be stable before redirecting
    if (maintenance === null || authLoading) return;

    // REDIRECT LOGIC
    if (isMaintenanceActive) {
        // SCENARIO 1: Non-admins on standard pages go to /maintenance
        if (!isAdmin && pathname !== '/maintenance') {
            router.replace('/maintenance');
        }
        // SCENARIO 2: Admins on /maintenance should be sent back to home
        if (isAdmin && pathname === '/maintenance') {
            router.replace('/');
        }
    } else {
        // SCENARIO 3: Maintenance is OFF. Kick everyone out of /maintenance
        if (pathname === '/maintenance') {
            router.replace('/');
        }
    }
  }, [isMaintenanceActive, isAdmin, pathname, router, maintenance, authLoading]);

  // --- RENDERING SAFETY ---

  // 1. While app is booting up with NO cached state at all (true first-ever
  //    visit) and auth hasn't settled, show a branded skeleton instead of a
  //    bare spinner — same layout shape as the real page, so it doesn't
  //    feel like a stall.
  if (maintenance === null || (authLoading && pathname !== '/')) {
      return (
        <div className="flex min-h-screen flex-col bg-background">
            <div className="h-16 border-b flex items-center px-4 gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <div className="ml-auto flex gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-8 w-20 rounded-full" />
                </div>
            </div>
            <div className="flex-1 px-4 py-6 space-y-4 max-w-3xl w-full mx-auto">
                <Skeleton className="h-44 w-full rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
        </div>
      );
  }

  // 2. Prevent flashing the home page for non-admins when FULL maintenance is active
  if (isMaintenanceActive && !isAdmin && pathname !== '/maintenance') {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse scale-150" />
                    <div className="relative z-10 w-20 h-20 bg-background rounded-[1.5rem] border-2 border-primary/5 flex items-center justify-center overflow-hidden p-3">
                        <img src={logoUrl} alt="12Labs" className="w-full h-full object-contain animate-pulse" />
                    </div>
                </div>
                <div className="text-center space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">System Synchronizing</p>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Checking Production Mode Status...</p>
                </div>
            </div>
        </div>
    );
  }

  // 3. Tools-only maintenance: on a tool route, show a paused screen but
  //    keep the header/nav so the user can walk to their library and
  //    download past work. Non-tool routes render normally below.
  if (blockForToolsOnly) {
    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center bg-background px-6">
            <div className="flex flex-col items-center gap-6 text-center max-w-md animate-in fade-in duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-2xl animate-pulse scale-150" />
                    <div className="relative z-10 w-20 h-20 bg-background rounded-[1.5rem] border-2 border-amber-500/10 flex items-center justify-center overflow-hidden p-3">
                        <img src={logoUrl} alt="12Labs" className="w-full h-full object-contain" />
                    </div>
                </div>
                <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500">Tools Paused</p>
                    <h1 className="text-2xl font-black uppercase tracking-tight">Under Maintenance</h1>
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                        Our studio tools are briefly paused for maintenance. Your projects
                        and history are safe — you can still open and download your past
                        work from your library.
                    </p>
                </div>
                <a
                    href="/history"
                    className="h-12 px-6 flex items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-lg"
                >
                    Go to My History
                </a>
            </div>
        </div>
    );
  }

  // Otherwise, render the app normally
  return <>{children}</>;
}
