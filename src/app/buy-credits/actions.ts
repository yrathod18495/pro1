'use server';

import Razorpay from 'razorpay';
import { FieldValue } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { applyPromoCode } from './promo-actions';
import { plans } from '@/lib/plans';
import { reportServerError } from '@/lib/report-error';

interface RazorpayOrderOutput {
  id: string;
  amount: number;
  currency: string;
  key_id: string;
  type: 'order' | 'subscription';
}

/**
 * Maps our internal autopay/subscription product IDs to the actual Razorpay
 * Plan created in the dashboard for them. Each recurring product needs its
 * own Razorpay Plan (Razorpay's Plan API only exists for subscriptions).
 */
const RAZORPAY_SUBSCRIPTION_PLAN_IDS: Record<string, string> = {
    autopay_pro: 'plan_T27TO5CdU4m985',
    test_sub: 'plan_TQGD320escDY50',
};

/**
 * Creates a secure Razorpay order on the server.
 * The amount is never trusted from the client.
 */
async function createRazorpayOrder(
    razorpayPublicKeyId: string,
    amountInPaise: number, 
    currency: 'INR' | 'USD',
    notes: { [key: string]: string; }
): Promise<RazorpayOrderOutput> {
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret || !razorpayPublicKeyId) {
        console.error('FATAL: Razorpay keys are not configured.');
        throw new Error('The payment system is not configured correctly on the server.');
    }
    
    const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret,
    });

    // --- SUBSCRIPTION LOGIC ---
    // NOTE: this used to only check `notes.productId === 'autopay_pro'`, so
    // every OTHER autopay plan (e.g. 'test_sub') silently fell through to the
    // one-time order path below and never actually created a Razorpay
    // Subscription — it just looked and behaved like a normal one-time plan,
    // even though the plan config says it's a weekly auto-debit. Checking
    // `notes.type === 'subscription_payment'` (set from plan.isAutopay)
    // covers every autopay plan, current and future, the same way.
    if (notes.type === 'subscription_payment') {
        const razorpayPlanId = RAZORPAY_SUBSCRIPTION_PLAN_IDS[notes.productId];
        if (!razorpayPlanId) {
            throw new Error(`No Razorpay subscription Plan is configured for '${notes.productId}'. Add its plan_id to RAZORPAY_SUBSCRIPTION_PLAN_IDS in buy-credits/actions.ts.`);
        }

        const subscription = await razorpay.subscriptions.create({
            plan_id: razorpayPlanId,
            total_count: 12, // 1 year of recurring billing
            quantity: 1,
            customer_notify: 1,
            notes: notes,
        });

        return {
            id: subscription.id,
            amount: amountInPaise,
            currency: 'INR',
            key_id: razorpayPublicKeyId,
            type: 'subscription'
        };
    }

    // --- STANDARD ORDER LOGIC ---
    const options = {
        amount: amountInPaise,
        currency: currency,
        receipt: `receipt_order_${new Date().getTime()}`,
        notes: notes,
    };

    try {
        const order = await razorpay.orders.create(options);
        if (!order) {
            throw new Error('Razorpay order creation returned a null or empty response.');
        }
        return {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: razorpayPublicKeyId,
            type: 'order'
        };
    } catch (error: any) {
    reportServerError('src/app/buy-credits/actions.ts#1', error);
        console.error('Razorpay API order creation failed:', {
            message: error.message,
            statusCode: error.statusCode,
            error: error.error,
        });
        const errorMessage = error?.error?.description || error.message || 'An unknown error occurred.';
        throw new Error(`Failed to create payment order. Reason: ${errorMessage}`);
    }
}


export async function handlePurchaseAction(
    planId: string, 
    user: { uid: string, name: string | null, email: string | null },
    currency: 'INR' | 'USD',
    promoCode?: string
): Promise<{ success: true; order?: RazorpayOrderOutput; free_purchase?: boolean } | { success: false; error: string }> {
  
  // 🛡️ IDENTITY SYNC CHECK
  if (!user || !user.uid || !user.email) {
    return { success: false, error: 'Identity node missing. Please sign in again.' };
  }
  
  // SECURITY: Never trust client-side price or credits. Look up the plan from server-side source of truth.
  const plan = plans.find(p => p.id === planId);
  if (!plan) {
    return { success: false, error: 'Invalid plan selected. Security protocol triggered.' };
  }

  try {
    const { firestore, database } = initializeFirebase();

    if (!firestore) {
        throw new Error("Firebase Admin / Firestore not available. Please verify server environment variables.");
    }

    const razorpayPublicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '';

    let finalPrice = currency === 'USD' 
        ? plan.priceInUSD 
        : plan.priceInRupees;
    
    // START: Calculate final credits based on bonus (if applicable)
    let finalCredits = plan.credits;
    let bonusCredits = 0;
    
    // SECURITY: Re-verify the promo code on the server before creating any order
    // Note: Consistent Creator (isAutopay) plan has fixed pricing and credits. Promo codes do NOT apply to consistent plans.
    if (promoCode && promoCode.toLowerCase() !== 'yxsh' && !plan.isAutopay) {
        const promoResult = await applyPromoCode(promoCode, user.uid, user.email || '');
        if (!promoResult.success) {
            return { success: false, error: `Promo Code Error: ${promoResult.message}` };
        }
        
        // Handle Price Discount
        if (promoResult.type === 'discount' && promoResult.value) {
            if (promoResult.discountType === 'percentage') {
                finalPrice *= (1 - promoResult.value / 100);
            } else if (promoResult.discountType === 'fixed') {
                const priceInInr = currency === 'USD' ? finalPrice * 85 : finalPrice;
                const newPriceInInr = Math.max(0, priceInInr - promoResult.value);
                finalPrice = currency === 'USD' ? newPriceInInr / 85 : newPriceInInr;
            }
        }

        // Handle Extra Credits Bonus (Affiliate / Special Promos like EXTRA10)
        if (promoResult.type === 'credit_bonus' && promoResult.value) {
            const extraFlat = (promoResult as any).extraFlatCredits || (promoCode.toUpperCase() === 'EXTRA10' ? 2000 : 0);
            bonusCredits = Math.floor(plan.credits * (promoResult.value / 100)) + extraFlat;
            finalCredits += bonusCredits;
        }
    }
    
    const finalAmountInPaise = Math.round(finalPrice * 100);

    // CASE 1: ZERO-COST ACTIVATION
    if (finalAmountInPaise <= 0) {
        await sendToTelegram(`🎁 <b>Zero-Cost Activation (Verified)</b>\n<b>User:</b> ${user.email}\n<b>Plan:</b> ${plan.name}${promoCode ? ` (Code: ${promoCode})` : ''}\n<b>Credits:</b> ${finalCredits.toLocaleString()}`);

        const userRef = firestore.collection('users').doc(user.uid);
        
        if (promoCode && promoCode.toLowerCase() !== 'yxsh') {
            await applyPromoCode(promoCode, user.uid, user.email, true);
        }

        const historyEntry = {
            amount: finalCredits,
            reason: `Purchase - ${plan.name}${promoCode ? ` (Code: ${promoCode})` : ' (Free)'}`,
            timestamp: new Date().toISOString(),
            paymentId: `free_auth_${new Date().getTime()}`,
            orderId: `free_auth_${new Date().getTime()}`,
            amountPaid: 0,
            currency: currency,
            promoCode: promoCode,
            bonusCredits: bonusCredits
        };

        await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("Identity node not found in database.");
            
            transaction.update(userRef, { 
                credits: FieldValue.increment(finalCredits),
                hasMadeFirstPurchase: true 
            });
        });

        await logSummaryEvent('creditsPurchased', finalCredits);
        return { success: true, free_purchase: true };

    } else {
        // CASE 2: RAZORPAY DISPATCH
        const pendingPaymentRef = firestore.collection('pendingPayments').doc();
        const pendingPaymentId = pendingPaymentRef.id;
        
        const notes: { [key: string]: string; } = {
          pendingPaymentId: pendingPaymentId,
          userId: user.uid,
          planName: plan.name,
          productId: plan.id,
          type: plan.isAutopay ? 'subscription_payment' : 'credit_purchase',
          planPrice: String(plan.priceInRupees),
          currency: currency,
          credits: String(finalCredits),
          bonusCredits: String(bonusCredits)
        };
        
        if (promoCode) notes.promoCode = promoCode;
        
        const order = await createRazorpayOrder(razorpayPublicKeyId, finalAmountInPaise, currency, notes);
        
        await pendingPaymentRef.set({ 
            status: 'pending' as const,
            amount: finalAmountInPaise,
            currency: currency,
            userId: user.uid,
            userName: user.name || 'N/A',
            userEmail: user.email || '',
            planName: plan.name,
            credits: finalCredits,
            bonusCredits: bonusCredits,
            createdAt: new Date().toISOString(),
            orderId: order.id,
            promoCode: promoCode || '',
        });
        
        return { success: true, order: order };
    }

  } catch (error: any) {
    reportServerError('src/app/buy-credits/actions.ts#2', error);
    console.error("Critical error in handlePurchaseAction:", error);
    return { success: false, error: error.message || "An unknown security error occurred." };
  }
}

// --- CUSTOM TOP-UP CONFIG ---
// Base rate: ₹120 => 10,000 credits (i.e. ~83.33 credits per ₹1).
// Everything scales proportionally to whatever amount the user enters.
const TOPUP_RATE_CREDITS = 10000;
const TOPUP_RATE_RUPEES = 120;
const TOPUP_MIN_RUPEES = 50;

function calculateTopupCredits(amountInRupees: number): { baseCredits: number; giftCredits: number; giftPercent: number; totalCredits: number } {
    const baseCredits = Math.floor(amountInRupees * (TOPUP_RATE_CREDITS / TOPUP_RATE_RUPEES));
    // No bonus/gift credits — the wallet is credited exactly what the rate
    // computes, nothing extra on top.
    return { baseCredits, giftCredits: 0, giftPercent: 0, totalCredits: baseCredits };
}

/**
 * Custom wallet top-up: unlike the fixed `plans`, the user picks their own amount
 * (INR only — the 10,000 credits / ₹120 rate is INR-denominated). Minimum ₹50.
 * Credits scale proportionally to the amount paid — no bonus/gift credits.
 * Used for topping up the account's live credit balance, which API keys draw
 * from as well (see /developer).
 */
export async function handleCustomTopupAction(
    amountInRupees: number,
    user: { uid: string, name: string | null, email: string | null },
): Promise<{ success: true; order?: RazorpayOrderOutput; breakdown: { baseCredits: number; giftCredits: number; giftPercent: number; totalCredits: number } } | { success: false; error: string }> {

    if (!user || !user.uid || !user.email) {
        return { success: false, error: 'Identity node missing. Please sign in again.' };
    }

    const amount = Math.round(Number(amountInRupees));
    if (!Number.isFinite(amount) || amount < TOPUP_MIN_RUPEES) {
        return { success: false, error: `Minimum top-up amount is ₹${TOPUP_MIN_RUPEES}.` };
    }

    const breakdown = calculateTopupCredits(amount);

    try {
        const { firestore } = initializeFirebase();
        if (!firestore) {
            throw new Error("Firebase Admin / Firestore not available. Please verify server environment variables.");
        }

        const razorpayPublicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '';
        const finalAmountInPaise = amount * 100;

        const pendingPaymentRef = firestore.collection('pendingPayments').doc();
        const pendingPaymentId = pendingPaymentRef.id;

        const notes: { [key: string]: string; } = {
            pendingPaymentId,
            userId: user.uid,
            planName: 'Custom Top-up',
            productId: 'custom_topup',
            type: 'credit_purchase',
            planPrice: String(amount),
            currency: 'INR',
            credits: String(breakdown.baseCredits),
            bonusCredits: String(breakdown.giftCredits),
        };

        const order = await createRazorpayOrder(razorpayPublicKeyId, finalAmountInPaise, 'INR', notes);

        await pendingPaymentRef.set({
            status: 'pending' as const,
            amount: finalAmountInPaise,
            currency: 'INR',
            userId: user.uid,
            userName: user.name || 'N/A',
            userEmail: user.email || '',
            planName: 'Custom Top-up',
            credits: breakdown.baseCredits,
            bonusCredits: breakdown.giftCredits,
            createdAt: new Date().toISOString(),
            orderId: order.id,
        });

        return { success: true, order, breakdown };
    } catch (error: any) {
        reportServerError('src/app/buy-credits/actions.ts#topup', error);
        console.error("Critical error in handleCustomTopupAction:", error);
        return { success: false, error: error.message || "An unknown security error occurred." };
    }
}

export async function cancelSubscriptionAction(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database sync failure.' };

    const userRef = firestore.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        return { success: false, error: 'User profile not found.' };
    }

    const userData = userDoc.data();
    const sub = userData?.subscription;

    if (!sub || sub.status !== 'active') {
        return { success: false, error: 'No active subscription found to cancel.' };
    }

    // 1. Cancel on Razorpay first. Never mark the local subscription cancelled
    // when Razorpay rejected the cancellation, otherwise the next charge can
    // still happen while the UI falsely reports success.
    //
    // Exception: subscriptions the admin granted manually from the admin panel
    // (sub.manuallyGranted) were never backed by a real Razorpay subscription,
    // so there is nothing to cancel on Razorpay's side — cancelling these just
    // stops the remaining local weekly grants.
    const subscriptionId = sub.subscriptionId;
    if (sub.manuallyGranted && !subscriptionId) {
        await sendToTelegram(`⚠️ <b>MANUAL SUBSCRIPTION CANCELLED (self-serve)</b>\n<b>User:</b> ${escapeHtml(userData?.email || 'N/A')}\n<b>Plan ID:</b> ${sub.planId}\n<b>Note:</b> No Razorpay subscription existed; cancelled locally only.`);
    } else if (subscriptionId && !subscriptionId.startsWith('test_sub_')) {
        try {
            const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
            const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

            if (!razorpayKeyId || !razorpayKeySecret) {
                throw new Error('Razorpay server credentials are missing. Local status was not changed.');
            }
            const razorpay = new Razorpay({
                key_id: razorpayKeyId,
                key_secret: razorpayKeySecret,
            });
            await razorpay.subscriptions.cancel(subscriptionId);
        } catch (rzpErr: any) {
    reportServerError('src/app/buy-credits/actions.ts#3', rzpErr);
            console.error('Razorpay-side subscription cancellation error:', rzpErr);
            await sendToTelegram(`🚨 <b>SUBSCRIPTION CANCEL FAILED</b>\n<b>User:</b> ${escapeHtml(userData?.email || 'N/A')}\n<b>Subscription ID:</b> <code>${escapeHtml(subscriptionId)}</code>\n<b>Error:</b> ${escapeHtml(rzpErr?.error?.description || rzpErr?.message || 'Razorpay rejected the cancellation.')}`);
            return { success: false, error: rzpErr?.error?.description || rzpErr?.message || 'Razorpay could not cancel this subscription. Local status was not changed.' };
        }
    } else if (!subscriptionId) {
        await sendToTelegram(`🚨 <b>SUBSCRIPTION CANCEL BLOCKED</b>\n<b>User:</b> ${escapeHtml(userData?.email || 'N/A')}\n<b>Reason:</b> Missing Razorpay subscription ID. Local status was not changed.`);
        return { success: false, error: 'Razorpay subscription ID is missing. Contact support before cancelling.' };
    }

    // 2. Update DB status to 'cancelled' so we prevent further billing / sync
    await userRef.update({
        'subscription.status': 'cancelled'
    });

    await sendToTelegram(`❌ <b>SUBSCRIPTION CANCELLED</b>\n<b>User:</b> ${userData?.email || 'N/A'}\n<b>Plan ID:</b> ${sub.planId}\n<b>Subscription ID:</b> ${subscriptionId || 'None'}`);

    return { success: true };
  } catch (err: any) {
    reportServerError('src/app/buy-credits/actions.ts#4', err);
    console.error('Error in cancelSubscriptionAction:', err);
    return { success: false, error: err.message || 'An unknown error occurred during cancellation.' };
  }
}
