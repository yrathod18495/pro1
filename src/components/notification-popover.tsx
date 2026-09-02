'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from './ui/button';
import { Bell, CreditCard, Mail, CheckCircle, AlertTriangle, Megaphone, Loader2 } from 'lucide-react';
import { initializeFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { Notification, User } from '@/lib/types';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';

import { GetNotifiedButton } from '@/components/push-subscription-handler';

function NotificationIcon({ type, message }: { type: Notification['type']; message: string }) {
    const lowerCaseMessage = message.toLowerCase();

    switch (type) {
        case 'credits':
            return <CreditCard className="h-5 w-5 text-primary" />;
        case 'message':
            return <Mail className="h-5 w-5 text-blue-500" />;
        case 'system':
            if (lowerCaseMessage.includes('completed') || lowerCaseMessage.includes('generated') || lowerCaseMessage.includes('available') || lowerCaseMessage.includes('approved')) {
                return <CheckCircle className="h-5 w-5 text-primary" />;
            }
            if (lowerCaseMessage.includes('failed') || lowerCaseMessage.includes('refunded') || lowerCaseMessage.includes('rejected')) {
                return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
            }
            return <Megaphone className="h-5 w-5 text-primary" />;
        default:
            return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
}

export function NotificationPopover({ user }: { user: User }) {
  const { firestore } = initializeFirebase();
  const [isOpen, setIsOpen] = useState(false);

  const notificationsDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid, 'notifications', 'user_notifications');
  }, [firestore, user?.uid]);

  const { data: notificationsDoc, isLoading } = useDoc<{ entries: Notification[] }>(notificationsDocRef);

  const notifications = useMemo(() => {
      if (!notificationsDoc?.entries) return [];
      // Live-chat replies stay inside Live Chat and are intentionally not
      // shown in the general notification inbox.
      return notificationsDoc.entries
        .filter(notification => notification.type !== 'message')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [notificationsDoc?.entries]);
  
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  /**
   * 🔔 PERSISTENT READ SYNC
   */
  useEffect(() => {
    if (isOpen && unreadCount > 0 && notificationsDocRef && notificationsDoc?.entries) {
        const markAllAsRead = async () => {
            const updatedEntries = notificationsDoc.entries.map(n => 
                n.read ? n : { ...n, read: true }
            );

            try {
                await updateDoc(notificationsDocRef, { entries: updatedEntries });
            } catch (error) {
                console.error("[NotificationSync] Failed to mark as read:", error);
            }
        };

        markAllAsRead();
    }
  }, [isOpen, unreadCount, notificationsDocRef, notificationsDoc?.entries]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative transition-transform active:scale-90">
          <Bell className={cn("h-5 w-5", unreadCount > 0 && "animate-flip")} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 shadow-sm border border-white dark:border-background"></span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[90vw] sm:w-80 p-0 rounded-2xl shadow-3xl border-primary/10 overflow-hidden" align="end" sideOffset={10}>
        <div className="p-3.5 border-b bg-muted/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Notifications</h3>
            {unreadCount > 0 && <Badge className="bg-primary text-white text-[9px] h-5 px-2">{unreadCount} New</Badge>}
          </div>
          <GetNotifiedButton size="sm" variant="outline" className="h-7 text-[10px] font-bold tracking-wider rounded-lg border-primary/20 hover:bg-primary/10" />
        </div>
        <ScrollArea className="h-80 sm:h-96">
            {isLoading ? (
                <div className="p-12 text-center flex flex-col items-center gap-3 opacity-30">
                    <Loader2 className="h-6 w-6 animate-spin text-primary"/>
                    <p className="text-[10px] font-black uppercase tracking-widest">Syncing Hub...</p>
                </div>
            ) : notifications && notifications.length > 0 ? (
                <div className="divide-y divide-primary/5">
                    {notifications.map((notification, index) => (
                        <div 
                          key={`${notification.id}-${index}`} 
                          onClick={() => {
                            if (notification.type === 'message') {
                              setIsOpen(false);
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('open-live-chat'));
                              }
                            }
                          }}
                          className={cn(
                            "p-4 flex items-start gap-4 transition-colors cursor-pointer hover:bg-muted/50", 
                            !notification.read ? "bg-primary/[0.03]" : "opacity-70"
                          )}
                        >
                           <div className="mt-1 shrink-0 p-1.5 rounded-lg bg-background shadow-sm border border-primary/5">
                            <NotificationIcon type={notification.type} message={notification.message} />
                           </div>
                           <div className="flex-1 space-y-1">
                            <p className="text-xs font-bold leading-relaxed">{notification.message}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                                {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
                            </p>
                           </div>
                           {!notification.read && <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0 shadow-sm" />}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-20 text-center flex flex-col items-center gap-4 opacity-20 grayscale">
                    <Bell className="h-12 w-12" />
                    <p className="text-xs font-black uppercase tracking-widest">Inbox Empty</p>
                </div>
            )}
        </ScrollArea>
        {notifications.length > 0 && (
            <div className="p-3 border-t bg-muted/10 text-center">
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">Secure Sync Node Active</p>
            </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
