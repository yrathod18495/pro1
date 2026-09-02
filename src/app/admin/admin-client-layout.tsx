
'use client';

import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { 
  BarChart3, 
  Users, 
  FolderSearch, 
  ListTodo, 
  IndianRupee, 
  MessageCircle, 
  Loader2, 
  Tag, 
  Package, 
  Landmark, 
  Store,
  ShoppingBag,
  MicVocal,
  Database,
  Terminal,
  Activity
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const adminNavItems = [
  { href: '/admin', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
  { href: '/admin/users', label: 'Users', icon: <Users className="h-4 w-4" /> },
  { href: '/admin/chat', label: 'Live Chat', icon: <MessageCircle className="h-4 w-4" /> },
  { href: '/admin/payments', label: 'Payments', icon: <IndianRupee className="h-4 w-4" /> },
  { href: '/admin/pending', label: 'Processing', icon: <ListTodo className="h-4 w-4" /> },
  { href: '/admin/clone-studio', label: 'Clone Hub', icon: <MicVocal className="h-4 w-4" /> },
  { href: '/admin/projects', label: 'Moderator', icon: <Package className="h-4 w-4" /> },
  { href: '/admin/sold-products', label: 'Sold Items', icon: <ShoppingBag className="h-4 w-4" /> },
  { href: '/admin/project-lookup', label: 'AI Lookup', icon: <FolderSearch className="h-4 w-4" /> },
  { href: '/admin/sales', label: 'Sellers', icon: <Store className="h-4 w-4" /> },
  { href: '/admin/payouts', label: 'Affiliates', icon: <Landmark className="h-4 w-4" /> },
  { href: '/admin/promo-codes', label: 'Promos', icon: <Tag className="h-4 w-4" /> },
  { href: '/developer', label: 'API Console', icon: <Terminal className="h-4 w-4" /> },
  { href: '/admin/api-logs', label: 'API Logs', icon: <Activity className="h-4 w-4" /> },
];

function MobileAdminBottomNav() {
    const pathname = usePathname();
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            const container = containerRef.current;
            const activeItem = container.querySelector<HTMLElement>('[data-active="true"]');
            
            if (activeItem) {
                // Calculate center scroll position
                const containerWidth = container.offsetWidth;
                const itemLeft = activeItem.offsetLeft;
                const itemWidth = activeItem.offsetWidth;
                
                const scrollLeft = itemLeft - (containerWidth / 2) + (itemWidth / 2);
                
                container.scrollTo({
                    left: scrollLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [pathname]);
    
    return (
        <div className="md:hidden fixed bottom-0 left-0 z-[100] w-full h-16 bg-background/80 backdrop-blur-xl border-t border-muted/50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            {/* Left and right fade gradients to indicate swipeability */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background via-background/60 to-transparent pointer-events-none z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background via-background/60 to-transparent pointer-events-none z-10" />
            
            <div 
                ref={containerRef}
                className="flex items-center gap-1.5 h-full overflow-x-auto scrollbar-none px-6 scroll-smooth snap-x"
            >
                {adminNavItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            data-active={isActive ? "true" : "false"}
                            className={cn(
                                "relative flex-shrink-0 inline-flex flex-col items-center justify-center text-center px-4 h-12 rounded-xl transition-all duration-300 snap-center min-w-[76px] select-none",
                                isActive ? "text-primary scale-105 font-black" : "text-muted-foreground opacity-60 hover:opacity-80"
                            )}
                        >
                            {/* Sliding active backplate indicator using layoutId */}
                            {isActive && (
                                <motion.span
                                    layoutId="activeMobileAdminTab"
                                    className="absolute inset-x-1 inset-y-1 bg-primary/10 rounded-xl -z-10"
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                            )}
                            
                            <span className={cn(
                                "flex items-center justify-center transition-transform duration-300",
                                isActive ? "-translate-y-0.5" : ""
                            )}>
                                {React.isValidElement(item.icon) ? React.cloneElement(item.icon as React.ReactElement<any>, { 
                                    className: cn("w-5 h-5 mb-0.5", isActive ? "stroke-[2.5px]" : "stroke-[2px]") 
                                } as any) : item.icon}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-tight whitespace-nowrap">{item.label}</span>
                            
                            {/* Smooth sliding dot indicator */}
                            {isActive && (
                                <motion.span 
                                    layoutId="activeDot"
                                    className="absolute bottom-1 w-1 h-1 rounded-full bg-primary"
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                            )}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

export default function AdminClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading, isImpersonating } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authLoading && !isImpersonating && (!user || user.role !== 'admin')) {
      router.push('/studio'); 
    }
  }, [user, authLoading, router, isImpersonating]);

  if (authLoading || (!isImpersonating && (!user || user.role !== 'admin'))) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/40">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">Verifying root credentials...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
        <Header />
        
        {/* Horizontal Scroll Navigation Bar */}
        <div className="sticky top-16 z-40 bg-background/95 backdrop-blur-md border-b">
            <ScrollArea className="w-full">
                <div className="flex items-center gap-3 p-3 px-4">
                    {adminNavItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                        return (
                            <Link 
                                key={item.href} 
                                href={item.href} 
                                className={cn(
                                    "px-4 h-9 flex items-center gap-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300",
                                    isActive 
                                        ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" 
                                        : "bg-muted/50 text-muted-foreground hover:bg-primary/5 hover:text-primary"
                                )}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
                <ScrollBar orientation="horizontal" className="invisible" />
            </ScrollArea>
        </div>
        
        <main className="flex-1 overflow-y-auto pb-24 md:pb-8 pt-4">
            <div className="p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
                {children}
            </div>
        </main>
        
        <MobileAdminBottomNav />
    </div>
  );
}
