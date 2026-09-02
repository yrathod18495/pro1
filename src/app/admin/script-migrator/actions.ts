
'use server';

import { initializeFirebase } from '@/firebase/server';
import type { Product, DownloadableFile } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { r2Client, R2_BUCKET } from '@/lib/r2';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';
import { reportServerError } from '@/lib/report-error';

export interface MigratableScript {
    id: string;
    title: string;
    hasGcs: boolean;
    sellerName: string;
}

/**
 * 🔍 FETCH SYNC QUEUE
 * Returns all Hand Written Scripts and their current migration status.
 */
export async function fetchScriptsForMigration(): Promise<{ success: boolean; data?: MigratableScript[]; message: string }> {
    const { firestore } = initializeFirebase();
    try {
        const snapshot = await firestore.collection('products')
            .where('productType', '==', 'Hand Written Script')
            .get();

        if (snapshot.empty) return { success: true, data: [], message: "No scripts found." };

        const scripts: MigratableScript[] = snapshot.docs.map((doc: any) => {
            const data = doc.data() as Product;
            const hasGcs = (data.downloadableFiles || []).some(f => f.url.startsWith('gcs://'));
            return {
                id: doc.id,
                title: data.title,
                hasGcs,
                sellerName: data.sellerName || 'Unknown'
            };
        });

        return { success: true, data: scripts, message: "Sync queue populated." };
    } catch (e: any) {
    reportServerError('src/app/admin/script-migrator/actions.ts#1', e);
        return { success: false, message: e.message };
    }
}

/**
 * 🚀 MIGRATE SINGLE NODE (R2 SYNC)
 * Migrates a specific script to R2 Secure Folder.
 */
export async function migrateSingleScriptAction(productId: string) {
    const { firestore } = initializeFirebase();
    
    try {
        if (!R2_BUCKET) throw new Error("R2 Node: Bucket not configured.");

        const productRef = firestore.collection('products').doc(productId);
        const doc = await productRef.get();

        if (!doc.exists) throw new Error("Product not found.");
        
        const data = doc.data() as Product;
        const existingFiles = data.downloadableFiles || [];
        
        if (existingFiles.some(f => f.url.startsWith('gcs://'))) {
            return { success: true, message: "Node already synchronized." };
        }

        let fileBuffer: Buffer | null = null;

        if (data.fullScriptContent) {
            fileBuffer = Buffer.from(data.fullScriptContent);
        } else if (existingFiles.length > 0) {
            const oldUrl = existingFiles[0].url;
            if (oldUrl.startsWith('http')) {
                const res = await fetch(oldUrl);
                if (res.ok) fileBuffer = Buffer.from(await res.arrayBuffer());
            }
        }

        if (!fileBuffer) throw new Error("Could not extract script payload.");

        const nodeUuid = crypto.randomUUID().split('-')[0].toUpperCase();
        const sanitizedTitle = data.title.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').trim();
        const finalFileName = `${sanitizedTitle || 'script'}_${nodeUuid}.txt`;

        // R2 SECURE DISPATCH
        const objectKey = `secure/store/scripts/masters/${finalFileName}`;
        
        await r2Client.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: objectKey,
            Body: fileBuffer,
            ContentType: 'text/plain',
        }));

        const r2Url = `gcs://${objectKey.replace('secure/', '')}`;
        const updatedFiles: DownloadableFile[] = [
            ...existingFiles,
            { fileName: `${data.title} (Secure Archive).txt`, url: r2Url }
        ];

        await productRef.update({ 
            downloadableFiles: updatedFiles,
            migrationLog: 'R2_SYNC_COMPLETE'
        });

        await sendToTelegram(`🔄 <b>Node Synchronized (R2)</b>\n<b>ID:</b> <code>${productId}</code>\n<b>File:</b> <code>${finalFileName}</code>`);

        revalidatePath('/admin/script-migrator');
        return { success: true, message: `Script mapped to R2 as ${finalFileName}` };

    } catch (e: any) {
    reportServerError('src/app/admin/script-migrator/actions.ts#2', e);
        console.error(`Migration Failed for ${productId}:`, e.message);
        return { success: false, message: e.message };
    }
}
