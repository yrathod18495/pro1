'use server';

import webpush from 'web-push';
import crypto from 'crypto';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

/**
 * Returns VAPID configuration and derives the exact matching Public Key from PUSH_PRIVATE_KEY
 */
function getVapidKeys() {
    const privateKey = (process.env.PUSH_PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
    const configuredPublic = (process.env.NEXT_PUBLIC_VAPID || '').trim().replace(/^["']|["']$/g, '');
    const defaultPublic = 'BBtch_VrbD3lBahKFtM68sPvbjbGwysDiLrgls0F6IbeoxWAjYL9dhonyYo1Ib49M-yVVxm1F5Qoz40FIePpD70';

    if (!privateKey) {
        return {
            privateKey: '',
            publicKey: configuredPublic || defaultPublic,
            derivedPublicKey: '',
            isPrivateKeySet: false,
            keysMatch: false,
            error: 'PUSH_PRIVATE_KEY environment variable is missing.'
        };
    }

    try {
        const ecdh = crypto.createECDH('prime256v1');
        const privBuffer = Buffer.from(privateKey, 'base64url');
        ecdh.setPrivateKey(privBuffer);
        const derivedPublicKey = ecdh.getPublicKey('base64url');

        return {
            privateKey,
            publicKey: derivedPublicKey, // WebPush MUST use the derived key for 100% JWT signature match
            configuredPublicKey: configuredPublic,
            derivedPublicKey,
            isPrivateKeySet: true,
            keysMatch: !configuredPublic || configuredPublic === derivedPublicKey,
            error: null
        };
    } catch (e: any) {
    reportServerError('src/app/admin/push-actions.ts#1', e);
        return {
            privateKey,
            publicKey: configuredPublic || defaultPublic,
            derivedPublicKey: '',
            isPrivateKeySet: true,
            keysMatch: false,
            error: `Invalid PUSH_PRIVATE_KEY format: ${e.message}`
        };
    }
}

/**
 * Extracts all subscription objects for a user (supports both single object and multi-device object)
 */
function extractSubscriptions(userVal: any): any[] {
    if (!userVal || typeof userVal !== 'object') return [];
    if (userVal.subscription) {
        return [userVal.subscription];
    }
    const subs: any[] = [];
    Object.values(userVal).forEach((dev: any) => {
        if (dev && dev.subscription) {
            subs.push(dev.subscription);
        }
    });
    return subs;
}

function getSubscriptionVapidKey(subscription: any): string | null {
    return typeof subscription?.vapidPublicKey === 'string'
        ? subscription.vapidPublicKey.trim()
        : null;
}

async function removeSubscription(database: any, userId: string, subscription: any) {
    const userRef = database.ref(`pushSubscriptions/${userId}`);
    const snap = await userRef.get();
    if (!snap.exists()) return;

    const value = snap.val();
    // Legacy format: the subscription was stored directly at the user node.
    if (value?.subscription) {
        await userRef.remove();
        return;
    }

    const endpoint = subscription?.endpoint;
    if (!endpoint || !value || typeof value !== 'object') return;
    const matchingDevice = Object.entries(value).find(
        ([, device]: [string, any]) => device?.subscription?.endpoint === endpoint
    );
    if (matchingDevice) {
        await userRef.child(matchingDevice[0]).remove();
    }
}

/**
 * Server action to get active matching VAPID public key
 */
export async function getActiveVapidPublicKey(): Promise<string> {
    const vapid = getVapidKeys();
    return vapid.publicKey;
}

/**
 * Server Action for Push Diagnostic Report
 */
export async function getPushDiagnostics() {
    const vapid = getVapidKeys();
    const { database } = initializeFirebase();

    let totalSubscriptions = 0;
    let subscriptionUids: string[] = [];

    try {
        const snap = await database.ref('pushSubscriptions').get();
        if (snap.exists()) {
            const data = snap.val();
            subscriptionUids = Object.keys(data);
            Object.values(data).forEach((userVal: any) => {
                const subs = extractSubscriptions(userVal);
                totalSubscriptions += subs.length;
            });
        }
    } catch (err: any) {
    reportServerError('src/app/admin/push-actions.ts#2', err);
        console.error('[Push Diagnostic] RTDB Error:', err);
    }

    return {
        isPrivateKeySet: vapid.isPrivateKeySet,
        derivedPublicKey: vapid.derivedPublicKey,
        configuredPublicKey: vapid.configuredPublicKey || vapid.derivedPublicKey,
        keysMatch: vapid.keysMatch,
        keyError: vapid.error,
        totalSubscriptions,
        activeUserCount: subscriptionUids.length,
    };
}

/**
 * Server action to send push notifications to a user.
 * Logic: Email -> Auth User Record -> UID -> RTDB Subscription -> Send
 */
export async function sendPushToUserByEmail(
  email: string, 
  title: string, 
  body: string, 
  url?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    const { auth, database } = initializeFirebase();
    const vapid = getVapidKeys();

    if (!vapid.privateKey) {
        return { success: false, error: "CRITICAL: PUSH_PRIVATE_KEY environment variable is not configured." };
    }

    try {
        webpush.setVapidDetails(
            'mailto:12labofficial@gmail.com',
            vapid.publicKey,
            vapid.privateKey
        );

        // 1. Find user by email (Strict Case-Insensitive)
        const targetEmail = email.toLowerCase().trim();
        const userRecord = await auth.getUserByEmail(targetEmail);
        const userId = userRecord.uid;
        
        // 2. Get their subscriptions from RTDB Node
        const subscriptionsSnap = await database.ref(`pushSubscriptions/${userId}`).get();
        
        if (!subscriptionsSnap.exists()) {
            return { success: false, error: `USER_NOT_SUBSCRIBED: No push token found in database vault for UID: ${userId}` };
        }

        const userVal = subscriptionsSnap.val();
        const subscriptions = extractSubscriptions(userVal);
        
        if (subscriptions.length === 0) {
            return { success: false, error: `USER_NOT_SUBSCRIBED: No push token found in database vault for UID: ${userId}` };
        }

        const notificationPayload = JSON.stringify({ 
            title: title || '12Labs AI Studio', 
            body: body || 'You have a new update.', 
            url: url?.trim() || null,
            id: Date.now()
        });

        // 3. Send to extracted subscriptions
        const results = await Promise.all(subscriptions.map(async (sub: any) => {
            try {
                const subscriptionKey = getSubscriptionVapidKey(sub);
                if (subscriptionKey && subscriptionKey !== vapid.publicKey) {
                    await removeSubscription(database, userId, sub).catch(() => {});
                    return {
                        success: false,
                        error: 'STALE_SUBSCRIPTION: This device was registered with an older VAPID key. Ask the user to enable notifications again.',
                    };
                }
                const response = await webpush.sendNotification(sub, notificationPayload);
                return { success: true, statusCode: response.statusCode };
            } catch (err: any) {
    reportServerError('src/app/admin/push-actions.ts#3', err);
                const rawError = err.body || err.message || `HTTP ${err.statusCode}`;
                // 404, 410, 401, 400 or VAPID mismatch means subscription token is expired or created with an old key
                if (err.statusCode === 404 || err.statusCode === 410 || err.statusCode === 401 || err.statusCode === 400 || rawError.toLowerCase().includes('vapid')) {
                     await removeSubscription(database, userId, sub).catch(() => {});
                }
                return { 
                    success: false, 
                    error: rawError,
                    statusCode: err.statusCode 
                };
            }
        }));

        const successCount = results.filter(r => r.success).length;
        if (successCount === 0) {
            const firstRawError = results[0]?.error || "Unknown Network Response";
            return { 
                success: false, 
                error: `DISPATCH_FAILED: ${firstRawError}`
            };
        }

        return { success: true, message: `Dispatched successfully to ${successCount} device(s).` };

    } catch (e: any) {
    reportServerError('src/app/admin/push-actions.ts#4', e);
        if (e.code === 'auth/user-not-found') return { success: false, error: "AUTH_ERROR: Email not found in Authentication database." };
        return { success: false, error: `SYSTEM_ERROR: ${e.message}` };
    }
}

/**
 * Server action to send push notifications to a user directly by user ID (UID).
 */
export async function sendPushToUserById(
  userId: string, 
  title: string, 
  body: string, 
  url?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    const { database } = initializeFirebase();
    const vapid = getVapidKeys();

    if (!vapid.privateKey) {
        return { success: false, error: "CRITICAL: PUSH_PRIVATE_KEY environment variable is not configured." };
    }

    try {
        webpush.setVapidDetails(
            'mailto:12labofficial@gmail.com',
            vapid.publicKey,
            vapid.privateKey
        );

        // Get subscriptions directly from RTDB for this userId
        const subscriptionsSnap = await database.ref(`pushSubscriptions/${userId}`).get();
        
        if (!subscriptionsSnap.exists()) {
            return { success: false, error: `USER_NOT_SUBSCRIBED: No push token found in database vault for UID: ${userId}` };
        }

        const userVal = subscriptionsSnap.val();
        const subscriptions = extractSubscriptions(userVal);
        
        if (subscriptions.length === 0) {
            return { success: false, error: `USER_NOT_SUBSCRIBED: No push token found in database vault for UID: ${userId}` };
        }

        const notificationPayload = JSON.stringify({ 
            title: title || '12Labs Support', 
            body: body || 'You have a new message from support.', 
            url: url?.trim() || '/?open_chat=true',
            id: Date.now()
        });

        const results = await Promise.all(subscriptions.map(async (sub: any) => {
            try {
                const subscriptionKey = getSubscriptionVapidKey(sub);
                if (subscriptionKey && subscriptionKey !== vapid.publicKey) {
                    await removeSubscription(database, userId, sub).catch(() => {});
                    return {
                        success: false,
                        error: 'STALE_SUBSCRIPTION: This device was registered with an older VAPID key. Ask the user to enable notifications again.',
                    };
                }
                const response = await webpush.sendNotification(sub, notificationPayload);
                return { success: true, statusCode: response.statusCode };
            } catch (err: any) {
    reportServerError('src/app/admin/push-actions.ts#5', err);
                const rawError = err.body || err.message || `HTTP ${err.statusCode}`;
                if (err.statusCode === 404 || err.statusCode === 410 || err.statusCode === 401 || err.statusCode === 400 || rawError.toLowerCase().includes('vapid')) {
                     await removeSubscription(database, userId, sub).catch(() => {});
                }
                return { 
                    success: false, 
                    error: rawError,
                    statusCode: err.statusCode 
                };
            }
        }));

        const successCount = results.filter(r => r.success).length;
        if (successCount === 0) {
            const firstRawError = results[0]?.error || "Unknown Network Response";
            return { 
                success: false, 
                error: `DISPATCH_FAILED: ${firstRawError}`
            };
        }

        return { success: true, message: `Dispatched successfully to ${successCount} device(s).` };
    } catch (e: any) {
    reportServerError('src/app/admin/push-actions.ts#6', e);
        return { success: false, error: `SYSTEM_ERROR: ${e.message}` };
    }
}

/**
 * Server action to send push notifications to ALL subscribed devices in RTDB.
 */
export async function sendBroadcastPush(
  title: string,
  body: string,
  url?: string
): Promise<{ success: boolean; count?: number; error?: string }> {
    const { database } = initializeFirebase();
    const vapid = getVapidKeys();

    if (!vapid.privateKey) {
        return { success: false, error: "PUSH_PRIVATE_KEY environment variable is not configured." };
    }

    try {
        webpush.setVapidDetails(
            'mailto:12labofficial@gmail.com',
            vapid.publicKey,
            vapid.privateKey
        );

        const subscriptionsSnap = await database.ref('pushSubscriptions').get();
        if (!subscriptionsSnap.exists()) {
            return { success: false, error: "No push subscriptions found in database." };
        }

        const allSubs = subscriptionsSnap.val();
        const notificationPayload = JSON.stringify({ 
            title: title || '12Labs AI Studio', 
            body: body || 'You have a new update.', 
            url: url?.trim() || null,
            id: Date.now()
        });

        let successCount = 0;
        let lastError = '';
        const promises: Promise<void>[] = [];

        Object.entries(allSubs).forEach(([userId, userVal]: [string, any]) => {
            const subs = extractSubscriptions(userVal);
            subs.forEach((sub: any) => {
                promises.push(
                    (async () => {
                        const subscriptionKey = getSubscriptionVapidKey(sub);
                        if (subscriptionKey && subscriptionKey !== vapid.publicKey) {
                            await removeSubscription(database, userId, sub).catch(() => {});
                            throw new Error('STALE_SUBSCRIPTION: device was registered with an older VAPID key');
                        }
                        return webpush.sendNotification(sub, notificationPayload);
                    })()
                        .then(() => { successCount++; })
                        .catch(async (err) => {
                            lastError = err.body || err.message || `HTTP ${err.statusCode}`;
                            if (err.statusCode === 404 || err.statusCode === 410 || err.statusCode === 401 || err.statusCode === 400 || lastError.toLowerCase().includes('vapid')) {
                                 await removeSubscription(database, userId, sub).catch(() => {});
                            }
                        })
                );
            });
        });

        await Promise.all(promises);

        if (successCount === 0 && lastError) {
            return { success: false, count: 0, error: `DISPATCH_FAILED: ${lastError}` };
        }

        return { success: true, count: successCount };
    } catch (e: any) {
    reportServerError('src/app/admin/push-actions.ts#7', e);
        return { success: false, error: e.message };
    }
}


