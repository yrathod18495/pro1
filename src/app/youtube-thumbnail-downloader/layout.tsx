import { Header } from "@/components/header";
import ToolLockGuard from "@/components/tool-lock-guard";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free YouTube Thumbnail Downloader - Download 4K & HD Images | 12Labs',
  description: 'Download high-quality YouTube thumbnails for free. Get HD (1280x720), 4K, and SD resolutions instantly. Fast, safe, and no registration required. Best tool for creators.',
  keywords: [
    'youtube thumbnail downloader', 
    'download youtube thumbnail', 
    'get youtube thumbnail', 
    '4k youtube thumbnail downloader', 
    'hd thumbnail extractor', 
    'youtube image downloader', 
    '12labs thumbnail tool',
    'youtube thumbnail save'
  ],
  alternates: {
    canonical: '/youtube-thumbnail-downloader',
  },
  openGraph: {
    title: 'YouTube Thumbnail Downloader - Free HD & 4K | 12Labs',
    description: 'The easiest way to grab HD thumbnails from any YouTube video. Just paste the URL and download.',
    type: 'website',
    url: 'https://www.12labs.in/youtube-thumbnail-downloader',
  }
};

export default function YouTubeThumbnailDownloaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <ToolLockGuard toolId="thumbnail-generator" toolName="AI Thumbnail Generator">
        <main className="flex-1">{children}</main>
      </ToolLockGuard>
    </>
  );
}
