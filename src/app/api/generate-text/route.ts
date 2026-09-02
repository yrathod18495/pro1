
import { NextRequest, NextResponse } from 'next/server';
import { callVertexText } from '@/ai/engines/vertex';
import { reportServerError } from '@/lib/report-error';

/**
 * 📝 UNIFIED TEXT GENERATION ENDPOINT
 * Follows provided document for Vertex AI & AI Studio integration.
 */
export async function POST(request: NextRequest) {
    try {
        const textBody = await request.text();
        if (!textBody || !textBody.trim()) {
            return NextResponse.json({ error: "Empty request body." }, { status: 400 });
        }
        let body: any = {};
        try {
            body = JSON.parse(textBody);
        } catch (e) {
            reportServerError('src/app/api/generate-text/route.ts:18', e);
            return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
        }
        const { text, modelName, credentials, projectId } = body;

        if (!text || !modelName) {
            return NextResponse.json({ error: "Missing text or modelName in payload." }, { status: 400 });
        }

        const result = await callVertexText({
            text,
            modelName,
            credentials,
            projectId
        });

        if (result._error) {
            return NextResponse.json({ error: result.message }, { status: 500 });
        }

        return NextResponse.json({ text: result.text });

    } catch (error: any) {
            reportServerError('src/app/api/generate-text/route.ts:40', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
