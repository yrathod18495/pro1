
'use server';

import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { Product, StoreProduct } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { reportServerError } from '@/lib/report-error';

export async function adminDeleteProduct(productId: string): Promise<{ success: boolean; message: string }> {
  const { firestore, database } = initializeFirebase();

  try {
    const productRef = firestore.collection('products').doc(productId);
    await productRef.delete();

    const updates: { [key: string]: any } = {};
    updates[`/storeProducts/${productId}`] = null;
    updates[`/pendingProducts/${productId}`] = null; // Also clear from pending just in case
    await database.ref().update(updates);

    await sendToTelegram(`🗑️ *Product Deleted by Admin*\n*Product ID:* ${productId}`);
    return { success: true, message: "Product deleted successfully." };
  } catch (error: any) {
    reportServerError('src/app/store/admin-actions.ts#1', error);
    console.error("Admin error deleting product:", error);
    await sendToTelegram(`🚨 *ADMIN Product Deletion FAILED*\n*Product ID:* ${productId}\n*Error:* ${error.message}`);
    return { success: false, message: error.message };
  }
}

export async function adminCleanCorruptedProducts(): Promise<{ success: boolean; cleanedCount: number }> {
  const { database } = initializeFirebase();
  try {
    const snap = await database.ref('storeProducts').get();
    if (!snap.exists()) return { success: true, cleanedCount: 0 };
    const data = snap.val();
    const updates: { [key: string]: any } = {};
    let count = 0;
    for (const [id, val] of Object.entries(data)) {
      const product = val as any;
      if (!product || typeof product !== 'object' || !product.title || !product.productType) {
        updates[`/storeProducts/${id}`] = null;
        count++;
      }
    }
    if (count > 0) {
      await database.ref().update(updates);
    }
    return { success: true, cleanedCount: count };
  } catch (e: any) {
    reportServerError('src/app/store/admin-actions.ts#2', e);
    console.error("Error cleaning corrupted store products:", e);
    return { success: false, cleanedCount: 0 };
  }
}

export async function adminToggleSellerVerification(
  sellerId: string,
  currentStatus: boolean
): Promise<{ success: boolean; message: string }> {
  const { database } = initializeFirebase();
  try {
    const newStatus = !currentStatus;
    await database.ref(`sellerProfiles/${sellerId}/isVerified`).set(newStatus);
    
    await sendToTelegram(`💎 <b>Seller Verification Updated</b>\n<b>Seller ID:</b> <code>${sellerId}</code>\n<b>New Status:</b> ${newStatus ? 'VERIFIED' : 'UNVERIFIED'}`);
    
    return { success: true, message: `Seller verification ${newStatus ? 'enabled' : 'disabled'}.` };
  } catch (error: any) {
    reportServerError('src/app/store/admin-actions.ts#3', error);
    return { success: false, message: error.message };
  }
}

export async function adminUpdateProduct(
    productId: string,
    updateData: {
        title: string;
        description: string;
        price: number;
        originalPrice?: number;
        productType: string;
        previewImage?: string;
        previews?: { type: 'image' | 'video' | 'audio', url: string }[];
        downloadableFiles?: { fileName: string, url: string }[];
        fullScriptContent?: string;
        licenseType?: 'commercial_only' | 'standard';
        requiresYoutubeLink?: boolean;
        tieredPricing?: {
            singleChannel: number;
            multipleWorks: number;
            fullOwnership: number;
        };
        // Story Extended
        language?: string;
        quality?: string;
        videoSize?: string;
        resolution?: string;
        frameCount?: string;
        targetAudience?: string;
        emotionalTone?: string;
        duration?: string;
        isAiGenerated?: boolean;
        soundFx?: string;
        bgm?: string;
    }
): Promise<{ success: boolean; message: string }> {
    const { firestore, database } = initializeFirebase();

    try {
        const productRef = firestore.collection('products').doc(productId);
        const productDoc = await productRef.get();
        if (!productDoc.exists) throw new Error("Product not found in Firestore.");
        
        const existingData = productDoc.data() as Product;

        // 1. Update Previews Logic
        let updatedPreviews = updateData.previews || [...(existingData.previews || [])];
        
        // If previews not passed but previewImage was, update the first image preview
        if (!updateData.previews && updateData.previewImage) {
            const firstImgIdx = updatedPreviews.findIndex(p => p.type === 'image');
            if (firstImgIdx > -1) {
                updatedPreviews[firstImgIdx] = { ...updatedPreviews[firstImgIdx], url: updateData.previewImage };
            } else {
                updatedPreviews.unshift({ type: 'image', url: updateData.previewImage });
            }
        }

        const firestoreUpdates: any = {
            title: updateData.title,
            description: updateData.description,
            price: updateData.price,
            productType: updateData.productType,
            previews: updatedPreviews,
            licenseType: updateData.licenseType || 'standard',
            requiresYoutubeLink: !!updateData.requiresYoutubeLink,
            tieredPricing: updateData.tieredPricing || null,
            // Extended
            language: updateData.language || null,
            quality: updateData.quality || null,
            videoSize: updateData.videoSize || null,
            resolution: updateData.resolution || null,
            frameCount: updateData.frameCount || null,
            targetAudience: updateData.targetAudience || null,
            emotionalTone: updateData.emotionalTone || null,
            duration: updateData.duration || null,
            isAiGenerated: !!updateData.isAiGenerated,
            soundFx: updateData.soundFx || 'Included',
            bgm: updateData.bgm || 'Included',
        };

        if (updateData.originalPrice && updateData.originalPrice > 0) {
            firestoreUpdates.originalPrice = updateData.originalPrice;
        } else {
            firestoreUpdates.originalPrice = FieldValue.delete();
        }

        if (updateData.downloadableFiles) {
            firestoreUpdates.downloadableFiles = updateData.downloadableFiles;
        }

        if (updateData.fullScriptContent !== undefined) {
            firestoreUpdates.fullScriptContent = updateData.fullScriptContent;
            if (updateData.productType === 'Hand Written Script') {
                const totalChars = updateData.fullScriptContent.length;
                const previewCharCount = Math.floor(totalChars * 0.30);
                let cutOffIndex = updateData.fullScriptContent.lastIndexOf(' ', previewCharCount);
                if (cutOffIndex === -1 || cutOffIndex < 100) cutOffIndex = previewCharCount;
                const previewText = updateData.fullScriptContent.substring(0, cutOffIndex);
                const scriptPreview = previewText.split('\n');
                if (totalChars > cutOffIndex) scriptPreview.push('[LOCKED_LINE]');
                firestoreUpdates.scriptPreview = scriptPreview;
                firestoreUpdates.characterCount = totalChars;
            }
        }

        await productRef.update(firestoreUpdates);

        // 2. Update RTDB store listing (Sanitized version)
        const rtdbStoreRef = database.ref(`storeProducts/${productId}`);
        const rtdbUpdate: any = {
            title: updateData.title,
            description: updateData.description,
            price: updateData.price,
            productType: updateData.productType,
            previews: updatedPreviews,
            previewImage: updatedPreviews.find(p => p.type === 'image')?.url || '',
            scriptPreview: firestoreUpdates.scriptPreview || existingData.scriptPreview || null,
            characterCount: firestoreUpdates.characterCount || existingData.characterCount || null,
            licenseType: firestoreUpdates.licenseType,
            requiresYoutubeLink: firestoreUpdates.requiresYoutubeLink,
            tieredPricing: firestoreUpdates.tieredPricing,
            // Extended
            language: updateData.language || null,
            quality: updateData.quality || null,
            videoSize: updateData.videoSize || null,
            resolution: updateData.resolution || null,
            frameCount: updateData.frameCount || null,
            targetAudience: updateData.targetAudience || null,
            emotionalTone: updateData.emotionalTone || null,
            duration: updateData.duration || null,
            isAiGenerated: !!updateData.isAiGenerated,
            soundFx: firestoreUpdates.soundFx,
            bgm: firestoreUpdates.bgm,
        };

        if (updateData.originalPrice && updateData.originalPrice > 0) {
            rtdbUpdate.originalPrice = updateData.originalPrice;
        } else {
            rtdbUpdate.originalPrice = null;
        }

        await rtdbStoreRef.update(rtdbUpdate);

        await sendToTelegram(`✏️ *Product Edited by Admin*\n<b>ID:</b> <code>${productId}</code>\n<b>Title:</b> ${updateData.title}`);
        
        return { success: true, message: "Product updated successfully." };
    } catch (error: any) {
    reportServerError('src/app/store/admin-actions.ts#4', error);
        console.error("Admin update error:", error);
        return { success: false, message: error.message };
    }
}
