
import { MetadataRoute } from 'next';

/**
 * 🔴 This route serves /manifest.webmanifest and OVERRIDES any static
 * public/manifest.webmanifest — Next.js's file-based manifest route wins.
 *
 * It used to build icon URLs dynamically from the admin-configurable
 * Cloudinary logo in RTDB. That's a problem for an installable app:
 *
 *  1. Android/PWABuilder need icons that reliably resolve at build/install
 *     time. A cross-domain Cloudinary URL that depends on an RTDB read
 *     (which can time out, and silently falls back) is fragile for
 *     something baked into an installed app.
 *  2. Changing the admin logo would silently change the installed app's
 *     icon — or break it — with no way to test the result first.
 *
 * Icons are now the committed files in public/, which always resolve and
 * are what PWABuilder packages into the APK. The rest of the fields are
 * also filled in to what PWABuilder validates against (id, orientation,
 * categories, lang/dir, a maskable icon, shortcuts).
 *
 * NOTE: theme_color here must stay in sync with `viewport.themeColor` in
 * src/app/layout.tsx — PWABuilder flags a mismatch between them.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '12Labs - AI Voice Generation & Content Studio',
    short_name: '12Labs',
    description: 'The ultimate AI toolkit for Indian creators. Generate high-quality AI voices, create YouTube SEO content, design thumbnails, and write scripts—all in one place.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    scope: '/',
    lang: 'en',
    dir: 'ltr',
    categories: ['productivity', 'utilities', 'multimedia'],
    prefer_related_applications: false,
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'AI Voice Studio',
        short_name: 'Studio',
        description: 'Generate multi-character AI voiceovers',
        url: '/studio',
        icons: [{ src: '/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Script Generator',
        short_name: 'Scripts',
        description: 'Write AI story scripts',
        url: '/script-generator',
        icons: [{ src: '/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Music Library',
        short_name: 'Music',
        description: 'Royalty-free background music',
        url: '/music-library',
        icons: [{ src: '/icon-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'My Projects',
        short_name: 'History',
        description: 'View your generated projects',
        url: '/history',
        icons: [{ src: '/icon-192x192.png', sizes: '192x192' }],
      },
    ],
  };
}
