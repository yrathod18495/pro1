import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { isValidDeveloperKey, resolveDeveloperKey, logDeveloperApiUsage, maskKeySuffix } from '@/lib/hf-proxy';
import { analyzeScriptStudio } from '@/ai/flows/analyze-script-studio';
import { reportServerError } from '@/lib/report-error';
import { withCors, corsPreflight } from '@/lib/cors';

/**
 * 🌐 PUBLIC API — POST /api/v1/analyze
 * ---------------------------------------
 * Runs the SAME script-analysis pipeline the website's /studio page uses
 * (src/ai/flows/analyze-script-studio.ts — detects characters, gender,
 * age, and per-line dialogue with emotion) and hands the result straight
 * back. This step is free on the website (gated by a daily count, not
 * credits — see studio-provider.tsx's dailyAnalysisCount) so it's free
 * here too; only /api/v1/generate actually spends credits.
 *
 * Body:  { "script": "..." }
 * Auth:  header  x-api-key: <developer key>
 *
 * Response: whatever analyzeScriptStudio returns — characters[] (name,
 * gender, age, dialogueCount), dialogueCount, characterCount.
 */
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

  const script = String(body?.script || '').trim();
  if (!script) {
    return NextResponse.json({ error: 'Missing required field: script.' }, { status: 400 });
  }
  if (script.length > 50000) {
    return NextResponse.json({ error: 'Script too long (max 50,000 characters). Split it and analyze in parts.' }, { status: 400 });
  }

  let result: any;
  let errorMessage: string | undefined;
  try {
    result = await analyzeScriptStudio({
      script,
      userId: keyRecord.userId,
      userEmail: undefined,
      includeEmotion: Boolean(body?.includeEmotion),
    });
  } catch (e: any) {
    errorMessage = e?.message || 'Script analysis failed.';
    reportServerError('src/app/api/v1/analyze/route.ts', e);
  }

  const latencyMs = Date.now() - startedAt;

  logDeveloperApiUsage({
    requestId,
    endpoint: 'analyze',
    api: '/api/v1/analyze',
    userId: keyRecord.userId,
    username: keyRecord.username,
    apiKeySuffix: maskKeySuffix(apiKey),
    cost: errorMessage ? 0 : (result?.creditsCharged || 0),
    latencyMs,
    status: errorMessage ? 'error' : 'success',
    timestamp: new Date().toISOString(),
    error: errorMessage,
  }).catch(() => null);

  if (errorMessage || !result) {
    return NextResponse.json({ error: errorMessage || 'Script analysis failed.' }, { status: 502 });
  }

  return NextResponse.json({
    characters: result.characters || [],
    lines: result.lines || [],
    language: result.languageCode || null,
    dailyAnalysisCount: result.dailyAnalysisCount,
    maxDailyLimit: result.maxDailyLimit,
    credits_charged: result.creditsCharged || 0,
  });
}

export async function POST(request: NextRequest) {
  return withCors(await handlePOST(request));
}

export async function OPTIONS() {
  return corsPreflight();
}
