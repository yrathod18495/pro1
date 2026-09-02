
import { MetadataRoute } from 'next';
import { initializeFirebase } from '@/firebase/server';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let logoUrl = 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png';
  
  try {
    const { database } = initializeFirebase();
    const snapshot = await database.ref('settings/landingPage/masterLogoUrl').get();
    const rtdbLogo = snapshot.val();
    
    if (rtdbLogo) {
      if (rtdbLogo.startsWith('http') || rtdbLogo.startsWith('data:')) {
        logoUrl = rtdbLogo;
      } else {
        const id = rtdbLogo.replace('tg://', '');
        // Using relative path for the API to avoid domain issues in preview
        logoUrl = `/api/cdn/${id}`;
      }
    }
  } catch (e) {
    console.error("Failed to fetch dynamic logo for manifest:", e);
  }

  // Generate Cloudinary optimized square PNGs for PWA requirements
  const getIconUrl = (size: number) => {
    if (logoUrl.includes('res.cloudinary.com')) {
      const parts = logoUrl.split('/upload/');
      return `${parts[0]}/upload/c_fill,g_center,ar_1:1,w_${size},h_${size},f_png/${parts[1]}`;
    }
    return logoUrl;
  };

  return {
    id: '/',
    name: '12Labs AI Studio',
    short_name: '12Labs',
    description: 'The Ultimate AI Studio for Indian Creators.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    scope: '/',
    icons: [
      {
        src: getIconUrl(192),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: getIconUrl(512),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Open Studio',
        url: '/studio',
        icons: [{ src: getIconUrl(192), sizes: '192x192' }],
      },
      {
        name: 'Digital Store',
        url: '/store',
        icons: [{ src: getIconUrl(192), sizes: '192x192' }],
      }
    ]
  };
}
