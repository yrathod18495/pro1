/**
 * 🛰️ VERTEX AI NEURAL ENGINE (TEXT & MUSIC)
 * -----------------------------------------------------------
 * Implementation for Vertex AI and Google AI unified calling.
 * FIXED: Uses direct REST fetch for Vertex AI to ensure correct URL structure 
 * (publishers/google/models) as per production spec.
 */

import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { reportServerError } from '@/lib/report-error';

interface VertexResponse {
    text: string | null;
    usage: any;
    media?: { url: string };
    _error?: boolean;
    message?: string;
    keyName?: string;
}

interface AudioMatch {
    data: string;
    mimeType: string;
    ext: string;
}

function findAudioRecursive(o: any): AudioMatch | null {
    if (!o) return null;

    if (typeof o === "object") {
        const dataKey = Object.keys(o).find(k => {
            const lk = k.toLowerCase();
            return lk === "data" || lk === "inline_data" || lk.includes("audio") || lk === "output_audio";
        });
        
        if (dataKey) {
            const val = o[dataKey];
            if (typeof val === "string" && val.length > 500) {
                const base64 = val.replace(/\s/g, "");
                if (base64.startsWith("UklGR")) return { data: base64, mimeType: "audio/wav", ext: "wav" };
                else if (base64.startsWith("SUQz") || base64.startsWith("/+MY") || base64.startsWith("//uQ")) return { data: base64, mimeType: "audio/mpeg", ext: "mp3" };
                else if (base64.startsWith("T2dnUw")) return { data: base64, mimeType: "audio/ogg", ext: "ogg" };
            }
        }

        const values = Array.isArray(o) ? o : Object.values(o);
        for (const v of values) {
            const found = findAudioRecursive(v);
            if (found) return found;
        }
    }

    if (typeof o === "string" && o.length > 1000) {
        const cleanStr = o.replace(/\s+/g, "");
        if (cleanStr.startsWith("UklGR")) return { data: cleanStr, mimeType: "audio/wav", ext: "wav" };
        if (cleanStr.startsWith("SUQz") || cleanStr.startsWith("/+MY")) return { data: cleanStr, mimeType: "audio/mpeg", ext: "mp3" };
    }

    return null;
}

/**
 * 📝 UNIFIED GOOGLE TEXT GENERATOR
 * FIXED: Bypasses SDK URL generation for Vertex AI to prevent 404 errors.
 */
export async function callVertexText(input: {
    text: string;
    modelName: string;
    credentials?: string;
    projectId?: string;
}): Promise<VertexResponse> {
    const { text, modelName, credentials, projectId } = input;
    
    try {
        const creds = credentials || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GEMINI_API_KEY;
        if (!creds) throw new Error("Credentials missing.");

        const isServiceAccount = creds.trim().startsWith('{');

        if (isServiceAccount) {
            // Case A: Service Account (Vertex AI Mode)
            // Use direct fetch to control the URL structure exactly
            const serviceAccount = JSON.parse(creds);
            const gcpProjectId = projectId || serviceAccount.project_id;
            
            const auth = new GoogleAuth({
                credentials: serviceAccount,
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            });
            const client = await auth.getClient();
            const tokenResponse = await client.getAccessToken();
            const token = tokenResponse.token;

            if (!token) throw new Error("OAuth token generation failed.");

            // CORRECT VERTEX URL STRUCTURE
            const region = "us-central1";
            const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${gcpProjectId}/locations/${region}/publishers/google/models/${modelName}:generateContent`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text }] }],
                    generationConfig: {
                        temperature: 0.8,
                        maxOutputTokens: 8192,
                    }
                }),
                cache: 'no-store'
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error?.message || `Vertex Rejection: ${JSON.stringify(data)}`);

            const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

            return {
                text: resultText,
                usage: data.usageMetadata || { totalTokens: 0 },
                keyName: 'VERTEX_NODE'
            };
        } else {
            // Case B: API Key (Google AI Studio Mode)
            const genAI = new GoogleGenerativeAI(creds);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent(text);
            const response = await result.response;
            const resultText = response.text();

            return {
                text: resultText,
                usage: response.usageMetadata || { totalTokens: 0 },
                keyName: 'AI_STUDIO_NODE'
            };
        }

    } catch (e: any) {
        console.error("[Vertex Text Error]:", e.message);
        return { _error: true, message: e.message, text: null, usage: null };
    }
}

/**
 * 🎙️ VERTEX LYRIA MUSIC DISPATCHER
 * FIXED: Model identifier now uses full resource path to prevent 'invalid_request'.
 */
export async function callVertexLyria(model: string, request: any): Promise<VertexResponse> {
    try {
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!serviceAccountKey) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY missing.");

        const creds = JSON.parse(serviceAccountKey.trim());
        const projectId = creds.project_id;

        const auth = new GoogleAuth({
            credentials: creds,
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse.token;

        if (!token) throw new Error("OAuth token generation failed.");

        const url = `https://aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/global/interactions`;
        
        let promptText = "";
        if (typeof request.prompt === 'string') promptText = request.prompt;
        else if (Array.isArray(request.prompt)) promptText = request.prompt.map((p: any) => p.text || "").join(" ");
        else if (request.messages) promptText = request.messages[request.messages.length - 1]?.content[0]?.text || "";

        // SYNC: Prefix model path as per interactions API spec
        const fullModelPath = model.startsWith('publishers/') ? model : `publishers/google/models/${model}`;
        const payload = { 
            model: fullModelPath, 
            input: promptText 
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            cache: 'no-store'
        });

        const rawText = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${rawText}`);

        let resultObj;
        try { resultObj = JSON.parse(rawText); } catch (e) {
            reportServerError('src/ai/engines/vertex.ts:198', e); resultObj = rawText; }
        
        const audioMatch = findAudioRecursive(resultObj);

        if (audioMatch) {
            return {
                text: `Neural Synthesis Optimized (${audioMatch.ext.toUpperCase()})`,
                usage: { totalTokens: 0 },
                media: { url: `data:${audioMatch.mimeType};base64,${audioMatch.data}` },
                keyName: 'VERTEX_GLOBAL_NODE'
            };
        }

        return { 
            _error: true, 
            message: "Interaction complete but no binary audio identified in payload.", 
            text: rawText,
            usage: null 
        };

    } catch (e: any) {
            reportServerError('src/ai/engines/vertex.ts:218', e);
        return { _error: true, message: e.message, text: null, usage: null };
    }
}
