
import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';
import { Inter, Poppins } from 'next/font/google';
import { cn, getDisplayUrl } from '@/lib/utils';
import Script from 'next/script';
import { ImpersonationBar } from '@/components/impersonation-bar';
import { MainBottomNav } from '@/components/main-bottom-nav';
import { initializeFirebase } from '@/firebase/server';
import { Header } from '@/components/header';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const fontLogo = Poppins({
  subsets: ['latin'],
  weight: ['700', '900'],
  variable: '--font-logo',
  display: 'swap',
});

const siteUrl = 'https://www.12labs.in';

// Only the root shell is force-dynamic-free: the header/nav/auth widgets
// above are all client components that fetch their own live data via
// Firebase in the browser, so a cached/static shell doesn't affect
// personalization — it only skips redoing the same server work (and the
// RTDB logo lookup below) on every single request. Pages that genuinely
// need per-request server rendering (e.g. /studio, /store/[productId])
// already declare their own `export const dynamic = 'force-dynamic'`
// and are unaffected by this. Revalidating hourly keeps the logo (pulled
// from Realtime Database) reasonably fresh without paying the full
// dynamic-render + DB-read cost on every visit.
export const revalidate = 3600;

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export async function generateMetadata(): Promise<Metadata> {
  let logoPngUrl = 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png';
  
  try {
    const firebase = initializeFirebase();
    if (firebase.database) {
      const snapshotPromise = firebase.database.ref('settings/landingPage/masterLogoUrl').get();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000));
      
      const snapshot = await Promise.race([snapshotPromise, timeoutPromise]) as any;
      const rtdbLogo = snapshot.val();
      
      if (rtdbLogo) {
        logoPngUrl = getDisplayUrl(rtdbLogo);
      }
    } else {
      console.warn("[MetadataNode] Firebase Database not initialized.");
    }
  } catch (e) {
    console.warn("[MetadataNode] Using fallback logo due to sync timeout or network boundary.");
  }

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: '12Labs | Ultimate AI Studio for Indian Creators',
      template: '%s | 12Labs AI',
    },
    description: 'Transform your content with 12Labs AI Voice Studio. High-quality Hindi & English AI voices, custom voice cloning, script generation, and digital assets marketplace.',
    keywords: ['12labs', 'ai voice studio', 'hindi ai voice', 'elevenlabs alternative india', 'voice cloning india', 'ai script generator', 'youtube seo kit', 'digital marketplace for creators'],
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: '12Labs',
    },
    icons: {
      icon: logoPngUrl,
      apple: logoPngUrl,
    },
    openGraph: {
      title: '12Labs - Professional AI Tools for Modern Creators',
      description: 'The all-in-one neural studio for high-fidelity Indian AI voices, scriptwriting, and creative assets.',
      url: siteUrl,
      siteName: '12Labs AI',
      locale: 'en_IN',
      type: 'website',
      images: [{ url: logoPngUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title: '12Labs AI Studio',
      description: 'Empowering Indian creators with state-of-the-art AI technology.',
      images: [logoPngUrl],
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('error', (event) => {
                const msg = (event.message || '') + '';
                if (
                  msg.includes('ChunkLoadError') ||
                  msg.includes('Loading chunk') ||
                  msg.includes('Unexpected token') ||
                  msg.includes("Failed to fetch dynamically imported module")
                ) {
                  console.warn('Network or script sync error detected:', msg);
                  const lastReload = sessionStorage.getItem('last_sync_reload');
                  const now = Date.now();
                  if (!lastReload || (now - parseInt(lastReload) > 30000)) {
                    sessionStorage.setItem('last_sync_reload', now.toString());
                    setTimeout(() => window.location.reload(), 1500);
                  }
                }
              }, true);
            `,
          }}
        />
      </head>
      <body className={cn(
          'min-h-screen font-sans antialiased overflow-x-hidden w-full max-w-full pb-16 md:pb-0',
          fontSans.variable,
          fontLogo.variable
        )}>
            <Providers>
              <ImpersonationBar />
              {/* 🧭 GLOBAL HEADER: rendered once here so every route gets it
                  consistently — previously each page had to import <Header />
                  itself, and ~55 of 68 pages simply forgot to, so the header
                  was missing on most of the site. */}
              <Header />
              {children}
              <MainBottomNav />
            </Providers>
          <Script id="razorpay-checkout-js" src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        </body>
    </html>
  );
}
