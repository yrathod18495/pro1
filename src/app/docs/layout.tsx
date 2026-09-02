
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation & Guides',
  description: 'Learn how to use 12Labs AI Studio: voice generation, script tools, the marketplace, and more, explained step by step.',
  alternates: {
    canonical: '/docs',
  },
  openGraph: {
    title: 'Documentation & Guides | 12Labs AI',
    description: 'Learn how to use 12Labs AI Studio: voice generation, script tools, the marketplace, and more, explained step by step.',
    type: 'website',
    url: 'https://www.12labs.in/docs',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
