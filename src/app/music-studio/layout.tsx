
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Music Studio – Generate Background Music & Tracks',
  description: 'Create custom background music with AI: pick a mood, apply presets, and download royalty-free tracks for your videos.',
  alternates: {
    canonical: '/music-studio',
  },
  openGraph: {
    title: 'AI Music Studio – Generate Background Music & Tracks | 12Labs AI',
    description: 'Create custom background music with AI: pick a mood, apply presets, and download royalty-free tracks for your videos.',
    type: 'website',
    url: 'https://www.12labs.in/music-studio',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
