
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us – Support & Help',
  description: 'Get in touch with the 12Labs team for support, questions, or feedback via WhatsApp, Telegram, or email.',
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact Us – Support & Help | 12Labs AI',
    description: 'Get in touch with the 12Labs team for support, questions, or feedback via WhatsApp, Telegram, or email.',
    type: 'website',
    url: 'https://www.12labs.in/contact',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
