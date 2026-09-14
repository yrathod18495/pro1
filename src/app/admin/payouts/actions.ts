
'use server';

import { initializeFirebase } from '@/firebase/server';
import { z } from 'zod';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { AffiliateCode, AffiliateTransaction, AffiliateWithdrawal } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { reportServerError } from '@/lib/report-error';
import { requireAdmin } from '@/lib/auth-guard';


export async function getAffiliateData(idToken: string): Promise<{ success: boolean; data?: { codes: AffiliateCode[], earnings: Record<string, { totalEarnings: number, totalWithdrawn: number, transactions: AffiliateTransaction[], withdrawals: AffiliateWithdrawal[] }> } , message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const { database } = initializeFirebase();
    try {
        const codesSnapshot = await database.ref('affiliateCodes').orderByKey().get();
        const earningsSnapshot = await database.ref('affiliateEarnings').get();
        const transactionsSnapshot = await database.ref('affiliateTransactions').get();
        const withdrawalsSnapshot = await database.ref('affiliateWithdrawals').get();

        const codesData = codesSnapshot.exists() ? codesSnapshot.val() : {};
        const earningsData = earningsSnapshot.exists() ? earningsSnapshot.val() : {};
        const transactionsData = transactionsSnapshot.exists() ? transactionsSnapshot.val() : {};
        const withdrawalsData = withdrawalsSnapshot.exists() ? withdrawalsSnapshot.val() : {};

        const codes: AffiliateCode[] = Object.keys(codesData).map(id => {
          const codeData = codesData[id];
          return {
            id,
            ...codeData,
          };
        });

        const finalEarnings: Record<string, { totalEarnings: number, totalWithdrawn: number, transactions: AffiliateTransaction[], withdrawals: AffiliateWithdrawal[] }> = {};
        for (const code of codes) {
            const codeId = code.id;
            const rawTransactions = transactionsData[codeId] || {};
            const transactions: AffiliateTransaction[] = Object.entries(rawTransactions).map(([id, tx]: [string, any]) => ({ id, ...tx }));
            transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            const rawWithdrawals = withdrawalsData[codeId] || {};
            const withdrawals: AffiliateWithdrawal[] = Object.entries(rawWithdrawals).map(([id, wd]: [string, any]) => ({ id, ...wd }));
            withdrawals.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            
            const earningsRecord = earningsData[codeId] || { totalEarnings: 0, totalWithdrawn: 0 };

            finalEarnings[codeId] = {
                totalEarnings: earningsRecord.totalEarnings,
                totalWithdrawn: earningsRecord.totalWithdrawn,
                transactions,
                withdrawals,
            };
        }

        return { success: true, data: { codes, earnings: finalEarnings }, message: 'Affiliate data fetched.' };

    } catch (error: any) {
    reportServerError('src/app/admin/payouts/actions.ts#1', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}

const PayoutSchema = z.object({
  code: z.string(),
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  adminEmail: z.string().email(),
  youtuberTelegramId: z.string(),
});

export async function recordAffiliatePayout(
  idToken: string,
  input: z.infer<typeof PayoutSchema>
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  const validation = PayoutSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, message: validation.error.flatten().formErrors.join(', ') };
  }

  const { code, amount, adminEmail, youtuberTelegramId } = validation.data;
  const { database } = initializeFirebase();
  const earningsRef = database.ref(`affiliateEarnings/${code}`);

  try {
    const transactionResult = await earningsRef.transaction((currentData: any) => {
      // Initialize if null
      if (currentData === null) {
        return { totalEarnings: 0, totalWithdrawn: 0 };
      }
      
      const currentWithdrawable = (currentData.totalEarnings || 0) - (currentData.totalWithdrawn || 0);
      if (amount > currentWithdrawable) {
        return; // Abort transaction if withdrawable balance is insufficient.
      }
      
      // Only update the summary data in the transaction
      return {
        totalEarnings: currentData.totalEarnings || 0,
        totalWithdrawn: (currentData.totalWithdrawn || 0) + amount,
      };
    });

    if (!transactionResult.committed) {
      // Re-read data to provide an accurate error message
      const latestSnapshot = await earningsRef.get();
      const latestData = latestSnapshot.val();
      const latestWithdrawable = (latestData?.totalEarnings || 0) - (latestData?.totalWithdrawn || 0);
      
      if (amount > latestWithdrawable) {
        const errorMessage = `Payout failed. The requested amount of ₹${amount.toFixed(2)} exceeds the current withdrawable balance of ₹${latestWithdrawable.toFixed(2)}.`;
        return { success: false, message: errorMessage };
      }
      
      // If it wasn't an insufficient balance error, it was a conflict.
      const concurrencyErrorMessage = 'Payout failed. The system detected that the earnings data was updated at the same moment. This is a concurrency safety measure. Please try again in a few seconds.';
      return { success: false, message: concurrencyErrorMessage };
    }

    // After successful transaction, write the detailed withdrawal record.
    const newWithdrawalRef = database.ref(`affiliateWithdrawals/${code}`).push();
    await newWithdrawalRef.set({
      amount,
      timestamp: new Date().toISOString(),
      adminEmail,
    });

    const updatedData = transactionResult.snapshot.val();
    const newWithdrawableBalance = (updatedData.totalEarnings || 0) - (updatedData.totalWithdrawn || 0);
    const previousWithdrawableBalance = newWithdrawableBalance + amount;

    // Send notifications
    const adminMessage = `✅ *Affiliate Payout Recorded*
*Admin:* ${adminEmail}
*Creator Code:* ${code}
*Amount Paid:* ₹${amount.toFixed(2)}
*New Withdrawable Balance:* ₹${newWithdrawableBalance.toFixed(2)}`;
    await sendToTelegram(adminMessage);

    const creatorMessage = `💰 *Payment Processed!*
We have sent *₹${amount.toFixed(2)}* to your registered UPI ID.
_Previous Balance: ₹${previousWithdrawableBalance.toFixed(2)}_
_New Withdrawable Balance: ₹${newWithdrawableBalance.toFixed(2)}_`;
    await sendToTelegram(creatorMessage, undefined, { targetChatId: youtuberTelegramId });

    revalidatePath('/admin/payouts');
    return { success: true, message: "Payout recorded and creator notified." };

  } catch (error: any) {
    reportServerError('src/app/admin/payouts/actions.ts#2', error);
    console.error(`Failed to record payout for ${code}:`, error);
    await sendToTelegram(`🚨 *CRITICAL: Affiliate Payout FAILED*\n*Admin:* ${adminEmail}\n*Code:* ${code}\n*Amount:* ₹${amount.toFixed(2)}\n*Error:* ${error.message}`);
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}
