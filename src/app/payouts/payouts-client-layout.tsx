'use client';

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-provider";
import { Loader2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import LockedToolPage from "@/components/locked-tool-page";

export default function PayoutsClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?redirect=${pathname}`);
    }
  }, [user, authLoading, router, pathname]);

  if (authLoading || !user) {
    return (
      <>
        <Header />
        <main className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="font-medium">Loading Payouts...</p>
            </div>
        </main>
      </>
    );
  }

  if (!user.isAffiliate && user.role !== 'admin') {
    return (
        <>
            <Header />
            <main className="flex-1">
                 <LockedToolPage 
                    toolName="Payouts Dashboard"
                    message="This area is for registered affiliates only."
                 />
            </main>
        </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1 bg-muted/40">{children}</main>
    </>
  );
}
