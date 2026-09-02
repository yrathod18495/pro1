'use server';

import { initializeFirebase } from '@/firebase/server';
import { uploadToGCS, deleteR2Object } from '@/lib/gcs-actions';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

/**
 * 🎵 PUBLIC MUSIC DISPATCHER (v2.1 - UNIFIED FORM)
 * ---------------------------------------
 * Fixed: Packs details into FormData to prevent parsing errors.
 */
export async function addMusicToLibraryAction(input: {
    prompt: string;
    category: string;
    price: number;
    url: string;
    privateUrl?: string;
    adminEmail: string;
    adminUid: string;
}) {
    try {
        const { database } = initializeFirebase();
        const { prompt, category, price, url, privateUrl, adminEmail, adminUid } = input;

        if (!url) {
            throw new Error("Missing preview URL for dispatch.");
        }

        // 3. Map to Global Registry (RTDB)
        const musicId = Math.random().toString(36).substring(7);
        const newItem: Record<string, any> = {
            id: musicId,
            prompt,
            url,
            category,
            price,
            createdAt: new Date().toISOString(),
            isPrivate: false,
            userName: '12Labs Production'
        };
        if (privateUrl && typeof privateUrl === 'string' && privateUrl.trim() !== '') {
            newItem.privateUrl = privateUrl.trim();
        }

        await database.ref(`publicMusicLibrary/${musicId}`).set(newItem);

        // 📡 Telegram Event Logging
        await sendToTelegram(`🎵 <b>Library Asset Dispatched (Secured)</b>\n\n` +
                             `<b>Node:</b> ${escapeHtml(prompt)}\n` +
                             `<b>Category:</b> ${category}\n` +
                             `<b>Price:</b> ${price > 0 ? `₹${price}` : 'FREE'}\n` +
                             `<b>Vault:</b> ${privateUrl ? 'Clean Copy Secured 🔒' : 'Public Only'}\n` +
                             `<b>Admin:</b> ${adminEmail}`);

        revalidatePath('/admin');
        revalidatePath('/music-library');
        
        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/admin/music-manager/actions.ts#1', e);
        console.error("[Music Upload Failed]:", e.message);
        return { success: false, error: e.message };
    }
}

/**
 * 🗑️ ASSET DESTRUCTION NODE (v3.2 - R2 SYNC)
 * Updated: Removed GCS bucket references to fix TS errors.
 */
export async function deleteLibraryMusicAction(id: string, url: string, privateUrl: string | undefined, adminEmail: string) {
    const { database } = initializeFirebase();
    try {
        await database.ref(`publicMusicLibrary/${id}`).remove();

        // 🚀 R2 NATIVE PURGE
        // deleteR2Object automatically handles pub:// and gcs:// protocols
        if (url) {
            await deleteR2Object(url).catch(() => null);
        }

        if (privateUrl) {
            await deleteR2Object(privateUrl).catch(() => null);
        }

        await sendToTelegram(`🗑️ <b>Library Asset Purged</b>\n<b>ID:</b> <code>${id}</code>\n<b>Admin:</b> ${adminEmail}`);
        
        revalidatePath('/admin');
        revalidatePath('/music-library');
        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/admin/music-manager/actions.ts#2', e);
        console.error("[Delete Library Music Failed]:", e.message);
        return { success: false, error: e.message };
    }
}

/**
 * ✏️ UPDATE MUSIC ENTRY
 */
export async function updateLibraryMusicAction(input: {
    id: string;
    prompt: string;
    category: string;
    price: number;
    url?: string;
    privateUrl?: string;
    isOff?: boolean;
    adminEmail: string;
}) {
    const { database } = initializeFirebase();
    try {
        const { id, prompt, category, price, url, privateUrl, isOff, adminEmail } = input;
        
        const updates: any = {
            prompt,
            category,
            price,
            updatedAt: new Date().toISOString()
        };

        if (url) updates.url = url;
        if (privateUrl) updates.privateUrl = privateUrl;
        if (typeof isOff === 'boolean') updates.isOff = isOff;

        await database.ref(`publicMusicLibrary/${id}`).update(updates);

        await sendToTelegram(`✏️ <b>Library Asset Updated</b>\n<b>ID:</b> <code>${id}</code>\n<b>Prompt:</b> ${escapeHtml(prompt)}\n<b>Category:</b> ${category}\n<b>Price:</b> ₹${price}\n<b>Admin:</b> ${adminEmail}`);

        revalidatePath('/admin');
        revalidatePath('/music-library');
        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/admin/music-manager/actions.ts#3', e);
        console.error("[Update Library Music Failed]:", e.message);
        return { success: false, error: e.message };
    }
}

/**
 * 🔘 TOGGLE MUSIC ASSET VISIBILITY STATUS (ON / OFF)
 */
export async function toggleMusicStatusAction(id: string, isOff: boolean, adminEmail: string) {
    const { database } = initializeFirebase();
    try {
        await database.ref(`publicMusicLibrary/${id}`).update({
            isOff,
            updatedAt: new Date().toISOString()
        });

        await sendToTelegram(`🔘 <b>Music Asset Status Toggled</b>\n<b>ID:</b> <code>${id}</code>\n<b>Status:</b> ${isOff ? '🔴 OFF (Hidden from Users)' : '🟢 ON (Visible to Public)'}\n<b>Admin:</b> ${adminEmail}`);

        revalidatePath('/admin');
        revalidatePath('/music-library');
        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/admin/music-manager/actions.ts#4', e);
        console.error("[Toggle Music Status Failed]:", e.message);
        return { success: false, error: e.message };
    }
}