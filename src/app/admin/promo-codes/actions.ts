
'use server';

import { initializeFirebase } from '@/firebase/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { PromoCode, AffiliateCode } from '@/lib/types';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';
import { requireAdmin } from '@/lib/auth-guard';

// Helper to generate a random string, now longer
const generateRandomCode = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const generatePromoCodesSchema = z.object({
  quantity: z.coerce.number().min(1, "Must be at least 1.").max(100, "Cannot be more than 100."),
  codeType: z.enum(['credit', 'discount_percentage', 'discount_fixed']),
  value: z.coerce.number().min(1, "Value must be at least 1."),
  expiresInDays: z.coerce.number().optional(),
  eventName: z.string().min(3, "Must be 3-12 chars").max(12, "Must be 3-12 chars or less").regex(/^[a-zA-Z0-9]+$/, 'Only letters and numbers allowed').optional().or(z.literal('')),
});


export async function generatePromoCodes(
  idToken: string,
  input: z.infer<typeof generatePromoCodesSchema>
): Promise<{ success: boolean; codes?: string[]; message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const validation = generatePromoCodesSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: validation.error.flatten().formErrors.join(', ') };
    }
    
    const { quantity, codeType, expiresInDays, eventName } = validation.data;
    let { value } = validation.data;

    if (codeType === 'discount_percentage' && value > 100) {
      value = 100;
    }

    const { firestore } = initializeFirebase();
    
    try {
        const batch = firestore.batch();
        const generatedCodes: string[] = [];
        const createdAt = new Date();
        const expiresAt = expiresInDays ? new Date(createdAt.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

        const prefix = eventName ? `12labs_${eventName.toUpperCase().replace(/[^A-Z0-9]/g, '')}` : '12LABS';

        for (let i = 0; i < quantity; i++) {
            const randomPart = generateRandomCode();
            const fullCode = `${prefix}-${randomPart}`;
            
            const promoRef = firestore.collection('promoCodes').doc(fullCode);

            const promoData: Partial<PromoCode> = {
                code: fullCode,
                status: 'available',
                createdAt: createdAt.toISOString(),
            };
            if (expiresAt) {
                promoData.expiresAt = expiresAt;
            }

            if (eventName) {
                promoData.eventName = eventName;
            }

            if (codeType === 'credit') {
                promoData.type = 'credit';
                promoData.creditAmount = value;
            } else if (codeType === 'discount_percentage') {
                promoData.type = 'discount';
                promoData.discountType = 'percentage';
                promoData.discountValue = value;
            } else if (codeType === 'discount_fixed') {
                promoData.type = 'discount';
                promoData.discountType = 'fixed';
                promoData.discountValue = value;
            }
            
            batch.set(promoRef, promoData);
            generatedCodes.push(fullCode);
        }
        
        await batch.commit();
        revalidatePath('/admin/promo-codes');

        return { success: true, codes: generatedCodes, message: `${quantity} codes generated successfully!` };

    } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#1', error);
        console.error("Error generating promo codes:", error);
        return { success: false, message: error.message || 'An unknown server error occurred.' };
    }
}

export async function getAvailablePromoCodes(idToken: string): Promise<{ success: boolean; codes?: PromoCode[]; message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const { firestore } = initializeFirebase();
    try {
        const q = firestore.collection('promoCodes').where('status', '==', 'available').orderBy('createdAt', 'desc');
        const snapshot = await q.get();
        if (snapshot.empty) {
            return { success: true, codes: [], message: 'No available promo codes found.' };
        }
        const codes = snapshot.docs.map((doc: any) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
                expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate().toISOString() : data.expiresAt,
                redeemedAt: data.redeemedAt?.toDate ? data.redeemedAt.toDate().toISOString() : data.redeemedAt,
            } as PromoCode;
        });

        return { success: true, codes, message: 'Available promo codes fetched successfully.' };
    } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#2', error);
        console.error("Error fetching available promo codes:", error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}

export async function searchPromoCode(idToken: string, codeId: string): Promise<{ success: boolean; code?: PromoCode; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  if (!codeId) {
    return { success: false, message: "Code is required." };
  }
  const { firestore } = initializeFirebase();
  try {
    const docRef = firestore.collection('promoCodes').doc(codeId.trim().toUpperCase());
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return { success: false, message: `Code "${codeId}" not found.` };
    }
    
    const data = docSnap.data()!;
    const code = {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
        expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate().toISOString() : data.expiresAt,
        redeemedAt: data.redeemedAt?.toDate ? data.redeemedAt.toDate().toISOString() : data.redeemedAt,
    } as PromoCode;

    return { success: true, code, message: "Code found." };

  } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#3', error);
    console.error(`Error searching promo code ${codeId}:`, error);
    return { success: false, message: error.message || 'An unknown server error occurred.' };
  }
}

export async function deletePromoCode(idToken: string, code: string): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  if (!code) {
    return { success: false, message: 'Code is required.' };
  }
  const { firestore } = initializeFirebase();
  try {
    await firestore.collection('promoCodes').doc(code).delete();
    revalidatePath('/admin/promo-codes');
    return { success: true, message: `Code "${code}" deleted successfully.` };
  } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#4', error);
    console.error(`Error deleting promo code ${code}:`, error);
    return { success: false, message: error.message || 'An unknown server error occurred.' };
  }
}

const updatePromoCodeSchema = z.object({
  value: z.coerce.number().min(1, "Value must be at least 1."),
  expiresAt: z.date().nullable(),
});

export async function updatePromoCode(
  idToken: string,
  code: string,
  updates: z.infer<typeof updatePromoCodeSchema>
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  if (!code) {
    return { success: false, message: 'Code is required.' };
  }

  const validation = updatePromoCodeSchema.safeParse(updates);
  if (!validation.success) {
    return { success: false, message: validation.error.flatten().formErrors.join(', ') };
  }

  const { firestore } = initializeFirebase();
  try {
    const promoRef = firestore.collection('promoCodes').doc(code);
    const doc = await promoRef.get();
    if (!doc.exists) {
      return { success: false, message: "Code not found." };
    }
    
    const data = doc.data() as PromoCode;
    if (data.status === 'redeemed') {
      return { success: false, message: "Cannot edit a redeemed code." };
    }

    let { value } = validation.data;
    const updateData: { creditAmount?: number; discountValue?: number; expiresAt: string | null } = {
        expiresAt: validation.data.expiresAt ? validation.data.expiresAt.toISOString() : null
    };

    if (data.type === 'credit') {
        updateData.creditAmount = value;
    } else if (data.type === 'discount') {
       if (data.discountType === 'percentage' && value > 100) value = 100;
        updateData.discountValue = value;
    }
    
    await promoRef.update(updateData);
    revalidatePath('/admin/promo-codes');

    return { success: true, message: `Code "${code}" updated successfully.` };
  } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#5', error);
    console.error(`Error updating promo code ${code}:`, error);
    return { success: false, message: error.message || 'An unknown server error occurred.' };
  }
}


// --- AFFILIATE CODE ACTIONS ---

const affiliateCodeSchema = z.object({
    code: z.string().min(3, "Code must be at least 3 characters").regex(/^[A-Z0-9_]+$/, 'Only uppercase letters, numbers, and underscores allowed.'),
    youtuberTelegramId: z.string().min(1, "Telegram ID is required."),
    affiliateEmail: z.string().email("Please enter a valid email for the affiliate."),
    rewardType: z.enum(['discount', 'extra_credits']),
    rewardValue: z.coerce.number().min(0, "Value must be non-negative.").max(100, "Value must be 100 or less."),
    commissionRate: z.coerce.number().min(0).max(100, "Commission must be between 0-100."),
});

async function setAffiliateFlag(email: string, status: boolean): Promise<void> {
    try {
        const { auth, firestore } = initializeFirebase();
        const userRecord = await auth.getUserByEmail(email);
        const userRef = firestore.collection('users').doc(userRecord.uid);
        await userRef.update({ isAffiliate: status });
    } catch (e: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#6', e);
        if (e.code === 'auth/user-not-found') {
            console.warn(`Could not set affiliate status for ${email}. User does not exist in Firebase Auth yet.`);
        } else {
            console.error(`Failed to set affiliate flag for ${email}:`, e);
        }
    }
}

export async function createAffiliateCode(
  idToken: string,
  input: z.infer<typeof affiliateCodeSchema>
): Promise<{ success: boolean; message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const validation = affiliateCodeSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: validation.error.flatten().formErrors.join(', ') };
    }

    const { database } = initializeFirebase();
    const { code, youtuberTelegramId, rewardType, rewardValue, commissionRate, affiliateEmail } = validation.data;
    
    const codeRef = database.ref(`affiliateCodes/${code}`);
    const snapshot = await codeRef.get();
    if (snapshot.exists()) {
        return { success: false, message: 'This code already exists.' };
    }

    try {
        const newCodeData: Omit<AffiliateCode, 'id'> = {
            code,
            youtuberTelegramId,
            affiliateEmail,
            rewardType,
            rewardValue,
            commissionRate,
            isEnabled: true
        };
        await codeRef.set(newCodeData);

        // Initialize earnings
        await database.ref(`affiliateEarnings/${code}`).set({
            totalEarnings: 0,
            totalWithdrawn: 0,
            transactions: {},
            withdrawals: {},
        });
        
        await setAffiliateFlag(affiliateEmail, true);

        revalidatePath('/admin/promo-codes');
        return { success: true, message: `Affiliate code "${code}" created successfully!` };

    } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#7', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}

export async function getAffiliateData(idToken: string): Promise<{ success: boolean; data?: { codes: AffiliateCode[] } , message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const { database } = initializeFirebase();
    try {
        const codesSnapshot = await database.ref('affiliateCodes').orderByKey().get();
        
        const codesData = codesSnapshot.exists() ? codesSnapshot.val() : {};

        const codes: AffiliateCode[] = Object.keys(codesData).map(id => ({
            id,
            ...codesData[id],
          }));

        return { success: true, data: { codes }, message: 'Affiliate codes fetched.' };

    } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#8', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}

export async function toggleAffiliateCodeStatus(
  idToken: string,
  code: string,
  currentStatus: boolean
): Promise<{ success: boolean; message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const { database } = initializeFirebase();
    try {
        await database.ref(`affiliateCodes/${code}/isEnabled`).set(!currentStatus);
        revalidatePath('/admin/promo-codes');
        return { success: true, message: `Code status updated.` };
    } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#9', error);
        return { success: false, message: error.message };
    }
}

const updateAffiliateCodeSchema = z.object({
    youtuberTelegramId: z.string().min(1, "Telegram ID is required."),
    affiliateEmail: z.string().email("Please enter a valid email for the affiliate."),
    rewardType: z.enum(['discount', 'extra_credits']),
    rewardValue: z.coerce.number().min(0, "Value must be non-negative.").max(100, "Value must be 100 or less."),
    commissionRate: z.coerce.number().min(0).max(100, "Commission must be between 0-100."),
});

export async function updateAffiliateCode(
  idToken: string,
  code: string,
  input: z.infer<typeof updateAffiliateCodeSchema>
): Promise<{ success: boolean; message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const validation = updateAffiliateCodeSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: validation.error.flatten().formErrors.join(', ') };
    }

    const { database } = initializeFirebase();
    const codeRef = database.ref(`affiliateCodes/${code}`);
    
    try {
        const snapshot = await codeRef.get();
        if (!snapshot.exists()) {
            return { success: false, message: 'This code does not exist.' };
        }
        const oldData = snapshot.val() as AffiliateCode;

        await codeRef.update(validation.data);
        
        // If email has changed, update user flags
        if (oldData.affiliateEmail && oldData.affiliateEmail !== validation.data.affiliateEmail) {
            // This is a simple implementation. A more robust one would check if the old user has other codes.
            await setAffiliateFlag(oldData.affiliateEmail, false);
        }
        await setAffiliateFlag(validation.data.affiliateEmail, true);

        revalidatePath('/admin/promo-codes');
        return { success: true, message: `Affiliate code "${code}" updated successfully!` };

    } catch (error: any) {
    reportServerError('src/app/admin/promo-codes/actions.ts#10', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}
