import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { isValidDeveloperKey, resolveDeveloperKey, logDeveloperApiUsage, maskKeySuffix } from '@/lib/hf-proxy';
import { analyzeScriptStudio } from '@/ai/flows/analyze-script-studio';
import { processHighQualityGenerationAndDeductCredits } from '@/app/studio/actions';
import { getEngineRate } from '@/lib/pricing';
import { voices as geminiVoices } from '@/lib/voices';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';
import { withCors, corsPreflight } from '@/lib/cors';

/**
 * 🌐 PUBLIC API — POST /api/v1/generate
 * -----------------------------------------
 * "One click" full-project generation, either engine. A single call does
 * everything the website's /studio flow needs several screens for:
 *
 *   1. Analyzes the script (src/ai/flows/analyze-script-studio.ts) —
 *      detects characters, gender, age, and dialogue.
 *   2. Auto-assigns a voice per character, matched by gender (and, for
 *      Gemini, by the character's age band too) — see
 *      autoAssignGeminiVoice / autoAssignElevenLabsVoice below.
 *   3. Submits to the EXACT SAME async pipeline the website uses
 *      (processHighQualityGenerationAndDeductCredits — the same function,
 *      same credit-deduction transaction, same pending_projects/
 *      11_projects RTDB queue, same studio.py/11.py workers). Nothing
 *      about the generation itself is different for an API call.
 *
 * PRICING: charged via getEngineRate (src/lib/pricing.ts) — the exact same
 * per-character rate read from the exact same settings/pricing RTDB path
 * the website's admin pricing dashboard controls. There is no separate
 * API price; changing a rate on the website changes it here too.
 *
 * Body:
 *   {
 *     "script": "...",
 *     "engine": "gemini" | "elevenlabs",   // default: "gemini"
 *     "project_name": "My Project"          // optional
 *   }
 * Auth: header x-api-key: <developer key>
 *
 * Response (202-style, this IS an async job): 
 *   { "project_id": "HQ_...", "status": "in_queue", "engine": "gemini", "estimated_cost": 148 }
 *
 * Poll GET /api/v1/generate/{project_id} (same x-api-key) for the result.
 */

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// A tiny in-memory cache so a script with 10 "Male" characters doesn't
// make 10 identical ElevenLabs lookups — same request-budget discipline
// as /api/voices' own cache, just scoped to one invocation of this route
// (a fresh Lambda/edge instance starts empty, which is fine: this is a
// handful of calls at most, not a hot path).
const elevenLabsDefaultCache = new Map<string, string | null>();

async function autoAssignElevenLabsVoice(gender: string): Promise<string | null> {
  const key = gender.toLowerCase();
  if (elevenLabsDefaultCache.has(key)) return elevenLabsDefaultCache.get(key)!;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({ page_size: '5', sort: 'trending' });
    if (key === 'male' || key === 'female') params.set('gender', key);
    const res = await fetch(`${ELEVENLABS_API_BASE}/shared-voices?${params}`, {
      headers: { 'xi-api-key': apiKey },
    });
    if (!res.ok) { elevenLabsDefaultCache.set(key, null); return null; }
    const data = await res.json();
    const voiceId = data?.voices?.[0]?.voice_id || null;
    elevenLabsDefaultCache.set(key, voiceId);
    return voiceId;
  } catch {
    elevenLabsDefaultCache.set(key, null);
    return null;
  }
}

function autoAssignGeminiVoice(gender: string): string {
  const target = gender.toLowerCase() === 'male' ? 'Male' : gender.toLowerCase() === 'female' ? 'Female' : null;
  const pool = target ? geminiVoices.filter((v) => v.gender === target) : geminiVoices;
  const usable = pool.length > 0 ? pool : geminiVoices;
  return usable[Math.floor(Math.random() * usable.length)]?.id || geminiVoices[0]?.id || '';
}

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
  const engine: 'gemini' | 'elevenlabs' = body?.engine === 'elevenlabs' ? 'elevenlabs' : 'gemini';
  const projectName = String(body?.project_name || 'API Generation').slice(0, 120);

  if (!script) {
    return NextResponse.json({ error: 'Missing required field: script.' }, { status: 400 });
  }
  if (script.length > 50000) {
    return NextResponse.json({ error: 'Script too long (max 50,000 characters). Split it into multiple generations.' }, { status: 400 });
  }
  if (engine === 'elevenlabs' && !process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: '11Labs engine is not configured on this server.' }, { status: 503 });
  }

  let errorMessage: string | undefined;
  let projectId: string | undefined;
  let estimatedCost = 0;

  try {
    // --- 1. Analyze ---
    const analysis = await analyzeScriptStudio({
      script,
      userId: keyRecord.userId,
      userEmail: undefined,
      includeEmotion: true,
    });
    const rawCharacters: any[] = analysis.characters || [];
    const lines: any[] = analysis.lines || [];
    if (rawCharacters.length === 0 || lines.length === 0) {
      throw new Error('Could not detect any characters or dialogue in this script.');
    }

    // --- 2. Auto-assign a voice per character ---
    const characters = await Promise.all(rawCharacters.map(async (c: any) => {
      const gender = String(c.gender || 'Male');
      const voice = engine === 'elevenlabs'
        ? (await autoAssignElevenLabsVoice(gender)) || ''
        : autoAssignGeminiVoice(gender);
      return {
        name: c.name,
        gender,
        age: (c.age === 'Kid' || c.age === 'Old') ? c.age : 'Adult',
        emotion: 'Neutral',
        voice,
        dialogueCount: c.dialogueCount || 0,
      };
    }));
    if (engine === 'elevenlabs' && characters.every((c) => !c.voice)) {
      throw new Error('Could not find any 11Labs voices to auto-assign. Try the gemini engine, or check the 11Labs API key configuration.');
    }

    // --- 3. Look up the caller's profile (name/email/investment) for the
    //     same fields the website's own submission passes ---
    const { firestore } = initializeFirebase();
    const userDoc = await firestore.collection('users').doc(keyRecord.userId).get();
    if (!userDoc.exists) throw new Error('Linked user profile not found for this API key.');
    const userData = userDoc.data() || {};

    const totalChars = lines.reduce((sum: number, l: any) => sum + String(l.text || l.dialogue || '').length, 0);
    const rate = await getEngineRate(engine);
    estimatedCost = Math.ceil(totalChars * rate);

    // --- 4. Submit to the exact same pipeline the website uses ---
    const res = await processHighQualityGenerationAndDeductCredits(
      keyRecord.userId,
      userData.name || keyRecord.username || 'API User',
      userData.email || '',
      projectName,
      script,
      characters as any,
      userData.totalInvestment || 0,
      totalChars,
      {
        dialogues: lines.map((l: any) => ({ character: l.character, line: l.text || l.dialogue, emotion: l.emotion })),
        clientTimestamp: new Date().toISOString(),
      },
      undefined,
      undefined,
      engine
    );

    if (!res.success || !res.projectId) {
      throw new Error(res.error || 'Generation submission failed.');
    }
    projectId = res.projectId;
  } catch (e: any) {
    errorMessage = e?.message || 'Generation failed.';
    reportServerError('src/app/api/v1/generate/route.ts', e);
  }

  const latencyMs = Date.now() - startedAt;

  logDeveloperApiUsage({
    requestId,
    endpoint: 'generate',
    api: '/api/v1/generate',
    userId: keyRecord.userId,
    username: keyRecord.username,
    apiKeySuffix: maskKeySuffix(apiKey),
    cost: errorMessage ? 0 : estimatedCost,
    latencyMs,
    status: errorMessage ? 'error' : 'success',
    timestamp: new Date().toISOString(),
    link: projectId ? `project:${projectId}` : null,
    error: errorMessage,
  }).catch(() => null);

  if (errorMessage || !projectId) {
    return NextResponse.json({ error: errorMessage || 'Generation failed.' }, { status: 502 });
  }

  return NextResponse.json({
    project_id: projectId,
    status: 'in_queue',
    engine,
    estimated_cost: estimatedCost,
    poll_url: `/api/v1/generate/${projectId}`,
  }, { status: 202 });
}

export async function POST(request: NextRequest) {
  return withCors(await handlePOST(request));
}

export async function OPTIONS() {
  return corsPreflight();
}
