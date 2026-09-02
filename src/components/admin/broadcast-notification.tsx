'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { initializeFirebase } from '@/firebase';
import { collection, writeBatch, doc, arrayUnion, getDocs, getCountFromServer } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Bell } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function BroadcastNotification() {
  const { user: currentUser } = useAuth();
  const { firestore } = initializeFirebase();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const { toast } = useToast();

  const fetchUserCount = async () => {
    if (!firestore || !currentUser || currentUser.role !== 'admin') return;
    setIsLoadingCount(true);
    try {
        const usersRef = collection(firestore, 'users');
        const snapshot = await getCountFromServer(usersRef);
        setUserCount(snapshot.data().count);
    } catch (error) {
        console.error("Failed to fetch user count:", error);
        setUserCount(0);
    } finally {
        setIsLoadingCount(false);
    }
  }

  const handleBroadcast = async () => {
    if (!message.trim() || !firestore) {
        toast({ variant: 'destructive', title: 'Cannot Send', description: 'Message is empty or database is unavailable.'});
        return;
    }
    setIsSending(true);

    try {
        const usersRef = collection(firestore, 'users');
        const usersSnapshot = await getDocs(usersRef);
        const users = usersSnapshot.docs;

        if (users.length === 0) {
            toast({ title: 'No users to notify.' });
            setIsSending(false);
            return;
        }

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

        for (const userDoc of users) {
            const notificationRef = doc(firestore, 'users', userDoc.id, 'notifications', 'user_notifications');
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

        toast({ title: 'Broadcast Sent', description: `Message sent to ${users.length} users.`});
        setMessage('');
    } catch(error: any) {
        console.error("Error broadcasting notification: ", error);
        toast({ variant: 'destructive', title: 'Broadcast Failed', description: 'An unexpected error occurred. Please try again.'});
    } finally {
        setIsSending(false);
    }
  };

  return (
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
          disabled={isSending}
        />
        <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
                {userCount !== null ? (
                    <span>Will be sent to <b>{userCount.toLocaleString()}</b> users.</span>
                ) : (
                    <Button variant="link" className="p-0 h-auto text-muted-foreground" onClick={fetchUserCount} disabled={isLoadingCount}>
                        {isLoadingCount ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Click to check user count
                    </Button>
                )}
            </div>
             <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button disabled={isSending || !message.trim()}>
                        {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Send Broadcast'}
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will send a notification to {userCount ? `${userCount.toLocaleString()} users` : 'all users'}. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBroadcast} disabled={isSending}>
                            {isSending ? 'Sending...' : 'Confirm & Send'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
