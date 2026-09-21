
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read the 12Labs Terms of Service covering use of our AI Voice Studio, marketplace, credits, and account policies.',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'Terms of Service | 12Labs AI',
    description: 'Read the 12Labs Terms of Service covering use of our AI Voice Studio, marketplace, credits, and account policies.',
    type: 'website',
    url: 'https://www.12labs.in/terms',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
