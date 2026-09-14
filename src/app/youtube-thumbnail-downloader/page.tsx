'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function YouTubeThumbnailDownloaderPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/thumbnail-generator?mode=download');
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground">
      <Loader2 className="h-10 w-10 animate-spin text-[#9C27B0] mb-4" />
      <p className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Loading TwelveLabs Unified Media Studio...</p>
    </div>
  );
}
