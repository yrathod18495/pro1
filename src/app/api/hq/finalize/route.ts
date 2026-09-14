
import { NextRequest, NextResponse } from 'next/server';
import { completeProjectAction } from '@/app/admin/pending/actions';

/**
 * 🔒 HQ PRODUCTION FINALIZATION WEBHOOK (v3.9 - STABLE HANDSHAKE)
 * ---------------------------------------
 * This endpoint is called by the HQ Bridge Node once synthesis is complete.
 * Path: /api/hq/finalize
 * Protocol: Secure Lightweight POST Handshake
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const userAgent = request.headers.get('user-agent') || 'Unknown';
        
        const body = await request.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ success: false, error: "Empty payload node." }, { status: 400 });
        }

        // Lightweight parameters only to avoid payload issues
        const { projectId, userId, userEmail, projectName, audioUrl, usedBridge } = body;

        if (!projectId || !userId || !audioUrl) {
            return NextResponse.json({ success: false, error: "Missing required node identifiers." }, { status: 400 });
        }

        /**
         * 🏁 PRODUCTION FINALIZATION
         * Note: syncData is already saved directly by the bridge to Firestore.
         */
        const result = await completeProjectAction(
            projectId,
            userId,
            projectName || "HQ Voiceover",
            audioUrl,
            undefined, // We don't pass syncData here to keep handshake fast
            "12Labs Neural Bridge",
            !!usedBridge
        );

        if (result.success) {
            return NextResponse.json({ 
                success: true, 
                message: "Production handshake secured. User notified." 
            });
        } else {
            return NextResponse.json({ success: false, error: result.message }, { status: 500 });
        }

    } catch (error: any) {
        console.error("[HQ Finalize] Critical Synchronizer Fault:", error.message);
        return NextResponse.json({ 
            success: false, 
            error: "Main server node synchronization error." 
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ 
        status: "operational", 
        node: "12Labs-HQ-Finalizer",
        protocol: "POST-Only"
    });
}
