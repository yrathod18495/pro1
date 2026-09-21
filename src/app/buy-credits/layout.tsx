
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Buy Credits – Plans & Pricing for 12Labs AI Studio',
  description: 'Compare 12Labs subscription plans and credit packs, and manage your billing for AI voice generation and other studio tools.',
  alternates: {
    canonical: '/buy-credits',
  },
  openGraph: {
    title: 'Buy Credits – Plans & Pricing for 12Labs AI Studio | 12Labs AI',
    description: 'Compare 12Labs subscription plans and credit packs, and manage your billing for AI voice generation and other studio tools.',
    type: 'website',
    url: 'https://www.12labs.in/buy-credits',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
