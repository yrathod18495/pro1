
'use server';

import { z } from 'zod';
import { initializeFirebase as initializeAdminFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { sendPushNotificationToAdmins } from '@/app/admin/actions';
import type { SellerProfile } from '@/lib/types';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

const OnboardingActionInputSchema = z.object({
  userId: z.string(),
  storeName: z.string().min(3),
  description: z.string().min(20),
  profileImageUrl: z.string(),
  mobileNumber: z.string().min(10, "Mobile number is required."),
  secondaryEmail: z.string().email("Secondary email is required."),
  payoutDetails: z.object({
      upiId: z.string(),
      accountHolderName: z.string(),
      paymentQrUrl: z.string(),
  }),
});

type OnboardingActionInput = z.infer<typeof OnboardingActionInputSchema>;

export async function completeOnboardingAction(input: OnboardingActionInput): Promise<{ success: boolean; error?: string }> {
    const validation = OnboardingActionInputSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().formErrors.join(', ') };
    }

    const { userId, storeName, description, profileImageUrl, mobileNumber, secondaryEmail, payoutDetails } = validation.data;
    const { database: rtdb } = initializeAdminFirebase();

    try {
        const sellerProfileData: SellerProfile = {
            id: userId,
            storeName,
            description,
            profileImageUrl,
            onboarded: true,
            status: 'pending',
            createdAt: new Date().toISOString(),
            mobileNumber,
            secondaryEmail,
            payoutDetails,
        };

        await rtdb.ref(`sellerProfiles/${userId}`).set(sellerProfileData);
        await rtdb.ref(`pendingSellerProfiles/${userId}`).set(sellerProfileData);
        
        const telegramMessage = `🏪 <b>New Seller Node Initialized</b>\n\n` +
                                `<b>Store:</b> ${escapeHtml(storeName)}\n` +
                                `<b>About:</b> <i>${escapeHtml(description)}</i>\n` +
                                `<b>Contact:</b> ${escapeHtml(secondaryEmail)} | ${escapeHtml(mobileNumber)}\n` +
                                `<b>UPI:</b> <code>${escapeHtml(payoutDetails.upiId)}</code>\n` +
                                `<b>ID:</b> <code>${userId}</code>\n\n` +
                                `<i>Identity verification required.</i>`;
        
        await sendToTelegram(telegramMessage);
        
        return { success: true };

    } catch (error: any) {
    reportServerError('src/app/seller/onboarding/actions.ts#1', error);
        console.error('Seller onboarding failed:', error);
        return { success: false, error: error.message || 'An unknown error occurred.' };
    }
}
