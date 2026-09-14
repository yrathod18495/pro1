import { reportServerError } from '@/lib/report-error';

/**
 * 🛰️ HUGGING FACE MUSIC, TEXT & VOICE BRIDGE ENGINE (v9.7 - UNIVERSAL AUTH)
 * -------------------------------------------------------------------
 * Alignment: Strictly uses HF_SUPERFAST as both Space Token and Bridge Secret.
 */

interface HFBridgeResponse {
    text: string | null;
    usage: any;
    media?: { url: string };
    _error?: boolean;
    message?: string;
    keyName?: string;
}

/**
 * Trigger Music Generation (Async Background Task)
 */
export async function callHFMusicBridge(
    spaceUrl: string, 
    prompt: string, 
    userId: string, 
    userEmail: string, 
    mappingId: string,
    metadata?: any
): Promise<HFBridgeResponse> {
    try {
        let baseUrl = spaceUrl.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        
        const fetchUrl = baseUrl.endsWith('/generate') ? baseUrl : `${baseUrl}/generate`;
        
        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HF_SUPERFAST}` // UNIVERSAL AUTH NODE
            },
            body: JSON.stringify({ 
                prompt, 
                userId, 
                userEmail, 
                mappingId,
                metadata: metadata || {}
            }),
            cache: 'no-store'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            return {
                text: "Signal Received. Music node is synthesizing.",
                usage: { totalTokens: 0 },
                keyName: 'HF_MUSIC_NODE'
            };
        }

        throw new Error(data.error || `Node Rejection: ${response.status}`);

    } catch (e: any) {
            reportServerError('src/ai/engines/hf-bridge.ts:62', e);
        return { _error: true, message: `[Music Bridge Error]: ${e.message}`, text: null, usage: null };
    }
}

/**
 * Trigger Text Generation (Async Background Task / Sync JSON)
 */
export async function callHFTextBridge(
    spaceUrl: string,
    prompt: string,
    modelName: string,
    metadata: { userId: string, userEmail: string, userName?: string, mappingId: string, projectName?: string, generationParams: any }
): Promise<HFBridgeResponse> {
    try {
        let baseUrl = spaceUrl.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        
        const fetchUrl = baseUrl.endsWith('/generate-text') ? baseUrl : `${baseUrl}/generate-text`;
        
        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HF_SUPERFAST}` // UNIVERSAL AUTH NODE
            },
            body: JSON.stringify({ 
                prompt, 
                model: modelName,
                userId: metadata.userId,
                userEmail: metadata.userEmail,
                userName: metadata.userName,
                mappingId: metadata.mappingId,
                projectName: metadata.projectName || 'AI Script Generation',
                generationParams: metadata.generationParams
            }),
            cache: 'no-store'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            return {
                text: data.message || "Signal accepted. Script node is writing.",
                usage: { totalTokens: 0 },
                keyName: 'HF_TEXT_NODE'
            };
        }

        throw new Error(data.error || `Node Rejection: ${response.status}`);

    } catch (e: any) {
            reportServerError('src/ai/engines/hf-bridge.ts:113', e);
        return { _error: true, message: `[Text Bridge Error]: ${e.message}`, text: null, usage: null };
    }
}

/**
 * Trigger Voice Editing / Regeneration via Hugging Face Backend
 */
export async function callHFEditingBridge(
    spaceUrl: string,
    params: {
        text: string;
        voiceId?: string;
        character?: string;
        refAudioUrl?: string;
        refAudioBase64?: string;
        userId?: string;
        userEmail?: string;
        lineId?: string;
        language?: string;
    }
): Promise<{ success: boolean; audioDataUri?: string; error?: string }> {
    try {
        let baseUrl = spaceUrl.trim();
        if (!baseUrl) throw new Error("Editing HF Backend URL is empty.");
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        
        const fetchUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
        
        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HF_SUPERFAST || ''}`
            },
            body: JSON.stringify(params),
            cache: 'no-store'
        });

        const data = await response.json();

        if (response.ok && (data.audioDataUri || data.audioUrl || data.media?.url || data.audio || data.url)) {
            let audioResult = data.audioDataUri || data.audioUrl || data.media?.url || data.audio || data.url;
            if (typeof audioResult === 'string' && !audioResult.startsWith('data:') && !audioResult.startsWith('http')) {
                audioResult = `data:audio/wav;base64,${audioResult}`;
            }
            return { success: true, audioDataUri: audioResult };
        }

        throw new Error(data.error || data.message || `HF Node returned status ${response.status}`);
    } catch (e: any) {
            reportServerError('src/ai/engines/hf-bridge.ts:163', e);
        return { success: false, error: `[HF Editing Bridge Error]: ${e.message}` };
    }
}
