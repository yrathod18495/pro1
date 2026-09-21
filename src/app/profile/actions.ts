'use server';

import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';
import { deleteProductAction } from '@/app/seller/products/actions';

export interface AccountSummary {
    projectCount: number;
    purchaseCount: number;
    productCount: number;
    isSeller: boolean;
}

/**
 * Lightweight counts for the /profile page's "what's tied to my account"
 * summary — not the full lists (those already live on /history and
 * /purchases), just enough for the user to see what deletion will affect
 * before they commit to it.
 */
export async function getAccountSummaryAction(uid: string): Promise<AccountSummary> {
    const { firestore } = initializeFirebase();
    let projectCount = 0;
    let purchaseCount = 0;
    let productCount = 0;
    let isSeller = false;

    try {
        const userDoc = await firestore.collection('users').doc(uid).get();
        isSeller = userDoc.data()?.isSeller === true;

        const [projectsSnap, purchasesSnap, productsSnap] = await Promise.all([
            firestore.collection('projects').doc(uid).collection('userProjects').count().get().catch(() => null),
            firestore.collection('storeHistory').where('userId', '==', uid).where('status', '==', 'paid').count().get().catch(() => null),
            isSeller ? firestore.collection('products').where('sellerId', '==', uid).count().get().catch(() => null) : Promise.resolve(null),
        ]);

        projectCount = projectsSnap?.data().count || 0;
        purchaseCount = purchasesSnap?.data().count || 0;
        productCount = productsSnap?.data().count || 0;
    } catch (e) {
        reportServerError('src/app/profile/actions.ts:getAccountSummaryAction', e);
    }

    return { projectCount, purchaseCount, productCount, isSeller };
}

/**
 * 🔒 Self-service account deletion (DPDP Act "right to erasure").
 *
 * This does NOT hard-delete the Firestore `users/{uid}` doc — too much of
 * the app (purchase history, seller attribution on products other people
 * bought, admin payout records) holds a foreign-key reference to that uid,
 * and destroying it would break those other people's own records, not just
 * this user's. Instead it anonymizes the identifying fields in place and
 * flips status to 'deleted', then deletes the actual Firebase Auth
 * credential — which is what really "deletes the account" from the DPDP
 * standpoint: the person can never log in again, and their name/email/photo
 * are gone from anywhere the app displays them.
 *
 * `registeredDeviceId` / hardware-signature fields are deliberately left
 * untouched — that's the anti-abuse device-fingerprint block, unrelated to
 * personal-data erasure, and its whole purpose is to survive exactly this
 * (stop a deleted account from farming fresh signup credits on the same
 * device).
 *
 * The caller (client) must have already re-authenticated the user
 * immediately before calling this — this action itself has no way to
 * verify a password, so re-auth freshness is enforced client-side (see
 * /profile) and this is the destructive step that runs only after that
 * succeeds.
 */
export async function deleteMyAccountAction(
    uid: string,
    email: string,
    keepProductsUnderPlatform: boolean
): Promise<{ success: boolean; message: string }> {
    if (!uid) return { success: false, message: 'Missing user ID.' };

    const { firestore, database, auth } = initializeFirebase();

    try {
        const userRef = firestore.collection('users').doc(uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) return { success: false, message: 'Account not found.' };
        const profile = userSnap.data() as any;
        const isSeller = profile?.isSeller === true;

        // 1. Seller products: the seller's own explicit choice, gathered on
        // /profile before this action is ever called.
        if (isSeller) {
            const productsSnap = await firestore.collection('products').where('sellerId', '==', uid).get();
            if (keepProductsUnderPlatform) {
                const batch = firestore.batch();
                productsSnap.forEach((doc: any) => {
                    batch.update(doc.ref, { sellerName: 'Unknown Seller', sellerAccountDeleted: true });
                });
                await batch.commit();

                // storeProducts/{id}.sellerName is a separate denormalized
                // copy the storefront actually reads first (see
                // getProductDetails) — has to be updated too or the old
                // name keeps showing.
                const rtdbUpdates: Record<string, any> = {};
                productsSnap.forEach((doc: any) => {
                    rtdbUpdates[`storeProducts/${doc.id}/sellerName`] = 'Unknown Seller';
                    rtdbUpdates[`storeProducts/${doc.id}/sellerAccountDeleted`] = true;
                });
                if (Object.keys(rtdbUpdates).length > 0) {
                    await database.ref().update(rtdbUpdates).catch((e: any) => { reportServerError('src/app/profile/actions.ts:rtdbSellerName', e); return null; });
                }
            } else {
                for (const doc of productsSnap.docs) {
                    await deleteProductAction(doc.id, uid).catch((e: any) => { reportServerError('src/app/profile/actions.ts:deleteProductAction', e); return null; });
                }
            }

            // Seller storefront profile — anonymize display fields, clear
            // payout/contact PII. Kept (not deleted) since past payout
            // records reference this uid for tax/audit purposes.
            await database.ref(`sellerProfiles/${uid}`).update({
                storeName: 'Unknown Seller',
                description: '',
                profileImageUrl: '',
                payoutDetails: null,
            }).catch((e: any) => { reportServerError('src/app/profile/actions.ts:sellerProfile', e); return null; });
        }

        // 2. Anonymize the account record in place — see the function
        // docstring for why this isn't a hard delete.
        await userRef.update({
            name: 'Deleted User',
            email: `deleted-${uid}@12labs.in`,
            photoURL: null,
            status: 'deleted',
            deletedAt: new Date().toISOString(),
        });

        // 3. Purge personal content the user directly owns. Best-effort —
        // one node failing to clear shouldn't abort the deletion (the auth
        // credential removal below is the part that actually matters most).
        const rtdbPersonalPaths = [
            `onlineUsers/${uid}`,
            `pushSubscriptions/${uid}`,
            `carts/${uid}`,
            `feedback/${uid}`,
            `cloningHistory/${uid}`,
            `pendingSellerProfiles/${uid}`,
        ];
        await Promise.all(
            rtdbPersonalPaths.map((path) =>
                database.ref(path).remove().catch((e: any) => { reportServerError(`src/app/profile/actions.ts:rtdb:${path}`, e); return null; })
            )
        );

        await (firestore as any).recursiveDelete(firestore.collection('projects').doc(uid)).catch((e: any) => {
            reportServerError('src/app/profile/actions.ts:recursiveDeleteProjects', e);
        });

        // 4. Revoke the actual login credential — this is what makes the
        // account genuinely inaccessible going forward.
        if (auth) {
            await auth.deleteUser(uid).catch((e: any) => { reportServerError('src/app/profile/actions.ts:deleteAuthUser', e); });
        }

        await sendToTelegram(
            `🗑️ <b>Account Deleted (Self-Service)</b>\n<b>UID:</b> ${escapeHtml(uid)}\n<b>Email:</b> ${escapeHtml(email)}\n<b>Was Seller:</b> ${isSeller ? 'Yes' : 'No'}${isSeller ? `\n<b>Products:</b> ${keepProductsUnderPlatform ? 'Kept under platform (Unknown Seller)' : 'Deleted'}` : ''}`
        ).catch((e: any) => { reportServerError('src/app/profile/actions.ts:telegram', e); return null; });

        return { success: true, message: 'Account deleted.' };
    } catch (error: any) {
        reportServerError('src/app/profile/actions.ts:deleteMyAccountAction', error);
        return { success: false, message: error.message || 'Account deletion failed.' };
    }
}
