
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Purchases | 12Labs',
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
