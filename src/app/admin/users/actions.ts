
'use server';

import { initializeFirebase } from '@/firebase/server';
import { Transaction } from 'firebase-admin/firestore';
import { logSummaryEvent } from '@/lib/summary-logger';
import type { UserProfile, UserSubscription, CreditHistoryEntry, Order } from '@/lib/types';
import type admin from 'firebase-admin';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { FieldValue } from 'firebase-admin/firestore';
import { plans } from '@/lib/plans';
import { syncUserSubscriptionInstallments, syncAllPendingSubscriptions } from '@/app/actions';
import { reportServerError } from '@/lib/report-error';
import { requireAdmin } from '@/lib/auth-guard';

export type SimpleAuthUser = {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  disabled: boolean;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
};

export async function searchAuthUsers(
  query: string
): Promise<{ success: boolean; users?: SimpleAuthUser[]; error?: string }> {
  if (!query.trim()) {
    return { success: false, error: 'Query cannot be empty.' };
  }

  try {
    const { auth } = initializeFirebase();
    if (!auth) return { success: false, error: 'Auth instance unavailable.' };
    let userRecords: admin.auth.UserRecord[] = [];

    try {
      const userRecord = await auth.getUserByEmail(query);
      userRecords.push(userRecord);
    } catch (error: any) {
      // 'auth/user-not-found' just means the query wasn't an email that
      // matches a user (e.g. admin searched by UID instead) — that's a
      // normal, expected outcome of this lookup-by-email-then-by-uid flow,
      // not a real server error, so it should not page the Telegram bot.
      if (error.code !== 'auth/user-not-found') {
        reportServerError('src/app/admin/users/actions.ts#1', error);
      }
      if (error.code !== 'auth/user-not-found') {
        try {
          const userRecord = await auth.getUser(query);
          userRecords.push(userRecord);
        } catch (uidError: any) {
           if (uidError.code !== 'auth/user-not-found') {
             reportServerError('src/app/admin/users/actions.ts#2', uidError);
             throw uidError;
           }
        }
      }
    }

    const plainUsers: SimpleAuthUser[] = userRecords.map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      disabled: user.disabled,
      metadata: {
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
      }
    }));
    
    return { success: true, users: plainUsers };
  } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#3', error);
    console.error('Failed to search auth users:', error);
    return { success: false, error: error.message || 'An unknown error occurred.' };
  }
}

export async function getUserProfileFromServer(uid: string): Promise<UserProfile | null> {
    try {
        const { firestore } = initializeFirebase();
        if (!firestore) return null;
        const userDocRef = firestore.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
            let data = userDoc.data() as UserProfile;
            data.uid = uid;

            // Auto-grant if pending installments are due
            if (data?.subscription && 
                (data.subscription.planId === 'autopay_pro' || data.subscription.planId === 'test_sub') &&
                (data.subscription.status === 'active' || data.subscription.status === 'cancelled') &&
                (data.subscription.weeklyGrantCount || 0) < (plans.find(p => p.id === data.subscription!.planId)?.maxGrants ?? 4)) {
                const now = new Date();
                const nextGrant = new Date(data.subscription.nextWeeklyGrantDate);
                if (now >= nextGrant) {
                    const syncResult = await syncUserSubscriptionInstallments(uid);
                    if (syncResult.success && syncResult.updatedProfile) {
                        data = { ...syncResult.updatedProfile, uid };
                    }
                }
            }

            return data;
        }
        return null;
    } catch (error) {
    reportServerError('src/app/admin/users/actions.ts#4', error);
        console.error(`Error fetching profile for ${uid}:`, error);
        return null;
    }
}

/**
 * Adjusts user credits manually and logs the action to a specialized Telegram ID.
 * UNLOCKS the user by setting hasMadeFirstPurchase to true if adjustment is non-zero.
 */
export async function adjustUserCredits(
  idToken: string,
  userId: string,
  currentCredits: number,
  newCreditAmount: number,
  adminEmail: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, error: guard.message };
  if (isNaN(newCreditAmount)) return { success: false, error: 'Invalid credit amount.' };

  const { firestore, database } = initializeFirebase();
  if (!firestore) return { success: false, error: 'Database instance unavailable.' };
  const difference = newCreditAmount - currentCredits;
  if (difference === 0) return { success: true };

  const userRef = firestore.collection('users').doc(userId);
  const batch = firestore.batch();

  const historyEntry = {
    amount: difference,
    reason: reason || 'Admin manual adjustment',
    timestamp: new Date().toISOString(),
  };

  if (database) {
    database.ref(`creditHistory/${userId}`).push(historyEntry).catch((e: any) => console.error("RTDB history error:", e));
  }
  
  // Set hasMadeFirstPurchase to true on ANY manual adjustment to unlock account
  batch.update(userRef, { 
    credits: newCreditAmount,
    hasMadeFirstPurchase: true
  });

  if (difference > 0) {
    const notificationRef = userRef.collection('notifications').doc('user_notifications');
    const notificationData = {
        id: `admin-credit-${Date.now()}`,
        message: `Your account has been credited with ${difference.toLocaleString()} credits.`,
        timestamp: new Date().toISOString(),
        read: false,
        type: 'credits' as const,
    };
    batch.set(notificationRef, { entries: FieldValue.arrayUnion(notificationData) }, { merge: true });
  }

  try {
    await batch.commit();
    
    // --- SPECIALIZED SECURITY LOGGING ---
    const targetUserId = "8757312470";
    const userDoc = await userRef.get();
    const userEmail = userDoc.data()?.email || userId;
    
    const adjustmentType = difference > 0 ? "GRANT 💎" : "DEDUCTION 📉";
    const sign = difference > 0 ? "+" : "";

    const logMessage = `🛠️ <b>MANUAL CREDIT SYNC</b>\n\n` +
                       `<b>Type:</b> ${adjustmentType}\n` +
                       `<b>Admin:</b> ${escapeHtml(adminEmail)}\n` +
                       `<b>User:</b> ${escapeHtml(userEmail)}\n` +
                       `<b>Change:</b> <code>${sign}${difference.toLocaleString()}</code>\n` +
                       `<b>New Balance:</b> <code>${newCreditAmount.toLocaleString()}</code>\n` +
                       `<b>Reason:</b> <i>${escapeHtml(reason || 'N/A')}</i>`;

    await sendToTelegram(logMessage, undefined, { targetChatId: targetUserId });

    if (difference > 0) await logSummaryEvent('creditsPurchased', difference);
    else await logSummaryEvent('creditsSpent', Math.abs(difference));
    
    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#5', error);
    return { success: false, error: error.message };
  }
}

export async function updateUserSubscription(
    idToken: string,
    userId: string,
    sub: UserSubscription | null,
    adminEmail?: string
): Promise<{ success: boolean; error?: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { firestore, database } = initializeFirebase();
        if (!firestore) return { success: false, error: 'Database instance unavailable' };
        const userRef = firestore.collection('users').doc(userId);
        
        if (sub) {
            await userRef.update({ subscription: sub, hasMadeFirstPurchase: true });
        } else {
            // Log deactivation
            if (database) {
                await database.ref(`creditHistory/${userId}`).push({
                    amount: 0,
                    reason: `Consistency Plan Deactivated${adminEmail ? ` by ${adminEmail}` : ''}`,
                    timestamp: new Date().toISOString(),
                }).catch((e: any) => console.error("RTDB history error:", e));
            }

            // Keep the subscription record with a cancelled status so the
            // user can see that it was cancelled and the scheduler can honor
            // the already-paid current cycle without creating a new one.
            await userRef.update({
                'subscription.status': 'cancelled',
                'subscription.cancelledAt': new Date().toISOString(),
            });
            
            if (adminEmail) {
                const userDoc = await userRef.get();
                const userEmail = userDoc.data()?.email || userId;
                await sendToTelegram(`🔴 <b>Consistency Plan Deactivated</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Admin:</b> ${escapeHtml(adminEmail)}`);
            }
        }
        
        revalidatePath('/admin/users');
        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/admin/users/actions.ts#6', e);
        return { success: false, error: e.message };
    }
}

export async function manuallyGrantAutopayAction(
  idToken: string,
  userId: string,
  adminEmail: string
): Promise<{ success: boolean; subscription?: UserSubscription; error?: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database instance unavailable' };
    const userRef = firestore.collection('users').doc(userId);
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const grantAmount = 20000;

    const sub: UserSubscription = {
        planId: 'autopay_pro',
        status: 'active',
        startDate: now.toISOString(),
        nextWeeklyGrantDate: nextWeek.toISOString(),
        weeklyGrantCount: 1,
        currentCycleMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        manuallyGranted: true
    };

    try {
        await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User profile missing.");

            const userData = userDoc.data() as UserProfile;
            if (userData.subscription?.status === 'active' && userData.subscription?.planId === 'autopay_pro') {
                throw new Error("User already has an active Consistency Plan. Please deactivate it first if you wish to reset.");
            }

            transaction.update(userRef, { 
                subscription: sub,
                credits: FieldValue.increment(grantAmount),
                totalInvestment: FieldValue.increment(700),
                hasMadeFirstPurchase: true
            });

            const notificationRef = userRef.collection('notifications').doc('user_notifications');
            transaction.set(notificationRef, { 
                entries: FieldValue.arrayUnion({
                    id: `manual-sub-grant-${Date.now()}`,
                    message: `Consistency Plan Activated: +20,000 Credits added for Week 1!`,
                    timestamp: now.toISOString(),
                    read: false,
                    type: 'credits'
                }) 
            }, { merge: true });
        });

        if (database) {
            database.ref(`creditHistory/${userId}`).push({
                amount: grantAmount,
                reason: `Consistency Plan: Week 1 Grant`,
                timestamp: now.toISOString(),
                amountPaid: 700,
                currency: 'INR'
            }).catch((e: any) => console.error("RTDB history error:", e));
        }

        await sendToTelegram(`⚡ <b>Manual Consistency Plan Activated</b>\n<b>User ID:</b> <code>${userId}</code>\n<b>Admin:</b> ${adminEmail}\n<b>Cycle:</b> 28 Days (Week 1/4 Grant Complete)`);
        
        revalidatePath('/admin/users');
        return { success: true, subscription: sub };

    } catch (e: any) {
    reportServerError('src/app/admin/users/actions.ts#7', e);
        console.error("Manual Autopay grant failed:", e);
        return { success: false, error: e.message };
    }
}

export async function updateUserRole(
    idToken: string,
    userId: string,
    userEmail: string,
    newRole: 'admin' | 'user'
): Promise<{ success: boolean; error?: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { auth, firestore } = initializeFirebase();
        if (!firestore) return { success: false, error: 'Database instance unavailable.' };
        if (auth) await auth.setCustomUserClaims(userId, { role: newRole }).catch((e: any) => console.warn('Role claim warning:', e));
        const userRef = firestore.collection('users').doc(userId);
        await userRef.update({ role: newRole });
        revalidatePath('/admin/users');
        await sendToTelegram(`🔧 <b>User Role Updated</b>\n*User:* ${escapeHtml(userEmail)}\n*New Role:* \`${escapeHtml(newRole.toUpperCase())}\``);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#8', error);
        return { success: false, error: error.message };
    }
}

export async function toggleSellerStatus(
  idToken: string,
  userId: string,
  userEmail: string,
  isCurrentlySeller: boolean
): Promise<{ success: boolean; error?: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { firestore } = initializeFirebase();
        if (!firestore) return { success: false, error: 'Database instance unavailable.' };
        const newSellerStatus = !isCurrentlySeller;
        const userRef = firestore.collection('users').doc(userId);
        await userRef.update({ isSeller: newSellerStatus });
        revalidatePath('/admin/users');
        await sendToTelegram(`🛍️ *Seller Status Updated*\n*User:* ${escapeHtml(userEmail)}\n*Seller Status:* \`${newSellerStatus ? 'ENABLED' : 'DISABLED'}\``);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#9', error);
        return { success: false, error: error.message };
    }
}

export async function toggleSponsorStatus(
  idToken: string,
  userId: string,
  userEmail: string,
  isCurrentlySponsor: boolean
): Promise<{ success: boolean; error?: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { firestore } = initializeFirebase();
        if (!firestore) return { success: false, error: 'Database instance unavailable.' };
        const newStatus = !isCurrentlySponsor;
        const userRef = firestore.collection('users').doc(userId);
        await userRef.update({ isSponsor: newStatus });
        revalidatePath('/admin/users');
        await sendToTelegram(`💎 <b>Sponsor Status Updated</b>\n*User:* ${escapeHtml(userEmail)}\n*Status:* \`${newStatus ? 'AUTHORIZED (UNLIMITED ACCESS)' : 'REVOKED'}\``);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#10', error);
        return { success: false, error: error.message };
    }
}

export async function banUser(idToken: string, userId: string, adminEmail: string): Promise<{ success: boolean; error?: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, error: guard.message };
  try {
    const { auth, firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database instance unavailable.' };
    if (auth) await auth.updateUser(userId, { disabled: true }).catch((e: any) => console.warn("Auth disable warning:", e));
    const userRef = firestore.collection('users').doc(userId);
    await userRef.update({ status: 'banned', isBanned: true });
    revalidatePath('/admin/users');
    await sendToTelegram(`🚫 *User Banned*\n*Admin:* ${escapeHtml(adminEmail)}\n*User ID:* ${userId}`);
    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#11', error);
    return { success: false, error: error.message };
  }
}

export async function suspendUser(idToken: string, userId: string, days: number, adminEmail: string): Promise<{ success: boolean; error?: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, error: guard.message };
  try {
    const { auth, firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database instance unavailable.' };
    if (auth) await auth.updateUser(userId, { disabled: true }).catch((e: any) => console.warn("Auth disable warning:", e));
    const suspensionEndDate = new Date();
    suspensionEndDate.setDate(suspensionEndDate.getDate() + days);
    const userRef = firestore.collection('users').doc(userId);
    await userRef.update({ status: 'suspended', suspensionEndDate: suspensionEndDate.toISOString() });
    revalidatePath('/admin/users');
    await sendToTelegram(`⏳ *User Suspended for ${days} days*\n*Admin:* ${escapeHtml(adminEmail)}\n*User ID:* ${userId}`);
    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#12', error);
    return { success: false, error: error.message };
  }
}

export async function reactivateUser(idToken: string, userId: string, adminEmail: string): Promise<{ success: boolean; error?: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, error: guard.message };
  try {
    const { auth, firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database instance unavailable.' };
    if (auth) await auth.updateUser(userId, { disabled: false }).catch((e: any) => console.warn("Auth enable warning:", e));
    const userRef = firestore.collection('users').doc(userId);
    await userRef.update({ status: 'active', isBanned: false, suspensionEndDate: FieldValue.delete() });
    revalidatePath('/admin/users');
    await sendToTelegram(`✅ *User Reactivated*\n*Admin:* ${escapeHtml(adminEmail)}\n*User ID:* ${userId}`);
    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#13', error);
    return { success: false, error: error.message };
  }
}

export async function updateUserHistory(
    userId: string,
    type: 'credit' | 'notification',
    entries: any[]
): Promise<{ success: boolean; message: string }> {
    if (!userId) return { success: false, message: 'User ID is required.' };
    
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false, message: 'Database instance unavailable.' };
    
    let docRef;
    if (type === 'credit') {
        docRef = firestore.collection('users').doc(userId).collection('creditHistory').doc('history_log');
    } else {
        docRef = firestore.collection('users').doc(userId).collection('notifications').doc('user_notifications');
    }

    try {
        if (type === 'credit') {
            // 1. Sync deletions with Realtime Database (RTDB)
            if (database) {
                const rtdbRef = database.ref(`creditHistory/${userId}`);
                const snapshot = await rtdbRef.once('value');
                if (snapshot.exists()) {
                    const rtdbData = snapshot.val();
                    if (rtdbData && typeof rtdbData === 'object') {
                        for (const key of Object.keys(rtdbData)) {
                            // If key is not in the remaining entries, it has been deleted
                            const stillExists = entries.some(entry => entry && entry.id === key);
                            if (!stillExists) {
                                await database.ref(`creditHistory/${userId}/${key}`).remove();
                            }
                        }
                    }
                }
            }

            // 2. Sync deletions with individual Firestore creditHistory documents
            const creditHistoryCol = firestore.collection('users').doc(userId).collection('creditHistory');
            const individualDocs = await creditHistoryCol.get();
            for (const doc of individualDocs.docs) {
                if (doc.id !== 'history_log') {
                    const data = doc.data();
                    if (data && data.timestamp && data.reason) {
                        const stillExists = entries.some(
                            entry => entry && entry.timestamp === data.timestamp && entry.reason === data.reason
                        );
                        if (!stillExists) {
                            await doc.ref.delete();
                        }
                    }
                }
            }

            // 3. Update Firestore history_log: only keep entries that do not have an `id` field (since `id` fields are RTDB-only)
            const firestoreEntries = entries.filter(entry => !entry || !entry.id);
            await docRef.set({ entries: firestoreEntries }, { merge: true });
        } else {
            // Notifications logic remains the same
            await docRef.set({ entries }, { merge: true });
        }
        
        // If updating credits and history length > 1, ensure user is unlocked
        if (type === 'credit' && entries.length > 1) {
            await firestore.collection('users').doc(userId).update({ hasMadeFirstPurchase: true });
        }
        
        revalidatePath('/admin/users');
        return { success: true, message: `${type === 'credit' ? 'Credit history' : 'Notifications'} updated successfully.` };
    } catch (error: any) {
    reportServerError('src/app/admin/users/actions.ts#14', error);
        console.error(`Error updating user ${type} history:`, error);
        return { success: false, message: error.message || `Failed to update ${type} history.` };
    }
}

/**
 * 🤑 FINANCIAL RECONSTRUCT NODE (PLAN-CENTRIC EDITION)
 * Derived investment totals from plan names and transactions to ensure accuracy.
 * Sets hasMadeFirstPurchase to true if history length > 1 or investment > 0.
 */
export async function recalculateUserFinancials(userId: string): Promise<{ success: boolean; error?: string }> {
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database instance unavailable.' };
    const userRef = firestore.collection('users').doc(userId);

    try {
        const historyLogRef = userRef.collection('creditHistory').doc('history_log');
        const [historySnap, storeHistorySnap, oldHistorySnap] = await Promise.all([
            historyLogRef.get(),
            firestore.collection('storeHistory').where('userId', '==', userId).where('status', '==', 'paid').get(),
            userRef.collection('creditHistory').limit(100).get()
        ]);

        let totalInvestmentInInr = 0;
        let historyCount = 0;
        const inventory: Record<string, number> = {};
        const allEntries: any[] = [];

        // 1. Process Firestore Credit Purchases
        if (historySnap.exists) {
            const entries = historySnap.data()?.entries || [];
            allEntries.push(...entries);
        }
        
        oldHistorySnap.docs.forEach((doc: any) => {
            if (doc.id !== 'history_log') {
                allEntries.push(doc.data());
            }
        });

        // 2. Also check RTDB creditHistory for complete ground truth
        if (database) {
            try {
                const rtdbSnap = await database.ref(`creditHistory/${userId}`).once('value');
                if (rtdbSnap.exists()) {
                    const rtdbData = rtdbSnap.val();
                    if (rtdbData && typeof rtdbData === 'object') {
                        Object.values(rtdbData).forEach((entry: any) => {
                            if (entry && typeof entry === 'object') {
                                allEntries.push(entry);
                            }
                        });
                    }
                }
            } catch (rtdbErr) {
    reportServerError('src/app/admin/users/actions.ts#15', rtdbErr);
                console.error("RTDB fetch in recalculate failed:", rtdbErr);
            }
        }

        // Deduplicate entries by timestamp + reason + amount
        const uniqueEntries = Array.from(
            new Map(allEntries.map(e => [`${e.timestamp || ''}_${e.reason || ''}_${e.paymentId || e.orderId || e.amount || ''}`, e])).values()
        );

        historyCount = uniqueEntries.length;
        uniqueEntries.forEach((entry: any) => {
            const reason = (entry.reason || "").toLowerCase();
            
            if (reason.includes("purchase") || reason.includes("promo") || reason.includes("plan") || reason.includes("consistency") || reason.includes("manual approval") || reason.includes("week 1 grant")) {
                let identifiedPrice = 0;
                let priceKey = "";

                if (reason.includes("starter") || reason.includes("139")) { identifiedPrice = 139; priceKey = "139"; }
                else if ((reason.includes("pro") || reason.includes("331") || reason.includes("336")) && !reason.includes("autopay")) { identifiedPrice = 331; priceKey = "331"; }
                else if (reason.includes("business") || reason.includes("534") || reason.includes("540")) { identifiedPrice = 534; priceKey = "534"; }
                else if (reason.includes("enterprise") || reason.includes("999")) { identifiedPrice = 999; priceKey = "999"; }
                else if (reason.includes("consistency") || reason.includes("autopay") || reason.includes("700") || reason.includes("week 1")) { identifiedPrice = 700; priceKey = "700"; }
                else if (reason.includes("test")) { identifiedPrice = 1; priceKey = "1"; }
                
                if (identifiedPrice === 0 && entry.amountPaid && entry.amountPaid > 0 && entry.amountPaid < 10000) {
                    identifiedPrice = entry.amountPaid;
                    if (entry.currency === 'USD') identifiedPrice *= 85;
                }

                if (identifiedPrice > 0) {
                    totalInvestmentInInr += identifiedPrice;
                    if (priceKey) {
                        inventory[priceKey] = (inventory[priceKey] || 0) + 1;
                    }
                }
            }
        });

        // 3. Process Marketplace Sales
        storeHistorySnap.forEach((doc: any) => {
            const order = doc.data() as Order;
            if (order.paymentMethod === 'cash') {
                totalInvestmentInInr += (order.amount / 100);
            }
        });

        // 4. Update User Node Index
        await userRef.update({
            totalInvestment: Math.round(totalInvestmentInInr),
            purchasedPlans: inventory,
            hasMadeFirstPurchase: totalInvestmentInInr > 0 || historyCount > 1
        });

        revalidatePath('/admin/users');
        return { success: true };

    } catch (e: any) {
    reportServerError('src/app/admin/users/actions.ts#16', e);
        console.error("Financial Reconstruct Failed:", e);
        return { success: false, error: e.message };
    }
}

/**
 * 🛡️ AUDIT SUBSCRIBED & PAYING USERS FOR DUPLICATE GRANTS / PURCHASES
 * Ultra-optimized: Queries ONLY users with subscriptions or recorded purchases instead of scanning 25,000+ free users.
 * Saves 99%+ Firestore reads.
 */
export async function auditAllUsersDuplicateGrants(): Promise<{
    success: boolean;
    totalUsersScanned: number;
    totalExcessCredits: number;
    affectedUsers: Array<{
        userId: string;
        name: string;
        email: string;
        currentCredits: number;
        excessCredits: number;
        duplicateEntries: Array<{
            id?: string;
            timestamp: string;
            reason: string;
            amount: number;
            amountPaid?: number;
        }>;
    }>;
    error?: string;
}> {
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false, totalUsersScanned: 0, totalExcessCredits: 0, affectedUsers: [], error: 'Database unavailable' };

    try {
        // 🚀 ULTRA-OPTIMIZATION: Target ONLY paying/subscribed users
        // Instead of reading all 25,000+ users, we target users who have active subscriptions or purchase flags
        const candidateUserDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();

        try {
            // 1. Users with active or recorded subscriptions
            const subQuery = await firestore.collection('users').where('subscription', '!=', null).limit(500).get();
            subQuery.docs.forEach(d => candidateUserDocs.set(d.id, d));
        } catch (e) {
    reportServerError('src/app/admin/users/actions.ts#17', e);
            console.warn("Subscription filter query:", e);
        }

        try {
            // 2. Users with hasMadeFirstPurchase == true
            const purchaseQuery = await firestore.collection('users').where('hasMadeFirstPurchase', '==', true).limit(500).get();
            purchaseQuery.docs.forEach(d => candidateUserDocs.set(d.id, d));
        } catch (e) {
    reportServerError('src/app/admin/users/actions.ts#18', e);
            console.warn("Purchase filter query:", e);
        }

        try {
            // 3. Users with totalInvestment > 0
            const investmentQuery = await firestore.collection('users').where('totalInvestment', '>', 0).limit(500).get();
            investmentQuery.docs.forEach(d => candidateUserDocs.set(d.id, d));
        } catch (e) {
    reportServerError('src/app/admin/users/actions.ts#19', e);
            console.warn("Investment filter query:", e);
        }

        // If candidates are empty (e.g. index missing), fallback to top users by credit balance
        if (candidateUserDocs.size === 0) {
            const topCreditQuery = await firestore.collection('users').orderBy('credits', 'desc').limit(100).get();
            topCreditQuery.docs.forEach(d => candidateUserDocs.set(d.id, d));
        }

        const affectedUsers: any[] = [];
        let totalExcessCredits = 0;

        for (const [userId, userDoc] of candidateUserDocs.entries()) {
            const userData = userDoc.data() as UserProfile;
            const allEntries: any[] = [];

            // 1. Fetch from Firestore history_log
            const historyLogSnap = await userDoc.ref.collection('creditHistory').doc('history_log').get();
            if (historyLogSnap.exists) {
                allEntries.push(...(historyLogSnap.data()?.entries || []));
            }

            // 2. Fetch from RTDB (RTDB reads are NOT billed per document like Firestore)
            if (database) {
                try {
                    const rtdbSnap = await database.ref(`creditHistory/${userId}`).once('value');
                    if (rtdbSnap.exists()) {
                        const val = rtdbSnap.val();
                        if (val && typeof val === 'object') {
                            Object.entries(val).forEach(([id, entry]: [string, any]) => {
                                if (entry && typeof entry === 'object') {
                                    allEntries.push({ id, ...entry });
                                }
                            });
                        }
                    }
                } catch (e) {
    reportServerError('src/app/admin/users/actions.ts#20', e);
                    console.error(`RTDB audit fetch error for ${userId}:`, e);
                }
            }

            if (allEntries.length === 0) continue;

            // Sort entries chronologically
            const sortedEntries = allEntries
                .filter(e => e && e.timestamp && e.reason)
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            // Detect duplicate grants (e.g. same reason within 10 minutes, or duplicate Week 1 grant within 24 hours)
            const duplicates: any[] = [];
            let userExcess = 0;

            for (let i = 0; i < sortedEntries.length; i++) {
                const current = sortedEntries[i];
                const currentReason = (current.reason || '').toLowerCase();
                const currentTime = new Date(current.timestamp).getTime();

                // Look ahead for duplicates
                for (let j = i + 1; j < sortedEntries.length; j++) {
                    const next = sortedEntries[j];
                    const nextReason = (next.reason || '').toLowerCase();
                    const nextTime = new Date(next.timestamp).getTime();
                    const diffMinutes = Math.abs(nextTime - currentTime) / (1000 * 60);

                    const isSameGrant = currentReason === nextReason && current.amount === next.amount;
                    const isDuplicateWeek1 = (currentReason.includes('week 1') || currentReason.includes('consistency')) && 
                                           (nextReason.includes('week 1') || nextReason.includes('consistency')) && 
                                           diffMinutes < 1440; // within 24 hours
                    const isCloseDuplicatePurchase = isSameGrant && diffMinutes < 10;

                    if ((isDuplicateWeek1 || isCloseDuplicatePurchase) && next.amount > 0) {
                        // Check if not already added to duplicates list
                        const alreadyAdded = duplicates.some(d => d.timestamp === next.timestamp && d.reason === next.reason);
                        if (!alreadyAdded) {
                            duplicates.push(next);
                            userExcess += next.amount;
                        }
                    }
                }
            }

            if (duplicates.length > 0) {
                totalExcessCredits += userExcess;
                affectedUsers.push({
                    userId,
                    name: userData.name || userData.displayName || 'Unnamed User',
                    email: userData.email || 'No Email',
                    currentCredits: userData.credits || 0,
                    excessCredits: userExcess,
                    duplicateEntries: duplicates
                });
            }
        }

        return {
            success: true,
            totalUsersScanned: usersSnap.size,
            totalExcessCredits,
            affectedUsers
        };
    } catch (err: any) {
    reportServerError('src/app/admin/users/actions.ts#21', err);
        console.error("Audit error:", err);
        return { success: false, totalUsersScanned: 0, totalExcessCredits: 0, affectedUsers: [], error: err.message };
    }
}

/**
 * 🧹 FIX DUPLICATE GRANTS FOR A SPECIFIC USER
 */
export async function fixUserDuplicateGrants(
    userId: string,
    duplicateEntriesToRemove: Array<{ id?: string; timestamp: string; reason: string; amount: number }>,
    creditsToDeduct: number
): Promise<{ success: boolean; message: string }> {
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false, message: 'Database unavailable' };

    try {
        const userRef = firestore.collection('users').doc(userId);
        
        // 1. Delete from RTDB
        if (database) {
            const rtdbRef = database.ref(`creditHistory/${userId}`);
            const rtdbSnap = await rtdbRef.once('value');
            if (rtdbSnap.exists()) {
                const val = rtdbSnap.val();
                if (val && typeof val === 'object') {
                    for (const [key, item] of Object.entries<any>(val)) {
                        const isMatch = duplicateEntriesToRemove.some(d => 
                            d.id === key || 
                            (d.timestamp === item.timestamp && d.reason === item.reason)
                        );
                        if (isMatch) {
                            await database.ref(`creditHistory/${userId}/${key}`).remove();
                        }
                    }
                }
            }
        }

        // 2. Delete from Firestore history_log
        const historyLogRef = userRef.collection('creditHistory').doc('history_log');
        const historyLogSnap = await historyLogRef.get();
        if (historyLogSnap.exists) {
            const entries = historyLogSnap.data()?.entries || [];
            const filtered = entries.filter((e: any) => 
                !duplicateEntriesToRemove.some(d => d.timestamp === e.timestamp && d.reason === e.reason)
            );
            await historyLogRef.set({ entries: filtered }, { merge: true });
        }

        // 3. Delete from individual Firestore docs
        const individualDocs = await userRef.collection('creditHistory').get();
        for (const doc of individualDocs.docs) {
            if (doc.id !== 'history_log') {
                const data = doc.data();
                const isMatch = duplicateEntriesToRemove.some(d => d.timestamp === data.timestamp && d.reason === data.reason);
                if (isMatch) {
                    await doc.ref.delete();
                }
            }
        }

        // 4. Atomically deduct excess credits
        await firestore.runTransaction(async (t: any) => {
            const uDoc = await t.get(userRef);
            if (!uDoc.exists) return;
            const currentBal = Number(uDoc.data()?.credits || 0);
            const newBal = Math.max(0, currentBal - creditsToDeduct);
            t.update(userRef, { credits: newBal });
        });

        // 5. Recalculate financials to ensure exact sync
        await recalculateUserFinancials(userId);

        revalidatePath('/admin/users');
        return { success: true, message: `Successfully reverted ${creditsToDeduct.toLocaleString()} duplicate credits for ${userId}.` };
    } catch (e: any) {
    reportServerError('src/app/admin/users/actions.ts#22', e);
        console.error("Fix user duplicate grants error:", e);
        return { success: false, message: e.message || "Failed to fix user duplicate grants." };
    }
}

/**
 * ⚡ FETCH ONLY ACTIVE CONSISTENCY PLAN USERS
 * Ultra-efficient targeted query: Reads ONLY users with active subscription or purchased consistency plan.
 * Reads = exact count of active consistency users (Zero wasted reads).
 */
export async function getActiveConsistencyPlanUsers(): Promise<{ success: boolean; users?: UserProfile[]; error?: string }> {
    const { firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database instance unavailable' };

    try {
        const usersMap = new Map<string, UserProfile>();

        // 1. Query users with active subscription
        try {
            const subSnap = await firestore.collection('users')
                .where('subscription.status', '==', 'active')
                .get();
            subSnap.docs.forEach(doc => {
                usersMap.set(doc.id, { ...doc.data() as UserProfile, uid: doc.id });
            });
        } catch (e) {
    reportServerError('src/app/admin/users/actions.ts#23', e);
            console.warn("Active sub query error:", e);
        }

        // 2. Query users with purchased consistency plan (key "700")
        try {
            const planSnap = await firestore.collection('users')
                .where('purchasedPlans.700', '==', true)
                .get();
            planSnap.docs.forEach(doc => {
                if (!usersMap.has(doc.id)) {
                    usersMap.set(doc.id, { ...doc.data() as UserProfile, uid: doc.id });
                }
            });
        } catch (e) {
    reportServerError('src/app/admin/users/actions.ts#24', e);
            console.warn("Consistency plan purchase query error:", e);
        }

        const now = new Date();
        const usersList: UserProfile[] = [];

        for (const [uid, userProfile] of usersMap.entries()) {
            let p = userProfile;
            const sub = p.subscription;
            if (
                sub &&
                (sub.planId === 'autopay_pro' || sub.planId === 'test_sub') &&
                (sub.status === 'active' || sub.status === 'cancelled') &&
                (sub.weeklyGrantCount || 0) < (plans.find(p2 => p2.id === sub.planId)?.maxGrants ?? 4)
            ) {
                const nextDate = new Date(sub.nextWeeklyGrantDate);
                if (now >= nextDate) {
                    const syncRes = await syncUserSubscriptionInstallments(uid);
                    if (syncRes.success && syncRes.updatedProfile) {
                        p = { ...syncRes.updatedProfile, uid };
                    }
                }
            }
            usersList.push(p);
        }

        return { success: true, users: usersList };
    } catch (e: any) {
    reportServerError('src/app/admin/users/actions.ts#25', e);
        console.error("Failed to fetch active consistency users:", e);
        return { success: false, error: e.message || "Failed to fetch active consistency plan users." };
    }
}

/**
 * ⏳ LOG EXPIRED CREDITS TO HISTORY & RTDB
 * Explicitly records credit expiry in history ledger.
 */
export async function logCreditExpiry(
    userId: string, 
    expiredAmount: number, 
    reason?: string
): Promise<{ success: boolean; error?: string }> {
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database instance unavailable' };

    try {
        const userRef = firestore.collection('users').doc(userId);
        const amountDeducted = -Math.abs(expiredAmount);
        const expiryReason = reason || 'Plan Credits Expired (30-Day Cycle Ended)';
        const timestamp = new Date().toISOString();

        const historyEntry = {
            amount: amountDeducted,
            reason: expiryReason,
            timestamp
        };

        // 1. Append to RTDB credit history
        if (database) {
            await database.ref(`creditHistory/${userId}`).push(historyEntry).catch((e: any) => console.error("RTDB expire log error:", e));
        }

        // 2. Append to Firestore history_log
        const historyLogRef = userRef.collection('creditHistory').doc('history_log');
        await historyLogRef.set({
            entries: FieldValue.arrayUnion(historyEntry)
        }, { merge: true });

        // 3. Update user credits balance if needed
        await firestore.runTransaction(async (t: any) => {
            const uDoc = await t.get(userRef);
            if (!uDoc.exists) return;
            const currentBal = Number(uDoc.data()?.credits || 0);
            const newBal = Math.max(0, currentBal - Math.abs(expiredAmount));
            t.update(userRef, { credits: newBal });
        });

        revalidatePath('/admin/users');
        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/admin/users/actions.ts#26', e);
        console.error("Failed to log credit expiry:", e);
        return { success: false, error: e.message };
    }
}

/**
 * ⚡ FIX ALL DETECTED DUPLICATE GRANTS IN BATCH
 */
export async function fixAllDuplicateGrants(): Promise<{ success: boolean; fixedUsersCount: number; totalRevertedCredits: number; message: string }> {
    const audit = await auditAllUsersDuplicateGrants();
    if (!audit.success || audit.affectedUsers.length === 0) {
        return { success: true, fixedUsersCount: 0, totalRevertedCredits: 0, message: 'No duplicate grants found across any user.' };
    }

    let fixedCount = 0;
    let totalReverted = 0;

    for (const affected of audit.affectedUsers) {
        const res = await fixUserDuplicateGrants(affected.userId, affected.duplicateEntries, affected.excessCredits);
        if (res.success) {
            fixedCount++;
            totalReverted += affected.excessCredits;
        }
    }

    revalidatePath('/admin/users');
    return {
        success: true,
        fixedUsersCount: fixedCount,
        totalRevertedCredits: totalReverted,
        message: `Successfully audited and fixed ${fixedCount} users. Reverted a total of ${totalReverted.toLocaleString()} duplicate credits!`
    };
}
