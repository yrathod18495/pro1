'use client';

import React, { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

function ProductCardPlaceholder() {
  return (
    <div className="flex flex-col rounded-2xl border overflow-hidden">
      <Skeleton className={cn('w-full aspect-[4/3]')} />
      <div className="p-4 sm:p-6 space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex items-center gap-2 pt-3 border-t border-dashed">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1">
                <Skeleton className="h-2 w-8" />
                <Skeleton className="h-3 w-12" />
            </div>
        </div>
      </div>
    </div>
  );
}

function FilterChipsSkeleton() {
  return (
    <div className="sticky top-16 bg-background z-40 border-b">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-3 px-4 py-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </div>
  );
}

export default function StoreLoading() {
  return (
    <>
      <FilterChipsSkeleton />
      <div className="container mx-auto max-w-7xl py-6 px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <ProductCardPlaceholder />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
