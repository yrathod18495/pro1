'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml, safeJsonStringify } from '@/lib/utils';

// Cooldown so a repeatedly-firing listener doesn't spam the bot.
const COOLDOWN_MS = 10 * 60 * 1000;
const lastReported = new Map<string, number>();

/**
 * An invisible component that listens for globally emitted 'permission-error' events
 * (Firestore) and reports them straight to the admin Telegram bot.
 * No UI shown to the user — this is purely for admins to debug from the bot logs.
 */
export function FirebaseErrorListener() {
    useEffect(() => {
        const handleError = (error: FirestorePermissionError) => {
            const code = (error.originalError as any)?.code || 'unknown';

            // Still log to console for local debugging.
            console.error(`Firestore Error [${code}]:`, error.message, error.request);

            const key = error.request?.path || error.message;
            const now = Date.now();
            const last = lastReported.get(key) || 0;
            if (now - last <= COOLDOWN_MS) return;
            lastReported.set(key, now);

            // 🏷️ Title reflects the REAL cause, not just "Permission Error"
            // for everything. A missing index (failed-precondition) needs
            // someone to click the console link and build it; a quota hit
            // (resource-exhausted) needs someone to check usage; only an
            // actual permission-denied is a rules problem. Mislabeling any
            // of these as "Permission Error" sends debugging in the wrong
            // direction — but NOT reporting them at all (the previous bug
            // here) is worse: it goes unnoticed until a user complains.
            const titleByCode: Record<string, string> = {
                'permission-denied': '🔴 Firestore Permission Error',
                'failed-precondition': '🟠 Firestore Missing Index',
                'resource-exhausted': '🟡 Firestore Quota/Resource Exhausted',
                'unavailable': '🟣 Firestore Unavailable (network/offline)',
            };
            const title = titleByCode[code] || `⚪ Firestore Error (${escapeHtml(code)})`;

            sendToTelegram(
                `${title}\n` +
                `<b>Path:</b> ${escapeHtml(error.request?.path || 'unknown')}\n` +
                `<b>Method:</b> ${escapeHtml(error.request?.method || 'unknown')}\n` +
                `<b>Code:</b> ${escapeHtml(code)}\n` +
                `<b>Original error:</b> ${escapeHtml(error.originalError?.message || 'n/a')}\n` +
                `<b>Details:</b>\n<pre>${escapeHtml(safeJsonStringify(error.request, 2).slice(0, 3000))}</pre>`
            ).catch(() => {
                // Never let logging failure break the app.
            });
        };

        errorEmitter.on('permission-error', handleError);

        return () => {
            errorEmitter.off('permission-error', handleError);
        };
    }, []);

    // This component renders nothing.
    return null;
}
