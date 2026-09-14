'use client'
 
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { sendToTelegram } from '@/lib/telegram-logger'
import { escapeHtml } from '@/lib/utils'

// 🔴 FIX: "Loading chunk N failed" (ChunkLoadError) isn't a real code bug —
// it happens whenever a browser tab that's been open since BEFORE a new
// deploy tries to lazy-load a JS chunk by its old hash, which no longer
// exists on the server because the new deploy replaced it with a
// differently-hashed file. This is routine with frequent deploys and
// resolves itself completely with one page reload (which fetches the
// current HTML + chunk manifest) — it doesn't need a "Try again" button,
// a scary crash screen, or a Telegram alert every time it happens.
function isChunkLoadError(error: Error & { name?: string }): boolean {
  const name = error?.name || '';
  const message = typeof error?.message === 'string' ? error.message : '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\w.-]+ failed/i.test(message) ||
    /Loading CSS chunk [\w.-]+ failed/i.test(message)
  );
}

const RELOAD_GUARD_KEY = 'chunk-error-auto-reload-at';
// If a reload happened in the last 10s and we hit ANOTHER chunk error
// right away, the problem isn't staleness — stop auto-reloading so we
// don't loop forever, and fall through to the normal crash screen.
const RELOAD_GUARD_WINDOW_MS = 10_000;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isReloadingForChunkError, setIsReloadingForChunkError] = useState(false);

  useEffect(() => {
    console.error(error)

    if (isChunkLoadError(error)) {
      const lastReloadAt = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
      const justReloaded = Date.now() - lastReloadAt < RELOAD_GUARD_WINDOW_MS;

      if (!justReloaded) {
        setIsReloadingForChunkError(true);
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        // A quiet, informational note only — not the alarming crash alert,
        // since this isn't something anyone needs to act on.
        sendToTelegram(
          `🔄 <b>Stale Chunk Auto-Reload</b>\n` +
          `<b>Page:</b> ${escapeHtml(typeof window !== 'undefined' ? window.location.pathname : 'unknown')}\n` +
          `<b>Chunk:</b> ${escapeHtml(error.message || '')}\n` +
          `A browser tab open since before the last deploy hit a stale chunk — reloading automatically.`
        ).catch(() => {});
        window.location.reload();
        return;
      }
      // Reloaded already and it's STILL happening — this is no longer
      // routine staleness, so report it properly below like any other
      // crash instead of silently looping.
    }

    const safeMessage = typeof error?.message === 'string' ? error.message : String(error?.message ?? error ?? 'Unknown error')
    sendToTelegram(
      `🔴 <b>Global (Unrecoverable) React Crash</b>\n` +
      `<b>Page:</b> ${escapeHtml(typeof window !== 'undefined' ? window.location.pathname : 'unknown')}\n` +
      `<b>Message:</b> ${escapeHtml(safeMessage)}\n` +
      (typeof error?.stack === 'string' ? `<pre>${escapeHtml(error.stack.slice(0, 1500))}</pre>` : '')
    ).catch(() => {})
  }, [error])

  if (isReloadingForChunkError) {
    // Brief, calm message — this resolves itself in a moment, it's not
    // the "something went wrong" screen below.
    return (
      <html>
        <body>
          <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
            <p className="text-muted-foreground">Updating to the latest version…</p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
            <div className="flex flex-col items-center gap-4">
                <AlertTriangle className="h-24 w-24 text-destructive" />
                <h2 className="text-3xl font-semibold">Something went wrong!</h2>
                <p className="max-w-md text-muted-foreground">
                    An unrecoverable error occurred. Please try to refresh the page.
                </p>
                <Button onClick={reset} size="lg" className="mt-4">
                    Try again
                </Button>
            </div>
        </div>
      </body>
    </html>
  )
}
