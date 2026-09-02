'use server';

import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { SellerProfile } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { getDisplayUrl, resolvePublicAudioUrl } from '@/lib/utils';
import { headers } from 'next/headers';
import { sendProjectReadyEmailAction } from '@/app/emails/actions';
import { reportServerError } from '@/lib/report-error';

export async function startProcessingProject(
  projectId: string,
  userId: string,
  adminEmail: string
): Promise<{ success: boolean; message: string }> {
  const { firestore, database } = initializeFirebase();
  try {
    // 📂 DYNAMIC PATH ROUTING: Check if it's a Pro project
    const isPro = projectId.startsWith('PRO_');
    const rtdbPath = isPro ? 'pro_projects' : 'pending_projects';
    const collectionName = isPro ? 'pro_projects' : 'projects';
    
    const rtdbRef = database.ref(`${rtdbPath}/${projectId}`);
    const firestoreRef = firestore.collection(collectionName).doc(userId).collection('userProjects').doc(projectId);
    
    await rtdbRef.update({ status: 'processing' });
    await firestoreRef.set({ status: 'processing' }, { merge: true });
    
    await sendToTelegram(`👨‍💻 *Processing Started by Admin*\n*Admin:* ${adminEmail}\n*Node:* ${rtdbPath.toUpperCase()}\n*ID:* \`${projectId}\``);
    
    revalidatePath('/admin/pending');
    return { success: true, message: 'Project status updated to processing.' };
  } catch (error: any) {
    reportServerError('src/app/admin/pending/actions.ts#1', error);
    console.error(`Failed to start processing for project ${projectId}:`, error);
    return { success: false, message: error.message };
  }
}

export async function completeProjectAction(
  projectId: string,
  userId: string,
  projectName: string,
  audioUrl: string,
  syncData?: string,
  adminEmail?: string,
  usedBridge: boolean = false
): Promise<{ success: boolean; message: string }> {
  const { firestore, database } = initializeFirebase();
  try {
    const batch = firestore.batch();
    
    // 📂 DYNAMIC PATH ROUTING
    const isPro = projectId.startsWith('PRO_');
    const rtdbPath = isPro ? 'pro_projects' : 'pending_projects';
    const collectionName = isPro ? 'pro_projects' : 'projects';
    
    const projectRef = firestore.collection(collectionName).doc(userId).collection('userProjects').doc(projectId);
    
    const updateData: any = { 
      id: projectId,
      userId: userId,
      status: 'completed', 
      audioUrl: resolvePublicAudioUrl(audioUrl)
    };

    if (syncData && syncData.trim() !== '') {
      try {
        updateData.syncData = JSON.parse(syncData);
      } catch (e) {
    reportServerError('src/app/admin/pending/actions.ts#2', e);
        console.warn("[Finalize] Malformed syncData received, skipping update.");
      }
    }
    
    batch.set(projectRef, updateData, { merge: true });

    const notificationRef = firestore.collection('users').doc(userId).collection('notifications').doc('user_notifications');
    const notificationData = { 
      id: `done-${Date.now()}`, 
      message: `Your project "${projectName}" has been successfully generated!`, 
      timestamp: new Date().toISOString(), 
      read: false, 
      type: 'system' as const 
    };
    batch.set(notificationRef, { entries: FieldValue.arrayUnion(notificationData) }, { merge: true });

    await batch.commit();
    
    // Cleanup from correct RTDB Node
    await database.ref(`${rtdbPath}/${projectId}`).remove();
    
    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        const projectDoc = await projectRef.get();
        
        if (userDoc.exists && projectDoc.exists) {
            const userData = userDoc.data();
            const projectData = projectDoc.data();
            
            await sendProjectReadyEmailAction({
                name: userData?.name || 'Creator',
                email: userData?.email || '',
                projectName: projectData?.projectName || projectName,
                script: projectData?.script || '',
                characters: projectData?.characters || []
            });
        }
    } catch (emailError) {
    reportServerError('src/app/admin/pending/actions.ts#3', emailError);
        console.error("Non-critical email dispatch failure:", emailError);
    }

    revalidatePath('/admin/pending');
    return { success: true, message: 'Project finalized and user notified.' };
  } catch (error: any) {
    reportServerError('src/app/admin/pending/actions.ts#4', error);
    console.error("Finalize project error:", error);
    return { success: false, message: error.message };
  }
}

export async function approveSellerAction(
    userId: string,
    adminEmail: string
): Promise<{ success: boolean; message: string }> {
    const { database } = initializeFirebase();
    try {
        const pendingRef = database.ref(`pendingSellerProfiles/${userId}`);
        const snapshot = await pendingRef.get();
        if (!snapshot.exists()) throw new Error("Pending profile not found.");
        
        const data = snapshot.val() as SellerProfile;
        const liveRef = database.ref(`sellerProfiles/${userId}`);
        
        await liveRef.update({ status: 'approved' });
        await pendingRef.remove();

        const firestore = initializeFirebase().firestore;
        const notificationRef = firestore.collection('users').doc(userId).collection('notifications').doc('user_notifications');
        const notificationData = {
            id: `seller-approve-${Date.now()}`,
            message: `Congratulations! Your seller profile "${data.storeName}" has been approved. You can now start listing products.`,
            timestamp: new Date().toISOString(),
            read: false,
            type: 'system',
        };
        await notificationRef.set({ entries: FieldValue.arrayUnion(notificationData) }, { merge: true });

        await sendToTelegram(`✅ <b>Seller Approved</b>\n<b>Store:</b> ${data.storeName}\n<b>Admin:</b> ${adminEmail}`);

        revalidatePath('/admin/pending');
        return { success: true, message: 'Seller profile approved successfully.' };
    } catch (e: any) {
    reportServerError('src/app/admin/pending/actions.ts#5', e);
        return { success: false, message: e.message };
    }
}

export async function rejectSellerAction(
    userId: string,
    reason: string,
    adminEmail: string
): Promise<{ success: boolean; message: string }> {
    const { database } = initializeFirebase();
    try {
        const pendingRef = database.ref(`pendingSellerProfiles/${userId}`);
        const snapshot = await pendingRef.get();
        if (!snapshot.exists()) throw new Error("Pending profile not found.");
        
        const data = snapshot.val() as SellerProfile;
        const liveRef = database.ref(`sellerProfiles/${userId}`);
        
        await liveRef.update({ status: 'rejected', rejectionReason: reason });
        await pendingRef.remove();

        const firestore = initializeFirebase().firestore;
        const notificationRef = firestore.collection('users').doc(userId).collection('notifications').doc('user_notifications');
        const notificationData = {
            id: `seller-reject-${Date.now()}`,
            message: `Your seller profile update for "${data.storeName}" was rejected. Reason: ${reason}`,
            timestamp: new Date().toISOString(),
            read: false,
            type: 'system',
        };
        await notificationRef.set({ entries: FieldValue.arrayUnion(notificationData) }, { merge: true });

        await sendToTelegram(`❌ <b>Seller Rejected</b>\n<b>Store:</b> ${data.storeName}\n<b>Reason:</b> ${reason}\n<b>Admin:</b> ${adminEmail}`);

        revalidatePath('/admin/pending');
        return { success: true, message: 'Seller profile rejected.' };
    } catch (e: any) {
    reportServerError('src/app/admin/pending/actions.ts#6', e);
        return { success: false, message: e.message };
    }
}
