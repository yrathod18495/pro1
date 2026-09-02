
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New AI Studio – Voice Generation & Timeline Editor',
  description: 'Generate, trim, and arrange AI voice clips on a timeline, then export a finished ZIP bundle from 12Labs newest studio interface.',
  alternates: {
    canonical: '/new-ai-studio',
  },
  openGraph: {
    title: 'New AI Studio – Voice Generation & Timeline Editor | 12Labs AI',
    description: 'Generate, trim, and arrange AI voice clips on a timeline, then export a finished ZIP bundle from 12Labs newest studio interface.',
    type: 'website',
    url: 'https://www.12labs.in/new-ai-studio',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
