'use client'
 
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
import { sendToTelegram } from '@/lib/telegram-logger'
import { escapeHtml } from '@/lib/utils'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    const safeMessage = typeof error?.message === 'string' ? error.message : String(error?.message ?? error ?? 'Unknown error')
    sendToTelegram(
      `🔴 <b>Global (Unrecoverable) React Crash</b>\n` +
      `<b>Page:</b> ${escapeHtml(typeof window !== 'undefined' ? window.location.pathname : 'unknown')}\n` +
      `<b>Message:</b> ${escapeHtml(safeMessage)}\n` +
      (typeof error?.stack === 'string' ? `<pre>${escapeHtml(error.stack.slice(0, 1500))}</pre>` : '')
    ).catch(() => {})
  }, [error])

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
