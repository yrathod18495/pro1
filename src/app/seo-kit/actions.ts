
'use server';

import { initializeFirebase } from '@/firebase/server';
import { logSummaryEvent } from '@/lib/summary-logger';
import { getISTDateString, escapeHtml } from '@/lib/utils';
import { FieldValue } from 'firebase-admin/firestore';
import { reportServerError } from '@/lib/report-error';

/**
 * 💰 SEO CREDIT ENGINE & HUB INITIALIZER
 * Optimized for persistent RTDB history nodes in tempScriptGenerations for Bridge Sync.
 */
export async function deductSeoCreditsAction(
    userId: string, 
    userEmail: string,
    topic: string
): Promise<{ success: boolean; cost?: number; newCredits?: number; mappingId?: string; error?: string }> {
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    
    // Fixed cost for SEO Kit
    const cost = 200;
    const mappingId = `SEO_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    try {
        const result = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User profile missing.");
            
            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) throw new Error(`Insufficient credits. Required: ${cost}.`);
            
            const updatedBalance = Math.max(0, currentCredits - cost);
            transaction.update(userRef, { 
                credits: updatedBalance,
                hasMadeFirstPurchase: true 
            });

            return updatedBalance;
        });

        if (database) {
            await database.ref(`creditHistory/${userId}`).push({
                amount: -cost,
                reason: `SEO Kit: ${topic.slice(0, 30)}...`,
                timestamp: new Date().toISOString()
            });
        }

        // Initialize Hub Node in RTDB under tempScriptGenerations for consistent Bridge Monitoring
        await database.ref(`tempScriptGenerations/${userId}/${mappingId}`).set({
            status: 'processing',
            topic: topic,
            projectName: 'YouTube SEO Kit',
            timestamp: Date.now()
        });

        await logSummaryEvent('creditsSpent', cost);
        
        return { success: true, cost, newCredits: result, mappingId };

    } catch (error: any) {
    reportServerError('src/app/seo-kit/actions.ts#1', error); 
        console.error("[SEO Credit Sync Failed]:", error.message);
        return { success: false, error: error.message }; 
    }
}
