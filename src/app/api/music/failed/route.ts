import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

/**
 * 🔒 SECURE MUSIC FAILURE & REFUND HANDSHAKE
 * ---------------------------------------
 * Path: /api/music/failed
 * Protocol: POST
 */
export async function POST(request: NextRequest) {
    try {
        // 1. Authenticate with X-API-Key or Authorization header
        const authHeader = request.headers.get('authorization') || '';
        const apiKeyHeader = request.headers.get('x-api-key') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
        
        const providedKey = (token || apiKeyHeader || '').trim();
        const configuredKey = (process.env.HQ_ACCESS_KEY || process.env.HF_SUPERFAST || '').trim();

        if (!configuredKey || providedKey !== configuredKey) {
            return NextResponse.json({ success: false, error: "Unauthorized endpoint access." }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ success: false, error: "Empty payload node." }, { status: 400 });
        }

        const { projectId, error: errorMsg } = body;
        if (!projectId) {
            return NextResponse.json({ success: false, error: "Missing projectId in payload." }, { status: 400 });
        }

        const { firestore, database } = initializeFirebase();

        // 2. Locate project in Firestore
        // Music projects have a root collection doc /music_project/{projectId}
        const rootProjectRef = firestore.collection('music_project').doc(projectId);
        const rootSnap = await rootProjectRef.get();

        if (!rootSnap.exists) {
            return NextResponse.json({ success: false, error: `Project node ${projectId} not found in Firestore registry.` }, { status: 404 });
        }

        const projectData = rootSnap.data();
        if (!projectData) {
            return NextResponse.json({ success: false, error: "Project payload is empty." }, { status: 500 });
        }

        const userId = projectData.userId;
        const userEmail = projectData.userEmail || projectData.userName || "N/A";
        const cost = projectData.cost || 2000;
        const projectName = projectData.projectName || "Music Generation";

        // Check if already refunded or marked as error/failed to prevent double refund
        if (projectData.status === 'failed' || projectData.status === 'error') {
            return NextResponse.json({ success: true, message: "Project was already marked as failed/refunded." });
        }

        const userRef = firestore.collection('users').doc(userId);

        // 3. Process refund inside a Firestore Transaction
        const finalCredits = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("User profile node does not exist.");
            }
            const userData = userDoc.data();
            const currentCredits = userData?.credits || 0;
            const updatedCredits = currentCredits + cost;

            // Refund credits
            transaction.update(userRef, { credits: updatedCredits });
            return updatedCredits;
        });

        // 4. Update project statuses in Firestore
        const updatePayload = {
            status: 'failed',
            error: errorMsg || 'Vertex Rejection or model generation error.',
            updatedAt: new Date().toISOString()
        };

        const batch = firestore.batch();
        // Update root path
        batch.set(rootProjectRef, updatePayload, { merge: true });
        // Update partitioned user path
        const partitionedRef = firestore.collection('music_project').doc(userId).collection('userProjects').doc(projectId);
        batch.set(partitionedRef, updatePayload, { merge: true });

        // Add a notification entry for the user
        const notificationRef = firestore.collection('users').doc(userId).collection('notifications').doc('user_notifications');
        const notificationData = { 
            id: `fail-${Date.now()}`, 
            message: `Your music project "${projectName}" failed to generate. ${cost.toLocaleString()} credits have been refunded to your account.`, 
            timestamp: new Date().toISOString(), 
            read: false, 
            type: 'system' as const 
        };
        batch.set(notificationRef, { entries: FieldValue.arrayUnion(notificationData) }, { merge: true });

        await batch.commit();

        // 5. Clean up pending references in RTDB and record credit refund history
        const timestampNow = Date.now();
        const historyId = `hist_${timestampNow}`;
        const historyReason = `REFUND (FAILED): ${projectName.toUpperCase()}`;

        await database.ref(`creditHistory/${userId}/${historyId}`).set({
            amount: cost,
            reason: historyReason,
            timestamp: new Date().toISOString(),
            id: projectId,
            type: 'refund'
        }).catch(() => null);

        // Remove from pending_projects or clean up status in RTDB
        await database.ref(`tempMusicGenerations/${userId}/${projectId}`).remove().catch(() => null);
        await database.ref(`pending_projects/${projectId}`).remove().catch(() => null);

        // 6. Send Telegram alert notifying success
        const cleanError = typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : String(errorMsg || 'Unknown Error');
        await sendToTelegram(
            `🚨 <b>MUSIC NODE FAILED & REFUNDED</b>\n\n` +
            `👤 <b>User:</b> ${escapeHtml(userEmail)}\n` +
            `🆔 <b>Node:</b> <code>${projectId}</code>\n` +
            `💎 <b>Credits Restored:</b> +${cost.toLocaleString()} Credits\n` +
            `❌ <b>Error:</b> <pre>${escapeHtml(cleanError.slice(0, 400))}${cleanError.length > 400 ? '...' : ''}</pre>`
        ).catch(() => null);

        revalidatePath('/history');
        revalidatePath('/music-studio');

        return NextResponse.json({
            success: true,
            message: `Handshake successful. Refunded ${cost} credits to user ${userId}.`,
            projectId,
            refundedCredits: cost,
            newBalance: finalCredits
        });

    } catch (error: any) {
        console.error("[Music Refund] Handshake Exception:", error.message);
        return NextResponse.json({ success: false, error: error.message || "Failed to process failure handshake." }, { status: 500 });
    }
}
