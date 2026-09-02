'use client';

import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';

// Cooldown so a hot error path doesn't spam the bot (per browser tab).
const COOLDOWN_MS = 10 * 60 * 1000;
const lastReported = new Map<string, number>();

/**
 * Fire-and-forget: reports a client-side error to the admin Telegram bot.
 *
 * Use this from inside any try/catch block in a client component where the
 * error is being handled/swallowed (e.g. shown as a toast) rather than
 * re-thrown. GlobalErrorReporter only sees uncaught errors and unhandled
 * promise rejections — anything caught locally needs to be reported
 * explicitly, or it never reaches the logs.
 *
 * Safe to call from anywhere on the client — never throws, never blocks.
 */
export function reportClientError(context: string, error: unknown, extra?: Record<string, any>) {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'Unknown error'));
    const key = `${context}::${err.message}`;
    const now = Date.now();
    const last = lastReported.get(key) || 0;

    console.error(`[Client:${context}]`, err);

    if (now - last <= COOLDOWN_MS) return;
    lastReported.set(key, now);

    const extraLines = extra
      ? Object.entries(extra).map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`).join('\n') + '\n'
      : '';

    sendToTelegram(
      `🔴 <b>Client Error (Handled)</b>\n` +
      `<b>Context:</b> ${escapeHtml(context)}\n` +
      extraLines +
      `<b>Page:</b> ${escapeHtml(typeof window !== 'undefined' ? window.location.pathname : 'unknown')}\n` +
      `<b>Message:</b> ${escapeHtml(err.message)}\n` +
      (err.stack ? `<pre>${escapeHtml(err.stack.slice(0, 1500))}</pre>` : '')
    ).catch((dispatchErr) => {
      // Don't let a logging failure break the caller, but don't swallow it
      // completely either — this is exactly the kind of silent failure that
      // makes "the log never arrived" impossible to debug.
      console.error(`[reportClientError] Telegram dispatch failed for ${context}:`, dispatchErr);
    });
  } catch {
    // reportClientError must never itself throw (this is the guard for
    // that promise — reporting the error here would recurse).
  }
}
