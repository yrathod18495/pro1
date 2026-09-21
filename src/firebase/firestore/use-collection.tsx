
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
  DocumentReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' and 'ref' field to a given type T. */
export type WithIdAndRef<T> = T & { id: string; ref: DocumentReference };

export interface UseCollectionResult<T> {
  data: WithIdAndRef<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

// Global throttle tracker to prevent rapid re-subscriptions across the app
const subscriptionTracker: Record<string, { count: number; lastTime: number }> = {};

/**
 * 🔒 SAFE useCollection hook with QUOTA SHIELD
 */
export function useCollection<T = any>(
  target:
    | (Query<DocumentData> & { __memo?: boolean })
    | (CollectionReference<DocumentData> & { __memo?: boolean })
    | null
    | undefined,
): UseCollectionResult<T> {
  const [data, setData] = useState<WithIdAndRef<T>[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  const subscribeCount = useRef(0);

  useEffect(() => {
    if (!target) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // --- QUOTA SHIELD LOGIC ---
    // If a component tries to re-subscribe too fast, we block it to save reads.
    const now = Date.now();
    const queryKey = (target as any)._query?.path?.canonicalString?.() || 'unknown';
    const track = subscriptionTracker[queryKey] || { count: 0, lastTime: 0 };

    if (now - track.lastTime < 2000) { // Within 2 seconds
        track.count++;
        if (track.count > 3) {
            console.error(`[QuotaShield] Blocked infinite read loop on path: ${queryKey}. Please check for missing useMemo on your query.`);
            setIsLoading(false);
            return;
        }
    } else {
        track.count = 1;
    }
    track.lastTime = now;
    subscriptionTracker[queryKey] = track;

    if (!target.__memo) {
      console.warn(
        `[useCollection] Query on ${queryKey} is NOT memoized. This wastes reads. Wrap your query in useMemoFirebase.`
      );
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      target,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: WithIdAndRef<T>[] = snapshot.docs.map((doc) => ({
          ...(doc.data() as T),
          id: doc.id,
          ref: doc.ref,
        }));

        setData(results);
        setIsLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        const path =
          target.type === 'collection'
            ? (target as CollectionReference).path
            : target.type === 'query'
            ? (target as any)._query?.path?.canonicalString?.() ?? 'unknown/query'
            : 'unknown/path';

        // 🚨 err.code is NOT always 'permission-denied'. A missing composite
        // index throws 'failed-precondition' (with a console link to create
        // it), a flaky connection throws 'unavailable', hitting daily quota
        // throws 'resource-exhausted', etc. Previously every one of these
        // was wrapped and reported as a "Firestore Permission Error" no
        // matter what — which sends whoever's debugging straight at
        // security rules for problems the rules had nothing to do with.
        // Always log the real code so it's never silently lost.
        console.error(
          `[useCollection] onSnapshot error on ${path} — code: ${err.code}, message: ${err.message}`
        );

        const contextualError = new FirestorePermissionError(
          { operation: 'list', path },
          err
        );

        setError(contextualError);
        setData(null);
        setIsLoading(false);

        // 🔴 FIX: this used to only emit when err.code === 'permission-denied',
        // which stopped mislabeling but also meant every OTHER kind of
        // error (failed-precondition/missing-index, unavailable,
        // resource-exhausted...) never reached the Telegram bot at all —
        // silently visible only in whoever's own browser console happened
        // to be open. That's strictly worse: a real, actionable error
        // (like a missing index) now goes unreported instead of just
        // being mislabeled. Always emit; FirebaseErrorListener picks the
        // right title/label from err.code instead of us deciding here
        // whether it's "worth" reporting.
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [target]);

  return { data, isLoading, error };
}
