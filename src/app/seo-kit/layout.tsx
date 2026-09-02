
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'YouTube SEO Kit – AI Titles, Tags & Descriptions',
  description: 'Generate optimized YouTube titles, descriptions, and tags with AI to help your videos rank and get discovered faster.',
  alternates: {
    canonical: '/seo-kit',
  },
  openGraph: {
    title: 'YouTube SEO Kit – AI Titles, Tags & Descriptions | 12Labs AI',
    description: 'Generate optimized YouTube titles, descriptions, and tags with AI to help your videos rank and get discovered faster.',
    type: 'website',
    url: 'https://www.12labs.in/seo-kit',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
