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
    imageUrl?: string;
    adminEmail: string;
    adminUid: string;
}) {
    try {
        const { database } = initializeFirebase();
        const { prompt, category, price, url, privateUrl, imageUrl, adminEmail, adminUid } = input;

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
        // Optional cover art — never required, tracks without one just
        // fall back to the gradient+icon placeholder in the UI.
        if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
            newItem.imageUrl = imageUrl.trim();
        }

        await database.ref(`publicMusicLibrary/${musicId}`).set(newItem);

        // 🔴 FIX: privateUrl (the unwatermarked master) used to be embedded
        // directly on the SAME publicMusicLibrary/{id} record that
        // `.read: true` makes readable by literally anyone — so the "paid"
        // master was actually downloadable by anyone who opened devtools,
        // purchase or not. It now lives at musicMasters/{id}, which has
        // `.read: false` for every client — only getSecureDownloadUrl below
        // (server-side, with its own purchase check) can ever read it.
        if (privateUrl && typeof privateUrl === 'string' && privateUrl.trim() !== '') {
            await database.ref(`musicMasters/${musicId}`).set({ privateUrl: privateUrl.trim() });
            // Safe, non-sensitive boolean on the public record so the admin
            // UI can show a "MASTER SECURED" badge without ever exposing
            // the actual URL to clients.
            await database.ref(`publicMusicLibrary/${musicId}`).update({ hasMaster: true });
        }

        // 📡 Telegram Event Logging
        await sendToTelegram(`🎵 <b>Library Asset Dispatched (Secured)</b>\n\n` +
                             `<b>Node:</b> ${escapeHtml(prompt)}\n` +
                             `<b>Category:</b> ${category}\n` +
                             `<b>Price:</b> ${price > 0 ? `₹${price}` : 'FREE'}\n` +
                             `<b>Vault:</b> ${privateUrl ? 'Clean Copy Secured 🔒' : 'Public Only'}\n` +
                             `<b>Cover Art:</b> ${imageUrl ? 'Yes' : 'None'}\n` +
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
export async function deleteLibraryMusicAction(id: string, url: string, privateUrl: string | undefined, adminEmail: string, imageUrl?: string) {
    const { database } = initializeFirebase();
    try {
        // 🔴 FIX: privateUrl no longer lives on the client-readable track
        // record (see addMusicToLibraryAction's comment), so a client can
        // never pass the real one in anymore — it'd always be undefined,
        // silently skipping R2 cleanup and leaking the master file forever.
        // Read it server-side from musicMasters instead; the passed-in
        // param is kept only as a fallback for any caller that still has it.
        let resolvedPrivateUrl = privateUrl;
        if (!resolvedPrivateUrl) {
            const masterSnap = await database.ref(`musicMasters/${id}`).get();
            resolvedPrivateUrl = masterSnap.exists() ? masterSnap.val()?.privateUrl : undefined;
        }

        await database.ref(`publicMusicLibrary/${id}`).remove();
        await database.ref(`musicMasters/${id}`).remove();

        // 🚀 R2 NATIVE PURGE
        // deleteR2Object automatically handles pub:// and gcs:// protocols
        if (url) {
            await deleteR2Object(url).catch(() => null);
        }

        if (resolvedPrivateUrl) {
            await deleteR2Object(resolvedPrivateUrl).catch(() => null);
        }

        if (imageUrl) {
            await deleteR2Object(imageUrl).catch(() => null);
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
    imageUrl?: string;
    isOff?: boolean;
    adminEmail: string;
}) {
    const { database } = initializeFirebase();
    try {
        const { id, prompt, category, price, url, privateUrl, imageUrl, isOff, adminEmail } = input;
        
        const updates: any = {
            prompt,
            category,
            price,
            updatedAt: new Date().toISOString()
        };

        if (url) updates.url = url;
        if (imageUrl) updates.imageUrl = imageUrl;
        if (typeof isOff === 'boolean') updates.isOff = isOff;

        await database.ref(`publicMusicLibrary/${id}`).update(updates);
        // Same musicMasters split as addMusicToLibraryAction — never on
        // the publicly-readable record.
        if (privateUrl) {
            await database.ref(`musicMasters/${id}`).set({ privateUrl: privateUrl.trim() });
            await database.ref(`publicMusicLibrary/${id}`).update({ hasMaster: true });
        }

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
 * 🔓 SECURE DOWNLOAD URL
 * ------------------------
 * The ONLY way to ever get a paid track's real (unwatermarked) master URL.
 * Free tracks: anyone gets the public preview URL — nothing to gate.
 * Paid tracks: requires uid, and requires musicPurchases/{uid}/{trackId} to
 * exist (written server-side by the Razorpay webhook on successful
 * payment — see src/app/api/webhook/razorpay/route.ts). Only then does it
 * read musicMasters/{trackId}, which no client can read directly.
 */
export async function getSecureDownloadUrl(
    trackId: string,
    uid: string | null
): Promise<{ success: true; url: string; isMaster: boolean } | { success: false; error: string }> {
    try {
        const { database } = initializeFirebase();
        const trackSnap = await database.ref(`publicMusicLibrary/${trackId}`).get();
        if (!trackSnap.exists()) return { success: false, error: 'Track not found.' };
        const track = trackSnap.val() || {};
        const price = Number(track.price) || 0;

        if (price <= 0) {
            if (!track.url) return { success: false, error: 'Track has no audio.' };
            return { success: true, url: track.url, isMaster: false };
        }

        if (!uid) {
            return { success: false, error: 'Sign in required to download this track.' };
        }

        const purchasedSnap = await database.ref(`musicPurchases/${uid}/${trackId}`).get();
        if (!purchasedSnap.exists()) {
            return { success: false, error: 'Purchase this track to download the full-quality file.' };
        }

        const masterSnap = await database.ref(`musicMasters/${trackId}`).get();
        const masterUrl = masterSnap.exists() ? masterSnap.val()?.privateUrl : null;
        if (masterUrl) {
            return { success: true, url: masterUrl, isMaster: true };
        }
        // No master was ever uploaded for this track (older track, or admin
        // skipped the private copy) — fall back to the public preview
        // rather than failing outright; they DID pay and shouldn't get
        // nothing.
        if (!track.url) return { success: false, error: 'No audio file available for this track.' };
        return { success: true, url: track.url, isMaster: false };
    } catch (e: any) {
        reportServerError('src/app/admin/music-manager/actions.ts#getSecureDownloadUrl', e);
        return { success: false, error: e.message || 'Could not resolve download URL.' };
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