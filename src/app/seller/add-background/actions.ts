'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import type { Product, ProductPreview } from '@/lib/types';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

const AssetProtocolSchema = z.string().refine(val => 
    val.startsWith('pub://') || 
    val.startsWith('gcs://') || 
    val.startsWith('tg://') || 
    val.startsWith('http'),
    "Invalid asset node protocol."
);

const AddBackgroundInputSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  price: z.coerce.number().min(0),
  thumbnailUrl: AssetProtocolSchema,
  masterAssetUrl: AssetProtocolSchema,
  assetFileName: z.string(),
});

export async function addBackgroundAction(
    input: z.infer<typeof AddBackgroundInputSchema>,
    userId: string,
    sellerName: string,
): Promise<{ success: boolean; message: string; }> {
  
  const validation = AddBackgroundInputSchema.safeParse(input);
  if (!validation.success) {
      return { success: false, message: validation.error.flatten().formErrors.join(', ') || "Invalid data format" };
  }
  
  const { database, firestore } = initializeFirebase();
  const { thumbnailUrl, masterAssetUrl, assetFileName, ...productData } = validation.data;

  try {
    const allPreviews: ProductPreview[] = [{ type: 'image', url: thumbnailUrl }];

    const productId = firestore.collection('products').doc().id;
    
    const firestoreProductData: Omit<Product, 'id'> = {
        ...productData,
        productType: "Premium Background", 
        isOneTimePurchase: false, 
        sellerId: userId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        previews: allPreviews,
        downloadableFiles: [{ fileName: assetFileName, url: masterAssetUrl }],
        likes: 0,
        sellerName: sellerName,
    };
    
    await database.ref(`pendingProducts/${productId}`).set({ ...firestoreProductData, id: productId });
    
    await sendToTelegram(`🌄 <b>New Background for Approval</b>\n<b>Seller:</b> ${sellerName}\n<b>Product:</b> ${productData.title}`);

    return { success: true, message: "Background submitted successfully!" };

  } catch (error: any) {
    reportServerError('src/app/seller/add-background/actions.ts#1', error);
    console.error("Error submitting background:", error);
    return { success: false, message: error.message };
  }
}
