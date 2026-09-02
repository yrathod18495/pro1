import { reportServerError } from '@/lib/report-error';
/**
 * 🐉 DEEPSEEK NEURAL NODE
 * ----------------------------------------
 * Logic for DeepSeek Native API (api.deepseek.com).
 * Uses single main key: process.env.DEEPSEEK.
 */

interface DeepSeekResponse {
    text: string | null;
    usage: any;
    _error?: boolean;
    message?: string;
    keyName?: string;
}

export async function callDeepSeek(model: string, request: any): Promise<DeepSeekResponse> {
    const apiKey = process.env.DEEPSEEK;
    if (!apiKey) return { _error: true, message: "DEEPSEEK key missing in environment node.", text: null, usage: null };

    const url = "https://api.deepseek.com/chat/completions";
    const config = request.config || {};
    
    let promptText = "";
    if (typeof request.prompt === 'string') promptText = request.prompt;
    else if (Array.isArray(request.prompt)) promptText = request.prompt.map((p: any) => p.text || "").join(" ");
    else if (request.messages) promptText = request.messages[request.messages.length - 1]?.content || "";

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model: model || "deepseek-chat",
                messages: [{ role: "user", content: promptText }],
                temperature: config.temperature ?? 0.7,
                max_tokens: 4096,
                response_format: { type: "json_object" },
                stream: false
            }),
            cache: 'no-store'
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error?.message || "Node Rejection");

        return {
            text: data.choices?.[0]?.message?.content || null,
            usage: data.usage || { total_tokens: 0 },
            keyName: 'DEEPSEEK_NODE'
        };
    } catch (e: any) {
            reportServerError('src/ai/engines/deepseek.ts:55', e);
        return { _error: true, message: e.message, text: null, usage: null };
    }
}
