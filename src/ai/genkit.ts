
import "server-only";

import { genkit, GenerateOptions, GenerateResponse } from "genkit";
import { z, type ZodTypeAny } from "zod";
import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from "@/lib/telegram-logger";

// Engine Modules
import { callGemini } from './engines/gemini';
import { callOpenRouterTTS, callOpenRouterText } from './engines/openrouter';
import { callVertexText, callVertexLyria } from './engines/vertex';
import { callHFMusicBridge, callHFTextBridge } from './engines/hf-bridge';
import { callDeepSeek } from './engines/deepseek';
import { generateVoiceCloningAction } from '@/app/voice-cloning/actions';
import { reportServerError } from '@/lib/report-error';

/**
 * 🧠 NEURAL JSON EXTRACTOR & REPAIR ENGINE (v5.1 - ULTRA ROBUST)
 * NOTE: intermediate parse attempts below are EXPECTED to fail often (e.g. AI
 * wraps JSON in ```json fences) — they are normal fallback branches, not real
 * errors, so they must NOT call reportServerError individually. Only the
 * public entry points (extractJson / repairAndParseJson) report a single
 * error, and only when every strategy has genuinely failed.
 */
function tryParseJsonCandidates(text: string): any {
    if (!text) return null;
    let str = text.trim();
    // 1. Strip markdown code fences
    str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try { return JSON.parse(str); } catch {}

    // Find opening brace or bracket
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
        startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
        startIdx = firstBrace;
    } else if (firstBracket !== -1) {
        startIdx = firstBracket;
    }

    if (startIdx !== -1) {
        let candidate = str.substring(startIdx);
        try { return JSON.parse(candidate); } catch {}

        const lastBrace = candidate.lastIndexOf('}');
        const lastBracket = candidate.lastIndexOf(']');
        const lastEnd = Math.max(lastBrace, lastBracket);
        if (lastEnd > 0) {
            const trimmed = candidate.substring(0, lastEnd + 1);
            try { return JSON.parse(trimmed); } catch {}
        }

        // Repair unclosed strings and stack balance
        let repaired = candidate.replace(/\\+$/, '').replace(/,\s*$/, '');
        let inString = false;
        let escaped = false;
        const stack: string[] = [];

        for (let i = 0; i < repaired.length; i++) {
            const ch = repaired[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (!inString) {
                if (ch === '{' || ch === '[') stack.push(ch);
                else if (ch === '}' || ch === ']') stack.pop();
            }
        }

        if (inString) repaired += '"';
        repaired = repaired.replace(/,\s*$/, '');

        const tempStack = [...stack];
        while (tempStack.length > 0) {
            const top = tempStack.pop();
            if (top === '{') repaired += '}';
            else if (top === '[') repaired += ']';
        }

        try { return JSON.parse(repaired); } catch {}

        // Fallback: trim to last comma and rebuild balance
        const lastComma = repaired.lastIndexOf(',');
        if (lastComma > 0) {
            let truncated = repaired.substring(0, lastComma);
            let s2: string[] = [];
            let inStr2 = false;
            let esc2 = false;
            for (let i = 0; i < truncated.length; i++) {
                const ch = truncated[i];
                if (esc2) { esc2 = false; continue; }
                if (ch === '\\') { esc2 = true; continue; }
                if (ch === '"') { inStr2 = !inStr2; continue; }
                if (!inStr2) {
                    if (ch === '{' || ch === '[') s2.push(ch);
                    else if (ch === '}' || ch === ']') s2.pop();
                }
            }
            if (inStr2) truncated += '"';
            while (s2.length > 0) {
                const top = s2.pop();
                if (top === '{') truncated += '}';
                else if (top === '[') truncated += ']';
            }
            try { return JSON.parse(truncated); } catch {}
        }
    }
    return null;
}

export function repairAndParseJson(text: string): any {
    const result = tryParseJsonCandidates(text);
    if (result === null && text) {
        reportServerError('src/ai/genkit.ts:repairAndParseJson (all strategies failed)', new Error(`Could not parse AI JSON output after all repair attempts. Raw text (first 500 chars): ${text.slice(0, 500)}`));
    }
    return result;
}

export function extractJson(text: string) {
    if (!text) return null;
    const cleanText = text.trim();
    try { return JSON.parse(cleanText); } catch {}
    try {
        const cleaned = cleanText.replace(/```json|```/g, "").trim();
        if (cleaned !== cleanText) return JSON.parse(cleaned);
    } catch {}
    try {
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
        }
    } catch {}
    // Final fallback: only this path reports a real error, and only if it too fails.
    const result = tryParseJsonCandidates(text);
    if (result === null) {
        reportServerError('src/ai/genkit.ts:extractJson (all strategies failed)', new Error(`Could not parse AI JSON output after all repair attempts. Raw text (first 500 chars): ${text.slice(0, 500)}`));
    }
    return result;
}

async function generateWithRotation<OutputSchema extends ZodTypeAny, CustomOptionsSchema extends ZodTypeAny>(
  arg: GenerateOptions<OutputSchema, CustomOptionsSchema> | string | any[]
): Promise<GenerateResponse<z.infer<OutputSchema>>> {
  const request: any = typeof arg === 'string' || Array.isArray(arg) ? { prompt: arg } : arg;
  const { database } = initializeFirebase();
  
  const passedModel = typeof request.model === 'string' ? request.model : request.model?.name;
  const userEmail = request.metadata?.userEmail || "System";
  const userId = request.metadata?.userId || "Unknown";
  const mappingId = request.metadata?.mappingId || request.metadata?.projectId || "ID_" + Math.random().toString(36).substring(7).toUpperCase();
  const taskType = request.metadata?.taskType || "";
  const projectName = request.metadata?.projectName || "AI Project";

  // 🎙️ MUSIC PRODUCTION NODE
  const isMusicModel = passedModel === 'lyria-3-pro-preview' || 
                       passedModel === 'lyria-3-clip-preview' || 
                       passedModel === 'lyria-3-pro' ||
                       passedModel === 'veo-2.0-generate-music-001';
  
  if (isMusicModel) {
      const musicSettingsSnap = await database.ref('settings/musicNode').get();
      const musicSettings = musicSettingsSnap.val() || {};
      const bridgeNodes = musicSettings.hfBridgeNodes || [];
      
      if (bridgeNodes.length > 0 && musicSettings.useBridge) {
          const randomBridge = bridgeNodes[Math.floor(Math.random() * bridgeNodes.length)];
          const promptText = typeof request.prompt === 'string' ? request.prompt : request.prompt?.[0]?.text || '';
          const response = await callHFMusicBridge(
              randomBridge, 
              promptText, 
              userId, 
              userEmail, 
              mappingId, 
              request.metadata?.generationParams
          );
          if (!response._error) return response as any;
      }
      return await callVertexLyria(passedModel, request) as any;
  }

  // --- 🎙️ NEW AI STUDIO DISPATCHER (v2.0 - CLONING SYNC) ---
  if (passedModel === 'new-studio-node' || taskType.includes("New Studio")) {
      const settingsSnap = await database.ref('settings/newStudioNode').get();
      const settings = settingsSnap.val() || {};

      if (settings.useBridge) {
          const musicSettingsSnap = await database.ref('settings/musicNode').get();
          const bridgeNodes = musicSettingsSnap.val()?.hfBridgeNodes || [];
          if (bridgeNodes.length > 0) {
              const randomBridge = bridgeNodes[Math.floor(Math.random() * bridgeNodes.length)];
              const promptText = typeof request.prompt === 'string' ? request.prompt : request.prompt?.[0]?.text || '';
              
              const response = await callHFTextBridge(randomBridge, promptText, 'voice-clone-node', { 
                  userId, userEmail, mappingId, projectName, 
                  generationParams: request.metadata?.generationParams
              });
              if (!response._error) {
                  (response as any).custom = { bridge: true, keyName: 'HF-Cloning-Bridge' };
                  return response as any;
              }
          }
      }
      
      // Fallback to internal Voice Cloning node with rotation
      const cloningRes = await generateVoiceCloningAction({
          text: request.metadata?.generationParams?.text || String(request.prompt),
          language: request.metadata?.generationParams?.language || 'hi',
          refAudioBase64: request.metadata?.generationParams?.refAudioBase64 || '',
          refText: "",
          userEmail,
          numStep: 32,
          guidanceScale: 2.0,
          denoise: true,
          speed: 1.0,
          preprocessPrompt: true,
          postprocessOutput: true,
          workerId: request.metadata?.workerId
      });

      if (!cloningRes.success) throw new Error(cloningRes.error || "Neural Dispatcher Fault");
      
      const resObj: any = {
          text: "Synthesis Complete (Direct Node)",
          media: { url: cloningRes.audioDataUri },
          custom: { keyName: cloningRes.usedToken, spaceId: cloningRes.usedPath }
      };
      return resObj as any;
  }

  // --- 🚀 ANALYSIS DIRECT HUB ---
  if (passedModel === 'analysis-direct-node' || taskType.includes("Analysis")) {
      const analysisSettingsSnap = await database.ref('settings/analysisNode').get();
      const analysisSettings = analysisSettingsSnap.val() || { engine: 'deepseek' };

      if (analysisSettings.engine === 'bridge') {
          const musicSettingsSnap = await database.ref('settings/musicNode').get();
          const bridgeNodes = musicSettingsSnap.val()?.hfBridgeNodes || [];
          if (bridgeNodes.length > 0) {
              const randomBridge = bridgeNodes[Math.floor(Math.random() * bridgeNodes.length)];
              const promptText = typeof request.prompt === 'string' ? request.prompt : request.prompt?.[0]?.text || '';
              
              const response = await callHFTextBridge(randomBridge, promptText, 'analysis-node', { 
                  userId, userEmail, mappingId, projectName: "Script Analysis", 
                  generationParams: { type: 'analysis' }
              });
              if (!response._error) {
                  (response as any).custom = { bridge: true, keyName: 'HF-Analysis-Node' };
                  return response as any;
              }
          }
      }

      // 1. Primary Node: DeepSeek
      try {
          const deepseekRes = await callDeepSeek('deepseek-v4-flash', request);
          if (deepseekRes && !deepseekRes._error && deepseekRes.text) {
              return deepseekRes as any;
          }
          console.warn("[Analysis Hub]: DeepSeek node error or empty output:", deepseekRes?.message || "Unknown DeepSeek Error");
      } catch (dsErr: any) {
          console.warn("[Analysis Hub]: DeepSeek exception:", dsErr.message);
      }

      // 2. Fallback Node: OpenRouter (google/gemini-2.5-flash)
      try {
          console.log("[Analysis Hub]: Failing over to OpenRouter (google/gemini-2.5-flash)...");
          const openRouterRes = await callOpenRouterText('google/gemini-2.5-flash', request);
          if (openRouterRes && !openRouterRes._error && openRouterRes.text) {
              return openRouterRes as any;
          }
          console.warn("[Analysis Hub]: OpenRouter node error:", openRouterRes?.message);
      } catch (orErr: any) {
          console.warn("[Analysis Hub]: OpenRouter exception:", orErr.message);
      }

      // 3. Last Resort Node: Native Gemini
      return await callGemini('gemini-2.5-flash', request) as any;
  }

  // --- 🎙️ DIRECT ROUTE: Synthesis ---
  if (taskType.includes("Synthesis") || taskType.includes("Fast Gen")) {
      return await callOpenRouterTTS("HARDCODED", request) as any;
  }

  // --- 🛰️ NEURAL ROUTING LOGIC ---
  let selectedEngine: 'gemini' | 'vertex' = 'gemini';
  let settingsPath = 'settings/generalPurpose';

  if (taskType.includes("Story") || taskType.includes("Script AI") || taskType.includes("SEO") || taskType.includes("Script Generation")) {
      selectedEngine = 'vertex';
      settingsPath = 'settings/intelligenceNode';
  }

  const settingsSnap = await database.ref(settingsPath).get();
  const settings = settingsSnap.val() || {};
  
  // --- 🌉 HF TEXT BRIDGE DISPATCH ---
  if (settings.useBridge) {
      const musicSettingsSnap = await database.ref('settings/musicNode').get();
      const bridgeNodes = musicSettingsSnap.val()?.hfBridgeNodes || [];
      if (bridgeNodes.length > 0) {
          const randomBridge = bridgeNodes[Math.floor(Math.random() * bridgeNodes.length)];
          const promptText = typeof request.prompt === 'string' ? request.prompt : request.prompt?.[0]?.text || '';
          
          const response = await callHFTextBridge(randomBridge, promptText, 'gemini-3.5-flash', { 
              userId, userEmail, mappingId, projectName, 
              generationParams: request.metadata?.generationParams
          });
          if (!response._error) {
              (response as any).custom = { bridge: true, keyName: 'HF-Docker-Node' };
              return response as any;
          }
      }
  }

  // --- MODEL ROTATION HUB ---
  const modelsString = settings.models || "";
  let modelsToTry = modelsString.split(',').map((m: string) => m.trim()).filter(Boolean);
  if (modelsToTry.length === 0) modelsToTry.push('gemini-2.5-flash');
  
  const shuffledModels = [...modelsToTry].sort(() => Math.random() - 0.5);
  let lastErrorMsg = "No nodes available.";

  for (const modelName of shuffledModels) {
      try {
          const promptText = typeof request.prompt === 'string' ? request.prompt : request.prompt?.[0]?.text || '';
          let response: any;
          if (selectedEngine === 'vertex') response = await callVertexText({ text: promptText, modelName });
          else response = await callGemini(modelName, request);

          if (response && !response._error) {
              if (request.output?.schema) { 
                  const parsed = extractJson(response.text || ""); 
                  if (parsed) response.output = parsed; 
              }
              return response as any;
          } else if (response?._error) lastErrorMsg = response.message || "Engine Rejection";
      } catch (e: any) {
            reportServerError('src/ai/genkit.ts:325', e); lastErrorMsg = e.message; }
  }

  await sendToTelegram(`🎙️🚨 <b>Engine Dispatch Failure</b>\n\n<b>Engine:</b> ${selectedEngine.toUpperCase()}\n<b>User:</b> ${userEmail}\n<b>Reason:</b> <pre>${lastErrorMsg}</pre>`);
  throw new Error(lastErrorMsg);
}

const internalAi = genkit({ plugins: [] }); 
internalAi.generate = generateWithRotation as any;
export const ai = internalAi;
export { z };
