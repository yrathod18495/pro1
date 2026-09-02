'use server';

import Razorpay from 'razorpay';
import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { UserProfile, Product, SellerProfile } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { logSummaryEvent } from '@/lib/summary-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

// This will be passed from the client
interface ActionCartItem {
    id: string;
    title: string;
    price: number;
    quantity: number;
    sellerId: string;
    isOneTimePurchase?: boolean;
}

interface RazorpayOrderOutput {
  id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export async function createOrderForCart(
    cartItems: ActionCartItem[],
    user: UserProfile
): Promise<{ success: true; order: RazorpayOrderOutput } | { success: false; error: string }> {

    if (!user) {
        return { success: false, error: "User not authenticated." };
    }
    if (cartItems.length === 0) {
        return { success: false, error: 'Cart is empty.' };
    }

    const { firestore } = initializeFirebase();

  try {
    const subtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    // BUYER FEE REVISION: 18% GST + 2% Platform/Handling Fee = 20% total addition
    const GST_RATE = 0.18;
    const PLATFORM_FEE_RATE = 0.02;

    const gstAmount = subtotal * GST_RATE;
    const platformFee = subtotal * PLATFORM_FEE_RATE;
    const totalAmount = subtotal + gstAmount + platformFee;
    const totalAmountInPaise = Math.round(totalAmount * 100);

    const pendingOrderRef = firestore.collection('pendingOrders').doc();
    
    await pendingOrderRef.set({
        buyerId: user.uid,
        buyerEmail: user.email,
        items: cartItems.map(item => ({ 
            productId: item.id, 
            quantity: item.quantity, 
            price: item.price, 
            sellerId: item.sellerId, 
            title: item.title 
        })),
        subtotal: Math.round(subtotal * 100),
        gstAmount: Math.round(gstAmount * 100),
        platformFee: Math.round(platformFee * 100),
        totalAmount: totalAmountInPaise,
        status: 'pending',
        createdAt: new Date().toISOString(),
    });

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const razorpayPublicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;

    if (!razorpayKeyId || !razorpayKeySecret || !razorpayPublicKeyId) {
        throw new Error('Razorpay keys are not configured.');
    }
    
    const razorpay = new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });

    const order = await razorpay.orders.create({
        amount: totalAmountInPaise,
        currency: 'INR',
        receipt: `receipt_${pendingOrderRef.id}`,
        notes: {
            type: 'product_order',
            pendingOrderId: pendingOrderRef.id,
            userId: user.uid,
            productIds: cartItems.map(item => item.id).join(','),
        },
    });

    await pendingOrderRef.update({ razorpayOrderId: order.id });

    return {
        success: true,
        order: {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: razorpayPublicKeyId,
        }
    };
    
  } catch (error: any) {
    reportServerError('src/app/store/checkout/actions.ts#1', error);
    console.error("Error creating order for cart:", error);
    await sendToTelegram(`🚨 **Cart Checkout FAILED**\n*User:* ${user.email}\n*Error:* ${error.message}`);
    return { success: false, error: error.message || "An unknown error occurred." };
  }
}


export async function processFreeOrder(
    cartItems: ActionCartItem[],
    user: UserProfile
): Promise<{ success: boolean; error?: string }> {
    if (!user) {
        return { success: false, error: "User not authenticated." };
    }
    if (cartItems.length === 0) {
        return { success: false, error: 'Cart is empty.' };
    }

    const nonFreeItem = cartItems.find(item => item.price > 0);
    if (nonFreeItem) {
        return { success: false, error: 'This flow is only for free products.' };
    }

    const { firestore, database } = initializeFirebase();

    try {
        const productIds = cartItems.map(item => item.id);
        const productRefs = productIds.length > 0 ? productIds.map(id => firestore.collection('products').doc(id)) : [];
        const productDocs = productIds.length > 0 ? await firestore.getAll(...productRefs) : [];
        const productsById = new Map<string, Product | undefined>(productDocs.map((doc: any) => [doc.id, doc.data() as Product]));

        const batch = firestore.batch();
        const createdAt = new Date().toISOString();

        for (const item of cartItems) {
            const orderRef = firestore.collection('storeHistory').doc();
            batch.set(orderRef, {
                userId: user.uid,
                userEmail: user.email,
                productId: item.id,
                productTitle: item.title,
                sellerId: item.sellerId,
                amount: 0,
                currency: 'INR',
                status: 'paid', // Free items are considered paid immediately
                paymentMethod: 'free',
                paymentId: `free_order_${orderRef.id}`, // A unique identifier
                createdAt: createdAt,
                productSnapshot: productsById.get(item.id) || null,
            });

            const productData = productsById.get(item.id);
            if (productData && productData.isOneTimePurchase) {
                const productRef = firestore.collection('products').doc(item.id);
                batch.update(productRef, { status: 'sold', isSold: true, buyerUid: user.uid });
            }
        }

        await batch.commit();

        // Update RTDB for one-time purchases with sold status
        for (const doc of productDocs) {
            if (doc.exists) {
                const productData = doc.data() as Product;
                if (productData.isOneTimePurchase) {
                    const snap = await database.ref(`storeProducts/${doc.id}`).get().catch(() => null);
                    if (snap && snap.exists() && snap.val()?.title) {
                        await database.ref(`storeProducts/${doc.id}`).update({ status: 'sold', isSold: true, buyerUid: user.uid });
                    }
                }
            }
        }

        // Clear User Cart
        await database.ref(`carts/${user.uid}`).remove();

        const productTitles = cartItems.map((item: any) => item.title).join(', ');
        await sendToTelegram(`🎁
*Free Product Order Successful!*
*User:* ${user.email}
*Products:* ${productTitles}`);

        return { success: true };

    } catch (error: any) {
    reportServerError('src/app/store/checkout/actions.ts#2', error);
        console.error("Error processing free order:", error);
        await sendToTelegram(`🚨 **Free Order Checkout FAILED**\n*User:* ${user.email}\n*Error:* ${error.message}`);
        return { success: false, error: error.message || "An unknown error occurred." };
    }
}

export async function processCreditOrder(
    cartItems: ActionCartItem[],
    user: UserProfile
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    if (!user) return { success: false, error: "User not authenticated." };
    if (cartItems.length === 0) return { success: false, error: 'Cart is empty.' };

    const { firestore, database } = initializeFirebase();

    try {
        const subtotalInRupees = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        // Conversion rate: 1rs = 100 credits
        const totalCreditCost = Math.round(subtotalInRupees * 100);

        // Security Check: Credits are ONLY accepted for Verified Partners
        const sellerProfiles: Record<string, SellerProfile> = {};
        for (const item of cartItems) {
            const sellerSnap = await database.ref(`sellerProfiles/${item.sellerId}`).get();
            if (!sellerSnap.exists() || !sellerSnap.val().isVerified) {
                return { success: false, error: "Credits are only accepted for Verified Partner sellers." };
            }
            sellerProfiles[item.sellerId] = sellerSnap.val();
        }

        
        const productIds = cartItems.map(item => item.id);
        const productRefs = productIds.length > 0 ? productIds.map(id => firestore.collection('products').doc(id)) : [];
        const productDocs = productIds.length > 0 ? await firestore.getAll(...productRefs) : [];
        const productsById = new Map<string, any>(productDocs.map((doc: any) => [doc.id, doc.data()]));
        
        const userRef = firestore.collection('users').doc(user.uid);
        let updatedBalance = 0;
        let lastOrderId = '';

        await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User profile not found.");
            
            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < totalCreditCost) {
                throw new Error(`Insufficient credits. You need ${totalCreditCost.toLocaleString()}, but have ${currentCredits.toLocaleString()}.`);
            }

            updatedBalance = Math.max(0, currentCredits - totalCreditCost);
            const createdAt = new Date().toISOString();

            // 1. Deduct Credits
            transaction.update(userRef, { credits: updatedBalance });

            if (database) {
                database.ref(`creditHistory/${user.uid}`).push({
                    amount: -totalCreditCost,
                    reason: `Store Purchase: ${cartItems.map(i => i.title).join(', ')}`,
                    timestamp: createdAt
                }).catch((err: any) => console.error("RTDB store credit history error:", err));
            }

            // 3. Process each item using Service Key privileges
            for (const item of cartItems) {
                const orderRef = firestore.collection('storeHistory').doc();
                lastOrderId = `credit_pay_${orderRef.id}`;
                transaction.set(orderRef, {
                    userId: user.uid,
                    userEmail: user.email,
                    productId: item.id,
                    productTitle: item.title,
                    sellerId: item.sellerId,
                    amount: Math.round(item.price * 100),
                    currency: 'INR',
                    status: 'paid',
                    paymentMethod: 'credits',
                    paymentId: lastOrderId,
                    createdAt: createdAt,
                    productSnapshot: productsById.get(item.id) || null,
                });

                if (item.isOneTimePurchase) {
                    transaction.update(firestore.collection('products').doc(item.id), { status: 'sold', isSold: true, buyerUid: user.uid });
                }
            }
        });

        // Update RTDB for one-time purchases
        for (const item of cartItems) {
            if (item.isOneTimePurchase) {
                const snap = await database.ref(`storeProducts/${item.id}`).get().catch(() => null);
                if (snap && snap.exists() && snap.val()?.title) {
                    await database.ref(`storeProducts/${item.id}`).update({ status: 'sold', isSold: true, buyerUid: user.uid });
                }
            }
        }

        // Clear User Cart
        await database.ref(`carts/${user.uid}`).remove();

        await logSummaryEvent('creditsSpent', totalCreditCost);

        // --- ENHANCED TELEGRAM NOTIFICATION (UNIFIED FORMAT) ---
        const telegramLogLines: string[] = [];
        for (const item of cartItems) {
            const sellerInfo = sellerProfiles[item.sellerId];
            telegramLogLines.push(
                `📦 <b>${escapeHtml(item.title)}</b>\n` +
                `💰 <b>Price:</b> 💎 ${item.price * 100} credits\n` +
                `🏪 <b>Store:</b> ${escapeHtml(sellerInfo?.storeName || 'N/A')}\n`
            );
        }

        const finalTelegramMessage = 
            `🛍️ <b>NEW MARKETPLACE SALE!</b>\n\n` +
            `👤 <b>Buyer:</b> ${escapeHtml(user.email)}\n` +
            `💳 <b>Paid via Credits:</b> 💎 ${totalCreditCost.toLocaleString()} Credits\n\n` +
            telegramLogLines.join('\n') +
            `🆔 <b>Order:</b> <code>${lastOrderId}</code>\n` +
            `📉 <b>New Balance:</b> ${updatedBalance.toLocaleString()}`;

        await sendToTelegram(finalTelegramMessage);

        return { success: true, newBalance: updatedBalance };

    } catch (error: any) {
    reportServerError('src/app/store/checkout/actions.ts#3', error);
        console.error("Credit order failed:", error);
        return { success: false, error: error.message || "An unknown error occurred." };
    }
}
