
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free Copyright-Free Background Music for Cartoon & YouTube Videos | 12Labs',
  description: 'Download free, copyright-free background music for cartoon videos, kids animation, YouTube, and Reels. Royalty-free cinematic, emotional, horror, comedy, and lo-fi tracks — no copyright claims, safe for monetization.',
  keywords: [
    'cartoon video background music free',
    'copyright free background music',
    'royalty free music for cartoons',
    'free background music for youtube videos',
    'no copyright music download',
    'free music for kids videos',
    'royalty free cinematic music',
    'free music for animation',
    'background music for youtube no copyright',
    'safe for monetization music',
  ],
  alternates: {
    canonical: '/music-library',
  },
  openGraph: {
    title: 'Free Copyright-Free Background Music for Cartoon & YouTube Videos | 12Labs',
    description: 'Download free, copyright-free background music for cartoon videos, kids animation, YouTube, and Reels — royalty-free tracks safe for monetization, no copyright claims.',
    type: 'website',
    url: 'https://www.12labs.in/music-library',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Copyright-Free Background Music for Cartoon & YouTube Videos',
    description: 'Royalty-free cartoon, cinematic, and kids-video background music — free to download, safe for monetization.',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const musicLibrarySchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Free Copyright-Free Background Music for Cartoon & YouTube Videos',
    description: 'Free and premium royalty-free background music for cartoon videos, kids animation, YouTube, and Reels — no copyright claims, safe for monetization.',
    url: 'https://www.12labs.in/music-library',
    about: {
      '@type': 'Thing',
      name: 'Royalty-free background music',
    },
    isAccessibleForFree: true,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(musicLibrarySchema) }}
      />
      {children}
    </>
  );
}
