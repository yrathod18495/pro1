
import * as admin from 'firebase-admin';
import { reportServerError } from '@/lib/report-error';

let app: admin.app.App | null = null;

export function initializeFirebase() {
  if (admin.apps.length > 0) {
    app = admin.apps[0]!;
  } else {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (serviceAccountKey && serviceAccountKey.trim() !== '') {
      try {
        const serviceAccount = JSON.parse(serviceAccountKey.trim());
        app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: "https://twelvelabs-copy-88796906-8d524-default-rtdb.asia-southeast1.firebasedatabase.app",
        });
      } catch (parseError: any) {
        console.error('CRITICAL: Malformed FIREBASE_SERVICE_ACCOUNT_KEY.', parseError.message);
      }
    }

    if (!app) {
      try {
        app = admin.initializeApp({
          databaseURL: "https://twelvelabs-copy-88796906-8d524-default-rtdb.asia-southeast1.firebasedatabase.app",
          projectId: "twelvelabs-copy-88796906-8d524",
        });
      } catch (e: any) {
        console.warn('WARNING: Default Firebase Admin initialization failed:', e.message);
      }
    }

    if (app) {
      try {
        app.firestore().settings({ ignoreUndefinedProperties: true });
      } catch (e) {
            reportServerError('src/firebase/server.ts:38', e);
        // Settings might have already been applied
      }
    }
  }

  return {
    firestore: app ? app.firestore() : (null as any),
    auth: app ? app.auth() : (null as any),
    database: app ? app.database() : (null as any),
    app: app || (null as any),
  };
}
