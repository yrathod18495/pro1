'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, set } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getActiveVapidPublicKey } from '@/app/admin/push-actions';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown';
  let deviceId = localStorage.getItem('12labs_push_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    localStorage.setItem('12labs_push_device_id', deviceId);
  }
  return deviceId;
}

function getVapidKey(): string {
  return (process.env.NEXT_PUBLIC_VAPID ||
    'BBtch_VrbD3lBahKFtM68sPvbjbGwysDiLrgls0F6IbeoxWAjYL9dhonyYo1Ib49M-yVVxm1F5Qoz40FIePpD70')
    .trim()
    .replace(/^["']|["']$/g, '');
}

async function registerSubscription(vapidPublicKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();

  // A subscription is tied to its application server key. Re-create it when
  // the server key changes instead of silently retaining an unusable token.
  if (existing) {
    const currentKey = existing.options.applicationServerKey;
    const expectedKey = urlBase64ToUint8Array(vapidPublicKey);
    if (currentKey) {
      const current = new Uint8Array(currentKey);
      const sameKey = current.length === expectedKey.length &&
        current.every((value, index) => value === expectedKey[index]);
      if (sameKey) return existing;
    }
    await existing.unsubscribe().catch(() => undefined);
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function subscribeToPushNotifications(user: any, database: any, toast?: any) {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (toast) toast({ variant: 'destructive', title: 'Not Supported', description: 'Push notifications are not supported on this browser.' });
    return false;
  }

  let vapidPublicKey = getVapidKey();

  try {
    const serverKey = await getActiveVapidPublicKey();
    if (serverKey) {
      vapidPublicKey = serverKey;
    }
  } catch (e) {
    console.warn('[Push] Could not fetch active VAPID key from server, using fallback:', e);
  }

  // Check if browser permission is already denied
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    if (toast) {
      toast({
        variant: 'destructive',
        title: 'Permission Blocked in Browser 🚫',
        description: 'Browser ne permission block kar rakhi hai. Address bar me Lock 🔒 icon par click karke Notifications -> Allow karein.',
      });
    }
    return false;
  }

  try {
    // Permission must be requested directly from user gesture click
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (toast) {
        toast({
          variant: 'destructive',
          title: 'Permission Denied 🚫',
          description: 'Permission allow nahi ki gayi. Agar dobara allow karna hai toh browser lock icon 🔒 me jaakar Notifications allow karein.',
        });
      }
      return false;
    }

    try {
      const subscription = await registerSubscription(vapidPublicKey);

      if (subscription && database) {
        const deviceId = getDeviceId();
        const targetUid = user?.uid || 'guest';
        // Keep one subscription per browser/device. Saving directly at the
        // user node caused the last device to overwrite every other device.
        const subRef = ref(database, `pushSubscriptions/${targetUid}/${deviceId}`);
        await set(subRef, {
          // Keep the key that created this browser subscription beside it.
          // A PushSubscription cannot be sent with a different VAPID key.
          subscription: {
            ...subscription.toJSON(),
            vapidPublicKey,
          },
          updatedAt: Date.now(),
          userAgent: navigator.userAgent,
          deviceId
        });
      }

      if (toast) {
        toast({
          title: 'Notifications Enabled! 🎉',
          description: 'Push notifications successfully active ho gaye hain!',
        });
      }
      return true;
    } catch (swErr) {
      console.warn('[Push] Service worker registration or subscription failed (likely sw.js is missing):', swErr);
      if (toast) {
        toast({
          variant: 'destructive',
          title: 'Setup Error',
          description: 'Service worker configuration is missing. Please contact support.',
        });
      }
      return false;
    }
  } catch (err: any) {
    console.error('[Push] Manual subscription error:', err);
    if (toast) {
      toast({
        variant: 'destructive',
        title: 'Subscription Error',
        description: err.message || 'Failed to enable notifications. Make sure VAPID key is configured.',
      });
    }
    return false;
  }
}

export function GetNotifiedButton({
  className,
  variant = 'default',
  size = 'sm',
  onEnabled,
  label = 'Get Notified',
}: {
  className?: string;
  variant?: any;
  size?: any;
  onEnabled?: () => void;
  label?: string;
}) {
  const { user } = useAuth();
  const { database } = initializeFirebase();
  const { toast } = useToast();

  const handleClick = async () => {
    const enabled = await subscribeToPushNotifications(user, database, toast);
    if (enabled) onEnabled?.();
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleClick}>
      <Bell className="mr-2 h-4 w-4" /> {label}
    </Button>
  );
}

export function PushSubscriptionHandler() {
  const { user } = useAuth();
  const { database } = initializeFirebase();
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid || !database || typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const registerAndSubscribe = async () => {
      try {
        let vapidPublicKey = getVapidKey();
        try {
          const serverKey = await getActiveVapidPublicKey();
          if (serverKey) vapidPublicKey = serverKey;
        } catch (e) {}

        try {
          if (Notification.permission !== 'granted') return;
          const subscription = await registerSubscription(vapidPublicKey);

          if (subscription) {
            const deviceId = getDeviceId();
            const subRef = ref(database, `pushSubscriptions/${user.uid}/${deviceId}`);
            await set(subRef, {
              subscription: {
                ...subscription.toJSON(),
                vapidPublicKey,
              },
              updatedAt: Date.now(),
              userAgent: navigator.userAgent,
              deviceId
            });
            subscribedRef.current = true;
          }
        } catch (swErr) {
          console.warn('[Push] Background registration failed (sw.js might be missing):', swErr);
        }
      } catch (err) {
        console.error('[Push] Registration/Subscription error:', err);
      }
    };

    registerAndSubscribe();
  }, [user?.uid, database]);

  return null;
}
