'use client' // Error components must be Client Components
 
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { sendToTelegram } from '@/lib/telegram-logger'
import { escapeHtml } from '@/lib/utils'

// See src/app/global-error.tsx for the full explanation — same fix here
// for segment-level crashes, since a stale chunk can surface through
// either boundary depending on where the lazy import happens.
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
const RELOAD_GUARD_WINDOW_MS = 10_000;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isReloadingForChunkError, setIsReloadingForChunkError] = useState(false);

  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)

    if (isChunkLoadError(error)) {
      const lastReloadAt = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
      const justReloaded = Date.now() - lastReloadAt < RELOAD_GUARD_WINDOW_MS;

      if (!justReloaded) {
        setIsReloadingForChunkError(true);
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        sendToTelegram(
          `🔄 <b>Stale Chunk Auto-Reload</b>\n` +
          `<b>Page:</b> ${escapeHtml(typeof window !== 'undefined' ? window.location.pathname : 'unknown')}\n` +
          `<b>Chunk:</b> ${escapeHtml(error.message || '')}\n` +
          `A browser tab open since before the last deploy hit a stale chunk — reloading automatically.`
        ).catch(() => {});
        window.location.reload();
        return;
      }
    }

    const safeMessage = typeof error?.message === 'string' ? error.message : String(error?.message ?? error ?? 'Unknown error')
    sendToTelegram(
      `🔴 <b>React Render Crash</b>\n` +
      `<b>Page:</b> ${escapeHtml(typeof window !== 'undefined' ? window.location.pathname : 'unknown')}\n` +
      `<b>Message:</b> ${escapeHtml(safeMessage)}\n` +
      (typeof error?.stack === 'string' ? `<pre>${escapeHtml(error.stack.slice(0, 1500))}</pre>` : '')
    ).catch(() => {})
  }, [error])

  if (isReloadingForChunkError) {
    return (
      <div className="container mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] text-center">
        <p className="text-muted-foreground">Updating to the latest version…</p>
      </div>
    );
  }
 
  return (
    <div className="container mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] text-center">
      <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
      <h2 className="text-2xl font-bold mb-2">Oops! Something went wrong.</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        An unexpected error occurred. You can try to refresh the page or go back.
      </p>
      <Button onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
