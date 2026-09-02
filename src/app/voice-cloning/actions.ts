
'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import { Transaction } from 'firebase-admin/firestore';
import { logSummaryEvent } from '@/lib/summary-logger';
import { Client, handle_file } from '@gradio/client';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

const CheckCreditsInputSchema = z.object({
  userId: z.string(),
  cost: z.number(),
});

export async function checkAndDeductCloningCredits(input: z.infer<typeof CheckCreditsInputSchema>): Promise<{ success: boolean; error?: string; newCredits?: number; }> {
  const validation = CheckCreditsInputSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.flatten().formErrors.join(', ') };
  }

  const { userId, cost } = validation.data;
  const { firestore, database } = initializeFirebase();
  const admin = require('firebase-admin');

  try {
    const userRef = firestore.collection('users').doc(userId);
    let newCredits = 0;

    if (database) {
      await database.ref(`creditHistory/${userId}`).push({
        amount: -cost,
        reason: 'AI Voice Cloning',
        timestamp: new Date().toISOString(),
      });
    }

    await firestore.runTransaction(async (transaction: any) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("User profile not found.");
      
      const currentCredits = userDoc.data()?.credits || 0;
      if (currentCredits < cost) {
        throw new Error(`Insufficient credits. You need ${cost.toLocaleString()} credits.`);
      }
      
      newCredits = Math.max(0, currentCredits - cost);
      
      transaction.update(userRef, { credits: newCredits });
    });

    if (database) {
        await database.ref(`creditHistory/${userId}`).push({
            amount: -cost,
            reason: 'Voice Cloning Generation',
            timestamp: new Date().toISOString(),
        });
    }

    await logSummaryEvent('creditsSpent', cost);
    await logSummaryEvent('voiceCloningGenerations');
    
    return { success: true, newCredits };

  } catch (error: any) {
    reportServerError('src/app/voice-cloning/actions.ts#1', error);
    console.error("Voice cloning credit deduction failed:", error);
    return { success: false, error: error.message || 'An unknown error occurred.' };
  }
}

const SaveClonedVoiceInputSchema = z.object({
  userId: z.string(),
  userEmail: z.string(),
  userName: z.string(),
  text: z.string(),
  generatedAudioUrl: z.string().url(),
});

export async function saveClonedVoiceProjectAction(input: z.infer<typeof SaveClonedVoiceInputSchema>): Promise<{ success: boolean; error?: string }> {
    const validation = SaveClonedVoiceInputSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: validation.error.flatten().formErrors.join(', ') };
    }

    const { firestore } = initializeFirebase();
    const { userId, userEmail, text, generatedAudioUrl } = validation.data;
    
    try {
        const projectName = `Voice Clone - ${new Date().toLocaleDateString()}`;
        const projectRef = firestore.collection('projects').doc();
        
        await projectRef.set({
            id: projectRef.id,
            userId,
            projectName,
            script: text,
            audioUrl: generatedAudioUrl,
            projectType: 'voice-clone',
            createdAt: new Date().toISOString(),
            characters: [{ name: 'Cloned Voice', voice: 'Custom', gender: 'N/A', age: 'N/A', emotion: 'N/A' }],
        });
        
        return { success: true };

    } catch (dbError: any) {
    reportServerError('src/app/voice-cloning/actions.ts#2', dbError);
        console.error(`DB Save FAILED for Voice Clone. User: ${userEmail}, Error: ${dbError.message}`);
        return { success: false, error: 'Audio was generated, but failed to save to your history.' };
    }
}

/**
 * 🎙️ NEURAL CLONING DISPATCHER (v3.1 - PRIVATE SUPERFAST READY)
 * Implements randomized rotation across multiple Hugging Face Spaces AND multiple Tokens.
 * Added HF_SUPERFAST for private space authentication.
 */
export async function generateVoiceCloningAction(input: {
  text: string,
  language: string,
  refAudioBase64: string,
  refText: string,
  userEmail: string,
  numStep: number,
  guidanceScale: number,
  denoise: boolean,
  speed: number,
  preprocessPrompt: boolean,
  postprocessOutput: boolean,
  workerId?: number
}): Promise<{ success: boolean; audioDataUri?: string; error?: string; usedToken?: string; usedPath?: string }> {
    
    const { text, language, refAudioBase64, userEmail, numStep, guidanceScale, denoise, speed, preprocessPrompt, postprocessOutput } = input;
    const { database } = initializeFirebase();

    // 1. Fetch Dynamic Space IDs from RTDB
    const hfNodesSnap = await database.ref('settings/generalPurpose/hfNodes').get();
    let spaceIds = hfNodesSnap.exists() ? hfNodesSnap.val() as string[] : ['k2-fsa/OmniVoice'];

    // 2. Fetch All Available API Keys (Tokens)
    const hfTokensString = process.env.HF_TOKENS || "";
    let hfTokensList = hfTokensString.split(',').map(k => k.trim()).filter(Boolean);
    
    // PRIORITY SYNC: Ensure HF_SUPERFAST is at the top for private nodes
    if (process.env.HF_SUPERFAST) hfTokensList.unshift(process.env.HF_SUPERFAST);
    if (process.env.HF_TOKEN) hfTokensList.push(process.env.HF_TOKEN);
    if (process.env.H1) hfTokensList.push(process.env.H1);
    if (process.env.H2) hfTokensList.push(process.env.H2);
    if (process.env.H3) hfTokensList.push(process.env.H3);

    // Remove duplicates
    hfTokensList = Array.from(new Set(hfTokensList));

    if (hfTokensList.length === 0) return { success: false, error: "CRITICAL: HF_TOKENS missing in environment node." };

    let tempFilePath: string | null = null;
    try {
        const base64Data = refAudioBase64.split(';base64,').pop();
        if (!base64Data) throw new Error("Invalid base64 source.");
        const buffer = Buffer.from(base64Data, 'base64');
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `vc_ref_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);
        await fs.promises.writeFile(tempFilePath, buffer);

        const langMap: Record<string, string> = { 'hi': 'Hindi', 'en': 'English', 'ja': 'Japanese', 'zh': 'Chinese', 'ko': 'Korean' };
        const targetLanguage = langMap[language] || (language === 'Auto' ? 'English' : language);

        // --- 🚀 RANDOMIZED DOUBLE ROTATION LOGIC ---
        const shuffledSpaces = [...spaceIds].sort(() => Math.random() - 0.5);
        const shuffledTokens = [...hfTokensList].sort(() => Math.random() - 0.5);

        let lastError = "All production nodes are currently busy or reached quota.";
        
        for (const spaceId of shuffledSpaces) {
            for (const token of shuffledTokens) {
                try {
                    const client = await Client.connect(spaceId as any, { hf_token: token as `hf_${string}` });
                    const result = await client.predict("/_clone_fn", {
                        text: text.trim(), 
                        lang: targetLanguage, 
                        ref_aud: tempFilePath ? handle_file(tempFilePath) : null,
                        ref_text: "", 
                        instruct: "", 
                        ns: Number(numStep), 
                        gs: Number(guidanceScale), 
                        dn: Boolean(denoise), 
                        sp: Number(speed), 
                        du: 0, 
                        pp: Boolean(preprocessPrompt), 
                        po: Boolean(postprocessOutput)
                    });

                    const audioFileObj = (result.data as any)?.[0];
                    if (!audioFileObj || !audioFileObj.url) throw new Error("Node returned empty result.");
                    
                    const audioRes = await fetch(audioFileObj.url);
                    if (!audioRes.ok) throw new Error("Failed to fetch generated artifact from space.");
                    
                    const audioBuffer = await audioRes.arrayBuffer();
                    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
                    const mimeType = audioRes.headers.get('content-type') || 'audio/wav';
                    
                    sendToTelegram(`🎙️✅ <b>Voice Clone Generated</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Language:</b> ${escapeHtml(targetLanguage)}\n<b>Node:</b> <code>${escapeHtml(spaceId)}</code>\n<b>Text:</b> <i>${escapeHtml(text.slice(0, 100))}${text.length > 100 ? '...' : ''}</i>`).catch(() => null);

                    return { 
                        success: true, 
                        audioDataUri: `data:${mimeType};base64,${audioBase64}`, 
                        usedToken: token.slice(0, 8) + '...',
                        usedPath: spaceId
                    };

                } catch (err: any) {
    reportServerError('src/app/voice-cloning/actions.ts#3', err); 
                    // err from @gradio/client can be a plain object rather than
                    // an Error instance, so err.message may be undefined — fall
                    // back to stringifying it so lastError stays informative.
                    const errMsg = err?.message || (() => { try { return JSON.stringify(err); } catch { return String(err); } })();
                    lastError = `[Node: ${spaceId}] ${errMsg}`;
                    console.warn(`[Neural Dispatcher] Failover triggered: ${spaceId} with token ending ${token.slice(-4)}`);
                }
            }
        }
        
        throw new Error(lastError);

    } catch (error: any) {
    reportServerError('src/app/voice-cloning/actions.ts#4', error);
        console.error("Cloning Dispatch Failed:", error.message);
        sendToTelegram(`🎙️🚨 <b>Neural Dispatcher Failed</b>\n\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Error:</b> <pre>${escapeHtml(error.message)}</pre>`).catch(() => null);
        return { success: false, error: error.message };
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            await fs.promises.unlink(tempFilePath).catch(() => null);
        }
    }
}
