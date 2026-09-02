'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { Home, Store, Library, Mic, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';

/**
 * Universal Mobile Bottom Navigation
 * Aligned with the user's requested 5-item set: HOME, STORE, STUDIO, LIBRARY, SUPPORT.
 * Features a premium glass effect, primary color highlight, and indicator dot.
 */
function MainBottomNavContent() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Restricted pages where nav is hidden
  const hiddenPaths = [
    '/login', 
    '/verify-email', 
    '/admin', 
    '/seller',
    '/maintenance',
    '/store',
    '/following',
    '/purchases',
    '/history'
  ];

  useEffect(() => {
    const handleChatOpen = () => setIsChatOpen(true);
    const handleChatClose = () => setIsChatOpen(false);

    window.addEventListener('live-chat-open', handleChatOpen);
    window.addEventListener('live-chat-close', handleChatClose);

    return () => {
      window.removeEventListener('live-chat-open', handleChatOpen);
      window.removeEventListener('live-chat-close', handleChatClose);
    };
  }, []);
  
  // CRITICAL: Hide navigation for guests, restricted pages, OR when chat is open
  const isHidden = loading || !user || isChatOpen || hiddenPaths.some(p => pathname.startsWith(p));

  if (isHidden) return null;

  const NavItem = ({ href, label, icon: Icon, isCenter = false }: { href: string, label: string, icon: any, isCenter?: boolean }) => {
    const isActive = href === '/' 
      ? pathname === '/' 
      : pathname.startsWith(href);

    if (isCenter) {
        return (
            <div className="flex items-center justify-center">
                <Link href={href} prefetch={false} className="relative group">
                    <div className={cn(
                        "w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 active:scale-90 shadow-lg",
                        isActive 
                            ? "bg-primary text-white shadow-primary/20 scale-110" 
                            : "bg-muted/50 text-foreground hover:bg-primary/10 hover:text-primary"
                    )}>
                        <Icon className={cn("w-7 h-7", isActive ? "animate-pulse" : "")} strokeWidth={isActive ? 3 : 2} />
                    </div>
                    {isActive && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
                    )}
                </Link>
            </div>
        );
    }

    return (
        <Link 
            href={href} 
            prefetch={false} 
            className={cn(
                "flex flex-col items-center justify-center gap-1 transition-all duration-300 relative",
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
        >
            <div className={cn(
                "transition-all duration-300 flex items-center justify-center",
                isActive ? "scale-110 -translate-y-0.5" : ""
            )}>
                <Icon className={cn("w-6 h-6", isActive ? "stroke-[2.5px]" : "stroke-[2px]")} />
            </div>
            <span className={cn(
                "text-[8px] font-black uppercase tracking-widest transition-all duration-300", 
                isActive ? "opacity-100" : "opacity-40"
            )}>
                {label}
            </span>
            {isActive && (
                <div className="absolute -bottom-1.5 w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
            )}
        </Link>
    );
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 z-[100] w-full h-16 bg-background/70 backdrop-blur-xl border-t border-primary/10 shadow-[0_-8px_30px_rgba(0,0,0,0.1)]">
      <div className="grid h-full grid-cols-5 items-center px-1 max-w-md mx-auto">
        
        <NavItem href="/" label="HOME" icon={Home} />
        
        <NavItem href="/store" label="STORE" icon={Store} />
        
        <NavItem 
            href="/studio" 
            label="STUDIO" 
            icon={Mic} 
            isCenter 
        />

        <NavItem href="/music-library" label="LIBRARY" icon={Library} />
        
        <NavItem href="/contact" label="SUPPORT" icon={MessageCircle} />

      </div>
    </nav>
  );
}

export function MainBottomNav() {
  return (
    <Suspense fallback={null}>
      <MainBottomNavContent />
    </Suspense>
  );
}
