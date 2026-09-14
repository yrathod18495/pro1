'use server';

import { initializeFirebase } from '@/firebase/server';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { PromoCode, AffiliateCode, UserProfile } from '@/lib/types';
import { reportServerError } from '@/lib/report-error';

const PromoCodeSchema = z.string().regex(/^[A-Z0-9-_]+$/, {
  message: "Invalid promo code format.",
});

export async function applyPromoCode(
  code: string,
  userId: string,
  userEmail: string,
  confirmed?: boolean
): Promise<{ 
    success: boolean; 
    type?: 'discount' | 'credit' | 'credit_bonus'; 
    discountType?: 'percentage' | 'fixed';
    value?: number; 
    extraFlatCredits?: number;
    message: string; 
}> {
  const codeValidation = PromoCodeSchema.safeParse(code.toUpperCase());
  if (!codeValidation.success) return { success: false, message: codeValidation.error.flatten().formErrors.join(', ') };
  const validatedCode = codeValidation.data;
  
  if (!userId) return { success: false, message: 'User information is required.' };

  const { firestore, database } = initializeFirebase();
  const promoRef = firestore.collection('promoCodes').doc(validatedCode);

  try {
    // 0. System-level fallback promo codes for immediate, zero-setup reliability
    if (validatedCode === 'EXTRA10') {
      return {
        success: true,
        type: 'credit_bonus',
        value: 10, // 10% extra credits
        extraFlatCredits: 2000, // + 2,000 bonus credits
        message: 'Exclusive 10% Extra Credits + 2,000 Welcome Bonus applied!'
      };
    }

    // 1. Standard Firestore Promo Codes
    const doc = await promoRef.get();
    if (doc.exists) {
        const data = doc.data() as PromoCode;
        if (data.status !== 'available') return { success: false, message: 'This promo code is not available.' };
        if (data.expiresAt && new Date(data.expiresAt) < new Date()) return { success: false, message: 'This promo code has expired.' };
        
        if (data.type === 'discount' && data.discountValue && data.discountValue > 0) {
            return { success: true, type: 'discount', discountType: data.discountType, value: data.discountValue, message: 'Discount applied!' };
        }

        if (data.type === 'credit' && data.creditAmount && data.creditAmount > 0) {
            const creditsToAdd = data.creditAmount;
            if (!confirmed) return { success: true, type: 'credit', value: creditsToAdd, message: `Redeem ${creditsToAdd.toLocaleString()} credits?` };
            
            if (database) {
                await database.ref(`creditHistory/${userId}`).push({
                    amount: creditsToAdd,
                    reason: `Promo: ${validatedCode}`,
                    timestamp: new Date().toISOString()
                });
            }

            await firestore.runTransaction(async (transaction: any) => {
                const pDoc = await transaction.get(promoRef);
                if (pDoc.data()?.status !== 'available') throw new Error('Already used.');
                
                transaction.update(promoRef, { status: 'redeemed', redeemedBy: userId, redeemedByEmail: userEmail, redeemedAt: new Date().toISOString() });
                transaction.update(firestore.collection('users').doc(userId), { credits: FieldValue.increment(creditsToAdd) });
            });

            await sendToTelegram(`🎁 <b>Promo Redeemed</b>\n<b>User:</b> ${userEmail}\n<b>Code:</b> ${validatedCode}`);
            return { success: true, type: 'credit', value: creditsToAdd, message: 'Credits added!' };
        }
    }
    
    // 2. Affiliate Codes
    const affiliateRef = database.ref(`affiliateCodes/${validatedCode}`);
    const affSnap = await affiliateRef.get();
    if (affSnap.exists()) {
        const data = affSnap.val() as AffiliateCode;
        if (!data.isEnabled) return { success: false, message: 'Disabled.' };
        if (data.rewardType === 'discount') return { success: true, type: 'discount', discountType: 'percentage', value: data.rewardValue, message: 'Creator discount applied!' };
        if (data.rewardType === 'extra_credits') return { success: true, type: 'credit_bonus', value: data.rewardValue, message: 'Extra credits bonus applied!' };
    }
    
    return { success: false, message: 'Invalid code.' };
  } catch (error: any) {
    reportServerError('src/app/buy-credits/promo-actions.ts#1', error);
    return { success: false, message: error.message };
  }
}
