import { MetadataRoute } from 'next';

/**
 * @fileOverview Generates robots.txt to control search engine crawling.
 *
 * IMPORTANT: This is the ONLY robots.txt source for the site — there must
 * never also be a public/robots.txt file, since Next.js will not reliably
 * serve both and it caused inconsistent crawl rules before.
 *
 * We deliberately do NOT `disallow` private pages like /admin/, /seller/,
 * /payouts/, /login, /purchases/ etc. here. Blocking a page in robots.txt
 * stops Googlebot from ever fetching it — which also means Googlebot can
 * never see that page's `noindex` meta tag, so an already-indexed private
 * URL can get stuck in Search results forever ("Indexed, though blocked
 * by robots.txt"). Instead, every private route has its own
 * `robots: { index: false, follow: false }` metadata (see each route's
 * layout.tsx) — that's what actually removes/keeps it out of the index.
 *
 * robots.txt here only blocks paths that are NOT pages at all (API routes,
 * Next.js build assets) — there's no meta tag to add to a JSON response,
 * and letting crawlers hit them just wastes crawl budget.
 */
const TECHNICAL_DISALLOW = ['/api/', '/_next/'];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.12labs.in';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: TECHNICAL_DISALLOW,
      },
      // Same technical-only block applies to AI/LLM crawlers — they can
      // read every real page (that's fine, none of it is secret once a
      // human can view it while logged out), just not hit API/build paths.
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'Google-Extended', 'ClaudeBot'],
        allow: '/',
        disallow: TECHNICAL_DISALLOW,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
