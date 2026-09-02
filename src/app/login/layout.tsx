
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login | 12Labs AI Studio',
  description: 'Sign in to access your 12Labs workspace.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
