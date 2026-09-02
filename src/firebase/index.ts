'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, Firestore } from 'firebase/firestore';
import { getDatabase, Database } from 'firebase/database';

// CRITICAL: Explicit side-effect imports for Next.js 15 bundle registration
import 'firebase/auth';
import 'firebase/firestore';
import 'firebase/database';

import { firebaseConfig } from '@/firebase/config';
import { reportClientError } from '@/lib/report-client-error';

export interface FirebaseServices {
  firebaseApp: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
  database: Database | null;
}

// Global singletons to prevent multiple initializations
let cachedApp: FirebaseApp | null = null;
let cachedFirestore: Firestore | null = null;
let cachedAuth: Auth | null = null;
let cachedDatabase: Database | null = null;

/**
 * Live Firebase initialization.
 * Uses a singleton pattern to ensure consistent instances across the application.
 */
export function initializeFirebase(): FirebaseServices {
  if (typeof window === 'undefined') {
    return { firebaseApp: null, auth: null, firestore: null, database: null };
  }

  try {
    if (!cachedApp) {
      const apps = getApps();
      cachedApp = apps.length > 0 ? apps[0] : initializeApp(firebaseConfig);
    }

    if (!cachedFirestore) {
      try {
        // NOTE: experimentalForceLongPolling and experimentalAutoDetectLongPolling
        // are mutually exclusive — Firestore throws if both are set. AutoDetect
        // is the safer choice: it falls back to long polling automatically in
        // proxied/sandboxed environments without forcing it everywhere.
        cachedFirestore = initializeFirestore(cachedApp, {
          experimentalAutoDetectLongPolling: true,
        });
      } catch (e) {
            reportClientError('src/firebase/index.ts:50', e);
        // If already initialized, use getFirestore to retrieve the existing instance
        cachedFirestore = getFirestore(cachedApp);
      }
    }

    if (!cachedAuth) cachedAuth = getAuth(cachedApp);
    if (!cachedDatabase) cachedDatabase = getDatabase(cachedApp);

    return {
      firebaseApp: cachedApp,
      auth: cachedAuth,
      firestore: cachedFirestore,
      database: cachedDatabase,
    };
  } catch (error) {
    console.error("Firebase live initialization failed:", error);
    return { firebaseApp: null, auth: null, firestore: null, database: null };
  }
}

export * from './provider';
export * from './client-provider';
export * from './errors';
export * from './error-emitter';
export * from './firestore/use-collection';
export * from './firestore/use-doc';