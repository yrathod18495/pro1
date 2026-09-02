
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMemoFirebase, initializeFirebase, useCollection } from '@/firebase';
import { collection, writeBatch, doc, arrayUnion } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Bell, ShieldCheck, AlertTriangle, RefreshCw, Key } from 'lucide-react';
import { sendBroadcastPush, getPushDiagnostics } from './push-actions';

export function BroadcastNotification() {
  const { user: currentUser } = useAuth();
  const { firestore } = initializeFirebase();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [diag, setDiag] = useState<any>(null);
  const [isCheckingDiag, setIsCheckingDiag] = useState(false);
  const { toast } = useToast();

  const runDiagnostics = async () => {
    setIsCheckingDiag(true);
    try {
      const result = await getPushDiagnostics();
      setDiag(result);
    } catch (err: any) {
      console.error('[Diagnostic Error]:', err);
    } finally {
      setIsCheckingDiag(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const usersQuery = useMemoFirebase(() => {
    if (firestore && currentUser?.role === 'admin') {
      return collection(firestore, 'users');
    }
    return null;
  }, [firestore, currentUser?.role]);
  
  const { data: users, isLoading: usersLoading } = useCollection<UserProfile>(usersQuery);

  const handleBroadcast = async () => {
    if (!message.trim() || !users || users.length === 0 || !firestore) {
        toast({ variant: 'destructive', title: 'Cannot Send', description: 'Please enter a message to broadcast.'});
        return;
    }
    setIsSending(true);

    try {
        const maxBatchWrites = 500;
        let batch = writeBatch(firestore);
        let writeCount = 0;
        const notificationData = {
            id: `broadcast-${Date.now()}`,
            message: message,
            timestamp: new Date().toISOString(),
            read: false,
            type: 'system' as const,
        };

        for (const user of users) {
            const notificationRef = doc(firestore, 'users', user.uid, 'notifications', 'user_notifications');
            batch.set(notificationRef, { entries: arrayUnion(notificationData) }, { merge: true });
            writeCount++;

            if (writeCount === maxBatchWrites) {
                await batch.commit();
                batch = writeBatch(firestore);
                writeCount = 0;
            }
        }
        
        if (writeCount > 0) {
            await batch.commit();
        }

        // Send Web Push Notification to all devices subscribed in RTDB
        const pushResult = await sendBroadcastPush('12Labs Announcement', message);

        if (pushResult.success) {
            toast({ title: 'Broadcast Sent 🎉', description: `In-app notification sent to ${users.length} users. Push sent to ${pushResult.count || 0} device(s).`});
            setMessage('');
        } else {
            toast({ 
                variant: 'destructive', 
                title: 'Push Failed ⚠️', 
                description: pushResult.error || 'Push dispatch failed.'
            });
        }
    } catch(error: any) {
        console.error("Error broadcasting notification: ", error);
        toast({ variant: 'destructive', title: 'Broadcast Failed', description: 'An unexpected error occurred. Please try again.'});
    } finally {
        setIsSending(false);
        runDiagnostics();
    }
  };

  const isLoading = usersLoading || isSending;

  return (
    <div className="space-y-4">
      {/* Push Diagnostic Banner */}
      <Card className="border-border/50 bg-muted/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" /> VAPID Push Diagnostics
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={runDiagnostics} disabled={isCheckingDiag}>
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingDiag ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          {diag ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 rounded bg-background border">
                  {diag.isPrivateKeySet ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div>
                    <span className="font-medium">PUSH_PRIVATE_KEY:</span>{' '}
                    {diag.isPrivateKeySet ? 'Configured' : 'Missing in .env'}
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded bg-background border">
                  <Bell className="h-4 w-4 text-blue-500 shrink-0" />
                  <div>
                    <span className="font-medium">Active Devices in DB:</span> {diag.totalSubscriptions} ({diag.activeUserCount} users)
                  </div>
                </div>
              </div>

              {diag.derivedPublicKey && (
                <div className="p-2 rounded bg-background border space-y-1 font-mono text-[11px] break-all">
                  <div className="font-sans font-medium text-muted-foreground">Derived Public Key from Private Key:</div>
                  <div className="text-primary font-bold">{diag.derivedPublicKey}</div>
                </div>
              )}

               {diag.configuredPublicKey && diag.derivedPublicKey && !diag.keysMatch && (
                 <div className="p-2 rounded bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                   NEXT_PUBLIC_VAPID does not match the public key derived from PUSH_PRIVATE_KEY. New subscriptions use the derived key; update the public key and ask users to enable notifications again.
                 </div>
               )}

               {diag.keyError && (
                <div className="p-2 rounded bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                  {diag.keyError}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking push configuration...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Broadcast Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell /> Send Announcement</CardTitle>
          <CardDescription>Send a notification to all registered users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Type your broadcast message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isLoading}
          />
          <div className="flex justify-end">
            <Button onClick={handleBroadcast} disabled={isLoading || !message.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isSending ? 'Sending...' : 'Loading users...'}
                </>
              ) : (
                'Send to All Users'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

