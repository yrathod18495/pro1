'use server';

import { initializeFirebase } from '@/firebase/server';
import { getISTDateString } from './utils';

export type SummaryEvent =
  | 'scriptsGenerated'
  | 'normalScriptAnalysis'
  | 'fastVoicesGenerated'
  | 'hqVoicesSubmitted'
  | 'thumbnailsGenerated'
  | 'soundSearches'
  | 'voiceCloningGenerations'
  | 'creditsSpent'
  | 'creditsPurchased'
  | 'newUserJoined';

export async function logSummaryEvent(event: SummaryEvent, value: number = 1) {
  try {
    const { database } = initializeFirebase();
    if (!database) return;
    // CRITICAL: Use IST for consistent day-splitting with the dashboard
    const today = getISTDateString(); 

    // Use the admin SDK's ref method directly from the database instance
    const summaryRef = database.ref(`dailySummaries/${today}/${event}`);
    
    // Use a transaction for atomic increments, which is the correct way for the Admin SDK
    await summaryRef.transaction((currentValue: any) => {
      return (currentValue || 0) + value;
    });

  } catch (error) {
    // Don't throw errors for logging failures, just log them on the server.
    console.error(`[SummaryLogger] Failed to log event '${event}':`, error);
  }
}

/**
 * Records that a given user was online at some point today, for the daily
 * "total users online today" report figure.
 *
 * Deliberately NOT a transaction/counter — a blind `set(true)` under the
 * user's own uid is idempotent (same call any number of times a day costs
 * the same single small write, no read-before-write) and self-deduplicates:
 * counting the report just reads the number of keys under this node once.
 * The client also dedupes its calls to roughly once per user per day (see
 * auth-provider.tsx), so this adds negligible extra write volume on top of
 * the presence writes that already happen on every connect.
 */
export async function logDailyActiveUser(uid: string) {
  if (!uid) return;
  try {
    const { database } = initializeFirebase();
    if (!database) return;
    const today = getISTDateString();
    await database.ref(`dailySummaries/${today}/onlineUsers/${uid}`).set(true);
  } catch (error) {
    console.error(`[SummaryLogger] Failed to log daily active user:`, error);
  }
}
