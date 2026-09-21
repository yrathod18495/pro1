
'use client';

import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header Loading */}
      <div className="flex flex-col items-center text-center md:items-start md:text-left md:flex-row md:justify-between gap-6">
          <div className="space-y-2">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-40 rounded-xl" />
      </div>
      
      {/* Stats Cards Loading */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>

      {/* Tabs Layout Loading */}
      <div className="space-y-8">
        <Skeleton className="h-14 w-full rounded-2xl" />
        
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <Skeleton className="h-64 w-full rounded-[2.5rem]" />
            <div className="grid md:grid-cols-2 gap-8">
              <Skeleton className="h-48 w-full rounded-[2.5rem]" />
              <Skeleton className="h-48 w-full rounded-[2.5rem]" />
            </div>
          </div>
          <Skeleton className="h-[600px] w-full rounded-[2.5rem]" />
        </div>
      </div>

      {/* Global Loader for explicit feedback */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-[100] bg-background/5 backdrop-blur-[1px]">
          <div className="bg-background border shadow-2xl p-4 rounded-2xl flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-xs font-black uppercase tracking-widest">Reading System Data...</span>
          </div>
      </div>
    </div>
  );
}
