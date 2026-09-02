import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { callHfApi, isValidDeveloperKey, resolveDeveloperKey, logDeveloperApiUsage, maskKeySuffix } from '@/lib/hf-proxy';
import { reportServerError } from '@/lib/report-error';

/**
 * 🌐 PUBLIC API — POST /api/v1/voice
 *
 * This is the ONLY address external callers ever see. It forwards to the
 * HF Space server-side (see src/lib/hf-proxy.ts) — the Space's own URL and
 * its internal key never appear in this response or anywhere client-visible.
 *
 * Body:  { "name": "Kore", "text": "Hello!" }
 *   or:  { "lines": [{"name":"Kore","text":"..."}, {"name":"Puck","text":"..."}] }
 * Auth:  header  x-api-key: <developer key>
 *
 * Every call is checked and logged from THIS Vercel layer — see
 * src/lib/hf-proxy.ts (resolveDeveloperKey / logDeveloperApiUsage) for why.
 */

function requestCost(body: any): number {
  if (Array.isArray(body?.lines)) {
    return body.lines.reduce((sum: number, line: any) => sum + String(line?.text || '').length, 0);
  }
  return String(body?.text || '').length;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const apiKey = request.headers.get('x-api-key');

  if (!isValidDeveloperKey(apiKey)) {
    return NextResponse.json({ error: 'Missing or invalid x-api-key header.' }, { status: 401 });
  }

  // Look the key up directly from Vercel (Firestore/RTDB) before doing
  // anything else — a key switched to "disabled" in the dashboard must be
  // rejected here, not left to the upstream engine to (maybe) enforce.
  const keyRecord = await resolveDeveloperKey(apiKey);
  if (!keyRecord.exists) {
    return NextResponse.json({ error: 'Invalid API key.' }, { status: 401 });
  }
  if (keyRecord.disabled) {
    return NextResponse.json({ error: 'This API key has been disabled. Re-enable it in the Developer dashboard.' }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const cost = requestCost(body);

  const result = await callHfApi('/api/v1/voice', {
    body,
    customerApiKey: apiKey,
    idempotencyKey: request.headers.get('idempotency-key'),
  });

  const latencyMs = Date.now() - startedAt;

  logDeveloperApiUsage({
    requestId,
    endpoint: 'voice',
    api: '/api/v1/voice',
    userId: keyRecord.userId,
    username: keyRecord.username,
    apiKeySuffix: maskKeySuffix(apiKey),
    cost,
    latencyMs,
    status: result.ok ? 'success' : 'error',
    timestamp: new Date().toISOString(),
    link: result.ok && !result.isBinary ? (result.data as any)?.audio_url || null : null,
    error: result.ok ? undefined : result.error,
  }).catch(() => null);

  if (!result.ok) {
    if (result.status !== 400 && result.status !== 401) {
      reportServerError('src/app/api/v1/voice/route.ts', new Error(result.error));
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // response_format: "binary" — hand the raw audio bytes straight back
  // instead of wrapping them in JSON.
  if (result.isBinary) {
    return new NextResponse(result.data, {
      status: result.status,
      headers: {
        'Content-Type': result.contentType,
        ...(result.requestId ? { 'X-Request-Id': result.requestId } : {}),
        ...(result.creditsCharged ? { 'X-Credits-Charged': result.creditsCharged } : {}),
      },
    });
  }

  return NextResponse.json(result.data);
}
