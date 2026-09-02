'use server';
/**
 * @fileOverview Context-Aware script analysis engine (v10.1 - FIXED).
 */

import { ai, extractJson } from '@/ai/genkit';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml, getISTDateString, checkIsPaidUser } from '@/lib/utils';
import { initializeFirebase } from '@/firebase/server';
import "server-only";
import { reportServerError } from '@/lib/report-error';

// Keep polling bounded for scripts that need a few minutes to finish.
const ANALYSIS_TIMEOUT_MS = 300000;

/**
 * ⚡ HARDENED REAL-TIME RTDB POLLING NODE
 */
async function pollAnalysisResult(userId: string, mappingId: string, timeoutMs: number = ANALYSIS_TIMEOUT_MS): Promise<any> {
    const { database } = initializeFirebase();
    if (!database) return null;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const primaryRef = database.ref(`tempScriptGenerations/${userId}/${mappingId}`);
        const fallbackRef = database.ref(`tempScriptGenerations/Unknown/${mappingId}`);

        const [primarySnap, fallbackSnap] = await Promise.all([primaryRef.get(), fallbackRef.get()]);
        const snapshot = primarySnap.exists() ? primarySnap : fallbackSnap;

        if (snapshot.exists()) {
            const data = snapshot.val();
            const currentStatus = String(data.status || '').toLowerCase();
            
            if (currentStatus === 'ready' && data.scriptUrl) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        const directUrl = data.scriptUrl.replace("pub://", "https://storage.12labs.in/api/public-storage/");
                        const response = await fetch(directUrl, { cache: 'no-store' });
                        if (response.ok) {
                            return await response.json();
                        }
                    } catch (e) {
    reportServerError('src/ai/flows/analyze-script-studio.ts#1', e);
                        console.warn(`[GCS Fetch Retry ${attempt + 1}] failed.`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1500)); 
                }
            } else if (currentStatus === 'error') {
                throw new Error("Bridge Node reported an internal production fault.");
            }
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
    }
    throw new Error(`Neural Hub Timeout: Data node not arrived after ${timeoutMs / 1000}s.`);
}

/**
 * ⚡ DIALOGUE NORMALIZATION ENGINE
 */
function normalizeAndChunkLines(rawLines: { character: string; text: string; emotion?: string }[]): { character: string; text: string; emotion: string }[] {
    if (rawLines.length === 0) return [];
    const merged: { character: string; text: string; emotion: string }[] = [];
    rawLines.forEach((line) => {
        let currentChar = line.character.trim();
        if (['वक्ता', 'कथावाचक', 'नैरेटर', 'speaker', 'background', 'narration', 'storyteller', 'कथाकार'].includes(currentChar.toLowerCase())) {
            currentChar = 'Narrator';
        }
        const last = merged[merged.length - 1];
        const currentEmotion = line.emotion || 'Neutral';
        const cleanText = line.text.replace(/\s+/g, ' ').trim();

        if (last && last.character.toLowerCase() === currentChar.toLowerCase() && last.emotion === currentEmotion) {
            last.text = (last.text + ' ' + cleanText).trim();
        } else {
            merged.push({ character: currentChar, text: cleanText, emotion: currentEmotion });
        }
    });
    return merged;
}

function splitScriptIntoChunks(text: string, chunkSize: number = 2200): string[] {
    if (text.length <= chunkSize) return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= chunkSize) { chunks.push(remaining); break; }
        let limit = chunkSize;
        let splitIdx = remaining.lastIndexOf('\n', limit);
        if (splitIdx === -1 || splitIdx < limit * 0.5) splitIdx = limit;
        chunks.push(remaining.substring(0, splitIdx).trim());
        remaining = remaining.substring(splitIdx).trim();
    }
    return chunks;
}

function parseFallbackLinesFromRawText(rawText: string, chunk: string): { characters: { name: string; gender: string }[]; lines: { character: string; text: string; emotion: string }[]; languageCode: string } {
    const lines: { character: string; text: string; emotion: string }[] = [];
    const charMap = new Map<string, string>();

    // Try matching JSON-like dialogue objects using regex
    const objectRegex = /\{[^{}]*"(?:c|character|speaker|n|name)"\s*:\s*"([^"]+)"[^{}]*"(?:t|text|line|dialogue)"\s*:\s*"([^"]+)"[^{}]*\}/gi;
    let match;
    while ((match = objectRegex.exec(rawText)) !== null) {
        const char = match[1].trim() || 'Narrator';
        const txt = match[2].trim();
        if (txt) {
            lines.push({ character: char, text: txt, emotion: 'Neutral' });
            if (!charMap.has(char.toLowerCase())) charMap.set(char.toLowerCase(), char);
        }
    }

    // Try line-by-line format "Character: Dialogue text" if regex didn't yield anything
    if (lines.length === 0) {
        const textLines = chunk.split('\n');
        for (const line of textLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const colonIdx = trimmed.indexOf(':');
            if (colonIdx > 0 && colonIdx < 30) {
                let char = trimmed.substring(0, colonIdx).trim();
                let txt = trimmed.substring(colonIdx + 1).trim();
                let emo = 'Neutral';

                // Check emotion before colon: "John (Happy)" or "John [Happy]"
                const emoMatchChar = char.match(/^([^\(\)\[\]]+)\s*[\(\[]([^\)\]]+)[\)\]]$/);
                if (emoMatchChar) {
                    char = emoMatchChar[1].trim();
                    emo = emoMatchChar[2].trim();
                }

                // Check emotion after colon: "[ emotional ] Dialogue" or "(Happy) Dialogue"
                const emoMatchTxt = txt.match(/^[\(\[]([^\)\]]+)[\)\]]\s*(.*)$/);
                if (emoMatchTxt) {
                    emo = emoMatchTxt[1].trim();
                    txt = emoMatchTxt[2].trim();
                }

                if (txt) {
                    lines.push({ character: char, text: txt, emotion: emo });
                    if (!charMap.has(char.toLowerCase())) charMap.set(char.toLowerCase(), char);
                }
            } else {
                lines.push({ character: 'Narrator', text: trimmed, emotion: 'Neutral' });
                if (!charMap.has('narrator')) charMap.set('narrator', 'Narrator');
            }
        }
    }

    if (lines.length === 0 && chunk.trim()) {
        lines.push({ character: 'Narrator', text: chunk.trim(), emotion: 'Neutral' });
        charMap.set('narrator', 'Narrator');
    }

    const characters = Array.from(charMap.values()).map(name => ({
        name,
        gender: 'Neutral'
    }));

    return { characters, lines, languageCode: 'hi' };
}

async function processChunk(chunk: string, index: number, userEmail: string, userId: string, includeEmotion: boolean): Promise<any> {
    const mappingId = `ANALYSIS_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const prompt = `Convert the input script chunk into a structured dialogue format. Return compact JSON:
- "c" (or "characters"): Array of { "n": "Name", "g": "Male" | "Female" | "Neutral" }
- "l" (or "lines"): Array of { "c": "Character Name", "t": "verbatim text spoken", "e": "Emotion" }
- "lang" (or "languageCode"): "hi" or "en"

**CRITICAL INSTRUCTIONS ON EMOTIONS:**
- Analyze the scene context, dialogues, situation, and punctuation to accurately detect and assign realistic performance emotions for EACH dialogue line (e.g. "serious", "angry", "sad", "happy", "fearful", "emotional", "curious", "excited", "whisper", "surprised", "calm", "neutral").
- If the original script already specifies emotion tags in brackets/parentheses like [ serious ], [ angry ], ( emotional ), ALWAYS preserve and output that exact emotion in the "e" field.
- If no explicit tag is present, intelligently deduce the contextual emotion from the tone and meaning of the character's dialogue.

**IMPORTANT:**
- If there is a Narrator or descriptive prose that is not direct dialogue, assign character to "Narrator" and include "Narrator" in the "c" (characters) array.
- Keep output JSON strictly valid and minimal.

SCRIPT:
---
${chunk}
---`;

    try {
        const response = await ai.generate({
            model: 'analysis-direct-node',
            prompt: prompt,
            // @ts-ignore
            metadata: { 
                userEmail, 
                userId, 
                mappingId, 
                taskType: "Script Analysis", 
                generationParams: { type: 'analysis' } 
            }
        });
        
        const rawText = response.text || "";
        const output = extractJson(rawText) || (outputData => outputData)(null);

        if (output) {
            const rawChars = output.characters || output.c || output.chars || output.characterList || (output.data && (output.data.characters || output.data.c)) || [];
            const rawLines = output.lines || output.dialogues || output.l || output.dialogue || output.linesList || (output.data && (output.data.lines || output.data.l)) || [];
            const langCode = output.languageCode || output.lang || 'hi';

            if (Array.isArray(rawLines) && rawLines.length > 0) {
                const parsedLines = rawLines.map((l: any) => ({
                    character: l.character || l.c || l.speaker || l.n || l.name || 'Narrator',
                    text: String(l.text || l.t || l.line || l.dialogue || l.content || "").trim(),
                    emotion: l.emotion || l.e || l.emo || 'Neutral'
                })).filter((l: any) => l.text.length > 0);

                if (parsedLines.length > 0) {
                    const parsedChars = Array.isArray(rawChars) ? rawChars.map((c: any) => ({
                        name: c.name || c.n || c.character || c.char || 'Narrator',
                        gender: c.gender || c.g || c.sex || 'Neutral'
                    })) : [];

                    return { 
                        characters: parsedChars, 
                        lines: parsedLines, 
                        languageCode: langCode
                    };
                }
            }
        }

        const lowText = rawText.toLowerCase();
        if (lowText.includes("signal accepted") || lowText.includes("accepted") || lowText.includes("received")) {
            const polledResult = await pollAnalysisResult(userId, mappingId);
            const polledChars = polledResult.characters || polledResult.c || [];
            const polledLines = polledResult.lines || polledResult.dialogues || polledResult.l || [];
            const polledLang = polledResult.languageCode || polledResult.lang || 'hi';

            if (Array.isArray(polledLines) && polledLines.length > 0) {
                return {
                    characters: polledChars.map((c: any) => ({
                        name: c.name || c.n || 'Narrator',
                        gender: c.gender || c.g || 'Neutral'
                    })),
                    lines: polledLines.map((l: any) => ({
                        character: l.character || l.c || l.name || 'Narrator',
                        text: String(l.text || l.t || l.line || "").trim(),
                        emotion: l.emotion || l.e || 'Neutral'
                    })).filter((l: any) => l.text.length > 0),
                    languageCode: polledLang
                };
            }
        }

        // Fallback extraction if model output couldn't be parsed directly by JSON
        console.warn(`[ProcessChunk Warning]: Non-standard JSON returned for chunk ${index}. Engaging fallback parser.`);
        const fallbackResult = parseFallbackLinesFromRawText(rawText, chunk);
        return fallbackResult;

    } catch (e: any) {
    reportServerError('src/ai/flows/analyze-script-studio.ts#2', e); 
        console.warn(`[ProcessChunk Exception]: Chunk ${index} failed: ${e.message}. Using fallback line parser.`);
        return parseFallbackLinesFromRawText("", chunk);
    }
}

export async function analyzeScriptStudio(input: { script: string, userId: string, userEmail?: string, includeEmotion?: boolean }): Promise<any> {
  const userEmail = input.userEmail || "Anonymous";
  const { firestore, database } = initializeFirebase();
  if (!firestore) throw new Error("Server database instance is currently unavailable.");

  if (!input.userId || input.userId === 'Unknown' || input.userId === 'guest') {
    throw new Error("Authentication required for script analysis. Please log in.");
  }

  // 1. Fetch User Profile
  const userRef = firestore.collection('users').doc(input.userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    throw new Error("User profile not found.");
  }
  const userData = userDoc.data() || {};
  const isSponsorOrAdmin = userData.isSponsor === true || userData.role === 'admin';

  // 2. Check Credits Safety (Script length vs available credits)
  const scriptCharCount = input.script.trim().length;
  const userCredits = Number(userData.credits || 0);

  if (!isSponsorOrAdmin && userCredits < scriptCharCount) {
    throw new Error(`Not Enough Credits. Your script has ${scriptCharCount.toLocaleString()} characters, but you only have ${userCredits.toLocaleString()} credits.`);
  }

  // 3. Check Daily Script Analysis Limit (Free: 2/day, Paid: 5/day)
  const isPaid = checkIsPaidUser(userData);
  const maxDailyLimit = isPaid ? 5 : 2;
  const today = getISTDateString();
  const analysisLimitRef = database.ref(`userScriptAnalysisLimits/${input.userId}/${today}`);
  const limitSnap = await analysisLimitRef.get();
  const currentDailyCount = limitSnap.exists() ? Number(limitSnap.val()) : 0;

  if (!isSponsorOrAdmin && currentDailyCount >= maxDailyLimit) {
    throw new Error(`Daily script analysis limit reached (${currentDailyCount}/${maxDailyLimit} used today). ${isPaid ? 'Paid users get max 5 script analyses per day.' : 'Free users get max 2 script analyses per day. Upgrade to Paid for 5/day.'}`);
  }

  try {
    const chunks = splitScriptIntoChunks(input.script);
    const results = await Promise.all(chunks.map((chunk, i) => processChunk(chunk, i, userEmail, input.userId, !!input.includeEmotion)));

    const mergedCharacters = new Map();
    const rawCollectedLines: any[] = [];
    let finalLanguageCode = 'hi';

    for (const res of results) {
        if (res._error) throw new Error(res.message);
        if (res.languageCode === 'en') finalLanguageCode = 'en';
        res.characters?.forEach((c: any) => {
            const key = String(c.name).toLowerCase().trim();
            if (key && !mergedCharacters.has(key)) mergedCharacters.set(key, c);
        });
        res.lines?.forEach((l: any) => { if (l.text) rawCollectedLines.push(l); });
    }

    const mergedLines = normalizeAndChunkLines(rawCollectedLines);
    
    const hasNarratorLines = mergedLines.some(l => l.character === 'Narrator');
    if (hasNarratorLines && !mergedCharacters.has('narrator')) {
        mergedCharacters.set('narrator', { name: 'Narrator', gender: 'Neutral' });
    }

    const finalCharacters = Array.from(mergedCharacters.values()).map(c => ({
        ...c,
        dialogueCount: mergedLines.filter(l => l.character.toLowerCase() === c.name.toLowerCase()).length
    })).filter(c => c.dialogueCount > 0);

    // 4. Increment Daily Analysis Count
    if (!isSponsorOrAdmin) {
      await analysisLimitRef.set(currentDailyCount + 1);
    }

    return { 
      characters: finalCharacters, 
      lines: mergedLines, 
      languageCode: finalLanguageCode,
      dailyAnalysisCount: currentDailyCount + 1,
      maxDailyLimit
    };
  } catch (error: any) {
    reportServerError('src/ai/flows/analyze-script-studio.ts#3', error);
    await sendToTelegram(`📝🚨 <b>Analysis Fatal Error</b>\n<b>User:</b> ${userEmail}\n<b>Error:</b> <pre>${escapeHtml(error.message)}</pre>`);
    throw error;
  }
}
