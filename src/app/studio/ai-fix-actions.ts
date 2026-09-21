'use server';

import { initializeFirebase } from '@/firebase/server';
import { callOpenRouterText } from '@/ai/engines/openrouter';
import { reportServerError } from '@/lib/report-error';
import { MIN_DIALOGUE_WORDS, isDialogueTooShort } from '@/lib/dialogue-validation';

const DEFAULT_AI_FIX_COST = 50;

/**
 * 🪄 "AI-Fix" — used by the pre-generate Resolve wizard
 * (studio/generation-settings.tsx) to expand a too-short dialogue line just
 * enough to give the TTS engine phonetic context to work with, without
 * rewriting the character's voice. Deducts an admin-configurable flat credit
 * cost (settings/app/aiDialogueExpandCost) via Gemini 2.5 Flash Lite,
 * reached through the existing OpenRouter integration (src/ai/engines/openrouter.ts)
 * already used elsewhere in this app as an analysis fallback.
 */
export async function expandDialogueWithAiAction(
    userId: string,
    dialogueText: string,
    characterName: string,
    fullScriptContext: string
): Promise<{ success: boolean; expandedText?: string; newCredits?: number; error?: string }> {
    if (!userId) return { success: false, error: 'User ID required.' };
    if (!dialogueText.trim()) return { success: false, error: 'Empty dialogue line.' };

    const { firestore, database } = initializeFirebase();

    try {
        const costSnap = await database.ref('settings/app/aiDialogueExpandCost').get();
        const cost = costSnap.exists() ? Number(costSnap.val()) : DEFAULT_AI_FIX_COST;

        // Charge first (same order as checkAndDeductCloningCredits) — if the
        // AI call itself fails after this, the credit loss is refunded below.
        const userRef = firestore.collection('users').doc(userId);
        let newCredits = 0;
        await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User profile not found.');
            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) throw new Error(`Insufficient credits. You need ${cost} credits for AI-Fix.`);
            newCredits = Math.max(0, currentCredits - cost);
            transaction.update(userRef, { credits: newCredits });
        });

        await database.ref(`creditHistory/${userId}`).push({
            amount: -cost,
            reason: 'Studio: AI Dialogue Fix',
            timestamp: new Date().toISOString(),
        }).catch((e: any) => { reportServerError('src/app/studio/ai-fix-actions.ts:creditHistory', e); return null; });

        const prompt = `You are fixing ONE line of dialogue in a voiceover script so it has enough words for an AI voice actor to perform naturally. The line below is too short (under ${MIN_DIALOGUE_WORDS} words) and would sound broken or clipped if synthesized as-is.

Full script for tone/context only:
"""
${fullScriptContext.slice(0, 2000)}
"""

Character speaking: ${characterName}
Line to fix: "${dialogueText}"

Rewrite ONLY this one line so it is at least ${MIN_DIALOGUE_WORDS} words and sounds natural for this character. Keep the original meaning and tone. Only expand it slightly — do NOT turn it into a long speech, do NOT add new plot points, do NOT add stage directions or brackets. Reply with ONLY the rewritten line, nothing else — no quotes, no explanation.`;

        const result = await callOpenRouterText('google/gemini-2.5-flash-lite', { prompt });

        if (result._error || !result.text) {
            // Refund — the credit was charged but nothing was delivered.
            await userRef.update({ credits: newCredits + cost }).catch((e: any) => { reportServerError('src/app/studio/ai-fix-actions.ts:refund', e); return null; });
            throw new Error(result.message || 'AI engine returned no result.');
        }

        const expandedText = result.text.trim().replace(/^["']|["']$/g, '');

        if (isDialogueTooShort(expandedText)) {
            // The model didn't actually fix it — refund rather than charge
            // for a no-op.
            await userRef.update({ credits: newCredits + cost }).catch((e: any) => { reportServerError('src/app/studio/ai-fix-actions.ts:refundNoop', e); return null; });
            throw new Error('AI could not expand this line sufficiently. Try editing it manually.');
        }

        return { success: true, expandedText, newCredits };
    } catch (error: any) {
        reportServerError('src/app/studio/ai-fix-actions.ts:expandDialogueWithAiAction', error);
        return { success: false, error: error.message || 'AI-Fix failed.' };
    }
}
