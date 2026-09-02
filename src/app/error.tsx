'use client' // Error components must be Client Components
 
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { sendToTelegram } from '@/lib/telegram-logger'
import { escapeHtml } from '@/lib/utils'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
    const safeMessage = typeof error?.message === 'string' ? error.message : String(error?.message ?? error ?? 'Unknown error')
    sendToTelegram(
      `🔴 <b>React Render Crash</b>\n` +
      `<b>Page:</b> ${escapeHtml(typeof window !== 'undefined' ? window.location.pathname : 'unknown')}\n` +
      `<b>Message:</b> ${escapeHtml(safeMessage)}\n` +
      (typeof error?.stack === 'string' ? `<pre>${escapeHtml(error.stack.slice(0, 1500))}</pre>` : '')
    ).catch(() => {})
  }, [error])
 
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
