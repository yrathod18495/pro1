
'use server';

import { initializeFirebase } from '@/firebase/server';
import type { UserProfile, UserSubscription } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { escapeHtml } from '@/lib/utils';
import crypto from 'crypto';
import { reportServerError } from '@/lib/report-error';
import { plans } from '@/lib/plans';

/**
 * Recursively converts Firestore Timestamps to ISO strings to ensure
 * Server Action responses are serializable.
 */
function serializeProfile(data: any): any {
  if (data === null || data === undefined) return data;
  
  // Handle Firestore Timestamps (they have a toDate method)
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }
  
  // Handle standard Dates
  if (data instanceof Date) {
    return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeProfile);
  }

  if (typeof data === 'object' && data.constructor === Object) {
    const serialized: any = {};
    for (const key in data) {
      serialized[key] = serializeProfile(data[key]);
    }
    return serialized;
  }

  return data;
}

/**
 * Creates a secure, pseudonymized hash of the device identifier using HMAC-SHA256.
 * It uses process.env.GEMINI_API_KEY as the secret salt. Since .env is ignored by Git,
 * the actual salt remains 100% private and is never pushed to GitHub.
 */
function hashDeviceId(rawDeviceId: string): string {
  // Use server-side Gemini API key as salt; fallback to a safe dev placeholder only for local development
  const salt = process.env.GEMINI_API_KEY || 'development_backup_salt';
  return crypto.createHmac('sha256', salt).update(rawDeviceId).digest('hex');
}

// This function will be called from the client when a new user is detected.
export async function createNewUserProfileOnServer(
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL?: string | null;
  },
  deviceId: string
): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
  if (!user.uid || !user.email) {
    return { success: false, error: 'User ID and email are required.' };
  }

  const { firestore, auth: adminAuth, database } = initializeFirebase();
  if (!firestore) {
    console.error("CRITICAL: Firebase Admin Firestore is null in createNewUserProfileOnServer.");
    return { success: false, error: 'Firebase Admin is not initialized on the server.' };
  }

  const userDocRef = firestore.collection('users').doc(user.uid);
  
  // Extract deviceId and hardware signature from device payload (DEV_<id>_HW_<hw>)
  let rawDevId = deviceId || '';
  let rawHwSig = '';
  if (rawDevId.includes('_HW_')) {
    const parts = rawDevId.split('_HW_');
    rawDevId = parts[0].replace(/^DEV_/, '');
    rawHwSig = parts[1] || '';
  }

  const cleanDeviceId = rawDevId && rawDevId !== 'unknown' && rawDevId !== 'server-side' 
    ? hashDeviceId(rawDevId.replace(/[^a-zA-Z0-9_-]/g, '')) 
    : null;

  const cleanHwSig = rawHwSig && rawHwSig !== 'hw_fallback' 
    ? hashDeviceId(rawHwSig.replace(/[^a-zA-Z0-9_-]/g, '')) 
    : null;

  try {
    // Check if profile already exists
    const userDoc = await userDocRef.get();
    if (userDoc.exists) {
      console.warn(`User profile for ${user.uid} already exists. Updating potentially changed details.`);
      const existingData = userDoc.data() as UserProfile;
      if (user.photoURL && existingData.photoURL !== user.photoURL) {
          await userDocRef.update({ photoURL: user.photoURL });
      }
      const profileWithPhoto = { ...existingData, photoURL: user.photoURL || existingData.photoURL };
      return { success: true, profile: serializeProfile(profileWithPhoto) };
    }
    
    const adminEmails = [
        'toonday378@gmail.com',
        'yrathod18495@gmail.com',
        'Yashsharma4638@gmail.com',
        'abcdtoon30@gmail.com',
        '12labofficial@gmail.com'
    ];
    const isAdmin = adminEmails.includes(user.email);
    
    if (isAdmin && adminAuth) {
        await adminAuth.setCustomUserClaims(user.uid, { role: 'admin' }).catch((e: any) => console.error("Admin claim failed:", e));
    }

    const now = new Date();
    let isAltAccount = false;
    let initialCredits = (!cleanDeviceId && !isAdmin) ? 0 : 2000;

    // --- MULTI-TIER DEVICE & HARDWARE FINGERPRINT CHECK ---
    if (cleanDeviceId && !isAdmin) {
      const deviceDocRef = firestore.collection('devices').doc(cleanDeviceId);
      const deviceDoc = await deviceDocRef.get();

      let matchedDeviceDocRef = deviceDocRef;
      let matchedDeviceData = deviceDoc.exists ? deviceDoc.data() : null;

      // If exact deviceId not found, check matching hardware signature across devices
      if (!matchedDeviceData && cleanHwSig) {
        const hwQuery = await firestore.collection('devices')
          .where('hwSignature', '==', cleanHwSig)
          .limit(1)
          .get();
        if (!hwQuery.empty) {
          matchedDeviceData = hwQuery.docs[0].data();
          matchedDeviceDocRef = hwQuery.docs[0].ref;
        }
      }

      if (!matchedDeviceData) {
        // Genuinely First account on this physical device -> Primary Account (Granted promotional credits)
        await deviceDocRef.set({
          deviceId: cleanDeviceId,
          hwSignature: cleanHwSig || null,
          promoClaimedByUid: user.uid,
          associatedUids: [user.uid],
          createdAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
        });
      } else {
        const promoClaimedByUid = matchedDeviceData?.promoClaimedByUid || matchedDeviceData?.primaryUid;

        if (promoClaimedByUid && promoClaimedByUid !== user.uid) {
          // ALT ACCOUNT DETECTED ON SAME DEVICE OR SAME HARDWARE!
          isAltAccount = true;
          initialCredits = 0; // ZERO FREE CREDITS FOR SECONDARY ACCOUNTS

          await matchedDeviceDocRef.update({
            associatedUids: FieldValue.arrayUnion(user.uid),
            lastSeenAt: now.toISOString(),
          }).catch(() => null);

          await sendToTelegram(`🚫 <b>ALT ACCOUNT BLOCKED ON DEVICE</b>\n<b>Alt User:</b> ${user.email}\n<b>Device ID:</b> ${cleanDeviceId}\n<b>Granted Credits:</b> 0 Credits`);
        } else {
          await matchedDeviceDocRef.update({
            lastSeenAt: now.toISOString(),
          }).catch(() => null);
        }
      }
    }

    const newUserProfile: UserProfile = {
      uid: user.uid,
      email: user.email,
      name: user.displayName || user.email.split('@')[0],
      credits: initialCredits,
      role: isAdmin ? 'admin' : 'user',
      status: 'active',
      createdAt: now.toISOString(),
      totalInvestment: 0,
      hasMadeFirstPurchase: false, // Explicitly false for new users
      photoURL: user.photoURL || '',
      registeredDeviceId: cleanDeviceId || undefined,
    };

    await userDocRef.set(newUserProfile);
    
    if (database) {
      await (database as any).ref(`creditHistory/${user.uid}`).push({
        amount: initialCredits,
        reason: isAltAccount ? 'Blocked free credits (Multiple accounts on device)' : 'Initial credits',
        timestamp: now.toISOString(),
      });
    }

    // Log the new user joined event to RTDB for optimized dashboard counters
    await logSummaryEvent('newUserJoined');

    const createdProfile = serializeProfile(newUserProfile);
    return { success: true, profile: createdProfile };
  } catch (error: any) {
    reportServerError('src/app/actions.ts#1', error);
    console.error('Error creating user profile on server:', error);
    return { success: false, error: error.message || 'Failed to create user profile.' };
  }
}

export async function completeUserOnboardingAction(
    uid: string,
    name: string,
    age: string
): Promise<{ success: boolean; error?: string }> {
    const { firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Firebase Admin is not initialized.' };
    try {
        const userRef = firestore.collection('users').doc(uid);
        await userRef.update({
            name,
            age,
            termsAcceptedAt: new Date().toISOString()
        });
        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/actions.ts#2', e);
        return { success: false, error: e.message };
    }
}

export async function getUserProfileFromServer(uid: string, deviceId?: string): Promise<UserProfile | null> {
    try {
        const { firestore } = initializeFirebase();
        if (!firestore) return null;
        const userDocRef = firestore.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        if (!userDoc.exists) return null;

        let profile = userDoc.data() as UserProfile;

        // Auto-grant pending weekly subscription installments if due
        if (profile?.subscription && 
            (profile.subscription.planId === 'autopay_pro' || profile.subscription.planId === 'test_sub') &&
            (profile.subscription.status === 'active' || profile.subscription.status === 'cancelled') &&
            (profile.subscription.weeklyGrantCount || 0) < (plans.find(p => p.id === profile.subscription!.planId)?.maxGrants ?? 4)) {
            const syncResult = await syncUserSubscriptionInstallments(uid);
            if (syncResult.success && syncResult.updatedProfile) {
                profile = syncResult.updatedProfile;
            }
        }

        return serializeProfile(profile);
    } catch (error) {
    reportServerError('src/app/actions.ts#3', error);
        console.error(`Error fetching profile for ${uid}:`, error);
        return null;
    }
}

const syncCooldownMap = new Map<string, number>();

function parseSubscriptionDate(value: any): Date {
    if (value?.toDate && typeof value.toDate === 'function') return value.toDate();
    if (value?._seconds || value?.seconds) {
        return new Date(Number(value._seconds ?? value.seconds) * 1000);
    }
    return new Date(value);
}

/**
 * FIXED ANCHOR LOGIC for Autopay Pro (Consistent Creator Plan)
 * Uses STRICT server-time and anchored 7-day gaps.
 * Awards all pending installments and DEACTIVATES the plan after the 4th grant.
 */
export async function syncUserSubscriptionInstallments(userId: string): Promise<{ success: boolean; updatedProfile?: UserProfile }> {
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false };

    // Cost Protection: Prevent spamming sync calls within 30 seconds per user
    const lastCheck = syncCooldownMap.get(userId);
    const nowMs = Date.now();
    if (lastCheck && nowMs - lastCheck < 30000) {
        return { success: true };
    }
    syncCooldownMap.set(userId, nowMs);

    const userRef = firestore.collection('users').doc(userId);

    try {
        const result = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) return null;
            
            const userData = userDoc.data() as UserProfile;
            const sub = userData.subscription;

            // Only process active or cancelled (pending cycle end) Autopay Pro or Test Sub subscriptions with pending installments
            if (!sub || (sub.planId !== 'autopay_pro' && sub.planId !== 'test_sub') || (sub.status !== 'active' && sub.status !== 'cancelled')) {
                return null;
            }

            const planSource = plans.find(p => p.id === sub.planId);
            const maxGrants = planSource?.maxGrants ?? 4;
            if (sub.weeklyGrantCount >= maxGrants) {
                return null;
            }

            const serverNow = new Date();
            let currentNextGrantDate = parseSubscriptionDate(sub.nextWeeklyGrantDate);
            if (Number.isNaN(currentNextGrantDate.getTime())) {
                throw new Error('Invalid nextWeeklyGrantDate on subscription.');
            }
            let currentWeekCount = sub.weeklyGrantCount;
            let totalCreditsToGrant = 0;
            const newHistoryEntries = [];
            const newNotifications = [];

            const grantAmount = planSource?.weeklyCredits ?? (sub.planId === 'test_sub' ? 2 : 20000);
            const planName = planSource?.name || 'Consistency Plan';
            const intervalDays = planSource?.grantIntervalDays ?? 7;
            const unitLabel = intervalDays === 1 ? 'Day' : 'Week';

            // Catch-up Loop: Awards all installments that became due while user was offline
            while (serverNow >= currentNextGrantDate && currentWeekCount < maxGrants) {
                // CRITICAL: Use the EXACT scheduled date for history
                const scheduledTimestamp = currentNextGrantDate.toISOString();
                
                totalCreditsToGrant += grantAmount;
                currentWeekCount++; // Moving to next installment tier
                
                newHistoryEntries.push({
                    amount: grantAmount,
                    reason: `${planName}: ${unitLabel} ${currentWeekCount} Grant`,
                    timestamp: scheduledTimestamp,
                });

                newNotifications.push({
                    id: `sub-grant-${currentWeekCount}-${Date.now()}`,
                    message: `${unitLabel === 'Day' ? 'Daily' : 'Weekly'} Consistency Grant: +${grantAmount.toLocaleString()} Credits added! (${unitLabel} ${currentWeekCount}/${maxGrants})`,
                    timestamp: serverNow.toISOString(),
                    read: false,
                    type: 'credits'
                });

                // ADVANCE THE ANCHOR: Strictly move forward by exactly `intervalDays` days
                currentNextGrantDate = new Date(currentNextGrantDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);
            }

            if (totalCreditsToGrant > 0) {
                // If we've hit the last installment, the plan should be deactivated after this grant
                const isPlanFinished = currentWeekCount >= maxGrants;
                
                const updateData: any = {
                    credits: FieldValue.increment(totalCreditsToGrant),
                };

                if (isPlanFinished) {
                    // AUTO-DEACTIVATE: Remove the subscription field from the user profile
                    updateData.subscription = FieldValue.delete();
                    
                    newNotifications.push({
                        id: `sub-complete-${Date.now()}`,
                        message: `Congratulations! Your ${maxGrants * intervalDays}-day Consistency Plan is complete. Your credits will expire 30 days from the original purchase date.`,
                        timestamp: serverNow.toISOString(),
                        read: false,
                        type: 'system'
                    });
                } else {
                    // Update the active subscription progress
                    updateData.subscription = {
                        ...sub,
                        weeklyGrantCount: currentWeekCount,
                        nextWeeklyGrantDate: currentNextGrantDate.toISOString(),
                    };
                }

                transaction.update(userRef, updateData);

                // 1. Write to Firestore Ledger History Log
                const historyLogRef = userRef.collection('creditHistory').doc('history_log');
                transaction.set(historyLogRef, { entries: FieldValue.arrayUnion(...newHistoryEntries) }, { merge: true });

                // 2. Write to Realtime Database for Live Sync
                if (database) {
                    for (const entry of newHistoryEntries) {
                        await (database as any).ref(`creditHistory/${userId}`).push(entry);
                    }
                }

                const notificationRef = userRef.collection('notifications').doc('user_notifications');
                transaction.set(notificationRef, { entries: FieldValue.arrayUnion(...newNotifications) }, { merge: true });

                // Construct updated local profile for immediate UI update
                const updatedProfile: any = { 
                    ...userData, 
                    credits: (userData.credits || 0) + totalCreditsToGrant 
                };
                if (isPlanFinished) {
                    delete updatedProfile.subscription;
                } else {
                    updatedProfile.subscription = updateData.subscription;
                }

                return updatedProfile as UserProfile;
            }

            return null;
        });

        if (result) {
            const isDeactivated = !result.subscription;
            const resultMaxGrants = plans.find(p => p.id === result.subscription?.planId)?.maxGrants ?? 4;
            await sendToTelegram(`⚡ <b>Consistency Grants Synchronized</b>\n<b>User:</b> ${result.email}\n<b>Status:</b> ${isDeactivated ? 'Plan Completed (Deactivated)' : `Grant ${result.subscription?.weeklyGrantCount}/${resultMaxGrants}`}`);
            return { success: true, updatedProfile: serializeProfile(result) };
        }

        return { success: true };
    } catch (error) {
    reportServerError('src/app/actions.ts#4', error);
        console.error("Subscription sync failed:", error);
        return { success: false };
    }
}

/**
 * Global Batch Synchronizer: Scans all users in the system and automatically grants
 * all due subscription installments even if users have never logged in or opened the website.
 */
export async function syncAllPendingSubscriptions(): Promise<{
    success: boolean;
    syncedCount: number;
    syncedUsers: string[];
    error?: string;
}> {
    const { firestore } = initializeFirebase();
    if (!firestore) return { success: false, syncedCount: 0, syncedUsers: [], error: 'Database unavailable' };

    try {
        const usersSnap = await firestore.collection('users').get();
        const syncedUsers: string[] = [];

        for (const doc of usersSnap.docs) {
            const data = doc.data() as UserProfile;
            const sub = data.subscription;
            const subMaxGrants = sub ? (plans.find(p => p.id === sub.planId)?.maxGrants ?? 4) : 4;
            if (
                sub &&
                (sub.planId === 'autopay_pro' || sub.planId === 'test_sub') &&
                (sub.status === 'active' || sub.status === 'cancelled') &&
                (sub.weeklyGrantCount || 0) < subMaxGrants
            ) {
                const syncRes = await syncUserSubscriptionInstallments(doc.id);
                if (syncRes.success && syncRes.updatedProfile) {
                    syncedUsers.push(`${data.email || doc.id} (Grant ${syncRes.updatedProfile.subscription?.weeklyGrantCount || subMaxGrants})`);
                }
            }
        }

        return {
            success: true,
            syncedCount: syncedUsers.length,
            syncedUsers
        };
    } catch (err: any) {
    reportServerError('src/app/actions.ts#5', err);
        console.error('Error during global subscription sync:', err);
        return { success: false, syncedCount: 0, syncedUsers: [], error: err.message };
    }
}

/**
 * 🤖 BOT LOG DISPATCHER
 * Dispatches real-time activity and error logs across all app modules to Telegram Bot.
 */
export async function logBotEventAction(input: {
    moduleName: string;
    userEmail?: string;
    eventType: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING';
    actionDetails: string;
    assetUrl?: string;
    pageUrl?: string;
    errorDetails?: string;
}): Promise<void> {
    try {
        const { moduleName, userEmail = 'Anonymous', eventType, actionDetails, assetUrl, pageUrl, errorDetails } = input;
        const icons: Record<string, string> = {
            INFO: 'ℹ️',
            SUCCESS: '✅',
            ERROR: '🚨',
            WARNING: '⚠️',
        };
        const icon = icons[eventType] || '🤖';
        
        let msg = `${icon} <b>[${escapeHtml(moduleName)}] ${eventType} Signal</b>\n`;
        msg += `<b>User:</b> ${escapeHtml(userEmail)}\n`;
        msg += `<b>Action:</b> ${escapeHtml(actionDetails)}\n`;
        
        if (assetUrl) {
            msg += `<b>🎧 Media Asset:</b> <a href="${escapeHtml(assetUrl)}">${escapeHtml(assetUrl)}</a>\n`;
        }
        if (pageUrl) {
            msg += `<b>🔗 Page URL:</b> <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a>\n`;
        }
        if (errorDetails) {
            msg += `<b>Error Details:</b> <pre>${escapeHtml(errorDetails)}</pre>\n`;
        }
        await sendToTelegram(msg);
    } catch (err: any) {
    reportServerError('src/app/actions.ts#6', err);
        console.error("[Bot Log Dispatch Failure]:", err?.message);
    }
}
