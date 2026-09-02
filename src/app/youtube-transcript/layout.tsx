
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'YouTube Transcript Generator - Extract Text from Video',
  description: 'Instantly extract text transcripts from any YouTube video. The 12Labs Transcript tool supports Hindi, English, and 10+ languages for research and content reuse.',
  alternates: {
    canonical: '/youtube-transcript',
  },
  openGraph: {
    title: 'YouTube Transcript Generator – Get Video Captions Instantly | 12Labs AI',
    description: 'Paste any YouTube video link to fetch its transcript instantly, useful for captions, repurposing content, and research.',
    type: 'website',
    url: 'https://www.12labs.in/youtube-transcript',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
