
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Digital Asset Hub – Voices, Sound Packs & Templates',
  description: 'Browse and buy voice packs, sound effects, and creative digital assets from the 12Labs marketplace, built for Indian content creators.',
  alternates: {
    canonical: '/store',
  },
  openGraph: {
    title: 'Digital Asset Store – Voices, Sound Packs & Templates | 12Labs AI',
    description: 'Browse and buy voice packs, sound effects, and creative digital assets from the 12Labs marketplace, built for Indian content creators.',
    type: 'website',
    url: 'https://www.12labs.in/store',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
