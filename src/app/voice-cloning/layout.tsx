
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Voice Cloning – Create a Custom Voice from a Sample',
  description: 'Upload a short audio sample and create a custom AI voice clone for your projects: fast, private, and easy to use.',
  alternates: {
    canonical: '/voice-cloning',
  },
  openGraph: {
    title: 'AI Voice Cloning – Create a Custom Voice from a Sample | 12Labs AI',
    description: 'Upload a short audio sample and create a custom AI voice clone for your projects: fast, private, and easy to use.',
    type: 'website',
    url: 'https://www.12labs.in/voice-cloning',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
