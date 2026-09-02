
'use server';

import { initializeFirebase } from '@/firebase/server';
import { Transaction } from 'firebase-admin/firestore';
import type { Character, UserProfile } from '@/lib/types';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { ai } from '@/ai/genkit';
import { TTS_MODEL } from '@/ai/config';
import wav from 'wav';
import { escapeHtml, getDisplayUrl } from '@/lib/utils';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { r2Client, R2_BUCKET } from '@/lib/r2';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';
import { callHFEditingBridge } from '@/ai/engines/hf-bridge';
import { reportServerError } from '@/lib/report-error';

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: 24000,
      bitDepth: 16,
    });
    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d: any) { bufs.push(d); });
    writer.on('end', function () { resolve(Buffer.concat(bufs).toString('base64')); });
    writer.write(pcmData);
    writer.end();
  });
}

export async function generateTtsAudioAction(text: string, voiceId: string, userEmail?: string, workerId?: number, character?: string, lineId?: string): Promise<{ success: boolean; audioDataUri?: string; usedBridge?: boolean; keyName?: string; error?: string }> {
    try {
        const { database } = initializeFirebase();
        const editingSettingsSnap = await database.ref('settings/editingHfBackend').get();
        const editingSettings = editingSettingsSnap.exists() ? editingSettingsSnap.val() : null;

        if (editingSettings && editingSettings.enabled !== false && editingSettings.url) {
            const hfRes = await callHFEditingBridge(editingSettings.url, {
                text, voiceId, character, userEmail, lineId
            });
            if (hfRes.success && hfRes.audioDataUri) {
                return { success: true, audioDataUri: hfRes.audioDataUri, usedBridge: true, keyName: 'HF-Editing-Backend' };
            }
        }

        const response = await ai.generate({
            model: TTS_MODEL,
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId || 'Algenib' } },
                },
            },
            prompt: text,
            // @ts-ignore
            metadata: { userEmail: userEmail || "Anonymous", taskType: "Synthesis (Fast Gen)", charCount: text.length, workerId }
        }) as any;

        const media = response.media;
        const usedBridge = !!(response.custom as any)?.bridge;
        const keyName = (response.custom as any)?.keyName || 'Unknown';

        if (!media || !media.url) throw new Error('Neural engine failed to output binary audio.');

        const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
        const wavBase64 = await toWav(audioBuffer);
        return { success: true, audioDataUri: `data:audio/wav;base64,${wavBase64}`, usedBridge, keyName };

    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#1', error);
        const errMsg = `🎙️🚨 <b>Synthesis Engine Failure</b>\n\n<b>User:</b> ${escapeHtml(userEmail || 'Anonymous')}\n${error.message}`;
        await sendToTelegram(errMsg);
        return { success: false, error: error.message };
    }
}

export async function completeFastGenerationAction(
    userId: string,
    userName: string,
    userEmail: string,
    projectName: string,
    script: string,
    audioUrl: string,
    characters: Omit<Character, 'id'>[],
    totalChars: number,
    projectId: string,
    usedBridge: boolean = false,
    keyName: string = 'Unknown',
    syncData?: any,
    isChatterbox: boolean = false
): Promise<{ success: boolean; error?: string }> {
    const { firestore } = initializeFirebase();
    try {
        const multiplier = isChatterbox ? 0.5 : 1.2;
        const cost = Math.ceil(totalChars * multiplier);
        
        const projectRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        
        await projectRef.set({
            id: projectId, userId, projectName, script, audioUrl,
            projectType: isChatterbox ? 'chatterbox-gen' : 'fast-gen',
            status: 'completed', createdAt: new Date().toISOString(), characters, cost, syncData: syncData || null
        });
        
        await logSummaryEvent('fastVoicesGenerated');

        const headersList = await headers();
        const host = headersList.get('host');
        const protocol = headersList.get('x-forwarded-proto') || 'https';
        const baseUrl = `${protocol}://${host}`;

        const displayAudioUrl = `${baseUrl}${getDisplayUrl(audioUrl)}`;
        const serverIndicator = usedBridge ? '<b>Custom Server 💻</b>' : '<b>Vercel Server 🧬</b>';
        
        const message = `⚡ <b>Generation Ready</b>\n\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Project:</b> ${escapeHtml(projectName)}\n<b>Stats:</b> ${totalChars} chars / ${cost} credits\n<b>Route:</b> ${serverIndicator}\n\n<b>Link:</b>\n${displayAudioUrl}`;
        await sendToTelegram(message);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#2', error); return { success: false, error: error.message }; }
}

export async function deductFastGenCreditsAction(
    userId: string, 
    totalChars: number, 
    projectName: string, 
    projectId: string,
    isChatterbox: boolean = false,
    customCost?: number,
    reasonOverride?: string
): Promise<{ success: boolean; newCredits?: number; error?: string }> {
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    
    const multiplier = isChatterbox ? 0.5 : 1.2;
    const cost = typeof customCost === 'number' && customCost > 0 ? customCost : Math.ceil(totalChars * multiplier);

    try {
        // Voice replacement requests are asynchronous. Do not charge again while
        // the same project already has a swap waiting or being processed.
        // Completed/failed jobs remain retryable, but in-flight jobs are not.
        if (reasonOverride?.startsWith('Voice Edit:')) {
            const activeSwapSnapshot = await database
                .ref('voice_replacement')
                .orderByChild('projectId')
                .equalTo(projectId)
                .get();
            const hasActiveSwap = activeSwapSnapshot.exists() &&
                Object.values(activeSwapSnapshot.val() || {}).some((job: any) =>
                    job?.userId === userId &&
                    ['pending', 'processing'].includes(String(job?.status || '').toLowerCase())
                );
            if (hasActiveSwap) {
                return {
                    success: false,
                    error: 'A voice replacement is already in progress for this project.'
                };
            }
        }

        const result = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User profile missing.");
            
            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) {
                throw new Error(`Insufficient credits. Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            }
            
            const updatedBalance = Math.max(0, currentCredits - cost);
            transaction.update(userRef, { credits: updatedBalance, hasMadeFirstPurchase: true });
            return updatedBalance;
        });

        await database.ref(`creditHistory/${userId}`).push({
            amount: -cost,
            reason: reasonOverride || `${isChatterbox ? 'New Studio' : 'Fast Gen'}: ${projectName}`,
            timestamp: new Date().toISOString(),
            projectId
        });

        await logSummaryEvent('creditsSpent', cost);
        return { success: true, newCredits: result };
    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#3', error); return { success: false, error: error.message }; }
}

export async function processHighQualityGenerationAndDeductCredits(
  userId: string, 
  userName: string, 
  userEmail: string, 
  projectName: string, 
  script: string, 
  characters: Omit<Character, 'id'>[], 
  totalInvestment: number, 
  totalChars: number,
  syncData?: any, 
  providedProjectId?: string,
  customCost?: number
): Promise<{ success: boolean; newCredits?: number; projectId?: string; error?: string }> {
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    
    const cost = typeof customCost === 'number' && customCost > 0 ? customCost : Math.ceil(totalChars * 1.2); 
    const projectId = providedProjectId || `HQ_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const createdAt = syncData?.clientTimestamp || new Date().toISOString();

    const projectRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);

    try {
        const newBalanceAfterDeduction = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User profile missing.");

            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) {
                throw new Error(`Insufficient credits. Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            }
            
            const updated = Math.max(0, currentCredits - cost);
            transaction.set(projectRef, { 
                id: projectId, userId, projectName, script, characters, cost, creditCost: cost,
                status: 'in_queue', projectType: 'hq-submission', 
                createdAt: createdAt, clientTimestamp: createdAt, timestamp: Date.now(), audioUrl: '', syncData: syncData || null 
            });
            transaction.update(userRef, { credits: updated, hasMadeFirstPurchase: true });
            return updated;
        });

        await database.ref(`pending_projects/${projectId}`).set({ 
            status: 'in_queue',
            userId,
            userEmail: userEmail || '',
            projectName: projectName || 'Untitled',
            characters: characters || [],
            dialogues: syncData?.dialogues || [],
            genre: syncData?.genere || syncData?.genre || 'general',
            genere: syncData?.genere || syncData?.genre || 'general',
            toneGuidance: syncData?.toneGuidance || '',
            queuedAt: Date.now(),
            timestamp: Date.now(),
            // Extra fields for website backend tracking
            id: projectId,
            userName,
            script,
            cost,
            creditCost: cost,
            createdAt,
            clientTimestamp: createdAt,
            projectType: 'hq-submission',
            syncData: syncData || null,
            total_dialogues: (syncData?.dialogues || []).length,
            processed_dialogues: 0
        });

        // 📝 Record Deduction to History Ledger
        if (database) {
            await database.ref(`creditHistory/${userId}`).push({
                amount: -cost,
                reason: `HQ Studio: ${projectName || 'Untitled'}`,
                timestamp: new Date().toISOString(),
                projectId
            });
        }

        await logSummaryEvent('creditsSpent', cost); 

        return { success: true, newCredits: newBalanceAfterDeduction, projectId: projectId };
    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#4', error); 
        return { success: false, error: error.message }; 
    }
}

export async function regenerateLineWithCreditsAction(userId: string, text: string, voiceId: string): Promise<{ success: boolean; audioDataUri?: string; error?: string; newCredits?: number }> {
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    const cost = Math.ceil(text.length * 1.2);
    
    try {
        if (!R2_BUCKET) throw new Error("R2 Node: Bucket ID missing.");

        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error("User node not found.");
        const userEmail = userDoc.data()?.email;

        const newBalance = await firestore.runTransaction(async (transaction: any) => {
            const freshUserDoc = await transaction.get(userRef);
            const currentCredits = freshUserDoc.data()?.credits || 0;
            if (currentCredits < cost) throw new Error(`Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            const updated = Math.max(0, currentCredits - cost);
            transaction.update(userRef, { credits: updated, hasMadeFirstPurchase: true });
            return updated;
        });

        // Write the ledger entry immediately after the successful deduction so
        // failed/slow audio generation cannot make the credit history disappear.
        if (database) {
            await database.ref(`creditHistory/${userId}`).push({
                amount: -cost,
                reason: `Voice Edit / Regenerate Line`,
                timestamp: new Date().toISOString(),
            });
        }

        const genResult = await generateTtsAudioAction(text, voiceId, userEmail);
        if (!genResult.success || !genResult.audioDataUri) throw new Error(genResult.error);

        const parts = genResult.audioDataUri.split(';base64,');
        const buffer = Buffer.from(parts[1], 'base64');
        const nodeUuid = crypto.randomUUID().split('-')[0];
        const objectKey = `public/editor/overrides/${userId}/${Date.now()}_${nodeUuid}.wav`;
        
        await r2Client.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: objectKey,
            Body: buffer,
            ContentType: 'audio/wav',
        }));
        
        const r2PublicUrl = `pub://${objectKey.replace('public/', '')}`;
        await logSummaryEvent('creditsSpent', cost);

        return { success: true, audioDataUri: getDisplayUrl(r2PublicUrl), newCredits: newBalance };
    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#5', error); return { success: false, error: error.message }; }
}

export async function createCharacterVoiceReplacementJobAction({
    projectId,
    userId,
    character,
    newVoiceId,
    replacements,
    syncData,
    projectAudioUrl
}: {
    projectId: string;
    userId: string;
    character?: string;
    newVoiceId?: string;
    replacements?: { charName: string; newVoiceId: string }[];
    syncData: any;
    projectAudioUrl?: string;
}): Promise<{
    success: boolean;
    jobId?: string;
    editedAudioUrl?: string;
    newCredits?: number;
    updatedSyncData?: any;
    error?: string;
}> {
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    
    try {
        if (!syncData || !syncData.dialogues || !Array.isArray(syncData.dialogues)) {
            throw new Error("Invalid project dialogue data.");
        }

        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error("User record not found.");
        const userEmail = userDoc.data()?.email || '';

        // Build replacement map
        const swapMap = new Map<string, string>();
        if (replacements && replacements.length > 0) {
            replacements.forEach(r => {
                if (r.charName && r.newVoiceId) {
                    swapMap.set(r.charName.toLowerCase().trim(), r.newVoiceId);
                }
            });
        } else if (character && newVoiceId) {
            swapMap.set(character.toLowerCase().trim(), newVoiceId);
        }

        if (swapMap.size === 0) {
            throw new Error("No character voice mappings specified.");
        }

        // Find affected dialogues
        const dialogues = [...syncData.dialogues];
        const affectedIndices: { idx: number; charName: string; voiceId: string }[] = [];
        dialogues.forEach((d: any, idx: number) => {
            const charLow = (d.character || '').toLowerCase().trim();
            if (swapMap.has(charLow)) {
                affectedIndices.push({ idx, charName: d.character, voiceId: swapMap.get(charLow)! });
            }
        });

        if (affectedIndices.length === 0) {
            throw new Error("No dialogues match the selected character(s).");
        }

        // Calculate character length & credits
        const totalChars = affectedIndices.reduce((acc, item) => acc + (dialogues[item.idx].line || '').length, 0);
        const cost = Math.max(1, Math.ceil(totalChars * 1.2));

        // Deduct credits
        const newBalance = await firestore.runTransaction(async (transaction: any) => {
            const freshUserDoc = await transaction.get(userRef);
            const currentCredits = freshUserDoc.data()?.credits || 0;
            if (currentCredits < cost) {
                throw new Error(`Insufficient credits. Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            }
            const updated = Math.max(0, currentCredits - cost);
            transaction.update(userRef, { credits: updated, hasMadeFirstPurchase: true });
            return updated;
        });

        // Record credit history
        await database.ref(`creditHistory/${userId}`).push({
            amount: -cost,
            reason: `Voice Swap (${affectedIndices.length} dialogues): ${character || 'Bulk Cast'}`,
            timestamp: new Date().toISOString(),
            projectId
        });

        await logSummaryEvent('creditsSpent', cost);

        // 1. Create RTDB editingjobs record (Lightweight payload without heavy scriptJson to save RTDB storage/bandwidth)
        const jobId = `job_${Date.now()}_${crypto.randomUUID().split('-')[0]}`;
        const originalAudioUrl = projectAudioUrl || syncData?.audioUrl || "";

        const initialJobRecord = {
            jobId,
            projectId,
            userId,
            character: character || Array.from(swapMap.keys()).join(', '),
            newVoiceId: newVoiceId || '',
            status: 'pending',
            progress: 0,
            cost,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await database.ref(`editingjobs/${jobId}`).set(initialJobRecord);

        // 2. Start Processing Job
        await database.ref(`editingjobs/${jobId}`).update({
            status: 'processing',
            progress: 5,
            updatedAt: new Date().toISOString()
        });

        let processedCount = 0;
        let primaryOverrideUrl = '';

        for (const item of affectedIndices) {
            const lineText = dialogues[item.idx].line;
            const genResult = await generateTtsAudioAction(lineText, item.voiceId, userEmail);

            if (genResult.success && genResult.audioDataUri) {
                const parts = genResult.audioDataUri.split(';base64,');
                const buffer = Buffer.from(parts[1], 'base64');
                // 💡 Deterministic objectKey per project and node index: Overwrites existing R2 file to avoid double storage charges!
                const objectKey = `public/editor/overrides/${userId}/${projectId}_node_${item.idx}.wav`;

                if (R2_BUCKET) {
                    await r2Client.send(new PutObjectCommand({
                        Bucket: R2_BUCKET,
                        Key: objectKey,
                        Body: buffer,
                        ContentType: 'audio/wav',
                    }));
                    const r2PublicUrl = `pub://${objectKey.replace('public/', '')}`;
                    const fullOverrideUrl = getDisplayUrl(r2PublicUrl);
                    dialogues[item.idx] = {
                        ...dialogues[item.idx],
                        audioOverridden: fullOverrideUrl,
                        useOverride: true
                    };
                    if (!primaryOverrideUrl) primaryOverrideUrl = fullOverrideUrl;
                } else {
                    dialogues[item.idx] = {
                        ...dialogues[item.idx],
                        audioOverridden: genResult.audioDataUri,
                        useOverride: true
                    };
                    if (!primaryOverrideUrl) primaryOverrideUrl = genResult.audioDataUri;
                }
            }

            processedCount++;
            const currentProgress = Math.min(95, Math.round(10 + (processedCount / affectedIndices.length) * 85));
            await database.ref(`editingjobs/${jobId}`).update({
                progress: currentProgress,
                updatedAt: new Date().toISOString()
            });
        }

        // Update voice assignments map
        const newVoiceAssignments = { ...(syncData.voiceAssignments || {}) };
        swapMap.forEach((vId, charKey) => {
            const existingKey = Object.keys(newVoiceAssignments).find(k => k.toLowerCase() === charKey);
            newVoiceAssignments[existingKey || charKey] = vId;
        });

        const updatedSyncData = {
            ...syncData,
            dialogues,
            voiceAssignments: newVoiceAssignments
        };

        const editedAudioUrl = primaryOverrideUrl || originalAudioUrl;

        // 3. Complete Job in RTDB & schedule auto-cleanup to save RTDB space
        await database.ref(`editingjobs/${jobId}`).update({
            status: 'completed',
            progress: 100,
            editedAudioUrl,
            updatedAt: new Date().toISOString()
        });

        // 🧹 Auto cleanup editing job node from RTDB after 30 seconds to prevent RTDB database clutter
        setTimeout(async () => {
            try {
                await database.ref(`editingjobs/${jobId}`).remove();
            } catch (err) {
    reportServerError('src/app/studio/actions.ts#6', err);
                console.warn(`[RTDB Cleanup] Failed to remove editingjob ${jobId}:`, err);
            }
        }, 30000);

        // 4. Update RTDB projectEdits
        await database.ref(`projectEdits/${projectId}`).set({
            ownerId: userId,
            syncData: updatedSyncData,
            editedAudioUrl,
            updatedAt: new Date().toISOString()
        });

        // 5. Update Firestore Project document
        const partitionedRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        const partitionedDoc = await partitionedRef.get();

        const firestoreUpdate = {
            syncData: updatedSyncData,
            editedAudioUrl,
            edited_audio_url: editedAudioUrl,
            updatedAt: new Date().toISOString()
        };

        if (partitionedDoc.exists) {
            await partitionedRef.update(firestoreUpdate);
        } else {
            const proRef = firestore.collection('pro_projects').doc(userId).collection('userProjects').doc(projectId);
            const proDoc = await proRef.get();
            if (proDoc.exists) {
                await proRef.update(firestoreUpdate);
            } else {
                const legacyRef = firestore.collection('projects').doc(projectId);
                const legacyDoc = await legacyRef.get();
                if (legacyDoc.exists) {
                    await legacyRef.update(firestoreUpdate);
                }
            }
        }

        revalidatePath('/history');

        return {
            success: true,
            jobId,
            editedAudioUrl,
            newCredits: newBalance,
            updatedSyncData
        };

    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#7', error);
        console.error("createCharacterVoiceReplacementJobAction failed:", error);
        return { success: false, error: error.message || 'Job creation failed' };
    }
}
