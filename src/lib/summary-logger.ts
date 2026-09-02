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
  | 'chatterboxGenerations'
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
