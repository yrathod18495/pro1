
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free AI Sound Effect Search - 30,000+ Royalty Free SFX',
  description: 'Search and download thousands of copyright-free sound effects for your YouTube videos and projects. Fast, easy, and high quality SFX library by 12Labs.',
  alternates: {
    canonical: '/sound-search',
  },
  openGraph: {
    title: 'Sound Effects Search – Find Royalty-Free SFX | 12Labs AI',
    description: 'Search thousands of royalty-free sound effects by keyword and preview instantly, perfect for adding polish to your videos.',
    type: 'website',
    url: 'https://www.12labs.in/sound-search',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
