'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LogoutPage() {
  const { logout, user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
        if (user) {
            logout();
        } else {
            // Already logged out, redirect to login
            router.replace('/login');
        }
    }
  }, [user, loading, logout, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">Logging you out...</p>
        </div>
    </div>
  );
}
