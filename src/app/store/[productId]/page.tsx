import { cache, Suspense } from 'react';
import { getProductDetails as fetchProductDetails } from './actions';
import { notFound } from 'next/navigation';
import ProductView from '@/components/store/product-view';
import { Skeleton } from '@/components/ui/skeleton';
import type { Metadata } from 'next';

type PageProps = {
  params: Promise<{ productId: string }>;
};

// 🔁 READ-COST FIX: generateMetadata() and the page component below both
// need the same product record, and Next.js runs both for every single
// page view. Without this, that meant 2x the RTDB/Firestore reads on
// EVERY store product visit. React's cache() memoizes this call per
// request, so the underlying getProductDetails() actually only runs once
// no matter how many times it's called during the same render pass.
const getProductDetails = cache(fetchProductDetails);

// Generate dynamic metadata for social sharing
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { productId } = await params;
  if (!productId) {
    return {};
  }
  
  const { product } = await getProductDetails(productId);

  if (!product) {
    return {
      title: 'Product Not Found',
    };
  }

  const siteUrl = 'https://www.12labs.in';
  const ogImageUrl = product.previews?.[0]?.url || 'https://storage.12labs.in/Uploaded%20previews/20260820_095435.jpg';
  const description = (product.description || '').slice(0, 160);

  return {
    title: product.title,
    description: description,
    alternates: {
        canonical: `/store/${product.id}`,
    },
    openGraph: {
      title: `${product.title} | 12Labs Store`,
      description: description,
      url: `${siteUrl}/store/${product.id}`,
      siteName: '12Labs',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.title} | 12Labs Store`,
      description: description,
      images: [ogImageUrl],
    },
  };
}


// This makes sure Next.js doesn't cache this page statically, as it depends on dynamic data
export const dynamic = 'force-dynamic';

function ProductPageSkeleton() {
    return (
        <div className="container mx-auto max-w-6xl py-10">
             <div className="grid lg:grid-cols-3 gap-8 md:gap-12">
                <div className="lg:col-span-2 space-y-4">
                    <Skeleton className="w-full aspect-video rounded-xl" />
                    <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="w-full aspect-video rounded-lg" />
                        ))}
                    </div>
                </div>
                <div className="lg:col-span-1">
                     <Skeleton className="w-full h-[500px] rounded-xl" />
                </div>
            </div>
        </div>
    );
}

export default async function ProductPage({
  params,
}: PageProps) {
  const { productId } = await params;
  
  if (!productId) {
    notFound();
  }

  const { product, seller } = await getProductDetails(productId);

  if (!product) {
    notFound();
  }

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: (product.description || '').slice(0, 500),
    image: product.previews?.map((p) => p.url).filter(Boolean) || [],
    ...(seller?.storeName || product.sellerName
      ? { brand: { '@type': 'Brand', name: seller?.storeName || product.sellerName } }
      : {}),
    offers: {
      '@type': 'Offer',
      url: `https://www.12labs.in/store/${product.id}`,
      priceCurrency: 'INR',
      price: product.price,
      availability:
        product.status === 'sold'
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/InStock',
    },
  };

  return (
    <Suspense fallback={<ProductPageSkeleton />}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
        <ProductView initialProduct={product} initialSeller={seller} />
    </Suspense>
  );
}
