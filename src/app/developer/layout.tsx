
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Developer API Keys | 12Labs',
  robots: {
    index: false,
    follow: false,
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
