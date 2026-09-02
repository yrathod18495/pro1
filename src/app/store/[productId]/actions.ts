'use server';

import { initializeFirebase } from '@/firebase/server';
import type { Product, SellerProfile, DownloadableFile, StoreProduct } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import { z } from 'zod';
import { reportServerError } from '@/lib/report-error';

/**
 * Increments the view count for a product.
 * Optimized: ONLY updates Realtime Database to save Firestore read/write costs.
 * Safety: Checks existence first to prevent creating ghost/blank entries.
 */
export async function incrementProductView(productId: string): Promise<void> {
    if (!productId) return;
    const { database } = initializeFirebase();
    try {
        const storeSnap = await database.ref(`storeProducts/${productId}`).get();
        if (!storeSnap.exists() || !storeSnap.val()?.title) {
            // Product is not live in store or is a corrupted entry - do NOT create ghost node
            return;
        }
        const rtdbRef = database.ref(`storeProducts/${productId}/views`);
        await rtdbRef.transaction((current: any) => (current || 0) + 1);
    } catch (e) {
    reportServerError('src/app/store/[productId]/actions.ts#1', e);
        console.error("Failed to increment view in RTDB:", e);
    }
}

/**
 * Fetches product details with high-reliability.
 * Now unified for both Admins and Users to show RTDB data first.
 */
export async function getProductDetails(productId: string, userId?: string): Promise<{ product: StoreProduct | null, seller: SellerProfile | null }> {
    const { firestore, database } = initializeFirebase();
    
    try {
        let rawProductData: any = null;

        // 1. Try Live Store (RTDB) - The primary source for display (verify valid product with title)
        const storeSnap = await database.ref(`storeProducts/${productId}`).get();
        if (storeSnap.exists() && storeSnap.val()?.title) {
            rawProductData = storeSnap.val();
            // Merge with Firestore data to ensure all newly introduced specs/story fields 
            // are populated for older approved products.
            if (rawProductData && rawProductData.productType === "YouTube Story") {
                try {
                    const productDoc = await firestore.collection('products').doc(productId).get();
                    if (productDoc.exists) {
                        const dbData = productDoc.data() || {};
                        const merged: any = { ...dbData, ...rawProductData };
                        const fieldsToRestore = [
                            'language', 'quality', 'videoSize', 'resolution', 'frameCount',
                            'targetAudience', 'emotionalTone', 'soundFx', 'bgm', 'duration',
                            'isAiGenerated', 'licenseType', 'requiresYoutubeLink', 'tieredPricing'
                        ];
                        for (const key of fieldsToRestore) {
                            if (
                                (merged[key] === undefined || merged[key] === null || merged[key] === '') &&
                                (dbData[key] !== undefined && dbData[key] !== null && dbData[key] !== '')
                            ) {
                                merged[key] = dbData[key];
                            }
                        }
                        rawProductData = merged;
                    }
                } catch (err) {
    reportServerError('src/app/store/[productId]/actions.ts#2', err);
                    console.error("Non-critical Firestore backup merge failure:", err);
                }
            }
        } else {
            // If storeSnap existed but had no title, it's a corrupted ghost node -> remove it!
            if (storeSnap.exists() && !storeSnap.val()?.title) {
                await database.ref(`storeProducts/${productId}`).remove().catch(() => null);
            }

            // 2. Try Firestore Backup (For Sold/Private Items or Missing RTDB)
            const productDoc = await firestore.collection('products').doc(productId).get();
            if (productDoc.exists) {
                rawProductData = { id: productDoc.id, ...productDoc.data() };
            }
        }

        if (!rawProductData || !rawProductData.title) return { product: null, seller: null };

        // Get seller profile from RTDB for accurate storeName fallback
        const sellerRef = database.ref(`sellerProfiles/${rawProductData.sellerId}`);
        const sellerSnapshot = await sellerRef.get();
        const seller = sellerSnapshot.exists() ? sellerSnapshot.val() as SellerProfile : null;

        // Sanitize Previews (Ensure Array)
        let previews = rawProductData.previews || [];
        if (previews && !Array.isArray(previews)) {
            previews = Object.values(previews);
        }
        
        const sanitizedProduct: StoreProduct = {
            id: rawProductData.id || productId,
            title: rawProductData.title,
            description: rawProductData.description,
            price: rawProductData.price,
            originalPrice: rawProductData.originalPrice,
            sellerId: rawProductData.sellerId,
            sellerName: rawProductData.sellerName || seller?.storeName || 'Unknown Seller',
            productType: rawProductData.productType,
            createdAt: rawProductData.createdAt,
            likes: rawProductData.likes || 0,
            views: rawProductData.views || 0,
            isOneTimePurchase: rawProductData.isOneTimePurchase,
            status: rawProductData.status,
            scriptPreview: rawProductData.scriptPreview || null,
            scriptPreviewUrl: rawProductData.scriptPreviewUrl || null,
            characterCount: rawProductData.characterCount || null,
            duration: rawProductData.duration,
            isAiGenerated: rawProductData.isAiGenerated,
            previewImage: previews.find((p: any) => p.type === 'image')?.url || rawProductData.previewImage || '',
            previews: previews,
            licenseType: rawProductData.licenseType,
            requiresYoutubeLink: rawProductData.requiresYoutubeLink,
            tieredPricing: rawProductData.tieredPricing,
            language: rawProductData.language,
            quality: rawProductData.quality,
            videoSize: rawProductData.videoSize,
            resolution: rawProductData.resolution,
            frameCount: rawProductData.frameCount,
            targetAudience: rawProductData.targetAudience,
            emotionalTone: rawProductData.emotionalTone,
            soundFx: rawProductData.soundFx,
            bgm: rawProductData.bgm,
        };
        
        return { product: sanitizedProduct, seller };

    } catch (error: any) {
    reportServerError('src/app/store/[productId]/actions.ts#3', error);
        console.error(`[ProductResolver] Error for ${productId}:`, error.message);
        return { product: null, seller: null };
    }
}

/**
 * Fetches all approved products for a specific seller.
 */
export async function getSellerProducts(sellerId: string): Promise<{ success: boolean; products: StoreProduct[] }> {
    const { firestore } = initializeFirebase();
    try {
        const snapshot = await firestore.collection('products')
            .where('sellerId', '==', sellerId)
            .where('status', 'in', ['approved', 'sold', 'pending_update'])
            .get();
            
        const products = snapshot.docs.map((doc: any) => {
            const data = doc.data();
            let previews = data.previews || [];
            if (previews && !Array.isArray(previews)) previews = Object.values(previews);

            return {
                id: doc.id,
                title: data.title,
                description: data.description,
                price: data.price,
                originalPrice: data.originalPrice,
                sellerId: data.sellerId,
                sellerName: data.sellerName,
                productType: data.productType,
                createdAt: data.createdAt,
                likes: data.likes || 0,
                views: data.views || 0,
                isOneTimePurchase: data.isOneTimePurchase,
                previewImage: previews.find((p: any) => p.type === 'image')?.url || '',
                previews: previews,
                status: data.status,
                scriptPreviewUrl: data.scriptPreviewUrl || null,
            } as StoreProduct;
        });
        
        return { success: true, products };
    } catch (e) {
    reportServerError('src/app/store/[productId]/actions.ts#4', e);
        console.error("Failed to fetch seller products:", e);
        return { success: false, products: [] };
    }
}

export async function checkIfUserLiked(productId: string, userId: string): Promise<boolean> {
    if (!userId) return false;
    try {
        const { database } = initializeFirebase();
        const likeRef = database.ref(`productLikes/${productId}/${userId}`);
        const snapshot = await likeRef.get();
        return snapshot.exists();
    } catch (error: any) {
    reportServerError('src/app/store/[productId]/actions.ts#5', error);
        console.error(`Failed to check like status for product ${productId}:`, error);
        return false;
    }
}

export async function toggleLikeProduct(productId: string, userId: string): Promise<{ success: boolean; newLikeCount?: number; error?: string }> {
    if (!userId) {
        return { success: false, error: 'User must be logged in.' };
    }

    const { firestore, database } = initializeFirebase();
    const likeRef = database.ref(`productLikes/${productId}/${userId}`);
    const storeProductLikesRef = database.ref(`storeProducts/${productId}/likes`);
    const firestoreProductRef = firestore.collection('products').doc(productId);

    try {
        const snapshot = await likeRef.get();
        let newLikeCount = 0;
        const isCurrentlyLiked = snapshot.exists();

        const storeProductSnap = await database.ref(`storeProducts/${productId}`).get();
        const productExistsInStore = storeProductSnap.exists() && storeProductSnap.val()?.title;

        if (isCurrentlyLiked) {
            await likeRef.remove();
            if (productExistsInStore) {
                const transactionResult = await storeProductLikesRef.transaction((c: any) => Math.max(0, (c || 1) - 1));
                newLikeCount = transactionResult.snapshot.val() || 0;
            }
            await firestoreProductRef.update({ likes: FieldValue.increment(-1) }).catch(() => null);
        } else {
            await likeRef.set(true);
            if (productExistsInStore) {
                const transactionResult = await storeProductLikesRef.transaction((c: any) => (c || 0) + 1);
                newLikeCount = transactionResult.snapshot.val() || 0;
            }
            await firestoreProductRef.update({ likes: FieldValue.increment(1) }).catch(() => null);
        }
        
        revalidatePath(`/store/${productId}`);
        return { success: true, newLikeCount };

    } catch (error: any) {
    reportServerError('src/app/store/[productId]/actions.ts#6', error);
        return { success: false, error: error.message };
    }
}

export async function getSecureDownloadUrls(
  productId: string,
  userId: string
): Promise<{ success: boolean; files?: DownloadableFile[]; fullScriptContent?: string; message: string }> {
  if (!userId) return { success: false, message: 'User not authenticated.' };

  const { firestore } = initializeFirebase();
  try {
    const purchaseQuery = firestore
      .collection('storeHistory')
      .where('userId', '==', userId)
      .where('productId', '==', productId)
      .where('status', '==', 'paid'); 

    const purchaseSnapshot = await purchaseQuery.get();
    if (purchaseSnapshot.empty) return { success: false, message: "No purchase found." };

    const productDoc = await firestore.collection('products').doc(productId).get();
    if (!productDoc.exists) return { success: false, message: 'Product not found.' };

    const productData = productDoc.data() as Product;
    
    return { 
        success: true, 
        files: productData.downloadableFiles || [], 
        fullScriptContent: productData.fullScriptContent || undefined,
        message: 'Authorization granted.' 
    };

  } catch (error: any) {
    reportServerError('src/app/store/[productId]/actions.ts#7', error);
    return { success: false, message: 'Security sync error.' };
  }
}

export async function checkPurchaseStatus(
  productId: string,
  userId: string
): Promise<boolean> {
  if (!userId) return false;
  const { firestore } = initializeFirebase();
  try {
    const purchaseQuery = firestore
      .collection('storeHistory')
      .where('userId', '==', userId)
      .where('productId', '==', productId)
      .where('status', '==', 'paid');
    const purchaseSnapshot = await purchaseQuery.get();
    return !purchaseSnapshot.empty;
  } catch (error) {
    reportServerError('src/app/store/[productId]/actions.ts#8', error);
    return false;
  }
}

const ReportSchema = z.object({
  productId: z.string(),
  productTitle: z.string(),
  sellerId: z.string(),
  reporterId: z.string(),
  reporterEmail: z.string(),
  reason: z.string().min(1, 'A reason is required.'),
  comment: z.string().max(1000).optional(),
});

export async function submitProductReport(input: z.infer<typeof ReportSchema>): Promise<{ success: boolean; message: string }> {
  const validation = ReportSchema.safeParse(input);
  if (!validation.success) return { success: false, message: 'Invalid data.' };
  const { firestore } = initializeFirebase();
  try {
      const reportRef = firestore.collection('reports').doc();
      await reportRef.set({ ...validation.data, createdAt: new Date().toISOString(), status: 'pending' });
      return { success: true, message: "Report submitted." };
  } catch (error: any) {
    reportServerError('src/app/store/[productId]/actions.ts#9', error);
      return { success: false, message: error.message };
  }
}
