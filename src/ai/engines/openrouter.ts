
/**
 * 🌐 OPENROUTER SPEECH NODE - HARDCODED EDITION
 * ----------------------------------------
 * Logic for OpenRouter Binary Speech API.
 * This node is strictly hardcoded to use Gemini TTS Preview.
 * Key: process.env.ROUTER.
 */

import wav from 'wav';
import { OpenRouter } from "@openrouter/sdk";
import { reportServerError } from '@/lib/report-error';

interface OpenRouterResponse {
    text: string | null;
    usage: any;
    media?: { url: string };
    _error?: boolean;
    message?: string;
    keyName?: string;
}

/**
 * 🌐 OPENROUTER TEXT DISPATCH NODE
 * Uses @openrouter/sdk for text completion (e.g. google/gemini-2.5-flash)
 */
export async function callOpenRouterText(model: string = "google/gemini-2.5-flash", request: any): Promise<OpenRouterResponse> {
    const apiKey = process.env.ROUTER || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER;
    if (!apiKey) return { _error: true, message: "OpenRouter key missing in environment.", text: null, usage: null };

    let promptText = "";
    if (typeof request.prompt === 'string') promptText = request.prompt;
    else if (Array.isArray(request.prompt)) promptText = request.prompt.map((p: any) => p.text || "").join(" ");
    else if (request.messages) promptText = request.messages[request.messages.length - 1]?.content || "";

    try {
        const openrouter = new OpenRouter({ apiKey });
        const response = await (openrouter.chat.send as any)({
            model: model || "google/gemini-2.5-flash",
            messages: [{ role: "user", content: promptText }]
        });

        const content = response.choices?.[0]?.message?.content;
        let textResult = "";
        if (typeof content === 'string') {
            textResult = content;
        } else if (Array.isArray(content)) {
            textResult = content.map((c: any) => c.text || "").join("\n");
        } else {
            textResult = String(content || "");
        }

        return {
            text: textResult,
            usage: response.usage || { total_tokens: 0 },
            keyName: 'OPENROUTER_TEXT_NODE'
        };
    } catch (sdkError: any) {
        console.warn("[OpenRouter SDK Failure, attempting direct REST fetch]:", sdkError?.message || sdkError);
        try {
            const url = "https://openrouter.ai/api/v1/chat/completions";
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model || "google/gemini-2.5-flash",
                    messages: [{ role: "user", content: promptText }]
                }),
                cache: 'no-store'
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

            return {
                text: data.choices?.[0]?.message?.content || null,
                usage: data.usage || { total_tokens: 0 },
                keyName: 'OPENROUTER_REST_FALLBACK'
            };
        } catch (fetchErr: any) {
            reportServerError('src/ai/engines/openrouter.ts:82', fetchErr);
            return { _error: true, message: fetchErr.message, text: null, usage: null };
        }
    }
}

/**
 * Converts Raw PCM Buffer to WAV Base64
 * Gemini TTS uses 24000Hz 16-bit Mono PCM
 */
async function toWav(pcmData: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
        const writer = new wav.Writer({
            channels: 1,
            sampleRate: 24000,
            bitDepth: 16,
        });

        let bufs = [] as any[];
        writer.on('error', reject);
        writer.on('data', (d: any) => bufs.push(d));
        writer.on('end', () => resolve(Buffer.concat(bufs).toString('base64')));

        writer.write(pcmData);
        writer.end();
    });
}

export async function callOpenRouterTTS(_unusedModel: string, request: any): Promise<OpenRouterResponse> {
    const apiKey = process.env.ROUTER;
    if (!apiKey) return { _error: true, message: "ROUTER key missing in environment.", text: null, usage: null };

    const url = "https://openrouter.ai/api/v1/audio/speech";
    const config = request.config || {};
    const voiceId = config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName || "Zephyr";

    // Extract Prompt Text
    let promptText = "";
    if (typeof request.prompt === 'string') promptText = request.prompt;
    else if (Array.isArray(request.prompt)) promptText = request.prompt.map((p: any) => p.text || "").join(" ");
    else if (request.messages) promptText = request.messages[request.messages.length - 1]?.content[0]?.text || "";

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${apiKey}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                model: "google/gemini-3.1-flash-tts-preview", // HARDCODED MODEL
                input: promptText,
                voice: voiceId,
                response_format: "pcm" // STRICT: Gemini TTS requires PCM
            }),
            cache: 'no-store'
        });

        if (!res.ok) {
            const errorJson = await res.json().catch(() => ({}));
            throw new Error(errorJson.error?.message || `Node Rejection: HTTP ${res.status}`);
        }

        /**
         * 🛰️ STREAM CONSUMPTION NODE
         * Reads the binary stream and converts to PCM buffer.
         */
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Convert to playable WAV for client-side playback
        const wavBase64 = await toWav(buffer);

        return {
            text: null,
            usage: { total_tokens: 0 },
            media: { url: `data:audio/wav;base64,${wavBase64}` },
            keyName: 'ROUTER_DIRECT_NODE'
        };
    } catch (e: any) {
            reportServerError('src/ai/engines/openrouter.ts:161', e);
        return { _error: true, message: e.message, text: null, usage: null };
    }
}
