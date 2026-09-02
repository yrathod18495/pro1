
'use server';

import { initializeFirebase } from '@/firebase/server';
import type { AffiliateTransaction } from '@/lib/types';
import { format } from 'date-fns';
import { reportServerError } from '@/lib/report-error';

export interface AffiliateDashboardData {
  todayEarnings: number;
  yesterdayEarnings: number;
  totalEarnings: number;
  totalWithdrawn: number;
  withdrawableAmount: number;
  transactions: AffiliateTransaction[];
  affiliateCode: string;
}

export async function getAffiliateDashboardData(userId: string): Promise<{ success: boolean; data?: AffiliateDashboardData, message: string }> {
    const { firestore, database } = initializeFirebase();

    try {
        // 1. Get user email
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) return { success: false, message: "User not found." };
        const userEmail = userDoc.data()?.email;
        if (!userEmail) return { success: false, message: "User email is not available." };

        // 2. Find affiliate code by email
        const affiliateCodesRef = database.ref('affiliateCodes');
        const snapshot = await affiliateCodesRef.orderByChild('affiliateEmail').equalTo(userEmail).get();
        
        if (!snapshot.exists()) {
             // To handle cases where isAffiliate might be true but code was deleted
            const userRef = firestore.collection('users').doc(userId);
            await userRef.update({ isAffiliate: false });
            return { success: false, message: "No affiliate account found for this user." };
        }
        
        // Assuming one code per email for now
        const codesData = snapshot.val();
        const affiliateCode = Object.keys(codesData)[0];
        
        // 3. Get earnings and transactions data
        // Transactions are stored at top level affiliateTransactions/{code}
        const [earningsSnapshot, transactionsSnapshot] = await Promise.all([
            database.ref(`affiliateEarnings/${affiliateCode}`).get(),
            database.ref(`affiliateTransactions/${affiliateCode}`).get()
        ]);

        const earningsData = earningsSnapshot.val() || { totalEarnings: 0, totalWithdrawn: 0 };
        const totalEarnings = earningsData.totalEarnings || 0;
        const totalWithdrawn = earningsData.totalWithdrawn || 0;

        const rawTxs = transactionsSnapshot.val() || {};
        const transactions: AffiliateTransaction[] = Object.entries(rawTxs).map(([id, tx]: [string, any]) => ({ id, ...tx }));

        // 4. Calculate stats
        const now = new Date();
        const todayStartStr = format(now, 'yyyy-MM-dd');
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStartStr = format(yesterday, 'yyyy-MM-dd');
        
        let todayEarnings = 0;
        let yesterdayEarnings = 0;

        transactions.forEach(tx => {
            const txDateStr = format(new Date(tx.timestamp), 'yyyy-MM-dd');
            if (txDateStr === todayStartStr) {
                todayEarnings += tx.commissionEarned;
            } else if (txDateStr === yesterdayStartStr) {
                yesterdayEarnings += tx.commissionEarned;
            }
        });

        // Show newest first in UI
        transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return {
            success: true,
            data: {
                todayEarnings,
                yesterdayEarnings,
                totalEarnings,
                totalWithdrawn,
                withdrawableAmount: totalEarnings - totalWithdrawn,
                transactions,
                affiliateCode,
            },
            message: "Data fetched."
        };

    } catch (error: any) {
    reportServerError('src/app/payouts/actions.ts#1', error);
        console.error("Error fetching affiliate dashboard data:", error);
        return { success: false, message: error.message || "An unknown server error occurred." };
    }
}
