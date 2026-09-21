'use server';

import { initializeFirebase } from '@/firebase/server';
import type { Product, SellerProfile, StoreProduct } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import { FieldValue } from 'firebase-admin/firestore';
import { reportServerError } from '@/lib/report-error';

async function getSellerProfile(userId: string): Promise<SellerProfile | null> {
    const { database } = initializeFirebase();
    
    try {
        const snapshot = await database.ref(`sellerProfiles/${userId}`).get();
        if (snapshot.exists()) {
            return snapshot.val() as SellerProfile;
        }
    } catch (e) {
    reportServerError('src/app/admin/projects/actions.ts#1', e);
        console.error("Error reading sellerProfiles from RTDB:", e);
    }
    
    return null;
}

export async function approveProduct(
    productId: string,
    originalData: Product,
    updateData: {
        title: string;
        description: string;
        price: number;
        productType: Product['productType'];
        isOneTimePurchase: boolean;
    }
): Promise<{ success: boolean; message: string; }> {
    const { firestore, database } = initializeFirebase();
    
    try {
        const approvedProductRef = firestore.collection('products').doc(productId);

        const sellerProfile = await getSellerProfile(originalData.sellerId);
        if (!sellerProfile) {
            throw new Error(`Seller profile for sellerId ${originalData.sellerId} not found.`);
        }
        
        const approvedProductData: Product = {
            ...originalData,
            ...updateData,
            status: 'approved',
            sellerName: sellerProfile.storeName,
        };
        // Remove originalData if it exists from a previous pending_update
        delete approvedProductData.originalData;


        const previewImage = approvedProductData.previews?.find(p => p.type === 'image')?.url || '';
        
        // SANITIZED DATA FOR PUBLIC RTDB
        // downloadableFiles AND fullScriptContent are STRICTLY excluded here.
        const storeProductData: StoreProduct = {
            id: productId,
            title: approvedProductData.title,
            description: approvedProductData.description,
            price: approvedProductData.price,
            productType: approvedProductData.productType,
            sellerId: approvedProductData.sellerId,
            sellerName: sellerProfile.storeName,
            previewImage: previewImage,
            previews: approvedProductData.previews || [],
            createdAt: approvedProductData.createdAt,
            likes: approvedProductData.likes || 0,
            isOneTimePurchase: approvedProductData.isOneTimePurchase || false,
            // Script specific public fields (30% teaser)
            scriptPreview: approvedProductData.scriptPreview ?? null,
            scriptPreviewUrl: approvedProductData.scriptPreviewUrl ?? null,
            characterCount: approvedProductData.characterCount ?? null,
            // Story specific public fields
            duration: approvedProductData.duration ?? null,
            isAiGenerated: approvedProductData.isAiGenerated ?? null,
            language: approvedProductData.language ?? null,
            quality: approvedProductData.quality ?? null,
            videoSize: approvedProductData.videoSize ?? null,
            resolution: approvedProductData.resolution ?? null,
            frameCount: approvedProductData.frameCount ?? null,
            targetAudience: approvedProductData.targetAudience ?? null,
            emotionalTone: approvedProductData.emotionalTone ?? null,
            soundFx: approvedProductData.soundFx ?? null,
            bgm: approvedProductData.bgm ?? null,
            licenseType: approvedProductData.licenseType ?? null,
            requiresYoutubeLink: approvedProductData.requiresYoutubeLink ?? null,
            tieredPricing: approvedProductData.tieredPricing ?? null,
        };

        // --- Firestore Transaction ---
        const batch = firestore.batch();
        batch.set(approvedProductRef, approvedProductData);

        const notificationRef = firestore.collection('users').doc(originalData.sellerId).collection('notifications').doc('user_notifications');
        const notificationMessage = `Congratulations! Your product "${updateData.title}" has been approved and is now live on the store.`;
        const notificationData = {
            id: `prod-approve-${productId}-${Date.now()}`,
            message: notificationMessage,
            timestamp: new Date().toISOString(),
            read: false,
            type: 'system' as const,
        };
        batch.set(notificationRef, { entries: FieldValue.arrayUnion(notificationData) }, { merge: true });

        await batch.commit();

        // --- RTDB Updates (after successful Firestore commit) ---
        const updates: { [key: string]: any } = {};
        updates[`/storeProducts/${productId}`] = storeProductData;
        updates[`/pendingProducts/${productId}`] = null;
        await database.ref().update(updates);
        
        await sendToTelegram(`✅ *Product Approved*\n<b>Title:</b> ${updateData.title}\n<b>Seller:</b> ${sellerProfile.storeName}`);
        
        return { success: true, message: 'Product approved successfully!' };

    } catch (error: any) {
    reportServerError('src/app/admin/projects/actions.ts#2', error);
        console.error("Error approving product:", error);
        const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
        await sendToTelegram(`🚨 *Product Approval FAILED*\n<b>Product ID:</b> ${productId}\n<b>Error:</b> ${mainErrorMessage}`);
        return { success: false, message: error.message };
    }
}

export async function rejectProduct(productId: string, productData: Product, reason: string): Promise<{ success: boolean; message: string; }> {
     const { firestore, database } = initializeFirebase();
    const productRef = firestore.collection('products').doc(productId);

    try {
        await database.ref(`pendingProducts/${productId}`).remove();

        const sellerProfile = await getSellerProfile(productData.sellerId);
        const sellerName = sellerProfile?.storeName || productData.sellerName || 'Unknown Seller';

        const notificationRef = firestore.collection('users').doc(productData.sellerId).collection('notifications').doc('user_notifications');
        let notificationMessage = '';
        
        // Check if this was a rejection of an update
        if (productData.status === 'pending_update' && productData.originalData) {
            const restoredData: Product = {
                ...productData,
                title: productData.originalData.title || productData.title,
                description: productData.originalData.description || productData.description,
                price: productData.originalData.price ?? productData.price,
                status: 'approved',
                rejectionReason: `Update Rejected: ${reason}`,
                sellerName: sellerName,
            };
            delete restoredData.originalData;

            await productRef.set(restoredData);
            
            const previewImage = restoredData.previews?.find(p => p.type === 'image')?.url || '';

            const storeProductData: StoreProduct = {
                id: productId,
                title: restoredData.title,
                description: restoredData.description,
                price: restoredData.price,
                productType: restoredData.productType,
                sellerId: restoredData.sellerId,
                sellerName: restoredData.sellerName,
                previewImage: previewImage,
                previews: restoredData.previews || [],
                createdAt: restoredData.createdAt,
                likes: restoredData.likes || 0,
                isOneTimePurchase: restoredData.isOneTimePurchase || false,
                scriptPreview: restoredData.scriptPreview ?? null,
                scriptPreviewUrl: restoredData.scriptPreviewUrl ?? null,
                characterCount: restoredData.characterCount ?? null,
                duration: restoredData.duration ?? null,
                isAiGenerated: restoredData.isAiGenerated ?? null,
                language: restoredData.language ?? null,
                quality: restoredData.quality ?? null,
                videoSize: restoredData.videoSize ?? null,
                resolution: restoredData.resolution ?? null,
                frameCount: restoredData.frameCount ?? null,
                targetAudience: restoredData.targetAudience ?? null,
                emotionalTone: restoredData.emotionalTone ?? null,
                soundFx: restoredData.soundFx ?? null,
                bgm: restoredData.bgm ?? null,
                licenseType: restoredData.licenseType ?? null,
                requiresYoutubeLink: restoredData.requiresYoutubeLink ?? null,
                tieredPricing: restoredData.tieredPricing ?? null,
            };
            await database.ref(`storeProducts/${productId}`).set(storeProductData);
            
            notificationMessage = `Your update for "${productData.title}" was rejected. Reason: ${reason}`;
            const notificationData = { id: `prod-reject-update-${productId}-${Date.now()}`, message: notificationMessage, timestamp: new Date().toISOString(), read: false, type: 'system' as const };
            await notificationRef.set({ entries: FieldValue.arrayUnion(notificationData) }, { merge: true });

            await sendToTelegram(`❌ *Product Update Rejected*\n<b>Title:</b> ${productData.title}\n<b>Seller:</b> ${sellerName}\n<b>Reason:</b> ${reason}`);
            return { success: true, message: 'Product update rejected. Original version restored.' };

        } else {
            await productRef.set({ ...productData, status: 'rejected', rejectionReason: reason, sellerName: sellerName });
            
            notificationMessage = `Your product submission "${productData.title}" was rejected. Reason: ${reason}`;
            const notificationData = { id: `prod-reject-${productId}-${Date.now()}`, message: notificationMessage, timestamp: new Date().toISOString(), read: false, type: 'system' as const };
            await notificationRef.set({ entries: FieldValue.arrayUnion(notificationData) }, { merge: true });

            await sendToTelegram(`❌ *Product Rejected*\n<b>Title:</b> ${productData.title}\n<b>Seller:</b> ${sellerName}\n<b>Reason:</b> ${reason}`);
            return { success: true, message: 'Product rejected successfully!' };
        }
    } catch (error: any) {
    reportServerError('src/app/admin/projects/actions.ts#3', error);
        console.error("Error rejecting product:", error);
         const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
         const errorMessage = `🚨 **Action Error: rejectProduct**
**Input:** \`\`\`json
${JSON.stringify({ productId, reason }, null, 2)}
\`\`\`
**Error:**
<pre>${mainErrorMessage}</pre>`;
        await sendToTelegram(errorMessage);
        return { success: false, message: error.message };
    }
}

export async function getProductsByStatus(status: 'rejected' | 'sold' | 'approved'): Promise<{ success: boolean; products?: Product[]; message: string; }> {
    const { firestore } = initializeFirebase();
    try {
        const productsRef = firestore.collection('products');
        const q = productsRef.where('status', '==', status);
        const snapshot = await q.get();

        if (snapshot.empty) {
            return { success: true, products: [], message: 'No products found.' };
        }

        const products = snapshot.docs.map((doc: any) => {
            const data = doc.data();
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
            return {
                ...data,
                id: doc.id,
                createdAt,
            } as Product;
        });
        
        return { success: true, products, message: 'Products fetched successfully.' };

    } catch (error: any) {
    reportServerError('src/app/admin/projects/actions.ts#4', error);
        console.error(`Error fetching ${status} products:`, error);
        return { success: false, products: [], message: `Failed to fetch ${status} products.` };
    }
}

export async function getCompleteProduct(productId: string): Promise<{ success: boolean; product?: Product; message: string; }> {
    const { firestore } = initializeFirebase();
    try {
        const productDoc = await firestore.collection('products').doc(productId).get();
        if (!productDoc.exists) {
            return { success: false, message: 'Product not found in Firestore.' };
        }
        const data = productDoc.data()!;
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
        const product: Product = {
            ...data,
            id: productDoc.id,
            createdAt,
        } as Product;
        return { success: true, product, message: 'Product fetched.' };
    } catch (error: any) {
    reportServerError('src/app/admin/projects/actions.ts#5', error);
         console.error(`Error fetching complete product for ID ${productId}:`, error);
        return { success: false, message: error.message || `Failed to fetch product.` };
    }
}
