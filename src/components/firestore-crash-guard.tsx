'use client';

import React from 'react';
import { getFirestore, disableNetwork, enableNetwork } from 'firebase/firestore';
import { getApps } from 'firebase/app';
import { reportClientError } from '@/lib/report-client-error';

/**
 * Firestore JS SDK has a known long-standing bug where a browser tab that
 * gets backgrounded/suspended (mobile Chrome, WebView wrappers, etc.) for
 * even a short while can come back with a corrupted internal stream state.
 * When that happens the SDK throws:
 *
 *   FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state (ID: ...)
 *
 * This is thrown deep inside the SDK's snapshot-processing internals and
 * surfaces to React as a render-time exception, which — with no boundary in
 * place — bubbles all the way up to Next.js's global-error.tsx. That wipes
 * the entire app (full "Something went wrong" screen), which feels nothing
 * like a native app: the user loses their place and has to start over.
 *
 * This boundary catches specifically that error signature, recycles the
 * Firestore connection (a full disableNetwork -> enableNetwork teardown is
 * required to actually reset the corrupted stream — a plain enableNetwork()
 * is a no-op), and then re-renders the same children in place. Anything
 * that isn't this specific Firestore bug is re-thrown so real bugs still
 * surface normally instead of being silently hidden.
 */
function isRecoverableFirestoreAssertion(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /FIRESTORE\b.*INTERNAL ASSERTION FAILED/i.test(message);
}

interface State {
  hasError: boolean;
}

export class FirestoreCrashGuard extends React.Component<{ children: React.ReactNode }, State> {
  private recovering = false;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> | null {
    if (isRecoverableFirestoreAssertion(error)) {
      // Recoverable: swallow it here, recovery kicks off in componentDidCatch.
      return { hasError: true };
    }
    // Not our bug — let it propagate to the real error boundary.
    throw error;
  }

  componentDidCatch(error: unknown) {
    if (!isRecoverableFirestoreAssertion(error)) return;

    reportClientError('FirestoreCrashGuard: recovered internal assertion', error);

    if (this.recovering) return;
    this.recovering = true;

    (async () => {
      try {
        const app = getApps()[0];
        if (app) {
          const firestore = getFirestore(app);
          // Force a real teardown + rebuild of the stream instead of a
          // no-op enableNetwork() call, or the same corrupted state can
          // immediately throw again on the next snapshot event.
          await disableNetwork(firestore);
          await enableNetwork(firestore);
        }
      } catch {
        // Best-effort — even if this fails, remounting children below will
        // trigger listeners to resubscribe on their own.
      } finally {
        this.recovering = false;
        // Re-render the exact same screen the user was on — nothing is
        // reloaded, no route change, no re-auth.
        this.setState({ hasError: false });
      }
    })();
  }

  render() {
    if (this.state.hasError) {
      // Render nothing for the brief moment recovery is in-flight (usually a
      // few hundred ms) instead of re-mounting the same children — if we put
      // them straight back up before the connection is actually rebuilt, the
      // same corrupted stream can throw again immediately in a tight loop.
      // A blank frame this short is imperceptible and still far better than
      // a full-page "Something went wrong" reset.
      return null;
    }
    return this.props.children;
  }
}
