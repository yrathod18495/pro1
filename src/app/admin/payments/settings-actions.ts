'use server';

import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

export async function savePaidUntilDate(
  date: string,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { database } = initializeFirebase();
    const settingsRef = database.ref('settings/payments');
    
    await settingsRef.update({ paidUntilDate: date });
    
    await sendToTelegram(
      `💸 *Revenue 'Paid Until' Date Updated*\n*Admin:* ${adminEmail}\n*New Date:* ${date}`
    );

    revalidatePath('/admin/payments');
    return { success: true, message: 'Date updated successfully.' };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/settings-actions.ts#1', error);
    console.error('Failed to save paid until date:', error);
    await sendToTelegram(
      `🚨 *Paid Until Date Update FAILED*\n*Admin:* ${adminEmail}\n*Error:* ${error.message}`
    );
    return {
      success: false,
      message: error.message || 'An unknown error occurred.',
    };
  }
}
