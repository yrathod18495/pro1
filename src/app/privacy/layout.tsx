
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Read the 12Labs Privacy Policy to understand how we collect, use, and protect your data across our AI Voice Studio and marketplace.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | 12Labs AI',
    description: 'Read the 12Labs Privacy Policy to understand how we collect, use, and protect your data across our AI Voice Studio and marketplace.',
    type: 'website',
    url: 'https://www.12labs.in/privacy',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
