import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <div className="flex flex-col items-center gap-4">
            <FileQuestion className="h-24 w-24 text-primary" />
            <h1 className="text-8xl font-bold text-primary">404</h1>
            <h2 className="text-3xl font-semibold">Page Not Found</h2>
            <p className="max-w-md text-muted-foreground">
                Sorry, we couldn't find the page you're looking for. It might have been moved, deleted, or maybe you just mistyped the URL.
            </p>
            <Button asChild className="mt-4">
                <Link href="/">Return to Homepage</Link>
            </Button>
        </div>
    </div>
  )
}
