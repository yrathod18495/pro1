import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

/**
 * 💳 PER-CHARACTER ENGINE RATE — single source of truth
 * --------------------------------------------------------
 * Both the website's HQ Studio (src/app/studio/actions.ts) and the public
 * API (src/app/api/v1/generate) charge through this SAME function, reading
 * the SAME RTDB path (`settings/pricing`) the admin pricing dashboard
 * writes to. There is deliberately no separate "API price" — whatever an
 * admin sets on the website is exactly what the API charges too, and a
 * rate change there takes effect on both surfaces at once, from the same
 * place, with no redeploy.
 */
export async function getEngineRate(
  engine: 'gemini' | 'elevenlabs'
): Promise<number> {
  const FALLBACK = { gemini: 1.2, elevenlabs: 2.5 } as const;
  try {
    const { database } = initializeFirebase();
    const snap = await database.ref('settings/pricing').get();
    const v = snap.val() || {};
    const key = engine === 'elevenlabs' ? 'elevenLabsNormal' : 'studioNormal';
    const rate = Number(v[key]);
    return Number.isFinite(rate) && rate > 0 ? rate : FALLBACK[engine];
  } catch (e) {
        reportServerError('src/lib/pricing.ts:25', e);
    // Never block a paid action on a settings read; fall back to the
    // documented default rather than charging 0.
    return FALLBACK[engine];
  }
}
