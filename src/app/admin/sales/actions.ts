
'use server';

import { initializeFirebase } from '@/firebase/server';
import type { Order, SellerProfile, Product } from '@/lib/types';
import type { WithdrawalRequest } from '@/app/admin/withdrawals/actions';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';
import { requireAdmin } from '@/lib/auth-guard';


export interface SellerSummary {
  id: string;
  storeName: string;
  description: string;
  profileImageUrl: string;
  mobileNumber?: string;
  secondaryEmail?: string;
  totalEarnings: number;
  totalWithdrawn: number;
  withdrawableAmount: number;
  totalSales: number;
  liveProducts: number;
  pendingWithdrawalAmount: number;
  hasPendingWithdrawal: boolean;
  payoutDetails?: SellerProfile['payoutDetails'];
  pendingRequestId?: string;
}

export async function getSellersList(idToken: string): Promise<{ success: boolean; data?: SellerSummary[]; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  try {
    const { firestore, database } = initializeFirebase();

    // 1. Fetch all seller profiles from RTDB
    const sellersSnapshot = await database.ref('sellerProfiles').get();
    const sellersMap: { [id: string]: SellerProfile } = sellersSnapshot.val() || {};

    // 2. Fetch all approved products to count live items per seller
    const productsSnapshot = await firestore
      .collection('products')
      .where('status', '==', 'approved')
      .get();
    
    const productCounts: { [id: string]: number } = {};
    productsSnapshot.forEach((doc: any) => {
        const data = doc.data() as Product;
        productCounts[data.sellerId] = (productCounts[data.sellerId] || 0) + 1;
    });

    // 3. Fetch all paid orders to calculate earnings (Gross)
    const ordersSnapshot = await firestore
      .collection('storeHistory')
      .where('status', '==', 'paid')
      .get();

    const earningsMap: { [id: string]: { amount: number, count: number } } = {};
    // Fee policy: Deduction happens at withdrawal. Display 100% in earnings.

    ordersSnapshot.forEach((doc: any) => {
        const order = doc.data() as Order;
        if (!earningsMap[order.sellerId]) {
            earningsMap[order.sellerId] = { amount: 0, count: 0 };
        }
        earningsMap[order.sellerId].amount += (order.amount / 100);
        earningsMap[order.sellerId].count += 1;
    });

    // 4. Fetch all withdrawal requests
    const withdrawalsSnapshot = await firestore.collection('withdrawalRequests').get();
    const withdrawalStats: { [id: string]: { completed: number, pending: number, pendingId?: string } } = {};

    withdrawalsSnapshot.forEach((doc: any) => {
        const req = doc.data() as WithdrawalRequest;
        const sid = req.sellerId;
        const amount = req.withdrawableAmount || 0;
        
        if (!withdrawalStats[sid]) {
            withdrawalStats[sid] = { completed: 0, pending: 0 };
        }

        if (req.status === 'completed') {
            withdrawalStats[sid].completed += amount;
        } else if (req.status === 'pending') {
            withdrawalStats[sid].pending += amount;
            withdrawalStats[sid].pendingId = doc.id;
        }
    });

    // 5. Combine into final list
    const sellersList: SellerSummary[] = Object.entries(sellersMap).map(([id, profile]) => {
        const totalGrossEarned = earningsMap[id]?.amount || 0;
        const stats = withdrawalStats[id] || { completed: 0, pending: 0 };

        return {
            id,
            storeName: profile.storeName || id,
            description: profile.description || '',
            profileImageUrl: profile.profileImageUrl || '',
            mobileNumber: profile.mobileNumber,
            secondaryEmail: profile.secondaryEmail,
            payoutDetails: profile.payoutDetails,
            totalEarnings: totalGrossEarned,
            totalWithdrawn: stats.completed,
            pendingWithdrawalAmount: stats.pending,
            hasPendingWithdrawal: stats.pending > 0,
            pendingRequestId: stats.pendingId,
            withdrawableAmount: Math.max(0, totalGrossEarned - stats.completed - stats.pending),
            totalSales: earningsMap[id]?.count || 0,
            liveProducts: productCounts[id] || 0,
        };
    });

    sellersList.sort((a, b) => b.totalEarnings - a.totalEarnings);

    return {
      success: true,
      message: 'Sellers list fetched successfully.',
      data: sellersList,
    };
  } catch (error: any) {
    reportServerError('src/app/admin/sales/actions.ts#1', error);
    console.error('Failed to fetch sellers list:', error);
    return { success: false, message: error.message || 'An unknown server error occurred.' };
  }
}

export async function getSellerProducts(idToken: string, sellerId: string): Promise<{ success: boolean; products?: Product[]; message: string; }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  try {
    const { firestore } = initializeFirebase();
    const snapshot = await firestore
      .collection('products')
      .where('sellerId', '==', sellerId)
      .get();

    const products: Product[] = [];
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
      
      // Normalize arrays from potential objects (RTDB mapping)
      const p = {
        ...data,
        id: doc.id,
        createdAt,
      } as Product;
      
      if (p.previews && !Array.isArray(p.previews)) p.previews = Object.values(p.previews);
      if (p.downloadableFiles && !Array.isArray(p.downloadableFiles)) p.downloadableFiles = Object.values(p.downloadableFiles);
      if (p.scriptPreview && !Array.isArray(p.scriptPreview)) p.scriptPreview = Object.values(p.scriptPreview);
      
      products.push(p);
    });

    // Sort by creation date descending
    products.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return {
      success: true,
      products,
      message: 'Seller products fetched successfully.',
    };
  } catch (error: any) {
    reportServerError('src/app/admin/sales/actions.ts#2', error);
    console.error('Failed to fetch seller products:', error);
    return { success: false, message: error.message || 'Failed to fetch seller products.' };
  }
}

export async function deleteProductAdminAction(idToken: string, productId: string): Promise<{ success: boolean; message: string; }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  const { firestore, database } = initializeFirebase();

  try {
    const productRef = firestore.collection('products').doc(productId);
    const productDoc = await productRef.get();
    let title = productId;

    if (productDoc.exists) {
      const data = productDoc.data();
      title = data?.title || productId;
      await productRef.delete();
    }
    
    // Atomically remove from RTDB
    const updates: { [key: string]: any } = {};
    updates[`/storeProducts/${productId}`] = null;
    updates[`/pendingProducts/${productId}`] = null;
    await database.ref().update(updates);

    await sendToTelegram(`🗑️ *Product Deleted by Admin*\n*Product ID:* ${productId}\n*Product Title:* ${title}`);

    return { success: true, message: "Product deleted successfully by admin." };

  } catch (error: any) {
    reportServerError('src/app/admin/sales/actions.ts#3', error);
    console.error("Error deleting product as admin:", error);
    return { success: false, message: error.message || "Failed to delete product." };
  }
}

