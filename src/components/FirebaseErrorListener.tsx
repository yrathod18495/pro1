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
            // Still log to console for local debugging.
            console.error("Firestore Permission Error:", error.message, error.request);

            const key = error.request?.path || error.message;
            const now = Date.now();
            const last = lastReported.get(key) || 0;
            if (now - last <= COOLDOWN_MS) return;
            lastReported.set(key, now);

            sendToTelegram(
                `🔴 <b>Firestore Permission Error</b>\n` +
                `<b>Path:</b> ${escapeHtml(error.request?.path || 'unknown')}\n` +
                `<b>Method:</b> ${escapeHtml(error.request?.method || 'unknown')}\n` +
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
