import { MetadataRoute } from 'next';
import { initializeFirebase } from '@/firebase/server';

/**
 * @fileOverview Generates sitemap.xml for full site indexing.
 * Includes all new production hubs, plus live store products and seller
 * storefronts so the marketplace's actual listings get crawled/indexed —
 * not just the static tool pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.12labs.in';

  const staticRoutes = [
    { url: '/', priority: 1.0, changeFrequency: 'daily' },
    { url: '/studio', priority: 0.9, changeFrequency: 'weekly' },
    { url: '/pro-studio', priority: 0.9, changeFrequency: 'weekly' },
    { url: '/new-ai-studio', priority: 0.9, changeFrequency: 'weekly' },
    { url: '/store', priority: 0.9, changeFrequency: 'daily' },
    { url: '/music-studio', priority: 0.8, changeFrequency: 'weekly' },
    { url: '/music-library', priority: 0.8, changeFrequency: 'daily' },
    { url: '/script-generator', priority: 0.8, changeFrequency: 'monthly' },
    { url: '/seo-kit', priority: 0.8, changeFrequency: 'monthly' },
    { url: '/pdf-tools', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/voice-cloning', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/buy-credits', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/sound-search', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/youtube-thumbnail-downloader', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/thumbnail-generator', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/youtube-transcript', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/docs', priority: 0.8, changeFrequency: 'weekly' },
    { url: '/api-docs', priority: 0.6, changeFrequency: 'monthly' },
    { url: '/contact', priority: 0.5, changeFrequency: 'monthly' },
    { url: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { url: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  ];

  const routes = staticRoutes.map((route) => ({
    url: `${baseUrl}${route.url}`,
    lastModified: new Date().toISOString(),
    changeFrequency: route.changeFrequency as any,
    priority: route.priority,
  }));

  // Best-effort: if Firestore is unreachable at build/request time, we still
  // return the static routes above rather than failing the whole sitemap.
  try {
    const { firestore } = initializeFirebase();

    const [productsSnap, sellersSnap] = await Promise.all([
      firestore.collection('products').where('status', '==', 'approved').limit(5000).get(),
      firestore.collection('sellers').where('onboarded', '==', true).limit(5000).get(),
    ]);

    const productRoutes: MetadataRoute.Sitemap = productsSnap.docs.map((doc) => {
      const data = doc.data() as { createdAt?: string };
      return {
        url: `${baseUrl}/store/${doc.id}`,
        lastModified: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
        changeFrequency: 'weekly' as any,
        priority: 0.6,
      };
    });

    const sellerRoutes: MetadataRoute.Sitemap = sellersSnap.docs.map((doc) => {
      const data = doc.data() as { createdAt?: string };
      return {
        url: `${baseUrl}/seller/${doc.id}`,
        lastModified: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
        changeFrequency: 'weekly' as any,
        priority: 0.5,
      };
    });

    return [...routes, ...productRoutes, ...sellerRoutes];
  } catch (e) {
    console.warn('[sitemap] Falling back to static routes only:', (e as Error)?.message);
    return routes;
  }
}