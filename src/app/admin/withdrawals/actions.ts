
'use server';

import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { reportServerError } from '@/lib/report-error';
import { requireAdmin } from '@/lib/auth-guard';

// Define the type for a withdrawal request
export interface WithdrawalRequest {
    id: string;
    sellerId: string;
    sellerName: string;
    withdrawableAmount: number;
    upiId: string;
    accountHolderName: string;
    status: 'pending' | 'completed' | 'rejected';
    createdAt: string;
    rejectionReason?: string;
    processedAt?: string;
}

export async function getWithdrawalRequests(idToken: string): Promise<{ success: boolean; data?: WithdrawalRequest[]; message: string; }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const { firestore } = initializeFirebase();
    try {
        const requestsRef = firestore.collection('withdrawalRequests');
        const snapshot = await requestsRef.orderBy('createdAt', 'desc').get();
        
        if (snapshot.empty) {
            return { success: true, data: [], message: 'No withdrawal requests found.' };
        }
        
        const requests: WithdrawalRequest[] = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        } as WithdrawalRequest));

        return { success: true, data: requests, message: 'Requests fetched.' };

    } catch (error: any) {
    reportServerError('src/app/admin/withdrawals/actions.ts#1', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}


const ProcessSchema = z.object({
  requestId: z.string(),
  sellerName: z.string(),
  amount: z.number(),
  adminEmail: z.string().email(),
  upiId: z.string(),
  accountHolderName: z.string(),
});

export async function processWithdrawal(idToken: string, input: z.infer<typeof ProcessSchema>): Promise<{ success: boolean; message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const validation = ProcessSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: validation.error.flatten().formErrors.join(', ') };
    }
    
    const { requestId, sellerName, amount, adminEmail, upiId, accountHolderName } = validation.data;
    const { firestore } = initializeFirebase();
    
    try {
        const requestRef = firestore.collection('withdrawalRequests').doc(requestId);
        await requestRef.update({
            status: 'completed',
            processedAt: new Date().toISOString(),
        });
        
        await sendToTelegram(`✅ *Withdrawal Processed*\n*Admin:* ${adminEmail}\n*Seller:* ${sellerName}\n*Name:* ${accountHolderName}\n*UPI ID:* \`${upiId}\`\n*Amount:* ₹${amount.toFixed(2)}`);

        revalidatePath('/admin/withdrawals');
        return { success: true, message: 'Withdrawal marked as completed.' };

    } catch (error: any) {
    reportServerError('src/app/admin/withdrawals/actions.ts#2', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}

const RejectSchema = z.object({
  requestId: z.string(),
  sellerName: z.string(),
  reason: z.string().min(10, 'Please provide a clear reason for rejection.'),
});

export async function rejectWithdrawal(idToken: string, input: z.infer<typeof RejectSchema>): Promise<{ success: boolean; message: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, message: guard.message };
    const validation = RejectSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, message: validation.error.flatten().formErrors.join(', ') };
    }

    const { requestId, sellerName, reason } = validation.data;
    const { firestore } = initializeFirebase();

    try {
        const requestRef = firestore.collection('withdrawalRequests').doc(requestId);
        await requestRef.update({
            status: 'rejected',
            rejectionReason: reason,
            processedAt: new Date().toISOString(),
        });

        await sendToTelegram(`❌ *Withdrawal Rejected*\n*Seller:* ${sellerName}\n*Reason:* ${reason}`);

        revalidatePath('/admin/withdrawals');
        return { success: true, message: 'Withdrawal request has been rejected.' };

    } catch (error: any) {
    reportServerError('src/app/admin/withdrawals/actions.ts#3', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}
