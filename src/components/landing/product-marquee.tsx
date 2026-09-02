
'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { initializeFirebase } from '@/firebase';
import { ref, get, query, limitToLast } from 'firebase/database';
import type { StoreProduct } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, getDisplayUrl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export function ProductMarquee() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const { database } = initializeFirebase();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasStartedLoading(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!database || !hasStartedLoading) {
      return;
    }

    const fetchProducts = async () => {
      try {
        const storeProductsRef = ref(database, 'storeProducts');
        const q = rtdbQuery(storeProductsRef, limitToLast(50));
        
        const snapshot = await get(q);
        if (snapshot.exists()) {
          const data = snapshot.val();
          // Ensure every product has a unique ID from the RTDB key
          const productsArray: StoreProduct[] = Object.entries(data)
            .filter(([_, val]: [string, any]) => val && typeof val === 'object' && val.title && val.productType)
            .map(([id, val]: [string, any]) => ({
              ...val,
              id: val.id || id
            }))
            .filter((p: any) => p.status !== 'sold' && !p.isSold && !p.buyerUid);
          const shuffled = shuffleArray(productsArray);
          setProducts(shuffled.slice(0, 15));
        }
      } catch (error) {
        console.error("Failed to fetch products for marquee:", error);
      } finally {
        setIsLoading(false);
      }
    };

    const rtdbQuery = (ref: any, ...args: any[]) => query(ref, ...args);
    fetchProducts();
  }, [database, hasStartedLoading]);

  if (!hasStartedLoading && products.length === 0) {
    return <section ref={sectionRef} className="w-full h-40 bg-muted/5 border-y" />;
  }

  if (isLoading) {
    return (
      <section ref={sectionRef} className="w-full py-8 bg-muted/20 border-y">
        <div className="container flex gap-4 overflow-hidden px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full sm:w-60 rounded-[1.5rem] flex-shrink-0" />
          ))}
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section ref={sectionRef} className="w-full py-8 bg-muted/20 border-y overflow-hidden group">
      <div className="container px-4">
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          plugins={[
            Autoplay({
              delay: 3000,
              stopOnInteraction: false,
            }),
          ]}
          className="w-full"
        >
          <CarouselContent className="-ml-2">
            {products.map((product) => (
              <CarouselItem key={product.id} className="pl-2 basis-[60%] sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6">
                <Link 
                  href={`/store/${product.id}`} 
                  prefetch={false}
                  className="block h-full group/link"
                >
                  <div className="bg-card border rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-500 h-full flex flex-col">
                    <div className="relative aspect-video w-full bg-muted">
                      <img 
                        src={getDisplayUrl(product.previewImage) || 'https://res.cloudinary.com/dptryoeis/image/upload/v1772590885/c10h0lknqblj7kfxp5qr.png'} 
                        alt={product.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover/link:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute top-2 right-2">
                         <Badge className="bg-background/90 backdrop-blur-md text-foreground font-black text-[10px] px-2 h-6 border-none shadow-lg">
                            ₹{product.price}
                         </Badge>
                      </div>
                    </div>
                    <div className="p-3 flex flex-col flex-1 gap-1">
                      <h4 className="font-bold text-xs line-clamp-1 group-hover/link:text-primary transition-colors">{product.title}</h4>
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <p className="text-[8px] text-muted-foreground font-black uppercase tracking-[0.1em] opacity-60">
                            {product.productType}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
}
