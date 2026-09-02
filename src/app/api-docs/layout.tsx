
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '12Labs Studio Voice API – REST API Documentation',
  description: 'One endpoint: send text, get back voice audio from the same engine that powers 12Labs Studio. Full REST API docs and setup guide.',
  alternates: {
    canonical: '/api-docs',
  },
  openGraph: {
    title: '12Labs Studio Voice API – REST API Documentation | 12Labs AI',
    description: 'One endpoint: send text, get back voice audio from the same engine that powers 12Labs Studio. Full REST API docs and setup guide.',
    type: 'website',
    url: 'https://www.12labs.in/api-docs',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
