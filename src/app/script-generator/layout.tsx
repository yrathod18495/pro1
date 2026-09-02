
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Script Generator – Write Video Scripts Instantly',
  description: 'Generate ready-to-record video scripts with AI: pick a genre and topic, then export your manuscript as text for narration.',
  alternates: {
    canonical: '/script-generator',
  },
  openGraph: {
    title: 'AI Script Generator – Write Video Scripts Instantly | 12Labs AI',
    description: 'Generate ready-to-record video scripts with AI: pick a genre and topic, then export your manuscript as text for narration.',
    type: 'website',
    url: 'https://www.12labs.in/script-generator',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
