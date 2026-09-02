'use client'
 
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
 
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])
 
  return (
    <div className="container mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] text-center">
      <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
      <h2 className="text-2xl font-bold mb-2">Oops! Something went wrong.</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        There was an issue loading the store. You can try refreshing the page.
      </p>
      <Button onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
