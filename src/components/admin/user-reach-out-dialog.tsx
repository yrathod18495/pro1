'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Send, Bell, Mail } from 'lucide-react';
import { initializeFirebase } from '@/firebase';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-provider';
import { sendTargetedNotificationByEmail } from '@/app/admin/send-email/actions';

/**
 * Reach out to ONE user from the users tab.
 *
 * Two independent channels, either or both:
 *   • In-app notification — written to the same
 *     users/{uid}/notifications/user_notifications document that the
 *     broadcast tool appends to, so it shows up in the user's existing
 *     notification bell with no new plumbing.
 *   • Email — goes through the existing Resend-backed
 *     sendTargetedNotificationByEmail action (already used by live chat),
 *     so the verified sending domain and reply-to are already correct.
 *
 * The two are reported separately on purpose: if the email bounces but
 * the notification landed, you need to know which happened.
 */
export function UserReachOutDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id?: string; uid?: string; name?: string; email?: string } | null;
}) {
  const { firestore } = initializeFirebase();
  const { user: adminUser } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sendNotification, setSendNotification] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const targetUid = user?.id || user?.uid;
  const canSend =
    !!targetUid && message.trim().length > 0 && (sendNotification || sendEmail) && !isSending;

  const reset = () => {
    setTitle('');
    setMessage('');
    setSendNotification(true);
    setSendEmail(false);
  };

  const handleSend = async () => {
    if (!targetUid || !firestore) return;
    if (sendEmail && !user?.email) {
      toast({ variant: 'destructive', title: 'No email on file', description: 'This user has no email address saved.' });
      return;
    }

    setIsSending(true);
    const results: string[] = [];
    const failures: string[] = [];

    if (sendNotification) {
      try {
        const notificationRef = doc(firestore, 'users', targetUid, 'notifications', 'user_notifications');
        await setDoc(
          notificationRef,
          {
            entries: arrayUnion({
              // Same shape the broadcast tool writes, so the user's
              // notification list renders it identically.
              id: `direct-${Date.now()}`,
              message: title.trim() ? `${title.trim()}: ${message.trim()}` : message.trim(),
              timestamp: new Date().toISOString(),
              read: false,
              type: 'system' as const,
            }),
          },
          { merge: true }
        );
        results.push('notification');
      } catch (e: any) {
        failures.push(`notification (${e?.message || 'failed'})`);
      }
    }

    if (sendEmail && user?.email) {
      try {
        const res = await sendTargetedNotificationByEmail({
          email: user.email,
          title: title.trim() || 'A message from 12Labs',
          message: message.trim(),
          adminEmail: adminUser?.email || 'admin',
          url: 'https://www.12labs.in',
          logToTelegram: true,
        });
        if (res.success) results.push('email');
        else failures.push(`email (${res.message || 'failed'})`);
      } catch (e: any) {
        failures.push(`email (${e?.message || 'failed'})`);
      }
    }

    setIsSending(false);

    if (results.length && !failures.length) {
      toast({ title: 'Sent', description: `Delivered by ${results.join(' and ')} to ${user?.name || user?.email}.` });
      reset();
      onOpenChange(false);
    } else if (results.length && failures.length) {
      toast({
        variant: 'destructive',
        title: 'Partly sent',
        description: `Sent: ${results.join(', ')}. Failed: ${failures.join(', ')}.`,
      });
    } else {
      toast({ variant: 'destructive', title: 'Not sent', description: failures.join(', ') || 'Nothing was sent.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Message {user?.name || 'user'}</DialogTitle>
          <DialogDescription className="text-xs">
            {user?.email || 'No email on file'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reach-title" className="text-xs font-bold">Title (optional)</Label>
            <Input
              id="reach-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. About your recent project"
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reach-message" className="text-xs font-bold">Message</Label>
            <Textarea
              id="reach-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What do you want to tell this user?"
              rows={5}
            />
          </div>

          <div className="space-y-2.5 rounded-xl border border-border/60 p-3">
            <p className="text-xs font-bold text-muted-foreground">Send via</p>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                checked={sendNotification}
                onCheckedChange={(v) => setSendNotification(v === true)}
              />
              <Bell className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-medium">In-app notification</span>
            </label>

            <label
              className={`flex items-center gap-2.5 ${user?.email ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            >
              <Checkbox
                checked={sendEmail}
                disabled={!user?.email}
                onCheckedChange={(v) => setSendEmail(v === true)}
              />
              <Mail className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-medium">
                Email {!user?.email && '(no address on file)'}
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {isSending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
            ) : (
              <><Send className="h-4 w-4 mr-2" /> Send</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
