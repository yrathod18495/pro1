'use server';

import { initializeFirebase } from '@/firebase/server';
import { ai } from '@/ai/genkit';
import { NEW_STUDIO_MODEL } from '@/ai/config';
import { logSummaryEvent } from '@/lib/summary-logger';
import { getDisplayUrl, escapeHtml } from '@/lib/utils';
import { sendToTelegram } from '@/lib/telegram-logger';
import { FieldValue } from 'firebase-admin/firestore';
import type { UserProfile } from '@/lib/types';
import { callHFEditingBridge } from '@/ai/engines/hf-bridge';
import { reportServerError } from '@/lib/report-error';

/**
 * 🎙️ NEW AI STUDIO - SYNTHESIS NODE (v2.0 - DISPATCHER READY)
 * Now routes through ai.generate for HF Bridge and Node Rotation support.
 */
export async function generateChatterboxLineAction(input: {
  userId: string;
  userEmail: string;
  text: string;
  refAudioUrl: string;
  language?: string;
  workerId?: number;
  character?: string;
  lineId?: string;
}): Promise<{ success: boolean; audioDataUri?: string; usedBridge?: boolean; keyName?: string; error?: string }> {
    const { text, refAudioUrl, language = 'hi', userId, userEmail, workerId, character, lineId } = input;

    try {
        const { database } = initializeFirebase();
        const editingSettingsSnap = await database.ref('settings/editingHfBackend').get();
        const editingSettings = editingSettingsSnap.exists() ? editingSettingsSnap.val() : null;

        if (editingSettings && editingSettings.enabled !== false && editingSettings.url) {
            const hfRes = await callHFEditingBridge(editingSettings.url, {
                text, refAudioUrl, language, userId, userEmail, character, lineId
            });
            if (hfRes.success && hfRes.audioDataUri) {
                return { success: true, audioDataUri: hfRes.audioDataUri, usedBridge: true, keyName: 'HF-Editing-Backend' };
            }
        }

        const refAudioResponse = await fetch(refAudioUrl);
        if (!refAudioResponse.ok) throw new Error("Could not reach voice archive node.");
        const buffer = await refAudioResponse.arrayBuffer();
        const base64Ref = Buffer.from(buffer).toString('base64');

        // Route through Global Neural Dispatcher
        const response = await ai.generate({
            model: NEW_STUDIO_MODEL,
            prompt: text,
            // @ts-ignore
            metadata: { 
                userEmail, 
                userId, 
                taskType: "New Studio Synthesis", 
                workerId,
                generationParams: {
                    text,
                    language,
                    refAudioBase64: `data:audio/wav;base64,${base64Ref}`
                }
            }
        });

        const media = (response as any).media;
        const usedBridge = !!(response as any).custom?.bridge;
        const keyName = (response as any).custom?.keyName || 'Unknown';

        if (!media || !media.url) throw new Error("Neural engine failed to return audio stream.");

        await logSummaryEvent('chatterboxGenerations');

        if (media.url.startsWith('http')) {
            await sendToTelegram(`🎙️✅ <b>New AI Studio Synthesis Complete</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Language:</b> ${escapeHtml(language)}\n<b>Text:</b> <i>${escapeHtml(text.slice(0, 80))}...</i>\n<b>🎧 Media Asset:</b> <a href="${escapeHtml(media.url)}">Listen / Download Audio</a>`).catch(() => null);
        } else {
            await sendToTelegram(`🎙️✅ <b>New AI Studio Synthesis Complete</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Language:</b> ${escapeHtml(language)}\n<b>Text:</b> <i>${escapeHtml(text.slice(0, 80))}...</i>`).catch(() => null);
        }

        return { 
            success: true, 
            audioDataUri: media.url, 
            usedBridge, 
            keyName
        };

    } catch (error: any) {
    reportServerError('src/app/new-ai-studio/actions.ts#1', error);
        console.error("New AI Studio Synthesis Failed:", error.message);
        
        await sendToTelegram(`🎙️🚨 <b>New AI Studio Synthesis Failed</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Text:</b> <i>${escapeHtml(text.slice(0, 50))}...</i>\n<b>Error:</b> <pre>${escapeHtml(error.message)}</pre>`);
        
        return { success: false, error: error.message };
    }
}

/**
 * 🎁 NEW STUDIO TRIAL & CREDIT ENGINE
 * Standardized: uses 0.5x multiplier on totalChars
 */
export async function deductNewStudioCreditsAction(
    userId: string,
    totalChars: number,
    projectName: string,
    projectId: string
): Promise<{ success: boolean; newCredits?: number; trialBalance?: number; usedTrial?: boolean; error?: string }> {
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    const trialRef = database.ref(`newAiStudioTrial/${userId}`);

    // UI SYNCED LOGIC: multiplier 0.5x
    const cost = Math.ceil(totalChars * 0.5);

    try {
        const trialSnap = await trialRef.get();
        let trialData = trialSnap.exists() ? trialSnap.val() : null;

        let remainingCost = cost;
        let usedFromTrial = 0;

        if (trialData && trialData.balance > 0) {
            if (remainingCost <= trialData.balance) {
                usedFromTrial = remainingCost;
                trialData.balance -= remainingCost;
                remainingCost = 0;
            } else {
                usedFromTrial = trialData.balance;
                remainingCost -= trialData.balance;
                trialData.balance = 0;
                trialData.used = true;
            }
            await trialRef.update(trialData);
        }

        let finalUserBalance = 0;
        if (remainingCost > 0) {
            finalUserBalance = await firestore.runTransaction(async (transaction: any) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) throw new Error("User profile missing.");
                
                const currentBalance = userDoc.data()?.credits || 0;
                if (currentBalance < remainingCost) {
                    throw new Error(`Insufficient credits. Required: ${remainingCost.toLocaleString()}, Available: ${currentBalance.toLocaleString()}.`);
                }
                
                const updated = Math.max(0, currentBalance - remainingCost);
                transaction.update(userRef, { credits: updated, hasMadeFirstPurchase: true });
                return updated;
            });

            await database.ref(`creditHistory/${userId}`).push({
                amount: -remainingCost,
                reason: `New AI Studio: ${projectName} (Overflow)`,
                timestamp: new Date().toISOString(),
                projectId
            });
            await logSummaryEvent('creditsSpent', remainingCost);
        }

        return { 
            success: true, 
            newCredits: remainingCost > 0 ? finalUserBalance : undefined,
            trialBalance: trialData?.balance,
            usedTrial: usedFromTrial > 0
        };

    } catch (e: any) {
    reportServerError('src/app/new-ai-studio/actions.ts#2', e);
        await sendToTelegram(`💰🚨 <b>Studio Credit Deduction FAILED</b>\n<b>User:</b> ${userId}\n<b>Error:</b> <pre>${escapeHtml(e.message)}</pre>`);
        return { success: false, error: e.message };
    }
}
