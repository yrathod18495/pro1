'use server';

import { initializeFirebase } from '@/firebase/server';
import type { Order, Product, SellerProfile } from '@/lib/types';
import { reportServerError } from '@/lib/report-error';

export interface SoldProductEntry extends Order {
  sellerName: string;
  productTitle: string;
}

export async function getSoldProductsList(): Promise<{ success: boolean; data?: SoldProductEntry[]; message: string }> {
  try {
    const { firestore, database } = initializeFirebase();

    // 1. Fetch all paid orders from storeHistory (these are actual asset sales)
    const ordersSnapshot = await firestore
      .collection('storeHistory')
      .where('status', '==', 'paid')
      .orderBy('createdAt', 'desc')
      .get();

    if (ordersSnapshot.empty) {
      return { success: true, data: [], message: 'No sold products found.' };
    }

    const orders = ordersSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Order));

    // 2. Fetch necessary metadata (Seller names and Product titles)
    const sellerIds = [...new Set(orders.map((o: any) => o.sellerId as string))] as string[];
    const productIds = [...new Set(orders.map((o: any) => o.productId as string))];

    // Fetch Seller Profiles from RTDB
    const sellerProfiles: Record<string, string> = {};
    await Promise.all(sellerIds.map(async (sid: string) => {
        const snap = await database.ref(`sellerProfiles/${sid}/storeName`).get();
        sellerProfiles[sid] = snap.val() || 'Unknown Seller';
    }));

    // Fetch Product Titles from Firestore
    const productTitles: Record<string, string> = {};
    if (productIds.length > 0) {
        const productChunks = [];
        for (let i = 0; i < productIds.length; i += 10) {
            productChunks.push(productIds.slice(i, i + 10));
        }

        for (const chunk of productChunks) {
            const snap = await firestore.collection('products').where('__name__', 'in', chunk).get();
            snap.forEach((doc: any) => {
                productTitles[doc.id] = (doc.data() as Product).title;
            });
        }
    }

    // 3. Map everything into a clean entry list
    const soldProducts: SoldProductEntry[] = orders.map((order: any) => ({
        ...order,
        sellerName: sellerProfiles[order.sellerId] || 'Unknown Seller',
        productTitle: productTitles[order.productId] || order.productTitle || 'Archive Product',
    }));

    return {
      success: true,
      message: 'Sold products retrieved.',
      data: soldProducts,
    };
  } catch (error: any) {
    reportServerError('src/app/admin/sold-products/actions.ts#1', error);
    console.error('Failed to fetch sold products:', error);
    return { success: false, message: error.message || 'Server node error.' };
  }
}
