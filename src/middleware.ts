
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 🌐 12LABS MULTI-TENANT MIDDLEWARE (v2.0)
 * ----------------------------------------
 * Handles Subdomain Routing:
 * 1. store.12labs.in -> Internally rewrites to /store
 * 2. 12labs.in -> Redirects to www.12labs.in
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get('host') || '';

  // Skip middleware logic for AI Studio dev domains, localhost, or Cloud Run proxy domains
  if (
    host.includes('.run.app') || 
    host.includes('localhost') || 
    host.includes('aistudio.google.com') || 
    host.includes('googleusercontent.com')
  ) {
    return NextResponse.next();
  }

  // 1. NON-WWW to WWW Redirect (Production standard)
  // IMPORTANT: Never redirect Server Action calls (Next.js POSTs with a
  // 'next-action' header) or any non-GET request. Redirecting a POST breaks
  // the body/encoding and the client throws "An unexpected response was
  // received from the server." Only redirect real page navigations.
  const isServerAction = request.headers.has('next-action');
  const isNavigation = request.method === 'GET' || request.method === 'HEAD';
  if (host === '12labs.in' && isNavigation && !isServerAction) {
    return NextResponse.redirect(`https://www.12labs.in${url.pathname}`, 301);
  }

  // 2. STORE SUBDOMAIN REWRITE
  // Logic: If user is on store.12labs.in, we serve content from /store directory
  if (host.startsWith('store.')) {
    // Prevent recursive loop if already in /store
    if (!url.pathname.startsWith('/store') && !url.pathname.startsWith('/api')) {
      url.pathname = `/store${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.webmanifest (PWA manifest)
     * - sw.js (Service Worker)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js).*)',
  ],
};
