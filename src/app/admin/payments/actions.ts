
'use server';

import { initializeFirebase } from '@/firebase/server';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { PendingPayment } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { reportServerError } from '@/lib/report-error';
import { requireAdmin } from '@/lib/auth-guard';

export async function manuallyApprovePayment(
  idToken: string,
  paymentId: string
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  const { firestore, database } = initializeFirebase();

  try {
    const paymentRef = firestore.collection('pendingPayments').doc(paymentId);
    let newCredits = 0;

    await firestore.runTransaction(async (transaction: any) => {
      const paymentDoc = await transaction.get(paymentRef);
      if (!paymentDoc.exists) {
        throw new Error('Payment record not found.');
      }
      const paymentData = paymentDoc.data() as PendingPayment;
      if (paymentData.status !== 'pending') {
        throw new Error('This payment is not in a pending state.');
      }

      const userRef = firestore.collection('users').doc(paymentData.userId);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error(`User with ID ${paymentData.userId} not found.`);
      }

      const creditsToAdd = paymentData.credits;
      const amountPaidInInr = (paymentData.amount || 0) / 100;
      newCredits = (userDoc.data()?.credits || 0) + creditsToAdd;

      // 1. Update payment status
      transaction.update(paymentRef, { status: 'approved' });

      // 2. Update user credits & financial metrics
      const isAutopay = paymentData.planName?.toLowerCase().includes('consistent creator');
      const userUpdates: any = {
        credits: FieldValue.increment(creditsToAdd),
        totalInvestment: FieldValue.increment(amountPaidInInr),
        hasMadeFirstPurchase: true
      };

      if (isAutopay) {
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        userUpdates.subscription = { 
          planId: 'autopay_pro',
          status: 'active',
          subscriptionId: paymentData.orderId || undefined,
          startDate: now.toISOString(),
          nextWeeklyGrantDate: nextWeek.toISOString(),
          weeklyGrantCount: 1,
          currentCycleMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        };
      }

      transaction.update(userRef, userUpdates);

      // 3. Add to credit history (RTDB)
      const historyEntry = {
        amount: creditsToAdd,
        reason: `Purchase - ${paymentData.planName} (Manual Approval)`,
        timestamp: new Date().toISOString(),
        paymentId: paymentData.paymentId || `MANUAL_${Date.now()}`,
        orderId: paymentData.orderId,
        amountPaid: amountPaidInInr,
        currency: paymentData.currency || 'INR',
      };
      if (database) {
        database.ref(`creditHistory/${paymentData.userId}`).push(historyEntry).catch((e: any) => console.error("RTDB history write failed:", e));
      }

      // 4. Send notification to user
      const notificationRef = userRef.collection('notifications').doc('user_notifications');
      const notificationEntry = {
        id: `notif-${paymentId}-${Date.now()}`,
        message: `Your purchase of ${creditsToAdd.toLocaleString()} credits was approved!`,
        timestamp: new Date().toISOString(),
        read: false,
        type: 'credits' as const,
      };
      transaction.set(notificationRef, { entries: FieldValue.arrayUnion(notificationEntry) }, { merge: true });
    });

    // Send Telegram log after successful transaction
    await sendToTelegram(
      `✅ *Payment Manually Approved by Admin*\n*Payment ID:* ${paymentId}\n*New Balance:* ${newCredits.toLocaleString()}`
    );

    revalidatePath('/admin/payments');
    return { success: true, message: 'Payment approved successfully!' };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts#1', error);
    console.error('Manual approval failed:', error);
    await sendToTelegram(
      `🚨 *Manual Approval FAILED*\n*Payment ID:* ${paymentId}\n*Error:* ${error.message}`
    );
    return {
      success: false,
      message: error.message || 'An unknown error occurred.',
    };
  }
}

export async function deletePendingPayment(
  idToken: string,
  paymentId: string
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  const { firestore } = initializeFirebase();

  try {
    const paymentRef = firestore.collection('pendingPayments').doc(paymentId);
    
    const paymentDoc = await paymentRef.get();
    if (!paymentDoc.exists) {
      return { success: true, message: 'Payment record was already removed.' };
    }
    const paymentData = paymentDoc.data() as PendingPayment;

    if (paymentData.status === 'approved') {
      throw new Error('This payment has already been approved and cannot be deleted.');
    }

    await paymentRef.delete();
    
    await sendToTelegram(
      `🗑️ *Pending Payment Deleted by Admin*\n*Payment ID:* ${paymentId}\n*User:* ${paymentData.userEmail}`
    );

    revalidatePath('/admin/payments');
    return { success: true, message: 'Pending payment record deleted successfully.' };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts#2', error);
    console.error('Pending payment deletion failed:', error);
    return {
      success: false,
      message: error.message || 'An unknown error occurred.',
    };
  }
}

export async function bulkDeletePayments(
  idToken: string,
  paymentIds: string[]
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  const { firestore } = initializeFirebase();
  const batch = firestore.batch();
  
  try {
    for (const id of paymentIds) {
      const ref = firestore.collection('pendingPayments').doc(id);
      batch.delete(ref);
    }
    await batch.commit();
    
    await sendToTelegram(`🗑️ *Bulk Deletion of Payments*\n*Count:* ${paymentIds.length} items removed.`);
    
    revalidatePath('/admin/payments');
    return { success: true, message: `${paymentIds.length} records deleted successfully.` };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts#3', error);
    console.error('Bulk deletion failed:', error);
    return { success: false, message: error.message || 'An unknown error occurred during bulk deletion.' };
  }
}
