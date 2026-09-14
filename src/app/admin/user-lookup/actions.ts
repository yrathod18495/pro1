
'use server';

import { initializeFirebase } from '@/firebase/server';
import type { UserProfile, CreditHistoryEntry, Notification } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { reportServerError } from '@/lib/report-error';

interface UserLookupResult {
    user: UserProfile;
    creditHistory: CreditHistoryEntry[];
    notifications: Notification[];
}

export async function findUserAndDataByEmail(email: string): Promise<{ success: boolean; data?: UserLookupResult; message: string }> {
    if (!email) {
        return { success: false, message: 'Email is required.' };
    }

    const { auth, firestore } = initializeFirebase();

    try {
        const userRecord = await auth.getUserByEmail(email);
        const userDocRef = firestore.collection('users').doc(userRecord.uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            return { success: false, message: 'User found in Auth, but no profile in Firestore.' };
        }
        
        const userProfile = { uid: userDoc.id, ...userDoc.data() } as UserProfile;

        // Fetch credit history
        const creditHistoryRef = userDocRef.collection('creditHistory').doc('history_log');
        const creditHistoryDoc = await creditHistoryRef.get();
        const creditHistory = creditHistoryDoc.exists ? (creditHistoryDoc.data()?.entries || []) : [];

        // Fetch notifications
        const notificationRef = userDocRef.collection('notifications').doc('user_notifications');
        const notificationDoc = await notificationRef.get();
        const notifications = notificationDoc.exists ? (notificationDoc.data()?.entries || []) : [];

        return {
            success: true,
            message: 'User data fetched.',
            data: {
                user: userProfile,
                creditHistory: creditHistory.sort((a: CreditHistoryEntry, b: CreditHistoryEntry) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
                notifications: notifications.sort((a: Notification, b: Notification) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
            }
        };

    } catch (error: any) {
    reportServerError('src/app/admin/user-lookup/actions.ts#1', error);
        if (error.code === 'auth/user-not-found') {
            return { success: false, message: `User with email "${email}" not found.` };
        }
        console.error("Error finding user by email:", error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}

export async function updateUserHistory(
    userId: string,
    type: 'credit' | 'notification',
    entries: any[]
): Promise<{ success: boolean; message: string }> {
    if (!userId) return { success: false, message: 'User ID is required.' };
    
    const { firestore, database } = initializeFirebase();
    
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

        revalidatePath('/admin/user-lookup');
        return { success: true, message: `${type === 'credit' ? 'Credit history' : 'Notifications'} updated successfully.` };
    } catch (error: any) {
    reportServerError('src/app/admin/user-lookup/actions.ts#2', error);
        console.error(`Error updating user ${type} history:`, error);
        return { success: false, message: error.message || `Failed to update ${type} history.` };
    }
}
