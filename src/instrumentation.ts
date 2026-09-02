// Next.js instrumentation hook (App Router, Next 15+).
// `onRequestError` is called automatically for any UNCAUGHT error that
// happens while handling a request: Server Components, Route Handlers
// (API routes), and Server Actions that throw without an internal try/catch.
//
// Note: this does NOT catch errors that a function already catches
// internally and turns into a normal return value (e.g.
// `catch (e) { return { success: false, error: e.message } }`) — those
// are handled, not uncaught, so Next.js never sees them as errors.
// Those are reported separately, at the point they're caught.

export async function register() {
  // no-op: nothing to initialize on cold start
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  // Dynamic import so this file stays edge-runtime-safe if ever needed there;
  // report-error.ts itself is Node-only (uses fetch, fine on both).
  const { reportServerError } = await import('@/lib/report-error');

  reportServerError(`instrumentation:${context.routeType}`, error, {
    path: request.path,
    method: request.method,
    route: context.routePath,
  });
}
