import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';

// Server-side cooldown so a hot error path doesn't spam the bot.
// (Separate from the client-side cooldown in global-error-reporter.tsx —
// this one lives in the Node process memory.)
const COOLDOWN_MS = 10 * 60 * 1000;
const lastReported = new Map<string, number>();

/**
 * Firestore "missing index" errors (FAILED_PRECONDITION) carry a one-time
 * console URL to auto-create the required index. That URL is exactly what
 * a dev needs to fix the bug, so we never want it deduped by the cooldown
 * or buried inside an HTML-escaped <pre> block where it's easy to miss.
 */
function extractFirestoreIndexUrl(message: string): string | null {
  const match = message.match(/https:\/\/console\.firebase\.google\.com\/[^\s)]+/);
  return match ? match[0] : null;
}

/**
 * Fire-and-forget: reports a server-side error to the admin Telegram bot.
 * Safe to call from anywhere on the server — never throws, never blocks.
 */
export function reportServerError(context: string, error: unknown, extra?: Record<string, any>) {
  try {
    // Non-Error rejections (e.g. plain objects thrown by third-party SDKs
    // like @gradio/client) previously fell through to `String(error)`,
    // which just produces "[object Object]" and hides the real cause.
    // JSON.stringify surfaces the actual fields so the alert is useful.
    const err = error instanceof Error
      ? error
      : new Error((() => {
          if (error === null || error === undefined) return String(error);
          if (typeof error === 'string') return error;
          try {
            const json = JSON.stringify(error);
            return json && json !== '{}' ? json : String(error);
          } catch {
            return String(error);
          }
        })());
    const indexUrl = extractFirestoreIndexUrl(err.message);
    const key = `${context}::${err.message}`;
    const now = Date.now();
    const last = lastReported.get(key) || 0;

    console.error(`[Server:${context}]`, err);

    // Index-creation errors are actionable exactly once per missing index —
    // never silently drop them behind the cooldown, or the "fix" link never
    // reaches the bot at all if the same query fails again within 10 min.
    if (!indexUrl && now - last <= COOLDOWN_MS) return;
    lastReported.set(key, now);

    const extraLines = extra
      ? Object.entries(extra).map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`).join('\n') + '\n'
      : '';

    sendToTelegram(
      `🔴 <b>Server Error</b>\n` +
      `<b>Context:</b> ${escapeHtml(context)}\n` +
      extraLines +
      `<b>Message:</b> ${escapeHtml(err.message)}\n` +
      (err.stack ? `<pre>${escapeHtml(err.stack.slice(0, 2000))}</pre>` : '')
    ).catch((dispatchErr) => {
      // Don't let a logging failure break the caller, but don't swallow it
      // completely — visible in server logs even if Telegram is unreachable.
      console.error(`[reportServerError] Telegram dispatch failed for ${context}:`, dispatchErr);
    });

    // Send the index-creation link as its own plain message too, so it
    // survives Telegram's 4096-char cut and shows up as a clean, tappable
    // link instead of sitting escaped inside a <pre> stack trace.
    if (indexUrl) {
      sendToTelegram(
        `🧩 <b>Missing Firestore Index</b>\n` +
        `<b>Context:</b> ${escapeHtml(context)}\n` +
        `Tap to create it:\n${escapeHtml(indexUrl)}`,
        undefined,
        { disable_web_page_preview: true }
      ).catch((dispatchErr) => {
        console.error(`[reportServerError] Index-link dispatch failed for ${context}:`, dispatchErr);
      });
    }
  } catch {
    // reportServerError must never itself throw (this is the guard for
    // that promise — reporting the error here would recurse).
  }
}
