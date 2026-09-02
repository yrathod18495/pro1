import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/server';
import { deleteR2Object } from '@/lib/gcs-actions';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { reportServerError } from '@/lib/report-error';

export const dynamic = 'force-dynamic';

// POST: Add new music asset
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt, category, price, url, privateUrl, adminEmail, adminUid } = body;

        if (!url) {
            return NextResponse.json({ success: false, error: "Missing audio preview URL." }, { status: 400 });
        }

        const { database } = initializeFirebase();
        const musicId = Math.random().toString(36).substring(7);
        const newItem: Record<string, any> = {
            id: musicId,
            prompt: prompt || 'Untitled Track',
            url,
            category: category || 'Cinematic',
            price: Number(price) || 0,
            createdAt: new Date().toISOString(),
            isPrivate: false,
            userName: '12Labs Production'
        };
        if (privateUrl && typeof privateUrl === 'string' && privateUrl.trim() !== '') {
            newItem.privateUrl = privateUrl.trim();
        }

        await database.ref(`publicMusicLibrary/${musicId}`).set(newItem);

        // Telegram Logging
        try {
            await sendToTelegram(`🎵 <b>Library Asset Dispatched (API)</b>\n\n` +
                                 `<b>Node:</b> ${escapeHtml(prompt || 'Untitled')}\n` +
                                 `<b>Category:</b> ${category}\n` +
                                 `<b>Price:</b> ${Number(price) > 0 ? `₹${price}` : 'FREE'}\n` +
                                 `<b>Vault:</b> ${privateUrl ? 'Clean Copy Secured 🔒' : 'Public Only'}\n` +
                                 `<b>Admin:</b> ${adminEmail || 'Admin'}`);
        } catch (tgErr) {
            console.warn("[Telegram Notify Warning]:", tgErr);
        }

        revalidatePath('/admin');
        revalidatePath('/music-library');

        return NextResponse.json({ success: true, id: musicId, data: newItem });
    } catch (e: any) {
        console.error("[API Music Add Error]:", e);
        return NextResponse.json({ success: false, error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE: Remove music asset
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const url = searchParams.get('url');
        const privateUrl = searchParams.get('privateUrl');
        const adminEmail = searchParams.get('adminEmail') || 'Admin';

        if (!id) {
            return NextResponse.json({ success: false, error: "Missing asset ID." }, { status: 400 });
        }

        const { database } = initializeFirebase();
        await database.ref(`publicMusicLibrary/${id}`).remove();

        if (url) {
            await deleteR2Object(url).catch(() => null);
        }
        if (privateUrl) {
            await deleteR2Object(privateUrl).catch(() => null);
        }

        try {
            await sendToTelegram(`🗑️ <b>Library Asset Purged</b>\n<b>ID:</b> <code>${id}</code>\n<b>Admin:</b> ${adminEmail}`);
        } catch (e) {
            reportServerError('src/app/api/admin/music-library/route.ts:85', e);}

        revalidatePath('/admin');
        revalidatePath('/music-library');

        return NextResponse.json({ success: true });
    } catch (e: any) {
            reportServerError('src/app/api/admin/music-library/route.ts:91', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

// PATCH: Toggle / Update music entry
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, isOff, prompt, category, price, url, privateUrl, adminEmail } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: "Missing asset ID." }, { status: 400 });
        }

        const { database } = initializeFirebase();
        const updates: any = { updatedAt: new Date().toISOString() };

        if (typeof isOff === 'boolean') updates.isOff = isOff;
        if (prompt) updates.prompt = prompt;
        if (category) updates.category = category;
        if (typeof price === 'number') updates.price = price;
        if (url) updates.url = url;
        if (privateUrl) updates.privateUrl = privateUrl;

        await database.ref(`publicMusicLibrary/${id}`).update(updates);

        revalidatePath('/admin');
        revalidatePath('/music-library');

        return NextResponse.json({ success: true });
    } catch (e: any) {
            reportServerError('src/app/api/admin/music-library/route.ts:122', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
