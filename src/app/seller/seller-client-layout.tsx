'use client';

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { useRouter, usePathname } from "next/navigation";
import React, { useEffect, useState, useMemo } from "react";
import { LayoutDashboard, Package, Upload, IndianRupee, Settings, Loader2, Hourglass, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { initializeFirebase } from "@/firebase";
import { ref, onValue } from "firebase/database";
import { onRtdbValue } from '@/lib/rtdb-listener';
import { SidebarProvider, Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset } from '@/components/ui/sidebar';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SellerProfile } from "@/lib/types";

const sellerDashboardPaths = [
  '/seller',
  '/seller/products',
  '/seller/sales',
  '/seller/settings',
];

const publicSellerPaths = [
    '/seller/add-product',
    '/seller/add-script',
    '/seller/add',
    '/seller/onboarding',
];

const sellerNavItems = [
  { href: '/seller', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/seller/products', label: 'Products', icon: <Package className="h-4 w-4" /> },
  { href: '/seller/add', label: 'Add', icon: <Upload className="h-4 w-4" /> },
  { href: '/seller/sales', label: 'Sales', icon: <IndianRupee className="h-4 w-4" /> },
  { href: '/seller/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
];

function OnboardingGuard({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { database } = initializeFirebase();
    const router = useRouter();
    const pathname = usePathname();
    const [isLoading, setIsLoading] = useState(true);
    const [profile, setProfile] = useState<SellerProfile | null>(null);

    useEffect(() => {
        if (!user || (!user.isSeller && user.role !== 'admin') || !database) {
            setIsLoading(false);
            return;
        }

        const profileRef = ref(database, `sellerProfiles/${user.uid}`);
        const unsubscribe = onRtdbValue(profileRef, (snapshot) => {
            const data = snapshot.val() as SellerProfile;
            setProfile(data);
            setIsLoading(false);
        }, (error) => {
            console.error("Failed to check seller profile:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user, database]);

    useEffect(() => {
        if (isLoading) return;
        
        const isOnboardingPage = pathname.includes('/seller/onboarding');
        
        const hasMandatoryFields = 
            profile?.mobileNumber && 
            profile?.secondaryEmail && 
            profile?.payoutDetails?.paymentQrUrl &&
            profile?.payoutDetails?.upiId &&
            profile?.payoutDetails?.accountHolderName;

        const needsOnboarding = !profile || !profile.onboarded || !hasMandatoryFields;
        
        if (needsOnboarding && !isOnboardingPage && user?.isSeller) {
            router.replace('/seller/onboarding');
        }
    }, [isLoading, profile, pathname, router, user]);

    if (isLoading) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="font-medium">Verifying seller profile...</p>
                </div>
            </div>
        );
    }

    const isPending = profile?.status === 'pending' || profile?.status === 'pending_update';
    const isAdmin = user?.role === 'admin';

    if (isPending && !isAdmin && !pathname.includes('/seller/onboarding')) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] p-6">
                <Card className="max-w-md w-full text-center rounded-[2.5rem] p-8 border-none shadow-xl bg-card">
                    <CardHeader className="p-0 space-y-6">
                        <div className="mx-auto bg-amber-100 p-5 rounded-full w-fit mb-6">
                            <Hourglass className="h-10 w-10 text-amber-600 animate-pulse" />
                        </div>
                        <div className="space-y-2">
                            <CardTitle className="text-2xl font-black uppercase tracking-tight">Identity Review</CardTitle>
                            <CardDescription className="text-base font-medium leading-relaxed">
                                {profile?.status === 'pending' 
                                    ? "Welcome! Our team is verifying your identity to ensure a safe marketplace."
                                    : "Profile updated! We are reviewing your new details now."
                                }
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <div className="mt-8 p-6 bg-muted/30 rounded-[2rem] border border-dashed border-primary/10">
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] leading-relaxed">
                            Estimated wait: 2-4 hours. <br/> You will be notified instantly via push.
                        </p>
                    </div>
                    <div className="mt-8 flex flex-col gap-3">
                        <Button asChild className="rounded-xl font-bold h-12 px-8 gap-2 bg-primary shadow-xl shadow-primary/20">
                            <Link href="/store">
                                <ArrowLeft className="h-4 w-4" />
                                Back to Store
                            </Link>
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }
    
    return <>{children}</>;
}

function MobileBottomNav() {
    const pathname = usePathname();
    return (
        <div className="md:hidden fixed bottom-0 left-0 z-50 w-full h-16 bg-background border-t">
            <div className="grid h-full grid-cols-5 mx-auto">
                {sellerNavItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/seller' && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "inline-flex flex-col items-center justify-center text-center px-1 group",
                                isActive ? "text-primary" : "text-muted-foreground"
                            )}
                        >
                            {React.cloneElement(item.icon as React.ReactElement<any>, { 
                                className: cn("w-5 h-5 mb-1 transition-colors", isActive ? "text-primary" : "group-hover:text-primary") 
                            } as any)}
                            <span className="text-[10px] font-medium transition-colors">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

export default function SellerClientLayout({ children }: { children: React.ReactNode; }) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const normalizedPathname = useMemo(() => {
    return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  }, [pathname]);
  
  const isSellerDashboardPage = sellerDashboardPaths.includes(normalizedPathname);
  const isPublicSellerPage = publicSellerPaths.some(p => pathname.startsWith(p));
  const isAnySellerPage = isSellerDashboardPage || isPublicSellerPage;

  useEffect(() => {
    if (!isAnySellerPage || authLoading) return;

    if (!user) {
        router.push(`/login?redirect=${pathname}`);
        return;
    }

    if (isSellerDashboardPage && !user.isSeller && user.role !== 'admin') {
        router.push('/seller/add-product');
    }
  }, [user, authLoading, router, pathname, isAnySellerPage, isSellerDashboardPage]);

  if (authLoading && isAnySellerPage) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="font-medium">Syncing account...</p>
            </div>
        </div>
      </div>
    );
  }

  if (!isAnySellerPage) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  const showSidebar = user?.isSeller || user?.role === 'admin';

  return (
    <OnboardingGuard>
        <SidebarProvider>
            <div className="flex flex-col min-h-screen w-full">
                <Header />
                <div className="flex flex-1 overflow-hidden">
                    {showSidebar && (
                      <Sidebar className="p-2 hidden md:flex border-r">
                          <SidebarContent className="flex flex-col py-4">
                              <SidebarMenu className="flex-1 px-2 space-y-1">
                                  {sellerNavItems.map((item) => {
                                      const isActive = normalizedPathname === item.href || (item.href !== '/seller' && normalizedPathname.startsWith(item.href));
                                      return (
                                          <SidebarMenuItem key={item.href}>
                                              <Link href={item.href}>
                                                  <SidebarMenuButton
                                                      isActive={isActive}
                                                      className="w-full justify-start gap-3 h-11 px-4 rounded-xl"
                                                      tooltip={item.label}
                                                  >
                                                      {item.icon}
                                                      <span className="font-bold">{item.label}</span>
                                                  </SidebarMenuButton>
                                              </Link>
                                          </SidebarMenuItem>
                                      );
                                  })}
                              </SidebarMenu>
                          </SidebarContent>
                      </Sidebar>
                    )}
                    
                    <SidebarInset className="flex-1 relative overflow-y-auto pb-20 md:pb-8">
                        <main className="p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
                            {children}
                        </main>
                    </SidebarInset>
                </div>
                 {showSidebar && <MobileBottomNav />}
            </div>
        </SidebarProvider>
    </OnboardingGuard>
  );
}
