'use client';

import { onValue, type DatabaseReference, type Query } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportClientError } from '@/lib/report-client-error';

/**
 * Drop-in replacement for `onRtdbValue()` from `firebase/database`.
 *
 * Behaviour:
 * - On success: works exactly like onValue (calls onNext with the snapshot).
 * - On error (permission-denied, index-not-defined, etc.):
 *     - Logs to console (same as default onValue behaviour), so devtools still show it.
 *     - Sends ONE alert to the admin Telegram bot per unique error per session
 *       (cooldown-based, so a re-firing listener doesn't spam the chat).
 *     - Does NOT touch the UI in any way — no toast, no state change.
 *       Users never see these; only admins get pinged.
 *
 * Usage:
 *   const unsubscribe = onRtdbValue(myRef, (snapshot) => { ... }, 'voice-editor:voice_replacement');
 *   // cleanup stays the same: return () => unsubscribe();
 */

const COOLDOWN_MS = 10 * 60 * 1000; // don't re-alert the same error more than once per 10 min
const lastReported = new Map<string, number>();

function getRefPath(refOrQuery: DatabaseReference | Query): string {
  try {
    // Both Reference and Query expose toString() -> full RTDB URL including path.
    const full = refOrQuery.toString();
    const marker = '.firebasedatabase.app/';
    const idx = full.indexOf(marker);
    return idx !== -1 ? full.slice(idx + marker.length) : full;
  } catch (e) {
            reportClientError('src/lib/rtdb-listener.ts:35', e);
    return 'unknown-path';
  }
}

export function onRtdbValue(
  refOrQuery: DatabaseReference | Query,
  onNext: (snapshot: any) => void,
  context?: string
): () => void {
  const handleError = (error: Error & { code?: string }) => {
    const path = getRefPath(refOrQuery);
    const label = context || path; // no label passed -> path itself identifies the failing listener
    const key = `${label}::${path}::${error.code || error.message}`;
    const now = Date.now();
    const last = lastReported.get(key) || 0;

    // Always log to console for local debugging — same as default onValue.
    console.error(`[RTDB:${label}] listener failed on "${path}":`, error);

    if (now - last > COOLDOWN_MS) {
      lastReported.set(key, now);
      sendToTelegram(
        `🔴 <b>RTDB Listener Failed</b>\n` +
        `<b>Context:</b> ${escapeHtml(label)}\n` +
        `<b>Path:</b> ${escapeHtml(path)}\n` +
        `<b>Code:</b> ${escapeHtml(error.code || 'unknown')}\n` +
        `<b>Message:</b> ${escapeHtml(error.message)}`
      ).catch(() => {
        // If Telegram itself is down, fail silently — never break the app over a log call.
      });
    }
  };

  const unsubscribe = onValue(refOrQuery, onNext, handleError);
  return unsubscribe;
}
