'use client';

import React, { useState, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase, type FirebaseServices } from '@/firebase';
import { goOnline } from 'firebase/database';
import { enableNetwork, disableNetwork } from 'firebase/firestore';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const [services, setServices] = useState<FirebaseServices | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const initialized = initializeFirebase();
      setServices(initialized);
    } catch (error) {
      console.error("Failed to initialize Firebase on client:", error);
    }
  }, []);

  // Mobile browsers can suspend Firebase's sockets while the app is in the
  // background. The SDK normally reconnects, but a suspended tab can keep
  // listeners in an offline state until a full page reload. Recover the
  // existing listeners whenever the app returns to the foreground or the
  // browser reports that connectivity is back.
  useEffect(() => {
    if (!services) return;

    let lastRecovery = 0;
    let hiddenAt = 0;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    const FORCE_TOKEN_REFRESH_AFTER_MS = 5 * 60 * 1000; // only for real background stints

    const recoverFirebaseConnection = () => {
      const now = Date.now();
      if (now - lastRecovery < 1000) return;
      lastRecovery = now;

      // A quick tab-switch (a second, a notification swipe, an app switch and
      // straight back) doesn't need a forced token refresh — the token is
      // still valid for up to an hour and Firebase refreshes it on its own
      // before it expires. Forcing it every single time was what triggered a
      // full-screen loading spinner on every brief background/foreground,
      // since it re-fires onIdTokenChanged. Only force it after a real
      // background stint.
      const wasHiddenFor = hiddenAt ? now - hiddenAt : 0;
      const shouldForceTokenRefresh = wasHiddenFor >= FORCE_TOKEN_REFRESH_AFTER_MS;
      hiddenAt = 0;

      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(async () => {
        try {
          if (services.database) {
            goOnline(services.database);
          }

          if (services.firestore) {
            // A plain enableNetwork() is a no-op if the SDK still thinks it's
            // "online" with a corrupted internal stream — which is exactly
            // the state that causes "INTERNAL ASSERTION FAILED" crashes after
            // a background suspension. Force a full teardown + rebuild of the
            // connection instead, so the stream is actually recreated.
            await disableNetwork(services.firestore);
            await enableNetwork(services.firestore);
          }

          // Refresh the token only after a genuinely long background
          // suspension so server actions and Firestore listeners are not
          // using an expired token. This happens silently in the
          // background — it never signs the user out or interrupts what
          // they were doing — and is skipped entirely for brief tab
          // switches so the app doesn't re-sync on every single return.
          if (shouldForceTokenRefresh && services.auth?.currentUser) {
            await services.auth.currentUser.getIdToken(true);
          }
        } catch (error) {
          // A transient offline state is expected; Firebase will retry on its
          // own. Do not interrupt the UI or force a reload.
          console.warn('Firebase foreground recovery deferred:', error);
        }
      }, 250);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recoverFirebaseConnection();
      } else {
        hiddenAt = Date.now();
      }
    };

    window.addEventListener('online', recoverFirebaseConnection);
    window.addEventListener('focus', recoverFirebaseConnection);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', recoverFirebaseConnection);
      window.removeEventListener('focus', recoverFirebaseConnection);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (recoveryTimer) clearTimeout(recoveryTimer);
    };
  }, [services]);

  // Always render the Provider to avoid context errors, but pass nulls until hydrated
  return (
    <FirebaseProvider
      firebaseApp={services?.firebaseApp || null}
      auth={services?.auth || null}
      firestore={services?.firestore || null}
      database={services?.database || null}
    >
      {children}
    </FirebaseProvider>
  );
}