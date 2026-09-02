'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getDisplayUrl } from '@/lib/utils';

/**
 * MaintenanceGuard - The ultimate sentry for the 12Labs node.
 * Hardened for Production: Prevents redirect-to-home on refresh by waiting for Auth sync.
 */
export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { database } = initializeFirebase();
  const router = useRouter();
  const pathname = usePathname();
  
  const [maintenance, setMaintenance] = useState<{ enabled: boolean, endTime: string } | null>(null);
  const [logoUrl, setLogoUrl] = useState('https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png');

  useEffect(() => {
    if (!database) return;

    const maintenanceRef = ref(database, 'settings/maintenance');
    const unsubscribe = onRtdbValue(maintenanceRef, (snapshot) => {
        if (snapshot.exists()) {
            setMaintenance(snapshot.val());
        } else {
            setMaintenance({ enabled: false, endTime: '' });
        }
    });

    const logoRef = ref(database, 'settings/landingPage/masterLogoUrl');
    const unsubLogo = onRtdbValue(logoRef, (snapshot) => {
        const url = snapshot.val();
        if (url) setLogoUrl(getDisplayUrl(url));
    });

    return () => {
        unsubscribe();
        unsubLogo();
    };
  }, [database]);

  const isMaintenanceActive = maintenance?.enabled === true;
  const isAdmin = user?.role === 'admin';

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
  
  // 1. While app is booting up, show a minimal sync screen (Prevents redirects)
  if (maintenance === null || (authLoading && pathname !== '/')) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      );
  }

  // 2. Prevent flashing the home page for non-admins when maintenance is active
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

  // Otherwise, render the app normally
  return <>{children}</>;
}
