'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-provider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
    Sun, 
    Moon, 
    LogOut, 
    CreditCard, 
    History as HistoryIcon, 
    ChevronDown, 
    ChevronUp,
    CircleDot,
    UserMinus, 
    Landmark, 
    Package, 
    ShoppingCart, 
    BellDot,
    Link2,
    Instagram,
    Youtube,
    MessageCircle,
    Send,
    ChevronRight,
    Home,
    ShoppingBag,
    LayoutDashboard,
    Mic,
    Sparkles,
    Music,
    Library,
    Store as StoreIcon,
    FilePenLine,
    AudioLines,
    MicVocal,
    FileCode,
    Lock,
    Terminal,
    Key,
    UserCircle
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { cn, generateAvatarColor, getDisplayUrl, formatCredits } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { NotificationPopover } from './notification-popover';
import { CreditHistoryDialog } from './admin/credit-history-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/context/cart-provider';
import { CartSheet } from './cart-sheet';
import { requestPushSubscription } from '@/context/studio-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';

export function Header() {
  const { user, logout, loading: authLoading, isImpersonating, stopImpersonating } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [avatarColor, setAvatarColor] = useState({ bg: 'bg-muted', text: 'text-muted-foreground' });
  const { toast } = useToast();
  const { itemCount } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { database } = initializeFirebase();

  const [isStoreDomain, setIsStoreDomain] = useState(false);
  const [isSocialExpanded, setIsSocialExpanded] = useState(false);
  const [toolSettings, setToolSettings] = useState<{ [key: string]: { locked?: boolean; discount?: string } }>({});
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!database) return;
    const settingsRef = ref(database, 'toolSettings');
    const unsubscribe = onRtdbValue(settingsRef, (snapshot) => {
      setToolSettings(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, [database]);

  const renderNavItem = (
    href: string,
    toolId: string | null,
    Icon: React.ElementType,
    label: string,
    iconColor: string,
    defaultBadge?: React.ReactNode,
    requireSeller?: boolean
  ) => {
    if (requireSeller && !isAdmin && !user?.isSeller) {
      return null;
    }

    const isLocked = toolId ? toolSettings[toolId]?.locked === true : false;
    
    // Hide completely for non-admins if locked
    if (isLocked && !isAdmin) {
      return null;
    }

    return (
      <SheetClose asChild key={href + (toolId || '')}>
        <Button variant="ghost" className="justify-start h-10 font-medium rounded-lg text-sm w-full" asChild>
          <Link href={href} className="flex items-center gap-3 w-full">
            <Icon className={cn("w-4 h-4", iconColor)} />
            <span className={cn(isLocked && "opacity-75 font-normal")}>{label}</span>
            {isLocked ? (
              <Badge variant="outline" className="ml-auto text-[9px] h-4 border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-500" />
                LOCKED
              </Badge>
            ) : (
              defaultBadge
            )}
          </Link>
        </Button>
      </SheetClose>
    );
  };

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
        setIsStoreDomain(window.location.hostname.startsWith('store.'));
    }
    if (user?.email) setAvatarColor(generateAvatarColor(user.email));
  }, [user]);

  // Dynamic navigation that respects the current origin
  const navigateTo = useCallback((path: string) => {
    if (typeof window === 'undefined') return;
    
    const hostname = window.location.hostname;
    const isProduction = hostname === '12labs.in' || hostname === 'www.12labs.in' || hostname.startsWith('store.12labs.in');
    
    // In production, if we are on a subdomain and want to go to a main path, we jump to www
    if (isProduction && isStoreDomain && !path.startsWith('/store')) {
        window.location.href = `https://www.12labs.in${path}`;
        return;
    }

    // In dev/preview or simple paths, just push
    router.push(path);
  }, [router, isStoreDomain]);

  const isLoading = !isMounted || authLoading;
  const currentTheme = resolvedTheme || 'light';

  // backdrop-blur-lg (16px) on a `sticky` bar has to re-sample everything
  // scrolling underneath it on every single frame — one of the most
  // common real causes of janky/laggy-feeling scroll on mobile. A lighter
  // blur plus a more opaque background reads almost identically but is
  // far cheaper to keep recomputing every frame.
  return (
    <header className="site-header sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-sm">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-1.5 sm:gap-4">
          {!isLoading && user && (
            <div className="flex items-center md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  {/* Menu trigger. Two short bars of unequal length in a
                      rounded container — reads as a menu without the dated
                      three-identical-lines look. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border border-border/60 bg-card/60 backdrop-blur anim-surface-border anim-surface-press shrink-0"
                  >
                    <span className="flex flex-col items-start justify-center gap-[5px]">
                      <span className="block h-[2px] w-[18px] rounded-full bg-foreground" />
                      <span className="block h-[2px] w-[11px] rounded-full bg-foreground/70" />
                    </span>
                    <span className="sr-only">Toggle menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] sm:w-[360px] p-0 border-r-primary/10 flex flex-col h-full z-[120]">
                  <SheetHeader className="p-5 border-b border-primary/5 flex-shrink-0 bg-background/50 backdrop-blur">
                    <SheetTitle className="flex items-center justify-between">
                      <Link href="/" className="flex items-baseline space-x-1">
                        <span className="text-2xl font-bold font-logo text-primary">12</span>
                        <span className="text-2xl font-bold font-headline">Labs</span>
                      </Link>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold border-primary/20 bg-primary/5 text-primary">
                        All Services
                      </Badge>
                    </SheetTitle>
                  </SheetHeader>

                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 pb-20">
                    {/* Quick Nav */}
                    <div>
                      <p className="px-2 pb-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Main Hub
                      </p>
                      <div className="grid grid-cols-1 gap-1">
                        {renderNavItem('/', null, Home, 'Home', 'text-primary')}
                        {renderNavItem('/store', 'store', ShoppingBag, 'Store', 'text-purple-600 dark:text-purple-400',
                          <Badge className="ml-auto text-[9px] h-4 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 border-none font-bold">
                            Shop
                          </Badge>
                        )}
                        {!isStoreDomain && renderNavItem('/studio', null, LayoutDashboard, 'Studio Dashboard', 'text-blue-600 dark:text-blue-400')}
                      </div>
                    </div>

                    {/* AI Studios & Music */}
                    <div>
                      <p className="px-2 pb-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        AI & Voice Studios
                      </p>
                      <div className="grid grid-cols-1 gap-1">
                        {renderNavItem('/studio', 'ai-voice-studio', Mic, 'Voice Studio', 'text-blue-600 dark:text-blue-400')}
                        {renderNavItem('/music-studio', 'music-studio', Music, 'Music AI Studio', 'text-pink-500')}
                        {renderNavItem('/music-library', 'music-library', Library, 'Music Library', 'text-emerald-500')}
                        {renderNavItem('/voice-cloning', 'voice-cloning', MicVocal, 'Voice Cloning', 'text-violet-500')}
                        {renderNavItem('/sound-search', 'sound-effect-search', AudioLines, 'SFX Sound Search', 'text-yellow-500')}
                      </div>
                    </div>

                    {/* Creator Tools */}
                    <div>
                      <p className="px-2 pb-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Creator & YouTube Tools
                      </p>
                      <div className="grid grid-cols-1 gap-1">
                        {renderNavItem('/script-generator', 'ai-script-studio', FilePenLine, 'Script AI Studio', 'text-amber-500')}
                        {renderNavItem('/thumbnail-generator', 'thumbnail-generator', Sparkles, 'Thumbnail Creator', 'text-purple-500')}
                        {renderNavItem('/pdf-tools', 'pdf-tools', FileCode, 'PDF Studio', 'text-slate-500')}
                      </div>
                    </div>

                    {/* Developer */}
                    <div>
                      <p className="px-2 pb-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Developer
                      </p>
                      <div className="grid grid-cols-1 gap-1">
                        {renderNavItem('/developer', 'developer-api', Terminal, 'Developer Platform', 'text-slate-600 dark:text-slate-400')}
                        {renderNavItem('/api-docs', 'developer-api', Key, 'API Documentation', 'text-slate-600 dark:text-slate-400')}
                      </div>
                    </div>

                    {/* Account & Seller */}
                    <div>
                      <p className="px-2 pb-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Account & Market
                      </p>
                      <div className="grid grid-cols-1 gap-1">
                        {renderNavItem('/seller', 'seller-hub', StoreIcon, 'Seller Hub', 'text-orange-500', undefined, true)}
                        {renderNavItem('/history', null, HistoryIcon, 'My Projects', 'text-primary/70')}
                        {renderNavItem('/buy-credits', null, CreditCard, 'Buy Credits', 'text-primary/70')}
                      </div>
                    </div>

                    {/* Connect with 12Labs */}
                    <div>
                      <p className="px-2 pb-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Connect with 12Labs
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" className="justify-start gap-2 h-9 border-primary/10 bg-background text-xs font-semibold" asChild>
                          <Link href="https://www.instagram.com/12labofficial" target="_blank">
                            <Instagram className="w-3.5 h-3.5 text-pink-600" />
                            <span>Instagram</span>
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" className="justify-start gap-2 h-9 border-primary/10 bg-background text-xs font-semibold" asChild>
                          <Link href="https://www.youtube.com/@12labofficial" target="_blank">
                            <Youtube className="w-3.5 h-3.5 text-red-600" />
                            <span>YouTube</span>
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" className="justify-start gap-2 h-9 border-primary/10 bg-background text-xs font-semibold" asChild>
                          <Link href="https://chat.whatsapp.com/CbWx44GhFyt49jCiHteGSe" target="_blank">
                            <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                            <span>WhatsApp</span>
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" className="justify-start gap-2 h-9 border-primary/10 bg-background text-xs font-semibold" asChild>
                          <Link href="https://t.me/twelvelab" target="_blank">
                            <Send className="w-3.5 h-3.5 text-blue-500" />
                            <span>Telegram</span>
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="p-4 border-t border-primary/10 bg-muted/30 flex-shrink-0">
                    <Button 
                      variant="outline" 
                      className="w-full justify-between h-11 font-bold rounded-xl border-primary/10 bg-background"
                      onClick={() => setTheme(currentTheme === 'light' ? 'dark' : 'light')}
                    >
                      <div className="flex items-center gap-3">
                        {currentTheme === 'light' ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}
                        <span>{currentTheme === 'light' ? 'Night Mode' : 'Day Mode'}</span>
                      </div>
                      <div className={cn(
                        "w-8 h-4.5 rounded-full relative transition-colors duration-300 flex items-center p-0.5",
                        currentTheme === 'dark' ? "bg-primary" : "bg-muted-foreground/30"
                      )}>
                        <div className={cn(
                          "w-3.5 h-3.5 rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out",
                          currentTheme === 'dark' ? "translate-x-3.5" : "translate-x-0"
                        )} />
                      </div>
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}

          <Link href="/" className="flex items-baseline space-x-1" prefetch={false}>
              <span className="text-xl sm:text-2xl font-bold font-logo text-primary">12</span>
              <span className="text-xl sm:text-2xl font-bold font-headline text-black dark:text-white">Labs</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-1 ml-4">
              <Button variant="ghost" asChild>
                  <Link href="/" prefetch={false}>Home</Link>
              </Button>
              <Button variant="ghost" asChild>
                  <Link href="/store" prefetch={false}>Store</Link>
              </Button>
              {!isStoreDomain && (
                  <Button variant="ghost" asChild>
                      <Link href="/studio" prefetch={false}>Studio</Link>
                  </Button>
              )}
          </div>

          {/* Credit balance. Tinted blue capsule with a visible border and
              an icon, rather than a solid blue block — the outlined style
              sits better next to the other header controls and keeps the
              number readable at 11px. Shown in FULL, never abbreviated:
              "100,197" reads as a real balance, while "100.2K" makes the
              same number feel smaller than it is. Decimals are stripped —
              a wallet figure with a decimal point reads like a price. */}
          {user && !isLoading && typeof user.credits !== 'undefined' && (
              <button
                  type="button"
                  onClick={() => setShowHistoryDialog(true)}
                  title={`${formatCredits(user.credits)} credits`}
                  className={cn(
                      "relative h-5 pl-1.5 pr-2 rounded-full overflow-hidden",
                      "inline-flex items-center gap-1",
                      "bg-primary/10 dark:bg-primary/15",
                      "border border-primary/30",
                      "text-primary",
                      "anim-surface-press anim-surface-focus",
                      "hover:bg-primary/15 dark:hover:bg-primary/20 transition-colors"
                  )}
              >
                  {/* Slow light sweeping behind the number. Low opacity and
                      pointer-events-none, so it never interferes with the
                      tap target or readability. */}
                  <span className="pointer-events-none absolute inset-0 anim-amb-sweep-x bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
                  <CircleDot className="relative h-2.5 w-2.5 shrink-0" />
                  <span className="relative text-[10px] font-bold tabular-nums leading-none">
                      {formatCredits(user.credits)}
                  </span>
              </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-2">
          {!isLoading && user ? (
            <>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 sm:h-10 sm:w-10" onClick={() => setIsCartOpen(true)}>
                <ShoppingCart className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                {itemCount > 0 && <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">{itemCount}</div>}
            </Button>
            <NotificationPopover user={user} />
            <DropdownMenu onOpenChange={(open) => { if(!open) setIsSocialExpanded(false); }}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2 h-9 sm:h-10 rounded-full border border-primary/10 group">
                  <Avatar className={cn("h-7 w-7 sm:h-8 sm:w-8 border shrink-0", isImpersonating ? "border-orange-500 border-2" : "border-primary/20")}>
                    <AvatarImage src={getDisplayUrl(user.photoURL) || ''} />
                    <AvatarFallback className={cn("font-bold text-xs sm:text-sm", avatarColor.bg, avatarColor.text)}>
                      {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="hidden sm:block h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 p-2 rounded-xl shadow-2xl border-primary/10 z-[120]" align="end" sideOffset={10}>
                  <DropdownMenuLabel className="font-normal px-2 py-3">
                      <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col space-y-1 min-w-0">
                              <p className="text-base font-bold leading-none truncate">{user.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <button
                            type="button"
                            aria-label="My Profile"
                            className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center hover:bg-primary/10 transition-colors"
                            onClick={(e) => { e.stopPropagation(); navigateTo('/profile'); }}
                          >
                            <UserCircle className="w-4 h-4 text-primary/70" />
                          </button>
                      </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-primary/5" />
                  <DropdownMenuGroup className="py-1">
                      {isImpersonating && (
                        <DropdownMenuItem className="rounded-lg h-11 cursor-pointer bg-orange-50 text-orange-700 font-bold mb-1" onClick={() => stopImpersonating()}>
                           <UserMinus className="w-4 h-4 mr-3" />
                           <span>Exit Impersonation</span>
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem className="rounded-lg h-11 cursor-pointer" onClick={() => navigateTo('/history')}>
                        <HistoryIcon className="w-4 h-4 mr-3 text-primary/70" />
                        <span className="font-medium">My Projects</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="rounded-lg h-11 cursor-pointer" onClick={() => navigateTo('/buy-credits')}>
                        <CreditCard className="w-4 h-4 mr-3 text-primary/70" />
                        <span className="font-medium">Buy Credits</span>
                      </DropdownMenuItem>
                      {((user.isAffiliate || user.role === 'admin')) && (
                        <DropdownMenuItem className="rounded-lg h-11 cursor-pointer" onClick={() => navigateTo('/payouts')}>
                          <Landmark className="w-4 h-4 mr-3 text-primary/70" />
                          <span className="font-medium">Payouts Hub</span>
                        </DropdownMenuItem>
                      )}
                      {(user.isSeller) && (
                        <DropdownMenuItem className="rounded-lg h-11 cursor-pointer" onClick={() => navigateTo('/seller')}>
                          <Package className="w-4 h-4 mr-3 text-primary/70" />
                          <span className="font-medium">Seller Hub</span>
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuItem 
                        className={cn(
                          "rounded-lg h-11 cursor-pointer transition-colors flex items-center justify-between",
                          isSocialExpanded ? "bg-primary/10 text-primary" : "hover:bg-primary/5"
                        )}
                        onSelect={(e) => {
                          e.preventDefault();
                          setIsSocialExpanded(!isSocialExpanded);
                        }}
                      >
                        <div className="flex items-center">
                          <Link2 className="w-4 h-4 mr-3 text-primary/70" />
                          <span className="font-medium">Connect with 12Labs</span>
                        </div>
                        {isSocialExpanded ? <ChevronUp className="h-3 w-3 opacity-50" /> : <ChevronRight className="h-3 w-3 opacity-50" />}
                      </DropdownMenuItem>

                      {isSocialExpanded && (
                        <div className="pl-4 space-y-1 py-1 mb-1 animate-in slide-in-from-top-2 duration-300">
                          <DropdownMenuItem className="rounded-lg h-10 cursor-pointer" asChild>
                            <Link href="https://www.instagram.com/12labofficial" target="_blank">
                              <Instagram className="w-3.5 h-3.5 mr-3 text-pink-600" />
                              <span className="text-xs font-bold">Instagram</span>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="rounded-lg h-10 cursor-pointer" asChild>
                            <Link href="https://www.youtube.com/@12labofficial" target="_blank">
                              <Youtube className="w-3.5 h-3.5 mr-3 text-red-600" />
                              <span className="text-xs font-bold">YouTube</span>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="rounded-lg h-10 cursor-pointer" asChild>
                            <Link href="https://chat.whatsapp.com/CbWx44GhFyt49jCiHteGSe" target="_blank">
                              <MessageCircle className="w-3.5 h-3.5 mr-3 text-green-600" />
                              <span className="text-xs font-bold">WhatsApp Group</span>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="rounded-lg h-10 cursor-pointer" asChild>
                            <Link href="https://t.me/twelvelab" target="_blank">
                              <Send className="w-3.5 h-3.5 mr-3 text-blue-500" />
                              <span className="text-xs font-bold">Telegram Channel</span>
                            </Link>
                          </DropdownMenuItem>
                        </div>
                      )}

                      <DropdownMenuItem className="rounded-lg h-11 cursor-pointer" onClick={() => requestPushSubscription(user, database, toast)}>
                        <BellDot className="w-4 h-4 mr-3 text-primary/70" />
                        <span className="font-medium">Get Notified</span>
                      </DropdownMenuItem>

                      {(user.role === 'admin' || isImpersonating) && (
                        <>
                          <DropdownMenuItem className="rounded-lg h-11 cursor-pointer font-bold text-primary mt-1 bg-primary/5" onClick={() => navigateTo('/admin')}>
                            <HistoryIcon className="w-4 h-4 mr-3" />
                            Admin Console
                          </DropdownMenuItem>
                        </>
                      )}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="bg-primary/5" />
                  <DropdownMenuItem className="rounded-lg h-11 cursor-pointer text-destructive font-bold" onClick={async () => { await logout(); }}>
                    <LogOut className="w-4 h-4 mr-3" />
                    <span>Log out</span>
                  </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : !isLoading && pathname !== '/login' && (
            <Button asChild className="rounded-full px-6"><Link href="/login" prefetch={false}>Login</Link></Button>
          )}
        </div>
      </div>
      <CartSheet open={isCartOpen} onOpenChange={setIsCartOpen} />
      {user && showHistoryDialog && <CreditHistoryDialog user={user} open={showHistoryDialog} onOpenChange={setShowHistoryDialog} showBuyButton={true} />}
    </header>
  );
}
