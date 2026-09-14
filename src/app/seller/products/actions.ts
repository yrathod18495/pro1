
'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import type { Product, ProductPreview } from '@/lib/types';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

const productTypes = [ "PC Character", "Green Screen Character", "Premium Background", "Hand Written Script", "Real Voice", "AutoDraft Character", "YouTube Thumbnail", "YouTube Story" ] as const;

const EditProductSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  price: z.coerce.number().min(0),
  productType: z.enum(productTypes),
  isOneTimePurchase: z.boolean().default(false),
  // Story Specs
  language: z.string().optional(),
  quality: z.string().optional(),
  videoSize: z.string().optional(),
  resolution: z.string().optional(),
  frameCount: z.string().optional(),
  targetAudience: z.string().optional(),
  emotionalTone: z.string().optional(),
  duration: z.string().optional(),
  isAiGenerated: z.boolean().optional(),
  soundFx: z.string().optional(),
  bgm: z.string().optional(),
});

export async function updateProductAction(
  productId: string,
  sellerId: string,
  newData: z.infer<typeof EditProductSchema>
): Promise<{ success: boolean; message: string; }> {
  const validation = EditProductSchema.safeParse(newData);
  if (!validation.success) {
    return { success: false, message: validation.error.flatten().formErrors.join(', ') };
  }

  const { firestore, database } = initializeFirebase();

  try {
    const productRef = firestore.collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new Error('Product not found.');
    }

    const originalData = productDoc.data() as Product;

    if (originalData.sellerId !== sellerId) {
      throw new Error("You do not have permission to edit this product.");
    }
    
    // Construct the data for RTDB pending queue
    const pendingProductData: Product = {
      ...originalData,
      ...validation.data,
      id: productId,
      status: 'pending_update',
      originalData: {
        title: originalData.title,
        description: originalData.description,
        price: originalData.price,
        productType: originalData.productType,
        isOneTimePurchase: originalData.isOneTimePurchase,
      },
    };
    
    // Atomically update RTDB
    const updates: { [key: string]: any } = {};
    updates[`/pendingProducts/${productId}`] = pendingProductData;
    updates[`/storeProducts/${productId}`] = null;
    await database.ref().update(updates);

    // Update status in Firestore to move it out of seller's 'approved' list
    await productRef.update({ status: 'pending_update', ...validation.data });

    await sendToTelegram(`✏️ *Product Edit for Approval*\n*Seller ID:* ${originalData.sellerId}\n*Product:* ${originalData.title}\n*New Category:* ${validation.data.productType}`);

    return { success: true, message: "Product updated and sent for re-approval!" };

  } catch (error: any) {
    reportServerError('src/app/seller/products/actions.ts#1', error);
    console.error("Error updating product:", error);
    return { success: false, message: error.message };
  }
}

export async function deleteProductAction(
  productId: string,
  sellerId: string,
): Promise<{ success: boolean; message: string; }> {
  const { firestore, database } = initializeFirebase();

  try {
    const productRef = firestore.collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      // It might have been deleted already. Let's proceed to clean up RTDB just in case.
      console.warn(`Product ${productId} not found in Firestore for deletion, but proceeding with cleanup.`);
    } else {
        const productData = productDoc.data() as Product;
        if (productData.sellerId !== sellerId) {
            throw new Error("You do not have permission to delete this product.");
        }
        await productRef.delete();
    }
    
    // Atomically remove from RTDB
    const updates: { [key: string]: any } = {};
    updates[`/storeProducts/${productId}`] = null;
    updates[`/pendingProducts/${productId}`] = null;
    await database.ref().update(updates);

    await sendToTelegram(`🗑️ *Product Deleted by Seller*\n*Seller ID:* ${sellerId}\n*Product ID:* ${productId}`);

    return { success: true, message: "Product deleted successfully." };

  } catch (error: any) {
    reportServerError('src/app/seller/products/actions.ts#2', error);
    console.error("Error deleting product:", error);
    const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
    await sendToTelegram(`🚨 *Product Deletion FAILED*\n*Seller ID:* ${sellerId}\n*Product ID:* ${productId}\n*Error:* ${mainErrorMessage}`);
    return { success: false, message: error.message };
  }
}

const UpdateProductMediaSchema = z.object({
  previews: z.array(z.object({
    type: z.enum(['image', 'video', 'audio']),
    url: z.string().url(),
  })),
});

export async function updateProductMediaAction(
  productId: string,
  sellerId: string,
  newData: z.infer<typeof UpdateProductMediaSchema>
): Promise<{ success: boolean; message: string; }> {
  const validation = UpdateProductMediaSchema.safeParse(newData);
  if (!validation.success) {
    return { success: false, message: validation.error.flatten().formErrors.join(', ') };
  }

  const { firestore, database } = initializeFirebase();

  try {
    const productRef = firestore.collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new Error('Product not found.');
    }

    const originalData = productDoc.data() as Product;
    
    if (originalData.sellerId !== sellerId) {
      throw new Error("You do not have permission to edit this product's media.");
    }
    
    const pendingProductData: Product = {
      ...originalData,
      previews: validation.data.previews,
      id: productId,
      status: 'pending_update',
      originalData: {
        ...originalData.originalData,
        previews: originalData.previews,
      },
    };
    
    const updates: { [key: string]: any } = {};
    updates[`/pendingProducts/${productId}`] = pendingProductData;
    updates[`/storeProducts/${productId}`] = null;
    await database.ref().update(updates);

    await productRef.update({ status: 'pending_update' });

    await sendToTelegram(`🖼️ *Product Media Edit for Approval*\n*Seller ID:* ${sellerId}\n*Product:* ${originalData.title}`);

    return { success: true, message: "Product media updated and sent for re-approval!" };

  } catch (error: any) {
    reportServerError('src/app/seller/products/actions.ts#3', error);
    console.error("Error updating product media:", error);
    return { success: false, message: error.message };
  }
}

export async function getSellerProductsAction(sellerId: string): Promise<{ success: boolean; data: Product[]; message: string }> {
  try {
    if (!sellerId) return { success: false, data: [], message: 'Seller ID is required' };
    const { firestore, database } = initializeFirebase();

    // 1. Fetch pending products from RTDB
    let pendingProducts: Product[] = [];
    try {
      const pendingSnap = await database.ref('pendingProducts').orderByChild('sellerId').equalTo(sellerId).once('value');
      const val = pendingSnap.val();
      if (val) {
        pendingProducts = Object.values(val) as Product[];
      }
    } catch (rtdbErr) {
    reportServerError('src/app/seller/products/actions.ts#4', rtdbErr);
      console.warn("RTDB pendingProducts query warning:", rtdbErr);
    }

    // 2. Fetch products from Firestore
    let firestoreProducts: Product[] = [];
    try {
      const snap = await firestore.collection('products').where('sellerId', '==', sellerId).get();
      snap.forEach((doc: any) => {
        firestoreProducts.push({ id: doc.id, ...doc.data() } as Product);
      });
    } catch (fsErr) {
    reportServerError('src/app/seller/products/actions.ts#5', fsErr);
      console.warn("Firestore products query warning:", fsErr);
    }

    // 3. Merge products by ID with priority to newer/pending data
    const combinedMap = new Map<string, Product>();
    firestoreProducts.forEach(p => combinedMap.set(p.id, p));
    pendingProducts.forEach(p => combinedMap.set(p.id, p));

    const combined = Array.from(combinedMap.values());
    combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return { success: true, data: combined, message: 'Products fetched successfully' };
  } catch (error: any) {
    reportServerError('src/app/seller/products/actions.ts#6', error);
    console.error("Failed to get seller products:", error);
    return { success: false, data: [], message: error.message || 'Failed to fetch products' };
  }
}

