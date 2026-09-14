import { NextRequest, NextResponse } from 'next/server';
import { isValidDeveloperKey, resolveDeveloperKey, logDeveloperApiUsage, maskKeySuffix } from '@/lib/hf-proxy';
import { deductScriptCreditsAction } from '@/app/script-generator/actions';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';
import { withCors, corsPreflight } from '@/lib/cors';
import crypto from 'node:crypto';

/**
 * 🌐 PUBLIC API — POST /api/v1/script
 * ----------------------------------------
 * Same feature as the website's /script-generator page, same function
 * underneath (deductScriptCreditsAction) — same pricing, same daily
 * limit, same RTDB queue (tempScriptGenerations) and Python worker
 * (server-files/script_generation.py) on the other end. This is async,
 * exactly like /api/v1/generate: submit here, poll
 * GET /api/v1/script/{mapping_id} for the finished script.
 *
 * Body:
 *   {
 *     "prompt": "A story about a lost dog finding its way home",
 *     "length": "10min" | "20min" | "30min",   // default: "10min"
 *     "genre": "moral",                          // optional
 *     "tone": "...",                              // optional
 *     "audience": "...",                          // optional
 *     "perspective": "...",                        // optional
 *     "number_of_characters": "...",               // optional
 *     "language": "English"                        // optional, default "English"
 *   }
 */

const LENGTH_TIERS: Record<string, number> = {
  '10min': 11000,
  '20min': 23000,
  '30min': 34000,
};

async function handlePOST(request: NextRequest) {
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const prompt = String(body?.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'Missing required field: prompt.' }, { status: 400 });
  }
  const lengthKey = typeof body?.length === 'string' && LENGTH_TIERS[body.length] ? body.length : '10min';
  const targetLength = LENGTH_TIERS[lengthKey];
  const language = String(body?.language || 'English').slice(0, 40);
  const genre = String(body?.genre || '').slice(0, 60);

  let errorMessage: string | undefined;
  let mappingId: string | undefined;
  let cost = 0;

  try {
    const { firestore } = initializeFirebase();
    const userDoc = await firestore.collection('users').doc(keyRecord.userId).get();
    const userEmail = userDoc.exists ? (userDoc.data()?.email || 'N/A') : 'N/A';

    const res = await deductScriptCreditsAction(
      keyRecord.userId,
      userEmail,
      targetLength,
      genre || 'story script',
      language,
      new Date().toISOString(),
      {
        genre,
        tone: String(body?.tone || ''),
        audience: String(body?.audience || ''),
        perspective: String(body?.perspective || ''),
        numberOfCharacters: String(body?.number_of_characters || ''),
        plotSummary: prompt,
        additionalInstructions: prompt,
        scriptType: genre || 'story script',
      }
    );
    if (!res.success || !res.mappingId) throw new Error(res.error || 'Script generation failed to start.');
    mappingId = res.mappingId;
    cost = res.cost || 0;
  } catch (e: any) {
    errorMessage = e?.message || 'Script generation failed.';
    reportServerError('src/app/api/v1/script/route.ts', e);
  }

  const latencyMs = Date.now() - startedAt;
  logDeveloperApiUsage({
    requestId,
    endpoint: 'script',
    api: '/api/v1/script',
    userId: keyRecord.userId,
    username: keyRecord.username,
    apiKeySuffix: maskKeySuffix(apiKey),
    cost: errorMessage ? 0 : cost,
    latencyMs,
    status: errorMessage ? 'error' : 'success',
    timestamp: new Date().toISOString(),
    link: mappingId ? `script:${mappingId}` : null,
    error: errorMessage,
  }).catch(() => null);

  if (errorMessage || !mappingId) {
    return NextResponse.json({ error: errorMessage || 'Script generation failed.' }, { status: 502 });
  }

  return NextResponse.json({
    mapping_id: mappingId,
    status: 'processing',
    estimated_cost: cost,
    poll_url: `/api/v1/script/${mappingId}`,
  }, { status: 202 });
}

export async function POST(request: NextRequest) {
  return withCors(await handlePOST(request));
}

export async function OPTIONS() {
  return corsPreflight();
}
