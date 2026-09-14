'use server';

import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { escapeHtml } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { reportServerError } from '@/lib/report-error';

/**
 * 🎵 SUBMIT MUSIC PROJECT REQUEST (Firestore `music_project` submission)
 */
export async function submitMusicProjectRequestAction(input: {
    userId: string;
    userName?: string;
    userEmail?: string;
    prompt: string;
    productionMode: 'vocal' | 'instrumental';
    selectedLanguage: string;
    selectedTags: string[];
    lyrics?: string;
    mood?: string;
    duration?: string;
    tempo?: string;
    genre?: string;
    category?: string;
    instruments?: string[];
    clientTimestamp?: string;
}): Promise<{ success: boolean; projectId?: string; newCredits?: number; error?: string }> {
    const { 
        userId, userName, userEmail, prompt, productionMode, 
        selectedLanguage, selectedTags, lyrics, mood, duration, 
        tempo, genre, category, instruments,
        clientTimestamp 
    } = input;
    
    if (!userId) {
        return { success: false, error: "User authentication required." };
    }
    if (!prompt || prompt.trim().length < 3) {
        return { success: false, error: "Please enter a valid music prompt (at least 3 characters)." };
    }

    const { firestore, database } = initializeFirebase();
    const cost = 2000;
    const projectId = `MUS_${Date.now()}_${crypto.randomUUID().split('-')[0].toUpperCase()}`;
    const createdAtIso = clientTimestamp || new Date().toISOString();
    const timestampNow = Date.now();

    try {
        const userRef = firestore.collection('users').doc(userId);

        // 1. Transaction to check and deduct user credits
        const currentBalanceAfterDeduction = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User profile missing.");

            const userData = userDoc.data() as UserProfile;
            const currentCredits = userData.credits || 0;
            if (currentCredits < cost) {
                throw new Error(`Insufficient credits (${currentCredits.toLocaleString()}/${cost.toLocaleString()}).`);
            }

            const updatedBalance = Math.max(0, currentCredits - cost);
            transaction.update(userRef, { credits: updatedBalance, hasMadeFirstPurchase: true });
            return updatedBalance;
        });

        // 2. Format and enhance prompt with selected duration if not already present
        let enhancedPrompt = prompt ? prompt.trim() : '';
        if (duration && enhancedPrompt) {
            const minMatch = duration.match(/^(\d+):00$/);
            const durationText = minMatch ? `${minMatch[1]} minutes` : `${duration} minutes`;
            const lowerPrompt = enhancedPrompt.toLowerCase();
            if (!lowerPrompt.includes('minute') && !lowerPrompt.includes('duration') && !lowerPrompt.includes('seconds') && !lowerPrompt.includes('length')) {
                enhancedPrompt = `${enhancedPrompt}, duration: ${durationText}`;
            }
        }

        // 3. Build Music Project Payload for Firestore
        const projectPayload = {
            id: projectId,
            projectId,
            userId,
            userName: userName || 'User',
            userEmail: userEmail || 'N/A',
            projectName: `AI MUSIC: ${(enhancedPrompt || 'Track').slice(0, 32).toUpperCase()}`,
            script: enhancedPrompt,
            prompt: enhancedPrompt,
            productionMode,
            language: selectedLanguage || 'English',
            tags: selectedTags || [],
            genre: genre || (selectedTags && selectedTags.length > 0 ? selectedTags.join(', ') : 'Music'),
            category: category || (productionMode === 'instrumental' ? (selectedTags[0] || 'Music') : 'Vocal'),
            instruments: instruments || (productionMode === 'instrumental' ? selectedTags.slice(1) : []),
            lyrics: lyrics || '',
            mood: mood || 'Upbeat',
            duration: duration || '2:00',
            tempo: tempo || 'Medium',
            status: 'pending',
            projectType: 'music-gen',
            isMusic: true,
            cost,
            creditCost: cost,
            createdAt: createdAtIso,
            clientTimestamp: createdAtIso,
            updatedAt: createdAtIso,
            timestamp: timestampNow
        };

        // 3. Save to `music_project` Firestore paths
        // Path A: Partitioned under user
        await firestore
            .collection('music_project')
            .doc(userId)
            .collection('userProjects')
            .doc(projectId)
            .set(projectPayload);

        // Path B: Root collection for direct queries / worker listeners
        await firestore
            .collection('music_project')
            .doc(projectId)
            .set(projectPayload);

        // 4. Record credit deduction history in RTDB and Firestore
        const historyReason = `MUSIC REQUEST: ${(enhancedPrompt || 'Music track').slice(0, 35).toUpperCase()}...`;

        await database.ref(`creditHistory/${userId}`).push({
            amount: -cost,
            reason: historyReason,
            timestamp: createdAtIso,
            id: projectId,
            type: 'deduction'
        }).catch(() => null);

        logSummaryEvent('creditsSpent', cost).catch(() => null);

        // 5. Send Telegram log notification
        await sendToTelegram(
            `🎵 <b>New Music Request Submitted</b>\n` +
            `<b>User:</b> ${escapeHtml(userEmail || userId)}\n` +
            `<b>Project ID:</b> <code>${projectId}</code>\n` +
            `<b>Mode:</b> ${productionMode.toUpperCase()} | <b>Lang:</b> ${selectedLanguage}\n` +
            `<b>Prompt:</b> <pre>${escapeHtml(enhancedPrompt)}</pre>`
        ).catch(() => null);

        revalidatePath('/history');
        revalidatePath('/music-studio');

        // --- 🚀 TRIGGER AI GENERATION NODE (v2.0) ---
        // We trigger the generation in the background so the user doesn't wait for the audio file,
        // but the request is immediately dispatched to the HF/Vertex nodes.
        try {
            const { ai } = await import('@/ai/genkit');
            const generationParams = {
                productionMode,
                language: selectedLanguage,
                tags: selectedTags,
                lyrics,
                mood,
                duration,
                tempo,
                genre,
                category,
                instruments
            };

            // Call the generation hub (Genkit)
            // It will route to Vertex Lyria or HF Bridge depending on settings
            ai.generate({
                model: 'lyria-3-pro-preview', // High fidelity music model
                prompt: enhancedPrompt,
                metadata: {
                    userId,
                    userEmail,
                    projectId,
                    taskType: 'Music Generation',
                    projectName: `AI MUSIC: ${enhancedPrompt.slice(0, 30)}`,
                    generationParams
                }
            }).catch(err => {
                console.error("[Music Dispatch Background Error]:", err.message);
                // Update Firestore status to error if dispatch fails immediately
                firestore.collection('music_project').doc(projectId).update({ status: 'error', error: err.message }).catch(() => null);
                firestore.collection('music_project').doc(userId).collection('userProjects').doc(projectId).update({ status: 'error', error: err.message }).catch(() => null);
            });

        } catch (dispatchErr: any) {
    reportServerError('src/app/music-studio/actions.ts#1', dispatchErr);
            console.error("[Music AI Import/Dispatch Error]:", dispatchErr.message);
        }

        return {
            success: true,
            projectId,
            newCredits: currentBalanceAfterDeduction
        };

    } catch (error: any) {
    reportServerError('src/app/music-studio/actions.ts#2', error);
        console.error("[Submit Music Project Error]:", error.message);
        return {
            success: false,
            error: error.message || "Failed to submit music request."
        };
    }
}

/**
 * 🗑️ DELETE MUSIC PROJECT REQUEST
 */
export async function deleteMusicProjectRequestAction(projectId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!projectId || !userId) {
        return { success: false, error: "Missing parameters." };
    }

    const { firestore } = initializeFirebase();

    try {
        // Delete or mark deleted from both paths
        await firestore
            .collection('music_project')
            .doc(userId)
            .collection('userProjects')
            .doc(projectId)
            .delete()
            .catch(() => null);

        await firestore
            .collection('music_project')
            .doc(projectId)
            .delete()
            .catch(() => null);

        revalidatePath('/history');
        revalidatePath('/music-studio');

        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/music-studio/actions.ts#3', error);
        return { success: false, error: error.message };
    }
}
