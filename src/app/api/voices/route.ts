import { NextRequest, NextResponse } from 'next/server';
import { reportServerError } from '@/lib/report-error';

/**
 * GET /api/voices                                   -> the account's own voices (fallback default)
 * GET /api/voices?gender=female&age=young&language=hi -> quiet, auto-filtered library search using a character's known traits
 * GET /api/voices?q=narrator                         -> full-text search the ElevenLabs voice library
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A DIRECT BROWSER CALL:
 * ELEVENLABS_API_KEY stays in Vercel's server environment and never
 * reaches the browser. A key shipped in the client bundle is public no
 * matter how it's obfuscated — and even a zero-credit key would let
 * anyone read this account's voice library and burn its rate limit,
 * which would take voice search down for real users.
 *
 * WHY THIS ISN'T EXPENSIVE:
 * the response is cached at Vercel's edge per URL (see CACHE_HEADER), so
 * a thousand users searching "narrator" cost ONE upstream call to
 * ElevenLabs, not a thousand. The client debounces and caches per query
 * on top of that.
 */

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// Account voices barely change -> cache long. Search results are shared
// across every user typing the same term -> cache long too, since the
// library itself moves slowly. stale-while-revalidate means an expired
// entry is still served instantly while it refreshes in the background.
const CACHE_HEADER = 'public, s-maxage=21600, stale-while-revalidate=86400';

interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string | null;
  gender?: string | null;
  accent?: string | null;
  language?: string | null;
  description?: string | null;
  category?: string | null;
  source: 'account' | 'library';
}

function mapAccountVoice(v: any): Voice {
  const labels = v?.labels || {};
  return {
    voice_id: v?.voice_id,
    name: v?.name,
    preview_url: v?.preview_url ?? null,
    gender: labels.gender ?? null,
    accent: labels.accent ?? null,
    language: labels.language ?? null,
    description: v?.description ?? labels.description ?? null,
    category: v?.category ?? null,
    source: 'account',
  };
}

function mapLibraryVoice(v: any): Voice {
  return {
    voice_id: v?.voice_id,
    name: v?.name,
    preview_url: v?.preview_url ?? null,
    gender: v?.gender ?? null,
    accent: v?.accent ?? null,
    language: v?.language ?? null,
    description: v?.description ?? null,
    category: v?.category ?? null,
    source: 'library',
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'Voice service is not configured.' },
      { status: 503 }
    );
  }

  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  // 🔴 NEW: script analysis already tells us a character's gender and age
  // group, and the script's own language is detectable from its text —
  // so instead of showing ElevenLabs' generic "account voices" as the
  // default (bland premade voices nobody picked for a reason), the
  // default list is now a QUIET, auto-filtered search using exactly
  // those three signals. The person never sees "search: female, hindi,
  // young" typed anywhere — the visible search box stays empty; this
  // only fires when there's no free-text query yet, and typing a real
  // search overrides it completely.
  const gender = (request.nextUrl.searchParams.get('gender') || '').trim();
  const age = (request.nextUrl.searchParams.get('age') || '').trim();
  const language = (request.nextUrl.searchParams.get('language') || '').trim();
  const hasAutoFilters = !q && (gender || age || language);

  try {
    if (!q && !hasAutoFilters) {
      // No search term and no character context at all (a caller that
      // didn't pass gender/age/language): the account's own voices.
      const res = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
        headers: { 'xi-api-key': apiKey },
        next: { revalidate: 21600 },
      });
      if (!res.ok) throw new Error(`ElevenLabs /voices returned ${res.status}`);
      const data = await res.json();
      const voices = (data?.voices || []).map(mapAccountVoice).filter((v: Voice) => v.voice_id);

      return NextResponse.json(
        { success: true, voices },
        { headers: { 'Cache-Control': CACHE_HEADER } }
      );
    }

    // Search term OR auto-filters: hand off to the library's own search.
    // Free-text `search` and the structured gender/age/language filters
    // can combine — ElevenLabs' shared-voices endpoint accepts both at
    // once, so a real search still benefits from a character's known
    // gender/age/language when those were passed too.
    const params = new URLSearchParams({ page_size: '100', sort: 'trending' });
    if (q) params.set('search', q);
    if (gender) params.set('gender', gender);
    if (age) params.set('age', age);
    if (language) params.set('language', language);
    const res = await fetch(`${ELEVENLABS_API_BASE}/shared-voices?${params}`, {
      headers: { 'xi-api-key': apiKey },
      next: { revalidate: 21600 },
    });
    if (!res.ok) throw new Error(`ElevenLabs /shared-voices returned ${res.status}`);
    const data = await res.json();
    const voices = (data?.voices || []).map(mapLibraryVoice).filter((v: Voice) => v.voice_id);

    return NextResponse.json(
      { success: true, voices, total: data?.total_count ?? voices.length },
      { headers: { 'Cache-Control': CACHE_HEADER } }
    );
  } catch (error: any) {
    reportServerError('src/app/api/voices/route.ts', error);
    return NextResponse.json(
      { success: false, error: 'Could not load voices right now.' },
      { status: 502 }
    );
  }
}
