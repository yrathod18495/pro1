
'use server';

/**
 * 🛰️ R2 STORAGE DISPATCHER (v2.1 - ROBUST SYNC)
 * -----------------------------------------------------------
 * Uses a single R2 bucket with folder partitioning.
 * - public/ folder for shared assets (resolved via pub://)
 * - secure/ folder for private vault (resolved via gcs://)
 */

import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET } from "./r2";
import { sendToTelegram } from './telegram-logger';
import { escapeHtml } from "./utils";
import crypto from 'crypto';
import { reportServerError } from '@/lib/report-error';

/**
 * 🎫 R2 SIGNED URL GENERATOR
 */
export async function getSignedUploadUrlAction(input: {
    fileName: string;
    contentType?: string;
    bucketType: 'public' | 'private';
    folder: string;
    userId: string;
    fileSize?: number;
}): Promise<{ success: boolean; signedUrl?: string; gcsPath?: string; error?: string }> {
    const { fileName, folder, userId, bucketType, fileSize, contentType } = input;

    try {
        if (!R2_BUCKET) throw new Error("Storage Node: Bucket ID missing.");

        // Server-side size validation limit (500MB for master audio/media assets)
        if (fileSize && fileSize > 500 * 1024 * 1024) {
            throw new Error(`File exceeds maximum upload limit of 500MB (requested: ${(fileSize / (1024 * 1024)).toFixed(2)}MB).`);
        }

        const nodeUuid = crypto.randomUUID().split('-')[0].toUpperCase();
        const timestamp = Date.now();
        const safeName = fileName.replace(/[^a-zA-Z0-9.]/g, '_').replace(/_+/g, '_').trim();
        
        // --- 🔒 FOLDER PARTITIONING NODE ---
        const rootFolder = bucketType === 'public' ? 'public' : 'secure';
        const basePath = folder.replace(/^\/|\/$/g, "");
        
        // Non-obvious professional naming
        const objectKey = `${rootFolder}/${basePath}/${userId}/${timestamp}_${nodeUuid}_${safeName}`;
        
        const effectiveContentType = contentType || 'application/octet-stream';
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: objectKey,
            ContentType: effectiveContentType,
        });

        const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });

        // Protocol mapping for internal resolver
        const protocol = bucketType === 'public' ? 'pub://' : 'gcs://';
        const storedPath = objectKey.replace(`${rootFolder}/`, '');

        return { 
            success: true, 
            signedUrl, 
            gcsPath: `${protocol}${storedPath}` 
        };

    } catch (e: any) {
    reportServerError('src/lib/gcs-actions.ts#1', e);
        console.error(`[Storage SignedURL Failure]:`, e.message);
        return { success: false, error: e.message };
    }
}

/**
 * 📦 DIRECT STORAGE DISPATCHER WITH LOCAL FALLBACK
 */
export async function uploadToGCS(
    formData: FormData,
    options?: { bucketType?: 'public' | 'private', folder?: string }
): Promise<{ success: boolean; url?: string; error?: string }> {
    const file = formData.get('file') as File;
    if (!file) return { success: false, error: 'No file provided.' };

    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const bucketType = (formData.get('bucketType') as 'public' | 'private') || options?.bucketType || 'private';
        const folder = (formData.get('folder') as string) || options?.folder || 'secure';
        const userId = (formData.get('userId') as string) || 'anonymous';
        const customFileName = formData.get('fileName') as string | null;

        const rootFolder = bucketType === 'public' ? 'public' : 'secure';
        const nodeUuid = crypto.randomUUID().split('-')[0].toUpperCase();
        const rawName = customFileName || file.name || `file_${Date.now()}`;
        const safeName = rawName.replace(/[^a-zA-Z0-9.]/g, '_').replace(/_+/g, '_').trim();
        const fileName = `${Date.now()}_${nodeUuid}_${safeName}`;
        const cleanFolder = folder.replace(/^\/|\/$/g, '');
        const objectKey = `${rootFolder}/${cleanFolder}/${userId}/${fileName}`;

        await r2Client.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: objectKey,
            Body: buffer,
            ContentType: file.type || 'application/octet-stream',
        }));

        const protocol = bucketType === 'public' ? 'pub://' : 'gcs://';
        const storedPath = objectKey.replace(`${rootFolder}/`, '');
        
        return { success: true, url: `${protocol}${storedPath}` };
    } catch (e: any) {
    reportServerError('src/lib/gcs-actions.ts#2', e);
        console.error("[R2 Storage Direct Upload Error]:", e.message);
        return { success: false, error: e.message };
    }
}


/**
 * 🗑️ ASSET DESTRUCTOR
 */
export async function deleteR2Object(path: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!R2_BUCKET) throw new Error("Storage Node: Bucket ID missing.");
        
        let fullKey = "";
        if (path.startsWith('pub://')) fullKey = "public/" + path.replace('pub://', '');
        else if (path.startsWith('gcs://')) fullKey = "secure/" + path.replace('gcs://', '');
        else fullKey = path; 
        
        await r2Client.send(new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: fullKey
        }));
        
        return { success: true };
    } catch (e: any) {
    reportServerError('src/lib/gcs-actions.ts#3', e);
        console.error("[Storage Purge Error]:", e.message);
        return { success: false, error: e.message };
    }
}

/**
 * 🛰️ FAILURE LOGGER ACTION
 */
export async function logUploadFailureAction(input: {
    userEmail: string;
    fileName: string;
    errorMessage: string;
}) {
    const { userEmail, fileName, errorMessage } = input;
    try {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        let fileCategory = 'Media';
        if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(ext)) {
            fileCategory = 'Audio/Music';
        } else if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'].includes(ext)) {
            fileCategory = 'Graphic/Image';
        } else if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) {
            fileCategory = 'Video';
        } else if (['pdf', 'txt', 'doc', 'docx', 'json'].includes(ext)) {
            fileCategory = 'Document';
        }

        await sendToTelegram(`🛰️🚨 <b>Upload Node Failure (${fileCategory})</b>\n<b>User:</b> ${userEmail}\n<b>File:</b> ${fileName}\n<b>Error:</b> <pre>${escapeHtml(errorMessage)}</pre>`);
    } catch (e) {
    reportServerError('src/lib/gcs-actions.ts#4', e);
        console.error("Failed to log upload failure:", e);
    }
}

/**
 * 🛰️ SUCCESS LOGGER ACTION WITH DIRECT FILE LINK
 */
export async function logUploadSuccessAction(input: {
    userEmail: string;
    fileName: string;
    publicUrl: string;
}) {
    const { userEmail, fileName, publicUrl } = input;
    try {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        let fileCategory = 'Media';
        if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(ext)) {
            fileCategory = 'Audio/Music';
        } else if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'].includes(ext)) {
            fileCategory = 'Graphic/Image';
        } else if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) {
            fileCategory = 'Video';
        }

        await sendToTelegram(
            `🛰️✅ <b>Storage Asset Uploaded (${fileCategory})</b>\n` +
            `<b>User:</b> ${escapeHtml(userEmail)}\n` +
            `<b>File:</b> <code>${escapeHtml(fileName)}</code>\n` +
            `<b>🔗 Direct Asset Link:</b> <a href="${escapeHtml(publicUrl)}">${escapeHtml(publicUrl)}</a>`
        );
    } catch (e) {
    reportServerError('src/lib/gcs-actions.ts#5', e);
        console.error("Failed to log upload success:", e);
    }
}

