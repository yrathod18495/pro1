'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import { logSummaryEvent } from '@/lib/summary-logger';
import { getISTDateString, escapeHtml, checkIsPaidUser } from '@/lib/utils';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { UserProfile } from '@/lib/types';
import { reportServerError } from '@/lib/report-error';

/**
 * 💰 SCRIPT CREDIT ENGINE & HUB INITIALIZER
 */
export async function deductScriptCreditsAction(
    userId: string, 
    userEmail: string,
    targetLength: number,
    projectName: string,
    language: string,
    clientTimestamp?: string,
    extraParams?: {
        genre?: string;
        tone?: string;
        audience?: string;
        perspective?: string;
        numberOfCharacters?: string;
        plotSummary?: string;
        additionalInstructions?: string;
        scriptType?: string;
    }
): Promise<{ success: boolean; cost?: number; newCredits?: number; mappingId?: string; error?: string }> {
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    const today = getISTDateString();
    const usageRef = database.ref(`userScriptGenerationLimits/${userId}/${today}`);
    
    const mappingId = `STORY_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const createdAtIso = clientTimestamp || new Date().toISOString();
    const numericTimestamp = Date.now();

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error("User profile missing.");
        
        const userData = userDoc.data() as UserProfile;
        
        // 🚨 CHECK DAILY LIMIT FOR ALL USERS (FREE & PAID)
        if (database) {
            const limitSnap = await database.ref('settings/app/dailyFreeScriptLimit').get();
            const dailyFreeLimit = limitSnap.exists() ? Number(limitSnap.val()) : 40;

            const dailyFreeCountSnap = await database.ref(`dailyFreeScriptGenerations/${today}/count`).get();
            const dailyFreeCount = dailyFreeCountSnap.exists() ? Number(dailyFreeCountSnap.val()) : 0;

            if (dailyFreeCount >= dailyFreeLimit) {
                return { 
                    success: false, 
                    error: "You can't create more scripts daily script generation limit exceeded come back tomorrow when quota refreshed" 
                };
            }
        }

        const usageSnap = await usageRef.get();
        const count = usageSnap.val() || 0;

        // Fetch dynamic pricing config from RTDB settings/pricing
        let pricingData: any = {};
        if (database) {
            try {
                const pricingSnap = await database.ref('settings/pricing').get();
                if (pricingSnap.exists()) {
                    pricingData = pricingSnap.val();
                }
            } catch (e) {
    reportServerError('src/app/script-generator/actions.ts#1', e);
                console.warn("Failed to fetch dynamic pricing in deductScriptCreditsAction, using fallback", e);
            }
        }

        const script10Normal = Number(pricingData.script10Normal) || 1000;
        const script10Discounted = Number(pricingData.script10Discounted) || 500;
        const script20Normal = Number(pricingData.script20Normal) || 2000;
        const script20Discounted = Number(pricingData.script20Discounted) || 700;
        const script30Normal = Number(pricingData.script30Normal) || 3000;
        const script30Discounted = Number(pricingData.script30Discounted) || 1000;
        
        // TIERED PRICING MATRIX
        let cost = 0;
        if (userData.isSponsor === true) {
            cost = 0;
        } else if (count === 0) {
            if (targetLength <= 8000) cost = script10Discounted;
            else if (targetLength <= 17000) cost = script20Discounted;
            else cost = script30Discounted;
        } else {
            if (targetLength <= 8000) cost = script10Normal;
            else if (targetLength <= 17000) cost = script20Normal;
            else cost = script30Normal;
        }

        const result = await firestore.runTransaction(async (transaction: any) => {
            const freshUserDoc = await transaction.get(userRef);
            const currentCredits = freshUserDoc.data()?.credits || 0;
            
            if (currentCredits < cost) throw new Error(`Insufficient credits. Required: ${cost}, Available: ${currentCredits}.`);
            
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
                creditCost: cost,
                reason: `Script Studio: ${projectName} (${targetLength / 1000}k chars)`,
                timestamp: createdAtIso,
                clientTimestamp: createdAtIso,
                numericTimestamp: numericTimestamp
            });
        }

        // Initialize Hub Node in RTDB
        await database.ref(`tempScriptGenerations/${userId}/${mappingId}`).set({
            status: 'processing',
            projectName,
            language,
            cost,
            creditCost: cost,
            createdAt: createdAtIso,
            clientTimestamp: createdAtIso,
            timestamp: numericTimestamp,

            // Added requested fields:
            mappingId,
            userId,
            userEmail: userEmail || 'N/A',
            scriptType: extraParams?.scriptType || projectName || 'story script',
            targetLength,
            type: 'script_generation',
            genre: extraParams?.genre || '',
            tone: extraParams?.tone || '',
            audience: extraParams?.audience || '',
            perspective: extraParams?.perspective || '',
            numberOfCharacters: extraParams?.numberOfCharacters || '',
            plotSummary: extraParams?.plotSummary || '',
            additionalInstructions: extraParams?.additionalInstructions || ''
        });

        // 🚀 SUBMIT SCRIPT PROJECT TO FIRESTORE (`script_projects`)
        const scriptProjectPayload = {
            id: mappingId,
            projectId: mappingId,
            mappingId,
            userId,
            userEmail: userEmail || 'N/A',
            projectName: `AI SCRIPT: ${(projectName || 'Script').slice(0, 32).toUpperCase()}`,
            language,
            targetLength,
            status: 'pending',
            projectType: 'script',
            isScript: true,
            cost,
            creditCost: cost,
            createdAt: createdAtIso,
            clientTimestamp: createdAtIso,
            updatedAt: createdAtIso,
            timestamp: numericTimestamp,

            // Added requested fields:
            scriptType: extraParams?.scriptType || projectName || 'story script',
            type: 'script_generation',
            genre: extraParams?.genre || '',
            tone: extraParams?.tone || '',
            audience: extraParams?.audience || '',
            perspective: extraParams?.perspective || '',
            numberOfCharacters: extraParams?.numberOfCharacters || '',
            plotSummary: extraParams?.plotSummary || '',
            additionalInstructions: extraParams?.additionalInstructions || ''
        };

        // 1. Partitioned user path
        await firestore
            .collection('script_projects')
            .doc(userId)
            .collection('userProjects')
            .doc(mappingId)
            .set(scriptProjectPayload)
            .catch((e: any) => console.error("Firestore script_projects user error:", e));

        // 2. Root collection document
        await firestore
            .collection('script_projects')
            .doc(mappingId)
            .set(scriptProjectPayload)
            .catch((e: any) => console.error("Firestore script_projects root error:", e));

        await usageRef.set(count + 1);
        if (database) {
            await database.ref(`dailyFreeScriptGenerations/${today}/count`).transaction((curr: any) => (curr || 0) + 1);
        }
        await logSummaryEvent('creditsSpent', cost);

        await sendToTelegram(`💰 <b>Script Hub Initialized</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Project:</b> ${escapeHtml(projectName)}\n<b>Sync:</b> <code>-${cost}</code>`);
        
        return { success: true, cost, newCredits: result, mappingId };

    } catch (error: any) {
        // "Insufficient credits" is expected user-facing validation, not a bug —
        // it fires whenever a user tries to generate without enough balance.
        // Reporting it as a Server Error spams the admin channel with routine,
        // actionless noise. Only report genuine failures (DB errors, etc).
        const isInsufficientCredits = typeof error?.message === 'string' && error.message.startsWith('Insufficient credits');
        if (!isInsufficientCredits) {
            reportServerError('src/app/script-generator/actions.ts#2', error);
        }
        console.error("[Credit Sync Failed]:", error.message);
        return { success: false, error: error.message }; 
    }
}

/**
 * 🏁 FINALIZE SCRIPT ACTION
 * Saves the received script to Firestore history and cleans up RTDB.
 */
export async function finalizeScriptSelectionAction(input: {
    userId: string;
    userEmail: string;
    userName: string;
    script: string;
    scriptUrl: string;
    mappingId: string;
    generationParams: any;
}): Promise<{ success: boolean; projectId?: string; error?: string }> {
    const { userId, userEmail, script, scriptUrl, mappingId, generationParams } = input;
    
    try {
        const { firestore, database } = initializeFirebase();
        
        const projectId = mappingId; 
        const projectRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        
        const projectName = `AI Script: ${generationParams.genre || 'Generation'}`;
        
        // 🚀 SECURE FULL SYNC
        await projectRef.set({ 
            id: projectId, 
            userId, 
            projectName, 
            script: script, 
            scriptUrl: scriptUrl,
            audioUrl: '', 
            createdAt: new Date().toISOString(), 
            generationParams,
            projectType: 'script',
            status: 'completed',
            cost: generationParams.cost || 0 
        });

        // Also sync completion to script_projects
        const updatedPayload = {
            script: script,
            scriptUrl: scriptUrl || '',
            status: 'completed',
            updatedAt: new Date().toISOString()
        };
        await firestore.collection('script_projects').doc(userId).collection('userProjects').doc(projectId).set(updatedPayload, { merge: true }).catch(() => null);
        await firestore.collection('script_projects').doc(projectId).set(updatedPayload, { merge: true }).catch(() => null);

        // Cleanup RTDB Node
        await database.ref(`tempScriptGenerations/${userId}/${mappingId}`).remove();

        await logSummaryEvent('scriptsGenerated');
        await sendToTelegram(`✅ <b>Script Hub Secured</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>ID:</b> <code>${projectId}</code>`);
        
        revalidatePath('/history');
        return { success: true, projectId };
    } catch (error: any) {
    reportServerError('src/app/script-generator/actions.ts#3', error); 
        console.error("[Script Finalization Failed]:", error.message);
        return { success: false, error: error.message }; 
    }
}

/**
 * 📊 GET REMAINING SCRIPT QUOTA
 */
export async function getRemainingScriptQuotaAction(): Promise<{ remaining: number; limit: number }> {
    const { database } = initializeFirebase();
    if (!database) return { remaining: 0, limit: 0 };

    const today = getISTDateString();
    
    try {
        const limitSnap = await database.ref('settings/app/dailyFreeScriptLimit').get();
        const dailyFreeLimit = limitSnap.exists() ? Number(limitSnap.val()) : 40;

        const dailyFreeCountSnap = await database.ref(`dailyFreeScriptGenerations/${today}/count`).get();
        const dailyFreeCount = dailyFreeCountSnap.exists() ? Number(dailyFreeCountSnap.val()) : 0;

        return {
            remaining: Math.max(0, dailyFreeLimit - dailyFreeCount),
            limit: dailyFreeLimit
        };
    } catch (error) {
    reportServerError('src/app/script-generator/actions.ts#4', error);
        console.error("Error fetching script quota:", error);
        return { remaining: 0, limit: 0 };
    }
}
