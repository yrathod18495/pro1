
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pro Studio – Advanced Multi-Character Voice Generation',
  description: 'A more powerful version of Voice Studio for longer manuscripts: fine-tune character assignments and generation settings, then export production-ready audio.',
  alternates: {
    canonical: '/pro-studio',
  },
  openGraph: {
    title: 'Pro Studio – Advanced Multi-Character Voice Generation | 12Labs AI',
    description: 'A more powerful version of Voice Studio for longer manuscripts: fine-tune character assignments and generation settings, then export production-ready audio.',
    type: 'website',
    url: 'https://www.12labs.in/pro-studio',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
