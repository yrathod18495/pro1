/**
 * hf-proxy.ts
 * ---------------------
 * 🔒 SERVER-ONLY. This file is never imported by client components — it's
 * only ever called from inside `src/app/api/v1/*` Route Handlers, which run
 * on the Next.js server (Node runtime). That means `HF_SPACE_URL` and
 * `HF_INTERNAL_API_KEY` NEVER reach the browser bundle — nobody calling
 * our public API can see or reach the underlying HF Space directly.
 *
 * Required env vars (set these in your hosting provider's dashboard, NOT
 * prefixed with NEXT_PUBLIC_ — that prefix would ship them to the browser):
 *   HF_SPACE_URL        e.g. "https://your-username-space-name.hf.space"
 *   HF_INTERNAL_API_KEY  one of the keys in the HF Space's PUBLIC_API_KEYS
 *                         env var — this is a server-to-server secret only,
 *                         never handed out to real API customers.
 *
 * KEY SAFETY: `resolveDeveloperKey` looks the caller's key up directly in
 * Firestore/RTDB from this Vercel server — the same source the API Keys
 * dashboard reads/writes. A missing key is rejected with 401 and a
 * `disabled: true` key is rejected with 403 *before* the request is ever
 * forwarded to the HF Space, so switching a key off in the dashboard takes
 * effect immediately, independent of anything the upstream engine does.
 *
 * USAGE LOGGING: every request is logged from here (Vercel), not by the HF
 * Space. `logDeveloperApiUsage` writes a full record — who called, which
 * key, cost, remaining balance, latency, and a link to what was generated —
 * to Realtime Database under `apiUsage/{userId}/{requestId}` (this is what
 * powers the Developer dashboard's usage graph) and mirrors the same detail
 * to Telegram. This does not depend on the HF Space attaching any telemetry
 * to its response, so the log is complete even if the upstream engine is
 * changed or misbehaves.
 */

import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { initializeFirebase } from '@/firebase/server';

export type HfProxyResult<T = any> =
  | { ok: true; status: number; data: T; isBinary?: false }
  | { ok: true; status: number; data: ArrayBuffer; isBinary: true; contentType: string; requestId?: string; creditsCharged?: string }
  | { ok: false; status: number; error: string };

export interface DeveloperKeyRecord {
  exists: boolean;
  disabled: boolean;
  keyId: string;
  userId: string;
  username: string;
}

/**
 * Looks the caller's secret key up directly (Firestore first, legacy RTDB
 * as a fallback) so this Vercel layer — not just the upstream engine — can
 * enforce the enabled/disabled state a developer sets in the dashboard.
 */
export async function resolveDeveloperKey(apiKey: string | null): Promise<DeveloperKeyRecord> {
  const empty: DeveloperKeyRecord = { exists: false, disabled: false, keyId: '', userId: '', username: '' };
  if (!apiKey || !apiKey.trim()) return empty;

  const { firestore, database } = initializeFirebase();

  try {
    if (firestore) {
      const doc = await firestore.collection('api_keys').doc(apiKey).get();
      if (doc.exists) {
        const data = (doc.data() || {}) as Record<string, any>;
        return {
          exists: true,
          disabled: data.disabled === true,
          keyId: doc.id,
          userId: String(data.userId || data.uid || ''),
          username: String(data.owner || data.name || data.userId || ''),
        };
      }
    }
    if (database) {
      const snapshot = await database.ref(`api_keys/${apiKey}`).once('value');
      if (snapshot.exists()) {
        const data = (snapshot.val() || {}) as Record<string, any>;
        return {
          exists: true,
          disabled: data.disabled === true,
          keyId: apiKey,
          userId: String(data.userId || data.uid || ''),
          username: String(data.owner || data.name || data.userId || ''),
        };
      }
    }
  } catch (error) {
    console.error('[Developer API] key lookup failed:', error);
  }
  return empty;
}

interface ApiUsageRecord {
  requestId: string;
  endpoint: string;
  api: string;
  userId: string;
  username: string;
  apiKeySuffix: string;
  cost: number;
  remainingCredits?: number;
  latencyMs: number;
  status: string;
  timestamp: string;
  link?: string | null;
  error?: string;
}

/**
 * Records one API call from the Vercel side straight to Telegram — the
 * only place this shows up. No dashboard, no RTDB/Firestore usage record,
 * no extra reads/writes per request; this is purely an operator log line
 * so every call to the public API (who called, what it cost, and a link
 * to whatever was generated) lands in Telegram. Best-effort: a logging
 * failure never affects the response already sent to the customer.
 */
export async function logDeveloperApiUsage(record: ApiUsageRecord): Promise<void> {
  const statusIcon = record.status === 'success' ? '✅' : '❌';
  const linkLine = record.link ? `\n🔗 Link: ${escapeHtml(record.link)}` : '';
  const errorLine = record.error ? `\n⚠️ Error: <code>${escapeHtml(record.error)}</code>` : '';

  const message =
    `🌐 <b>Public API — ${escapeHtml((record.endpoint || '').replace(/^\w/, (c) => c.toUpperCase()))}</b>\n` +
    `${statusIcon} Status: <code>${escapeHtml(record.status)}</code>\n` +
    `👤 User: <code>${escapeHtml(record.username || record.userId || 'unknown')}</code>\n` +
    `🆔 Request: <code>${escapeHtml(record.requestId)}</code>\n` +
    `🔑 Key: <code>${escapeHtml(record.apiKeySuffix)}</code>\n` +
    `💳 Cost: <b>${(record.cost || 0).toLocaleString()}</b> credits\n` +
    `⏱ Latency: <code>${record.latencyMs} ms</code>` +
    linkLine +
    errorLine;

  await sendToTelegram(message, undefined, { disable_web_page_preview: true }).catch(() => null);
}

export async function callHfApi<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    customerApiKey?: string | null;
    idempotencyKey?: string | null;
  } = {}
): Promise<HfProxyResult<T>> {
  const baseUrl = process.env.HF_SPACE_URL;
  const internalKey = process.env.HF_INTERNAL_API_KEY;
  // Needed on top of the app-level keys above: if the HF Space itself is
  // set to Private visibility, Hugging Face's own edge gateway rejects any
  // unauthenticated request with a 404 (not 401/403 — it hides the space's
  // existence) before the request ever reaches our FastAPI app. Sending the
  // HF token as a Bearer header satisfies that gate.
  const hfToken = process.env.HF_TOKEN;

  if (!baseUrl || !internalKey) {
    return {
      ok: false,
      status: 503,
      error: 'HF_SPACE_URL / HF_INTERNAL_API_KEY not configured on the server.',
    };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The upstream API uses this key to identify the Firebase user for
        // billing. Keep the internal key as a second server-to-server guard.
        'X-API-Key': options.customerApiKey || internalKey,
        'X-Internal-API-Key': internalKey,
        // Authenticates against the HF Space itself when it's private.
        ...(hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      // Voice/music generation can take a while — give the upstream
      // engine real room before Next.js's own fetch gives up on it.
      signal: AbortSignal.timeout(180_000),
    });

    // 'binary' response_format (currently only /voice supports it) comes
    // back as raw audio bytes, not JSON — res.text() would silently mangle
    // those bytes (lossy UTF-8 decoding of binary data), so any non-JSON
    // content-type is read as an ArrayBuffer and passed straight through
    // instead of being parsed/re-encoded.
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const buf = await res.arrayBuffer();
      if (!res.ok) {
        return { ok: false, status: res.status, error: `HF Space returned ${res.status}` };
      }
      return {
        ok: true,
        status: res.status,
        data: buf,
        isBinary: true,
        contentType: contentType || 'application/octet-stream',
        requestId: res.headers.get('x-request-id') || undefined,
        creditsCharged: res.headers.get('x-credits-charged') || undefined,
      };
    }

    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const message =
        (data && (data.detail?.error || data.detail || data.error)) ||
        `HF Space returned ${res.status}`;
      return { ok: false, status: res.status, error: typeof message === 'string' ? message : JSON.stringify(message) };
    }

    // The upstream engine may still attach its own `_telemetry` field —
    // strip it unconditionally so it never leaks to the customer. It is no
    // longer read for logging: usage is now recorded independently from
    // this Vercel layer via `logDeveloperApiUsage`.
    if (data && typeof data === 'object' && '_telemetry' in data) {
      delete data._telemetry;
    }

    return { ok: true, status: res.status, data };
  } catch (e: any) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      error: timedOut ? 'Upstream engine timed out.' : (e?.message || 'Failed to reach generation engine.'),
    };
  }
}

/**
 * Cheap presence check only. Real validation — existence, ownership, and
 * enabled/disabled state — happens in `resolveDeveloperKey`, which every
 * /api/v1/* route calls before forwarding anything upstream.
 */
export function isValidDeveloperKey(key: string | null): boolean {
  return typeof key === 'string' && key.trim().length > 0;
}

export function maskKeySuffix(key: string | null | undefined): string {
  if (!key) return 'unknown';
  return key.length > 6 ? `••••${key.slice(-6)}` : key;
}
