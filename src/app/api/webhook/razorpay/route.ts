import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { initializeFirebase } from '@/firebase/server';
import { FieldValue } from 'firebase-admin/firestore';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { UserProfile, UserSubscription, Product, AffiliateCode } from '@/lib/types';
import { logSummaryEvent } from '@/lib/summary-logger';
import type * as admin from 'firebase-admin';
import { escapeHtml, getISTDateString } from '@/lib/utils';
import { plans } from '@/lib/plans';

async function handleAffiliateCommission(
    database: admin.database.Database,
    promoCode: string,
    buyerEmail: string,
    amountInInr: number,
    paymentId: string
) {
    if (!promoCode) return;
    
    try {
        const affiliateRef = database.ref(`affiliateCodes/${promoCode.toUpperCase()}`);
        const snapshot = await affiliateRef.get();
        
        if (!snapshot.exists()) return;
        
        const data = snapshot.val() as AffiliateCode;
        if (!data.isEnabled || !data.commissionRate) return;

        const commission = Math.round(amountInInr * (data.commissionRate / 100));
        if (commission <= 0) return;

        const earningsRef = database.ref(`affiliateEarnings/${data.code}`);
        const txRef = database.ref(`affiliateTransactions/${data.code}`).push();

        await earningsRef.transaction((current) => {
            if (!current) return { totalEarnings: commission, totalWithdrawn: 0 };
            return {
                ...current,
                totalEarnings: (current.totalEarnings || 0) + commission
            };
        });

        await txRef.set({
            buyerEmail,
            purchaseAmount: amountInInr,
            commissionEarned: commission,
            timestamp: new Date().toISOString(),
            paymentId
        });

        await sendToTelegram(`💸 <b>Affiliate Commission Logged</b>\n<b>Creator:</b> ${data.code}\n<b>Buyer:</b> ${buyerEmail}\n<b>Earned:</b> ₹${commission}`);

    } catch (e: any) {
        console.error("Affiliate sync failed:", e.message);
    }
}

async function handleProductPurchase(
    firestore: admin.firestore.Firestore,
    database: admin.database.Database,
    paymentEntity: any,
    orderEntity?: any
) {
    const notes = { ...(orderEntity?.notes || {}), ...(paymentEntity?.notes || {}) };
    const userId = notes.userId;
    const pendingOrderId = notes.pendingOrderId;
    const paymentId = paymentEntity?.id || orderEntity?.id || `pay_${Date.now()}`;
    const orderId = paymentEntity?.order_id || orderEntity?.id || notes.orderId;
    const paymentEmail = paymentEntity?.email || orderEntity?.email || '';
    const amountInInr = (paymentEntity?.amount || orderEntity?.amount || 0) / 100;

    if (!userId) throw new Error("Missing UserID in store purchase metadata.");

    try {
        const processedRef = firestore.collection('processedPayments').doc(paymentId);
        const processedOrderRef = orderId ? firestore.collection('processedPayments').doc(orderId) : null;
        const userRef = firestore.collection('users').doc(userId);
        const pendingOrderRef = pendingOrderId ? firestore.collection('pendingOrders').doc(pendingOrderId) : null;

        const transactionResult = await firestore.runTransaction(async (transaction: any) => {
            const [processedDoc, processedOrderDoc, userDoc, pendingOrderDoc] = await Promise.all([
                transaction.get(processedRef),
                processedOrderRef ? transaction.get(processedOrderRef) : Promise.resolve(null),
                transaction.get(userRef),
                pendingOrderRef ? transaction.get(pendingOrderRef) : Promise.resolve(null)
            ]);

            if (processedDoc.exists || (processedOrderDoc && processedOrderDoc.exists)) {
                return { alreadyProcessed: true };
            }

            if (pendingOrderDoc?.exists && pendingOrderDoc.data()?.status === 'completed') {
                return { alreadyProcessed: true };
            }

            const createdAt = new Date().toISOString();
            
            if (!userDoc.exists) {
                const newUserProfile: any = {
                    uid: userId,
                    email: paymentEmail || '',
                    name: (paymentEmail || 'User').split('@')[0],
                    credits: 2000, 
                    role: 'user',
                    status: 'active',
                    createdAt: createdAt,
                    totalInvestment: 0,
                    photoURL: '',
                };
                transaction.set(userRef, newUserProfile);
            }
            
            const orderData = pendingOrderDoc?.exists ? pendingOrderDoc.data() : null;
            const items = orderData?.items || [];
            
            // Pre-fetch products for snapshotting inside history
            const productIds = items.map((i: any) => i.productId);
            let productsById: Record<string, any> = {};
            if (productIds.length > 0) {
                const productDocs = await transaction.getAll(...productIds.map((id: string) => firestore.collection('products').doc(id)));
                productDocs.forEach((doc: any) => {
                    if (doc.exists) {
                        productsById[doc.id] = doc.data();
                    }
                });
            }

            for (const item of items) {
                const historyRef = firestore.collection('storeHistory').doc();
                transaction.set(historyRef, {
                    userId,
                    userEmail: paymentEmail,
                    productId: item.productId,
                    productTitle: item.title,
                    sellerId: item.sellerId,
                    amount: item.price * 100,
                    currency: 'INR',
                    status: 'paid',
                    paymentMethod: 'cash',
                    paymentId,
                    createdAt,
                    productSnapshot: productsById[item.productId] || null,
                });

                const productRef = firestore.collection('products').doc(item.productId);
                transaction.update(productRef, { status: 'sold', isSold: true, buyerUid: userId });
            }

            const prevInvestment = Number(userDoc.data()?.totalInvestment || 0);
            const newTotalInvestment = prevInvestment + amountInInr;

            transaction.update(userRef, { totalInvestment: FieldValue.increment(amountInInr) });

            if (pendingOrderRef) transaction.update(pendingOrderRef, { status: 'completed', paymentId });
            transaction.set(processedRef, { processedAt: createdAt, type: 'store_asset', orderId: orderId || null, paymentId });
            if (processedOrderRef) {
                transaction.set(processedOrderRef, { processedAt: createdAt, type: 'store_asset', paymentId, orderId });
            }

            return { alreadyProcessed: false, items, totalInvestment: newTotalInvestment };
        });

        if (!transactionResult || (transactionResult as any).alreadyProcessed) return;

        const tr = transactionResult as any;
        const items = tr.items || [];
        
        // --- 💸 AFFILIATE HUB SYNC (FOR STORE) ---
        if (notes.promoCode) {
            await handleAffiliateCommission(database, notes.promoCode, paymentEmail, amountInInr, paymentId);
        }

        const itemDetails = items.map((item: any) => `📦 <b>${escapeHtml(item.title)}</b>`).join('\n');

        for (const item of items) {
            const productSnap = await database.ref(`storeProducts/${item.productId}`).get().catch(() => null);
            if (productSnap && productSnap.exists() && productSnap.val()?.title) {
                await database.ref(`storeProducts/${item.productId}`).update({ status: 'sold', isSold: true, buyerUid: userId }).catch(() => null);
            }
        }

        await database.ref(`carts/${userId}`).remove().catch(() => null);
        const todayStr = getISTDateString();
        const revenueRef = database.ref(`dailySummaries/${todayStr}/revenue`);
        let previousRevenue = 0;
        await revenueRef.transaction((currentValue) => {
            previousRevenue = currentValue || 0;
            return previousRevenue + amountInInr;
        });
        const todayEarningsText = `🤑 <b>Today:</b> ₹${Math.round(previousRevenue).toLocaleString('en-IN')} + ₹${Math.round(amountInInr).toLocaleString('en-IN')} = ₹${Math.round(previousRevenue + amountInInr).toLocaleString('en-IN')}`;

        const storeTotalInvestFormatted = tr.totalInvestment !== undefined 
            ? `₹${Math.round(tr.totalInvestment).toLocaleString('en-IN')}` 
            : `₹${amountInInr}`;
        await sendToTelegram(`🛍️ <b>STORE ASSET PURCHASED</b>\n\n<b>User:</b> ${paymentEmail}\n<b>Amount:</b> ₹${amountInInr}\n<b>Total Investment:</b> ${storeTotalInvestFormatted}\n\n${itemDetails}\n\n<b>Status:</b> UNLOCKED\n\n${todayEarningsText}`);

    } catch (e: any) {
        console.error("Store purchase sync failed:", e.message);
        await sendToTelegram(`🚨 <b>STORE SYNC FAILED</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Error:</b> ${e.message}`);
    }
}

async function handleCreditPurchase(
    firestore: admin.firestore.Firestore, 
    database: admin.database.Database, 
    paymentEntity: any, 
    orderEntity?: any,
    isRecurring = false
) {
  const entity = paymentEntity || {};
  const notes = { ...(orderEntity?.notes || {}), ...(entity?.notes || {}) };
  const paymentId = entity.id || orderEntity?.id || `pay_${Date.now()}`;
  const orderId = entity.order_id || orderEntity?.id || notes.orderId;
  const paymentEmail = entity.email || orderEntity?.email || '';
  const subscriptionId = entity.subscription_id || notes.subscriptionId || null;
  const amountInOriginalCurrency = (entity.amount || orderEntity?.amount || 0) / 100;
  const currency = entity.currency || orderEntity?.currency || 'INR';
  const isAutopay = !!subscriptionId || notes.productId === 'autopay_pro' || notes.productId === 'test_sub' || isRecurring || (currency === 'INR' && amountInOriginalCurrency === 700);
  const currencySymbol = currency === 'USD' ? '$' : '₹';

  const paymentInInr = currency === 'USD' ? amountInOriginalCurrency * 85 : amountInOriginalCurrency;

  try {
    let userId = notes.userId;
     if (!userId && paymentEmail) {
        const userSearch = await firestore.collection('users').where('email', '==', paymentEmail).limit(1).get();
        if (!userSearch.empty) userId = userSearch.docs[0].id;
    }
     // Recurring Razorpay payments may not carry the original notes/email.
     // Resolve the account by the subscription ID before processing the grant.
     if (!userId && subscriptionId) {
         const subscriptionSearch = await firestore.collection('users')
             .where('subscription.subscriptionId', '==', subscriptionId).limit(1).get();
         if (!subscriptionSearch.empty) userId = subscriptionSearch.docs[0].id;
     }

    if (!userId) throw new Error("Could not resolve User Identity.");

    let pendingPaymentId = notes.pendingPaymentId;
    if (!pendingPaymentId) {
        const lookupId = entity.order_id || subscriptionId;
        if (lookupId) {
            const ppSearch = await firestore.collection('pendingPayments').where('orderId', '==', lookupId).limit(1).get();
            if (!ppSearch.empty) pendingPaymentId = ppSearch.docs[0].id;
        }
    }

    const processedRef = firestore.collection('processedPayments').doc(paymentId);
    const processedOrderRef = orderId ? firestore.collection('processedPayments').doc(orderId) : null;
    const processedSubRef = subscriptionId ? firestore.collection('processedPayments').doc(subscriptionId) : null;
    const userRef = firestore.collection('users').doc(userId);
    const ppRef = pendingPaymentId ? firestore.collection('pendingPayments').doc(pendingPaymentId) : null;

    const transactionResult = await firestore.runTransaction(async (transaction: any) => {
        const [processedDoc, processedOrderDoc, processedSubDoc, userDoc, ppDoc] = await Promise.all([
            transaction.get(processedRef),
            processedOrderRef ? transaction.get(processedOrderRef) : Promise.resolve(null),
            processedSubRef && !isRecurring ? transaction.get(processedSubRef) : Promise.resolve(null),
            transaction.get(userRef),
            ppRef ? transaction.get(ppRef) : Promise.resolve(null)
        ]);

        if (processedDoc.exists || (processedOrderDoc && processedOrderDoc.exists) || (processedSubDoc && processedSubDoc.exists)) {
            return { stopProcessing: true };
        }

        if (ppDoc?.exists && ppDoc.data()?.status === 'approved') {
            return { stopProcessing: true };
        }

        const userData = userDoc.exists ? userDoc.data() as UserProfile : null;

        // A late recurring webhook must not resurrect a subscription that the
        // customer already cancelled in Razorpay.
        if (isRecurring && userData?.subscription && userData.subscription.status !== 'active') {
            return { stopProcessing: true };
        }
        
        // Safety guard for Autopay Pro: If user already has an active subscription started within last 1 hour, prevent duplicate grant
        if (isAutopay && !isRecurring && userData?.subscription?.status === 'active') {
            const subStartDate = userData.subscription.startDate ? new Date(userData.subscription.startDate).getTime() : 0;
            const isRecentDuplicate = (Date.now() - subStartDate) < (60 * 60 * 1000); // 1 hour window
            if (isRecentDuplicate && userData.subscription.weeklyGrantCount === 1) {
                return { stopProcessing: true };
            }
        }

        const now = new Date();
         let creditsToAdd = 0;
        let planName = notes.planName || 'AI Credit Pack';
        const planSource = plans.find(p => p.id === notes.productId);
         const previousSubscription = userData?.subscription;
         const effectivePlan = planSource || plans.find(p => p.id === previousSubscription?.planId);
         const previousGrantCount = Number(previousSubscription?.weeklyGrantCount || 0);
         const grantCycle = isAutopay ? (isRecurring ? previousGrantCount + 1 : 1) : 0;

        const bonusFromNotes = parseInt(notes.bonusCredits || '0', 10);

        if (isAutopay) {
             creditsToAdd = effectivePlan?.weeklyCredits || 20000;
             planName = `${effectivePlan?.name || 'Consistent Creator'} (Week ${grantCycle} Grant)`;
        } else if (planSource) {
            creditsToAdd = planSource.credits + bonusFromNotes;
            planName = planSource.name + (bonusFromNotes > 0 ? ' (+Bonus)' : '');
        } else if (notes.credits) {
            // Custom top-ups (no matching fixed `plans` entry) land here. The gift/bonus
            // credits are tracked separately in notes.bonusCredits so the client can show
            // them as a distinct "Gift Credits" line, but they still need to be granted.
            creditsToAdd = (parseInt(notes.credits, 10) || 0) + bonusFromNotes;
            planName = (notes.planName || 'AI Credit Pack') + (bonusFromNotes > 0 ? ` (+${bonusFromNotes.toLocaleString()} Gift Credits)` : '');
        }

        const userUpdates: any = {
            credits: FieldValue.increment(creditsToAdd), 
            hasMadeFirstPurchase: true, 
            totalInvestment: FieldValue.increment(paymentInInr) 
        };

        if (planSource) {
            const priceKey = String(planSource.priceInRupees);
            userUpdates[`purchasedPlans.${priceKey}`] = FieldValue.increment(1);
        } else if (isAutopay) {
            userUpdates[`purchasedPlans.700`] = FieldValue.increment(1);
        }

         if (isAutopay) {
            const intervalDays = effectivePlan?.grantIntervalDays ?? 7;
            const nextWeek = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
             userUpdates.subscription = {
                 ...(previousSubscription || {}),
                 planId: previousSubscription?.planId || effectivePlan?.id || 'autopay_pro',
                 status: 'active',
                 subscriptionId: subscriptionId || previousSubscription?.subscriptionId || `test_sub_${Date.now()}`,
                 startDate: previousSubscription?.startDate || now.toISOString(),
                 nextWeeklyGrantDate: nextWeek.toISOString(),
                 weeklyGrantCount: grantCycle,
                 currentCycleMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
             };
        }

        if (!userDoc.exists) {
            const newUserProfile: any = {
                uid: userId,
                email: paymentEmail || '',
                name: (paymentEmail || 'User').split('@')[0],
                credits: 2000, 
                role: 'user',
                status: 'active',
                createdAt: now.toISOString(),
                totalInvestment: 0,
                photoURL: '',
            };
            transaction.set(userRef, newUserProfile);
        }

        if (ppRef && ppDoc?.exists) {
            transaction.update(ppRef, { status: 'approved', paymentId: paymentId, updatedAt: now.toISOString() });
        }

        transaction.update(userRef, userUpdates);

        const notificationRef = userRef.collection('notifications').doc('user_notifications');
        transaction.set(notificationRef, { 
            entries: FieldValue.arrayUnion({ 
                id: `pay-${paymentId}`, 
                message: `Payment successful! ${creditsToAdd.toLocaleString()} credits added.`, 
                timestamp: now.toISOString(), 
                read: false, 
                type: 'credits' 
            }) 
        }, { merge: true });

        const processedPayload = { 
            processedAt: now.toISOString(), 
            type: isAutopay ? 'subscription' : 'credits', 
            userId, 
            email: paymentEmail, 
            amount: entity.amount,
            paymentId,
            orderId: orderId || null
        };

        transaction.set(processedRef, processedPayload);
        if (processedOrderRef) {
            transaction.set(processedOrderRef, processedPayload);
        }
        if (processedSubRef && !isRecurring) {
            transaction.set(processedSubRef, processedPayload);
        }

        const prevInvestment = Number(userDoc.data()?.totalInvestment || 0);
        const newTotalInvestment = prevInvestment + paymentInInr;

        return { 
            stopProcessing: false, 
            userId, 
            userName: userDoc.data()?.name || 'User', 
            userEmail: paymentEmail, 
            creditsToAdd,
             grantCycle,
             isRecurring,
            totalInvestment: newTotalInvestment
        };
    });

    if (!transactionResult || (transactionResult as any).stopProcessing) return;
    const tr = transactionResult as any;

    if (notes.promoCode) {
        await handleAffiliateCommission(database, notes.promoCode, tr.userEmail, paymentInInr, paymentId);
    }

    await logSummaryEvent('creditsPurchased', tr.creditsToAdd);

    const todayStr = getISTDateString();
    const revenueRef = database.ref(`dailySummaries/${todayStr}/revenue`);
    let previousRevenue = 0;
    await revenueRef.transaction((currentValue) => {
        previousRevenue = currentValue || 0;
        return previousRevenue + paymentInInr;
    });
    const todayEarningsText = `🤑 <b>Today:</b> ₹${Math.round(previousRevenue).toLocaleString('en-IN')} + ₹${Math.round(paymentInInr).toLocaleString('en-IN')} = ₹${Math.round(previousRevenue + paymentInInr).toLocaleString('en-IN')}`;

    const creditTotalInvestFormatted = tr.totalInvestment !== undefined 
        ? `₹${Math.round(tr.totalInvestment).toLocaleString('en-IN')}` 
        : `${currencySymbol}${amountInOriginalCurrency}`;
     const recurringGrantText = tr.isRecurring
         ? `\n<b>Consistent Plan:</b> Week ${tr.grantCycle} credit grant`
         : '';
     await sendToTelegram(`<b>💎 CREDIT PURCHASE SUCCESSFUL</b>\n\n<b>User:</b> ${tr.userEmail}\n<b>Amount:</b> ${currencySymbol}${amountInOriginalCurrency}\n<b>Credit Grant:</b> +${tr.creditsToAdd.toLocaleString()}${recurringGrantText}\n<b>Total Investment:</b> ${creditTotalInvestFormatted}\n\n${todayEarningsText}`);
  } catch (e: any) {
      await sendToTelegram(`🚨 <b>PAYMENT SYNC FAILED</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Error:</b> ${e.message}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const text = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!secret) {
      console.error('[Razorpay Webhook Error] Neither RAZORPAY_WEBHOOK_SECRET nor RAZORPAY_KEY_SECRET is set.');
      return NextResponse.json({ status: 'error', message: 'Webhook secret not configured on server' }, { status: 400 });
    }

    if (!signature) {
      console.error('[Razorpay Webhook Error] Missing x-razorpay-signature header.');
      return NextResponse.json({ status: 'error', message: 'Missing x-razorpay-signature header' }, { status: 400 });
    }

    const calculatedHmac = crypto.createHmac('sha256', secret).update(text).digest('hex');
    const hmacBuf = Buffer.from(calculatedHmac, 'utf8');
    const sigBuf = Buffer.from(signature, 'utf8');

    if (hmacBuf.length !== sigBuf.length || !crypto.timingSafeEqual(hmacBuf, sigBuf)) {
      console.error('[Razorpay Webhook Error] Signature verification failed. Ensure RAZORPAY_WEBHOOK_SECRET in environment matches Razorpay dashboard webhook secret.');
      return NextResponse.json({ status: 'error', message: 'Invalid signature' }, { status: 400 });
    }
    
    const event = JSON.parse(text);
    const { firestore, database } = initializeFirebase();
    const entity = event?.payload?.payment?.entity || event?.payload?.subscription?.entity;
    const notes = { ...(event?.payload?.order?.entity?.notes || {}), ...(entity?.notes || {}) };

    if (event.event === 'order.paid' || event.event === 'payment.captured') {
        if (notes.type === 'product_order' || notes.pendingOrderId) await handleProductPurchase(firestore, database, entity, event.payload?.order?.entity);
        else await handleCreditPurchase(firestore, database, entity, event.payload?.order?.entity);
     } else if (event.event === 'subscription.charged') {
        await handleCreditPurchase(firestore, database, entity, undefined, true);
     } else if (event.event === 'subscription.cancelled' || event.event === 'subscription.completed' || event.event === 'subscription.paused') {
         const subscriptionId = entity?.id || entity?.subscription_id;
         if (subscriptionId) {
             const matchingUsers = await firestore.collection('users')
                 .where('subscription.subscriptionId', '==', subscriptionId).limit(1).get();
             if (!matchingUsers.empty) {
                 const userDoc = matchingUsers.docs[0];
                 const nextStatus = event.event === 'subscription.paused' ? 'past_due' : 'cancelled';
                 await userDoc.ref.update({ 'subscription.status': nextStatus });
                 await sendToTelegram(`📡 <b>RAZORPAY SUBSCRIPTION ${nextStatus.toUpperCase()}</b>\n<b>User:</b> ${escapeHtml(userDoc.data()?.email || 'N/A')}\n<b>Subscription ID:</b> <code>${escapeHtml(subscriptionId)}</code>`);
             }
         }
    }
    return NextResponse.json({ status: 'processed' });
  } catch (e: any) { 
    console.error('[Razorpay Webhook Exception]:', e);
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 }); 
  }
}
