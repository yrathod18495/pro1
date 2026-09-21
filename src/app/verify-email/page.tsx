
'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useAuth } from '@/context/auth-provider';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MailCheck, MailWarning, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAuth, onIdTokenChanged, reload } from 'firebase/auth';
import { reportClientError } from '@/lib/report-client-error';

function VerifyEmailContent() {
  const { user, sendEmailVerification, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [status, setStatus] = useState<'loading' | 'unverified' | 'verified'>('loading');
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const handleResend = async () => {
    if (countdown === 0) {
      setIsResending(true);
      try {
        await sendEmailVerification();
        toast({
          title: 'Verification Email Sent',
          description: 'A new verification link has been sent to your email.',
        });
        setCountdown(60); 
      } catch (error: any) {
            reportClientError('src/app/verify-email/page.tsx:34', error);
        toast({
          variant: 'destructive',
          title: 'Failed to Resend Email',
          description: error.message || 'An error occurred. Please try again later.',
        });
      } finally {
        setIsResending(false);
      }
    }
  };
  
  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  useEffect(() => {
    if (authLoading) {
      setStatus('loading');
      return;
    }

    if (!user && !authLoading) {
      router.replace('/login');
      return;
    }

    if (user && user.emailVerified) {
      setStatus('verified');
      setTimeout(() => router.replace('/'), 1000);
      return;
    }
    
    setStatus('unverified');

    const auth = getAuth();
    const interval = setInterval(async () => {
        if (auth.currentUser && !auth.currentUser.emailVerified) {
            await reload(auth.currentUser);
        }
    }, 3000);

    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
        if (currentUser?.emailVerified) {
            setStatus('verified');
            clearInterval(interval);
            unsubscribe();
        }
    });

    return () => {
        unsubscribe();
        clearInterval(interval);
    };

  }, [user, authLoading, router, toast]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center text-center p-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Checking your status...</p>
          </div>
        );
      case 'verified':
        return (
          <div className="flex flex-col items-center justify-center text-center p-4">
            <MailCheck className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium">Email Verified Successfully!</p>
            <p className="text-muted-foreground">Redirecting you to Home...</p>
          </div>
        );
      case 'unverified':
        return (
          <>
            <CardHeader className="items-center text-center">
              <MailWarning className="h-12 w-12 text-yellow-500 mb-4" />
              <CardTitle className="text-2xl">Verify Your Email</CardTitle>
              <CardDescription>
                We&apos;ve sent a verification link to your email address. Please click the link to continue.
                <br />
                <strong className="text-yellow-600">Please check your spam folder if you don&apos;t see it.</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4 w-full">
              <div className="text-sm text-muted-foreground">
                <p>Didn&apos;t receive the email? Click below to resend.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={handleResend} disabled={isResending || countdown > 0}>
                  {isResending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    'Resend Verification Email'
                  )}
                  {countdown > 0 && ` (${countdown}s)`}
                </Button>
                <Button variant="link" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Wrong Email? Log Out
                </Button>
              </div>
            </CardContent>
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500 min-h-[380px] flex flex-col items-center justify-center">
        {renderContent()}
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
    return (
      <Suspense fallback={
          <div className="flex min-h-screen items-center justify-center bg-background p-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
      }>
          <VerifyEmailContent />
      </Suspense>
    )
  }
