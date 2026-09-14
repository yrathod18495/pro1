'use server';

import Razorpay from 'razorpay';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

interface RazorpayOrderOutput {
  id: string;
  amount: number;
  currency: string;
  key_id: string;
}

/**
 * 🔒 MUSIC TRACK UNLOCK — ORDER CREATION
 * ---------------------------------------
 * Mirrors the pattern in src/app/buy-credits/actions.ts — a Razorpay order
 * is created server-side (price is read from RTDB `publicMusicLibrary`,
 * NEVER trusted from the client) with the purchase details stamped into
 * `notes`. The webhook (src/app/api/webhook/razorpay/route.ts) reads those
 * same notes to know which user unlocked which track once payment clears.
 */
export async function createOrderForMusicTrack(
  trackId: string,
  user: { uid: string; email: string; name?: string }
): Promise<{ success: true; order: RazorpayOrderOutput } | { success: false; error: string }> {
  try {
    if (!user?.uid || !user?.email) {
      return { success: false, error: 'Sign in required to purchase a track.' };
    }
    if (!trackId) {
      return { success: false, error: 'Missing track.' };
    }

    const { database } = initializeFirebase();
    const trackSnap = await database.ref(`publicMusicLibrary/${trackId}`).get();
    if (!trackSnap.exists()) {
      return { success: false, error: 'Track not found.' };
    }
    const track = trackSnap.val() || {};
    const price = Number(track.price) || 0;
    if (price <= 0) {
      return { success: false, error: 'This track is free — no purchase needed.' };
    }

    // Already owns it? Don't let them pay twice.
    const purchasedSnap = await database.ref(`musicPurchases/${user.uid}/${trackId}`).get();
    if (purchasedSnap.exists()) {
      return { success: false, error: 'You already own this track.' };
    }

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const razorpayPublicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;

    if (!razorpayKeyId || !razorpayKeySecret || !razorpayPublicKeyId) {
      return { success: false, error: 'Payment system is not configured.' };
    }

    const razorpay = new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });
    const amountInPaise = Math.round(price * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `music_${trackId}_${Date.now()}`.slice(0, 40),
      notes: {
        type: 'music_track_purchase',
        trackId,
        userId: user.uid,
        userEmail: user.email,
        trackTitle: (track.prompt || 'Untitled Track').toString().slice(0, 200),
      },
    });

    if (!order) throw new Error('Razorpay order creation returned empty.');

    return {
      success: true,
      order: {
        id: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        key_id: razorpayPublicKeyId,
      },
    };
  } catch (e: any) {
    reportServerError('src/app/music-library/actions.ts#1', e);
    return { success: false, error: e.message || 'Order creation failed.' };
  }
}
