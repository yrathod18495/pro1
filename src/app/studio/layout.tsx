
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Voice Studio – Generate Story & Character Voiceovers',
  description: 'Turn your script into a fully voiced story with 12Labs Voice Studio: assign different AI voices per character, add emotion tags, and export in one click.',
  alternates: {
    canonical: '/studio',
  },
  openGraph: {
    title: 'AI Voice Studio – Generate Story & Character Voiceovers | 12Labs AI',
    description: 'Turn your script into a fully voiced story with 12Labs Voice Studio: assign different AI voices per character, add emotion tags, and export in one click.',
    type: 'website',
    url: 'https://www.12labs.in/studio',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
