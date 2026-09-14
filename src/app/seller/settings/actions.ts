
'use server';

import { z } from 'zod';
import { initializeFirebase as initializeAdminFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { sendPushNotificationToAdmins } from '@/app/admin/actions';
import type { SellerProfile } from '@/lib/types';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

const UpdateSellerProfileSchema = z.object({
  storeName: z.string().min(3, "Store name must be at least 3 characters."),
  description: z.string().min(20, "Description must be at least 20 characters."),
  profileImageUrl: z.string().optional(), 
  mobileNumber: z.string().min(10, "Mobile number is required."),
  secondaryEmail: z.string().email({ message: "Please enter a valid email." }),
});

type UpdateSellerProfileInput = z.infer<typeof UpdateSellerProfileSchema>;

export async function updateSellerProfileAction(
  userId: string,
  input: UpdateSellerProfileInput
): Promise<{ success: boolean; error?: string }> {
    const validation = UpdateSellerProfileSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().formErrors.join(', ') };
    }

    const { database: rtdb } = initializeAdminFirebase();

    try {
        const sellerProfileRef = rtdb.ref(`sellerProfiles/${userId}`);
        const snapshot = await sellerProfileRef.get();
        if (!snapshot.exists()) {
            throw new Error("Seller profile does not exist.");
        }

        const currentProfile = snapshot.val() as SellerProfile;
        
        // CHECK: If public fields changed, trigger re-approval.
        // If ONLY contact info changed, update directly without pending status.
        const publicChanged = 
            validation.data.storeName !== currentProfile.storeName ||
            validation.data.description !== currentProfile.description ||
            (validation.data.profileImageUrl && validation.data.profileImageUrl !== currentProfile.profileImageUrl);

        if (publicChanged) {
            const updatedProfile: SellerProfile = {
                ...currentProfile,
                ...validation.data,
                status: 'pending_update',
            };

            await sellerProfileRef.update({ status: 'pending_update', ...validation.data });
            await rtdb.ref(`pendingSellerProfiles/${userId}`).set(updatedProfile);
            
            const telegramMessage = `✍️✍️ <b>Seller Profile Update (Public)</b>\n\n` +
                                    `<b>Store:</b> ${escapeHtml(validation.data.storeName)}\n` +
                                    `<b>ID:</b> <code>${userId}</code>\n\n` +
                                    `<i>Verification required for public visibility.</i>`;

            await sendToTelegram(telegramMessage);
        } else {
            // ONLY contact/internal info changed
            await sellerProfileRef.update(validation.data);
            await sendToTelegram(`🔧 <b>Seller Contact Sync</b>\n<b>ID:</b> <code>${userId}</code>\n<b>Contact:</b> ${validation.data.secondaryEmail} | ${validation.data.mobileNumber}`);
        }

        return { success: true };

    } catch (error: any) {
    reportServerError('src/app/seller/settings/actions.ts#1', error);
        console.error('Seller profile update failed:', error);
        return { success: false, error: error.message || 'An unknown error occurred.' };
    }
}
