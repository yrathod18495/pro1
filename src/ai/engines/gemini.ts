/**
 * ♊ GEMINI NEURAL NODE - STANDARD EDITION
 * ----------------------------------------
 * Handles standard Gemini API calls using rotated API keys.
 * Note: Lyria (Music) has been moved to Vertex Node for Service Key support.
 */

interface GeminiResponse {
    text: string | null;
    usage: any;
    media?: { url: string };
    _error?: boolean;
    message?: string;
    keyName?: string;
}

async function executeGeminiFetch(model: string, request: any, apiKey: string): Promise<any> {
    const modelName = model.startsWith('models/') ? model : `models/${model}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

    const config = request.config || {};
    const isJson = request.output?.format === 'json';
    const isTTS = config.responseModalities?.includes('AUDIO') || !!config.speechConfig;

    let promptText = "";
    if (typeof request.prompt === 'string') promptText = request.prompt;
    else if (Array.isArray(request.prompt)) promptText = request.prompt.map((p: any) => p.text || "").join(" ");
    else if (request.messages) promptText = request.messages[request.messages.length - 1]?.content[0]?.text || "";

    // Standard Payload
    const payload: any = {
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
            temperature: config.temperature ?? 0.7,
            maxOutputTokens: config.maxOutputTokens ?? 8192,
            responseMimeType: isJson ? "application/json" : "text/plain"
        }
    };

    if (isTTS) {
        payload.generationConfig.responseModalities = ["AUDIO"];
        if (config.speechConfig) payload.generationConfig.speechConfig = config.speechConfig;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store'
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p: any) => p.text);
    const audioPart = parts.find((p: any) => p.inlineData);

    return {
        text: textPart?.text || null,
        usage: data.usageMetadata || { totalTokens: 0 },
        media: audioPart ? { url: `data:${audioPart.inlineData.mime_type};base64,${audioPart.inlineData.data}` } : undefined,
        keyName: apiKey.slice(0, 6) + '...'
    };
}

export async function callGemini(model: string, request: any): Promise<GeminiResponse> {
    const freeKeys = (process.env.GEMINI_KEYS || "").split(',').map(k => k.trim()).filter(Boolean);
    const paidKey = process.env.GEMINI_API_KEY;

    // Define model fallback list if a specific model fails (e.g. quota exhausted on new preview models)
    const modelCandidates = [model];
    const rawModel = model.replace(/^models\//, '');
    if (rawModel === 'gemini-3.5-flash') {
        modelCandidates.push('gemini-2.5-flash', 'gemini-1.5-flash');
    } else if (rawModel === 'gemini-2.5-flash') {
        modelCandidates.push('gemini-1.5-flash');
    }

    let lastError = "No keys available.";

    for (const activeModel of modelCandidates) {
        // 1. Try Free Keys First (Shuffled)
        const shuffledFree = [...freeKeys].sort(() => Math.random() - 0.5);

        for (const key of shuffledFree) {
            try {
                return await executeGeminiFetch(activeModel, request, key);
            } catch (e: any) {
                console.warn(`[Gemini Free Node - ${activeModel}] Failed: ${e.message}`);
                lastError = e.message;
            }
        }

        // 2. Try Paid Key as Fallback for this model candidate
        if (paidKey) {
            try {
                return await executeGeminiFetch(activeModel, request, paidKey);
            } catch (e: any) {
                console.warn(`[Gemini Paid Node - ${activeModel}] Failed: ${e.message}`);
                lastError = `[Paid Node Failure] ${e.message}`;
            }
        }
        
        console.warn(`[Gemini Model failover]: ${activeModel} exhausted/failed. Trying next candidate if available.`);
    }

    return { _error: true, message: lastError, text: null, usage: null };
}
