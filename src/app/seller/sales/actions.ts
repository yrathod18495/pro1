
'use server';

import { initializeFirebase } from '@/firebase/server';
import { z } from 'zod';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { Order, Product } from '@/lib/types';
import { reportServerError } from '@/lib/report-error';


const PayoutDetailsSchema = z.object({
  upiId: z.string().regex(/^[\w.-]+@[\w.-]+$/, {
    message: "Invalid UPI ID format. It should be like 'yourname@bank'.",
  }),
  accountHolderName: z.string().min(2, "Account holder name is required."),
  paymentQrUrl: z.string().optional(),
});

export async function savePayoutDetailsAction(
  userId: string,
  details: z.infer<typeof PayoutDetailsSchema>
): Promise<{ success: boolean; message: string }> {
  const validation = PayoutDetailsSchema.safeParse(details);
  if (!validation.success) {
    return { success: false, message: validation.error.flatten().formErrors.join(', ') };
  }

  try {
    const { database } = initializeFirebase();
    const sellerProfileRef = database.ref(`sellerProfiles/${userId}/payoutDetails`);
    
    await sellerProfileRef.update(validation.data);
    
    await sendToTelegram(`💸 *Payout Details Updated*\n*Seller ID:* ${userId}\n*Name:* ${validation.data.accountHolderName}\n*UPI ID:* ${validation.data.upiId}\n*QR:* ${validation.data.paymentQrUrl ? 'Uploaded' : 'None'}`);

    return { success: true, message: 'Payout details saved successfully!' };
  } catch (error: any) {
    reportServerError('src/app/seller/sales/actions.ts#1', error);
    console.error(`Failed to save payout details for user ${userId}:`, error);
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}

const WithdrawalRequestSchema = z.object({
  sellerId: z.string(),
  sellerName: z.string(),
  withdrawableAmount: z.number().min(50, "Minimum withdrawal amount is ₹50."),
  upiId: z.string().regex(/^[\w.-]+@[\w.-]+$/, "Invalid UPI ID."),
  accountHolderName: z.string().min(2, "Account holder name is required."),
});

export async function requestWithdrawalAction(
  input: z.infer<typeof WithdrawalRequestSchema>
): Promise<{ success: boolean; message: string }> {
  const validation = WithdrawalRequestSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, message: validation.error.flatten().formErrors.join(', ') };
  }

  const { firestore } = initializeFirebase();
  const { sellerId, sellerName, withdrawableAmount, upiId, accountHolderName } = validation.data;

  try {
    const newRequestRef = firestore.collection('withdrawalRequests').doc();

    await newRequestRef.set({
      ...validation.data,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    await sendToTelegram(`💰 *New Withdrawal Request*
*Seller:* ${sellerName} (${sellerId})
*Amount:* ₹${withdrawableAmount.toFixed(2)}
*Name:* ${accountHolderName}
*UPI ID:* \`${upiId}\``);

    return { success: true, message: 'Your withdrawal request has been submitted successfully.' };
  } catch (error: any) {
    reportServerError('src/app/seller/sales/actions.ts#2', error);
    console.error(`Withdrawal request failed for seller ${sellerId}:`, error);
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}


export interface SellerSaleTransaction {
  id: string;
  productId: string;
  productTitle: string;
  amount: number;
  createdAt: string;
  status: string;
}

export interface SalesData {
  totalRevenue: number;
  totalEarnings: number;
  totalWithdrawn: number;
  withdrawableAmount: number;
  totalSales: number;
  transactions: SellerSaleTransaction[];
  withdrawalHistory: any[];
  hasPendingWithdrawal: boolean;
  pendingWithdrawalAmount: number;
}

export async function getSellerSalesData(
  sellerId: string
): Promise<{ success: boolean; data?: SalesData; message: string }> {
  try {
    const { firestore } = initializeFirebase();

    // 1. Fetch all paid orders for this seller
    const ordersQuery = firestore
      .collection('storeHistory')
      .where('sellerId', '==', sellerId)
      .where('status', '==', 'paid');

    const ordersSnapshot = await ordersQuery.get();
    
    const orders: { id: string; productId: string; amount: number; createdAt: string; status: string }[] = [];
    ordersSnapshot.forEach((doc: any) => {
        const data = doc.data();
        // Strictly extract only anonymous sale figures, NEVER include buyer information
        orders.push({
          id: doc.id,
          productId: data.productId,
          amount: data.amount || 0,
          createdAt: data.createdAt || new Date().toISOString(),
          status: data.status || 'paid'
        });
    });

    // Denormalize product titles for richer history
    const productIds = [...new Set(orders.map(o => o.productId))];
    
    const productDocs = productIds.length > 0 
        ? await Promise.all(productIds.map(id => firestore.collection('products').doc(id).get())) 
        : [];
        
    const productTitleMap = new Map<string, string>();
    productDocs.forEach(doc => {
        if (doc.exists) {
            productTitleMap.set(doc.id, (doc.data() as Product)?.title || 'Unknown Product');
        }
    });
    
    // Anonymized transaction list for seller analytics (NO buyer personal info)
    const transactions: SellerSaleTransaction[] = orders.map(order => ({
        id: `TX_${order.id.slice(0, 10).toUpperCase()}`,
        productId: order.productId,
        productTitle: productTitleMap.get(order.productId) || 'Digital Asset',
        amount: order.amount,
        createdAt: order.createdAt,
        status: order.status,
    }));

    // 2. Calculate total revenue (Gross - 100%)
    let totalRevenueInPaise = 0;
    transactions.forEach(tx => {
      totalRevenueInPaise += tx.amount;
    });
    
    // Fee policy update: Charge is taken at withdrawal time.
    // Dashboard shows 100% of the sale.
    const totalEarningsInPaise = totalRevenueInPaise;

    // 3. Fetch all withdrawal requests to calculate withdrawn and pending amounts
    const withdrawalsQuery = firestore
      .collection('withdrawalRequests')
      .where('sellerId', '==', sellerId);
    const withdrawalsSnapshot = await withdrawalsQuery.get();

    let totalWithdrawnInPaise = 0;
    let pendingWithdrawalAmountInPaise = 0;
    const withdrawalHistory: any[] = [];

    if (!withdrawalsSnapshot.empty) {
        withdrawalsSnapshot.forEach((doc: any) => {
            const request = doc.data();
            const amountInPaise = (request.withdrawableAmount || 0) * 100;
            
            withdrawalHistory.push({ id: doc.id, ...request });

            if (request.status === 'completed') {
                totalWithdrawnInPaise += amountInPaise;
            } else if (request.status === 'pending') {
                pendingWithdrawalAmountInPaise += amountInPaise;
            }
        });
    }

    // 4. Calculate final withdrawable amount
    const finalWithdrawableAmountInPaise = totalEarningsInPaise - totalWithdrawnInPaise - pendingWithdrawalAmountInPaise;

    return {
      success: true,
      message: 'Sales data fetched successfully.',
      data: {
        totalRevenue: totalRevenueInPaise / 100, // Convert to Rupees
        totalEarnings: totalEarningsInPaise / 100, // Convert to Rupees
        totalWithdrawn: totalWithdrawnInPaise / 100, // Convert to Rupees
        withdrawableAmount: Math.max(0, finalWithdrawableAmountInPaise / 100), // Convert to Rupees, ensure non-negative
        totalSales: transactions.length,
        transactions: transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        withdrawalHistory: withdrawalHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        hasPendingWithdrawal: pendingWithdrawalAmountInPaise > 0,
        pendingWithdrawalAmount: pendingWithdrawalAmountInPaise / 100,
      },
    };
  } catch (error: any) {
    reportServerError('src/app/seller/sales/actions.ts#3', error);
    console.error(`Failed to fetch sales data for seller ${sellerId}:`, error);
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}
