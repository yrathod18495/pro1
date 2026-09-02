
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Music Library – Royalty-Free Tracks for Creators',
  description: 'Search and preview a growing library of royalty-free music tracks, sorted by mood, price, and popularity, ready to license for your content.',
  alternates: {
    canonical: '/music-library',
  },
  openGraph: {
    title: 'Music Library – Royalty-Free Tracks for Creators | 12Labs AI',
    description: 'Search and preview a growing library of royalty-free music tracks, sorted by mood, price, and popularity, ready to license for your content.',
    type: 'website',
    url: 'https://www.12labs.in/music-library',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
