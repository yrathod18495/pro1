import { NextResponse } from 'next/server';

/**
 * 🌐 CORS for the public v1 API
 * --------------------------------
 * These routes are meant to be called directly from arbitrary third-party
 * code — including a plain HTML file with no server of its own (the exact
 * use case: "one-click voiceover" tools built by pasting a script and an
 * API key into a webpage). Without CORS headers, every one of those calls
 * would fail silently in the browser with a CORS error, since Next.js API
 * routes are same-origin-only by default.
 *
 * `Access-Control-Allow-Origin: *` is safe here specifically because auth
 * is a header value (x-api-key), never a cookie — there's no session to
 * leak cross-origin, and a stolen response tells a third-party site
 * nothing it couldn't get by just calling the API itself with its own key.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Idempotency-Key',
  'Access-Control-Max-Age': '86400',
};

/** Wrap any NextResponse with CORS headers before returning it. */
export function withCors(response: NextResponse): NextResponse {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/** Standard preflight response for an OPTIONS request. */
export function corsPreflight(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}
