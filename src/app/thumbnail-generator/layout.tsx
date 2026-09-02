
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Thumbnail Generator – Create Custom YouTube Thumbnails',
  description: 'Generate eye-catching, custom YouTube thumbnails with AI. Describe your idea, generate variations, and download in seconds.',
  alternates: {
    canonical: '/thumbnail-generator',
  },
  openGraph: {
    title: 'AI Thumbnail Generator – Create Custom YouTube Thumbnails | 12Labs AI',
    description: 'Generate eye-catching, custom YouTube thumbnails with AI. Describe your idea, generate variations, and download in seconds.',
    type: 'website',
    url: 'https://www.12labs.in/thumbnail-generator',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
