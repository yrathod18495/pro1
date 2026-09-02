
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

        const contextualError = new FirestorePermissionError(
          { operation: 'list', path },
          err
        );

        setError(contextualError);
        setData(null);
        setIsLoading(false);
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [target]);

  return { data, isLoading, error };
}
