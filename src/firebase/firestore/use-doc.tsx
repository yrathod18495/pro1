'use client';
    
import { useState, useEffect } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { WithIdAndRef } from './use-collection';

/**
 * Interface for the return value of the useDoc hook.
 * @template T Type of the document data.
 */
export interface UseDocResult<T> {
  data: WithIdAndRef<T> | null; // Document data with ID and Ref, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/**
 * React hook to subscribe to a single Firestore document in real-time.
 * Handles nullable references.
 * 
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * use useMemo to memoize it per React guidence.  Also make sure that it's dependencies are stable
 * references
 *
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {DocumentReference<DocumentData> | null | undefined} docRef -
 * The Firestore DocumentReference. Waits if null/undefined.
 * @returns {UseDocResult<T>} Object with data, isLoading, error.
 */
export function useDoc<T = any>(
  memoizedDocRef: DocumentReference<DocumentData> | null | undefined,
): UseDocResult<T> {
  type StateDataType = WithIdAndRef<T> | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!memoizedDocRef) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    // Optional: setData(null); // Clear previous data instantly

    const unsubscribe = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setData({ ...(snapshot.data() as T), id: snapshot.id, ref: snapshot.ref });
        } else {
          // Document does not exist
          setData(null);
        }
        setError(null); // Clear any previous error on successful snapshot (even if doc doesn't exist)
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        // Same issue as use-collection.tsx: err.code isn't always
        // 'permission-denied' (missing index, offline, quota, etc). Log the
        // real code/message so it's never lost.
        console.error(
          `[useDoc] onSnapshot error on ${memoizedDocRef.path} — code: ${error.code}, message: ${error.message}`
        );

        const contextualError = new FirestorePermissionError({
          operation: 'get',
          path: memoizedDocRef.path,
        }, error)

        setError(contextualError)
        setData(null)
        setIsLoading(false)

        // 🔴 FIX: always emit, same reasoning as use-collection.tsx — gating
        // this on err.code === 'permission-denied' meant real errors like a
        // missing index went completely unreported to Telegram, not just
        // mislabeled. FirebaseErrorListener titles it correctly from the
        // real code instead of us filtering here.
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [memoizedDocRef]); // Re-run if the memoizedDocRef changes.

  return { data, isLoading, error };
}
