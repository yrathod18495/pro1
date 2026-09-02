
'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import type { Product, ProductPreview } from '@/lib/types';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

/**
 * 🛰️ PROTOCOL VALIDATOR
 */
const AssetProtocolSchema = z.string().refine(val => 
    val.startsWith('pub://') || 
    val.startsWith('gcs://') || 
    val.startsWith('tg://') || 
    val.startsWith('http'),
    "Invalid asset node protocol. Expected pub://, gcs://, or tg://"
);

const AddProductInputSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  price: z.coerce.number().min(0),
  thumbnailUrl: AssetProtocolSchema,
  additionalImageUrls: z.array(z.string()),
  downloadableFiles: z.array(z.object({ 
      fileName: z.string(), 
      url: AssetProtocolSchema 
  })),
});

export async function addProductAction(
    input: z.infer<typeof AddProductInputSchema>,
    userId: string,
    sellerName: string,
): Promise<{ success: boolean; message: string; }> {
  
  const validation = AddProductInputSchema.safeParse(input);
  if (!validation.success) {
      const errorMessage = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errorMessage).flat()[0] || "Schema Validation Failed";
      return { success: false, message: firstError };
  }
  
  const { database, firestore } = initializeFirebase();
  const { thumbnailUrl, additionalImageUrls, downloadableFiles, ...productData } = validation.data;

  try {
    const allPreviews: ProductPreview[] = [];
    allPreviews.push({ type: 'image', url: thumbnailUrl });
    allPreviews.push(...additionalImageUrls.map(url => ({ type: 'image' as const, url })));

    const productId = firestore.collection('products').doc().id;
    
    const firestoreProductData: Omit<Product, 'id'> = {
        ...productData,
        productType: "PC Character", 
        isOneTimePurchase: false, 
        sellerId: userId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        previews: allPreviews,
        downloadableFiles: downloadableFiles,
        likes: 0,
        sellerName: sellerName,
    };
    
    await database.ref(`pendingProducts/${productId}`).set({ ...firestoreProductData, id: productId });
    
    await sendToTelegram(`🔔 <b>New Product for Approval</b>\n<b>Seller:</b> ${sellerName}\n<b>Product:</b> ${productData.title}`);

    return { success: true, message: "Product and Asset submitted successfully!" };

  } catch (error: any) {
    reportServerError('src/app/seller/add-product/actions.ts#1', error);
    console.error("Error submitting product:", error);
    const mainErrorMessage = (error.message || 'Unknown server error').split('\n')[0];
    
    // 🛰️ DETAILED ERROR LOGGING TO TELEGRAM
    await sendToTelegram(`🚨 <b>Product Submission FAILED</b>\n<b>Seller:</b> ${sellerName}\n<b>Product:</b> ${productData.title}\n<b>Error:</b> <pre>${escapeHtml(error.message)}</pre>`);
    
    return { success: false, message: mainErrorMessage };
  }
}
