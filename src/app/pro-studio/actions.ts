'use server';

import { initializeFirebase } from '@/firebase/server';
import type { Character, UserProfile } from '@/lib/types';
import { logSummaryEvent } from '@/lib/summary-logger';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { reportServerError } from '@/lib/report-error';

/**
 * 🎙️ PRO STUDIO DISPATCHER (v4.2 - PRO_PROJECTS NODE SYNC)
 * ---------------------------------------
 * Fixed: Writes to 'pro_projects' node in RTDB instead of 'pending_projects'.
 * Fixed: Explicitly places 'dialogues' at root of RTDB node for backend sync.
 */
export async function processProStudioGenerationAndDeductCredits(
  userId: string, 
  userName: string, 
  userEmail: string, 
  projectName: string, 
  script: string, 
  characters: Omit<Character, 'id'>[], 
  totalChars: number,
  dialogues: { character: string, line: string, emotion?: string }[],
  clientTimestamp?: string
): Promise<{ success: boolean; newCredits?: number; projectId?: string; error?: string }> {
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    
    // Pro Studio Cost: 0.5x multiplier (UPDATED per user request - Integer node)
    const cost = Math.ceil(totalChars * 0.5); 
    const projectId = `PRO_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const createdAt = clientTimestamp || new Date().toISOString();

    const projectRef = firestore.collection('pro_projects').doc(userId).collection('userProjects').doc(projectId);

    try {
        const newBalanceAfterDeduction = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("Identity node missing.");

            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) {
                throw new Error(`Insufficient credits. Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            }
            
            const updated = Math.max(0, currentCredits - cost);
            transaction.set(projectRef, { 
                id: projectId, userId, projectName, script, characters, cost, creditCost: cost,
                status: 'in_queue', projectType: 'pro-studio', 
                createdAt: createdAt, clientTimestamp: createdAt, timestamp: Date.now(), audioUrl: '', 
                syncData: { dialogues, clientTimestamp: createdAt } 
            });
            transaction.update(userRef, { credits: updated, hasMadeFirstPurchase: true });
            return updated;
        });

        if (database) {
            await database.ref(`creditHistory/${userId}`).push({
                amount: -cost,
                creditCost: cost,
                reason: `Pro Studio: ${projectName}`,
                timestamp: createdAt,
                clientTimestamp: createdAt,
                numericTimestamp: Date.now()
            });
        }

        /**
         * 🛰️ NEURAL HUB DISPATCH (Backend Path: pro_projects)
         * CRITICAL: 'dialogues' must be at root for Python Backend (Murf Engine).
         * Updated: Now uses isolated 'pro_projects' node as per production spec.
         */
        await database.ref(`pro_projects/${projectId}`).set({ 
            id: projectId, 
            userId, 
            userName, 
            userEmail, 
            projectName, 
            script, 
            characters, 
            dialogues: dialogues.map(d => ({ character: d.character, line: d.line })), 
            cost, 
            creditCost: cost,
            createdAt, 
            clientTimestamp: createdAt,
            timestamp: Date.now(),
            status: 'in_queue', 
            projectType: 'pro-studio', 
            syncData: { dialogues, clientTimestamp: createdAt },
            total_dialogues: dialogues.length,
            processed_dialogues: 0,
            rejected_nodes: 0
        });

        await logSummaryEvent('creditsSpent', cost); 

        // 📝 Record Deduction to History Ledger
        if (database) {
            await database.ref(`creditHistory/${userId}`).push({
                amount: -cost,
                reason: `Pro Studio: ${projectName || 'Untitled'}`,
                timestamp: new Date().toISOString(),
                projectId
            });
        }
        
        revalidatePath('/history');
        return { success: true, newCredits: newBalanceAfterDeduction, projectId: projectId };
    } catch (error: any) {
    reportServerError('src/app/pro-studio/actions.ts#1', error); 
        console.error("[Pro Studio Error]:", error.message);
        return { success: false, error: error.message }; 
    }
}
