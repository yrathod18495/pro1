import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { callHfApi, isValidDeveloperKey, resolveDeveloperKey, logDeveloperApiUsage, maskKeySuffix } from '@/lib/hf-proxy';

/**
 * 🌐 PUBLIC API — GET /api/v1/voice/names
 * Returns every valid voice name, so callers can validate client-side
 * before ever calling /api/v1/voice.
 *
 * Free to call (no credits), but still gated on the key being enabled and
 * still logged from Vercel — same as /api/v1/voice — for a complete audit
 * trail of who is calling the public API.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const apiKey = request.headers.get('x-api-key');

  if (!isValidDeveloperKey(apiKey)) {
    return NextResponse.json({ error: 'Missing or invalid x-api-key header.' }, { status: 401 });
  }

  const keyRecord = await resolveDeveloperKey(apiKey);
  if (!keyRecord.exists) {
    return NextResponse.json({ error: 'Invalid API key.' }, { status: 401 });
  }
  if (keyRecord.disabled) {
    return NextResponse.json({ error: 'This API key has been disabled. Re-enable it in the Developer dashboard.' }, { status: 403 });
  }

  const result = await callHfApi('/api/v1/voice/names', { method: 'GET', customerApiKey: apiKey });

  logDeveloperApiUsage({
    requestId,
    endpoint: 'voice/names',
    api: '/api/v1/voice/names',
    userId: keyRecord.userId,
    username: keyRecord.username,
    apiKeySuffix: maskKeySuffix(apiKey),
    cost: 0,
    latencyMs: Date.now() - startedAt,
    status: result.ok ? 'success' : 'error',
    timestamp: new Date().toISOString(),
    link: null,
    error: result.ok ? undefined : result.error,
  }).catch(() => null);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
