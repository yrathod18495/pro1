'use client';

import { AuthForm } from '@/components/auth-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-provider';
import { useState, useRef, useEffect, Suspense } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { reportClientError } from '@/lib/report-client-error';

function LoginPageContent() {
  const { user, loading: authLoading, loginWithEmail } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleMouseDown = () => {
    longPressTimer.current = setTimeout(() => {
      setIsAdminDialogOpen(true);
    }, 5000); 
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };
  
  const handleAdminLogin = async () => {
    if (!adminPassword) {
      toast({ variant: 'destructive', title: 'Password Required' });
      return;
    }
    setIsLoggingIn(true);
    try {
      await loginWithEmail('toonday378@gmail.com', adminPassword);
      toast({ title: 'Admin Login Successful' });
      setIsAdminDialogOpen(false);
    } catch (error: any) {
            reportClientError('src/app/login/page.tsx:50', error);
      toast({ variant: 'destructive', title: 'Admin Login Failed' });
    } finally {
      setIsLoggingIn(false);
      setAdminPassword('');
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
        const redirectTo = searchParams.get('redirect') || '/';
        router.replace(redirectTo);
    }
  }, [user, authLoading, searchParams, router]);

  if (authLoading || user) {
     return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4 text-muted-foreground animate-in fade-in duration-500">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="font-black uppercase tracking-widest text-[10px]">Synchronizing Identity Node...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background">

        <div className="relative z-10 w-full max-w-md px-4 py-12">
          <div className="flex flex-col items-center mb-10">
              <div
                className="cursor-default select-none animate-in fade-in slide-in-from-top-4 duration-1000"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchEnd={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <h1 className="flex items-baseline tracking-tighter font-headline">
                    <span className="text-7xl font-black text-primary">12</span><span className="text-4xl sm:text-5xl font-black text-foreground">Labs</span>
                </h1>
              </div>
          </div>

          <Card className="border rounded-[2rem] shadow-xl overflow-hidden">
              <CardHeader className="text-center pt-10 pb-4">
                  <CardTitle className="text-3xl font-black text-foreground tracking-tight">Welcome</CardTitle>
                  <CardDescription className="text-muted-foreground text-base">Sign in to your account to continue.</CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-10">
                  <AuthForm />
                  <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
                      By clicking continue, you agree to our{' '}
                      <Link href="/terms" prefetch={false} className="underline hover:text-primary transition-colors">Terms of Service</Link>
                      {' '}and{' '}
                      <Link href="/privacy" prefetch={false} className="underline hover:text-primary transition-colors">Privacy Policy</Link>.
                  </p>
              </CardContent>
          </Card>
        </div>

        <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
          <DialogContent className="rounded-[2.5rem] border-none shadow-3xl bg-background">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black flex items-center gap-3 uppercase tracking-tight">
                  <ShieldAlert className="h-6 w-6 text-primary" />
                  Root Override
              </DialogTitle>
              <DialogDescription className="text-xs font-bold uppercase opacity-60">
                  Secure administrator access. Please verify credentials.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <Input 
                type="password"
                placeholder="Admin Cipher..."
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                className="h-14 bg-muted/20 border-primary/10 rounded-2xl font-mono text-center text-lg"
              />
            </div>
            <DialogFooter className="gap-3">
              <Button variant="ghost" onClick={() => setIsAdminDialogOpen(false)} className="rounded-xl font-bold h-12">Abort</Button>
              <Button onClick={handleAdminLogin} disabled={isLoggingIn} className="rounded-xl px-10 font-black h-12 shadow-xl shadow-primary/20 uppercase tracking-widest text-xs">
                {isLoggingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Initiate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-transparent">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        }>
            <LoginPageContent />
        </Suspense>
    )
}