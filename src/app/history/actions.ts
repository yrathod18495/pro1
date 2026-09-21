'use server';

import { initializeFirebase } from '@/firebase/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { resolvePublicAudioUrl } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

/**
 * 📂 DUAL-PATH DELETE ACTION
 * Automatically detects if project is in legacy, partitioned, or pro_projects path.
 */
export async function adminDeleteProjectAction(projectId: string, adminUserId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
    if (!projectId || !adminUserId || !targetUserId) {
        return { success: false, message: 'Missing identifiers for deletion.' };
    }

    const { firestore } = initializeFirebase();

    try {
        const adminUserRef = firestore.collection('users').doc(adminUserId);
        const adminUserDoc = await adminUserRef.get();
        if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
            throw new Error('Permission denied. Admin privileges required.');
        }
        
        // 1. Check Partitioned Path first
        const partitionedRef = firestore.collection('projects').doc(targetUserId).collection('userProjects').doc(projectId);
        const partitionedDoc = await partitionedRef.get();
        if (partitionedDoc.exists) {
            await partitionedRef.delete();
        } else {
            // 2. Check Pro Projects Path
            const proRef = firestore.collection('pro_projects').doc(targetUserId).collection('userProjects').doc(projectId);
            const proDoc = await proRef.get();
            if (proDoc.exists) {
                await proRef.delete();
            } else {
                // 3. Check Legacy Path
                await firestore.collection('projects').doc(projectId).delete();
            }
        }
        
        revalidatePath('/history');
        return { success: true, message: 'Project node purged successfully.' };

    } catch (error: any) {
    reportServerError('src/app/history/actions.ts#1', error);
        console.error('Error deleting project:', error);
        return { success: false, message: error.message || 'Failed to delete project.' };
    }
}

/**
 * 🗑️ USER DELETE PROJECT ACTION
 */
export async function deleteUserProjectAction(projectId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const { firestore } = initializeFirebase();
    try {
        // Find in all possible partitions and mark as deleted for user
        const partitionedRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        const partitionedDoc = await partitionedRef.get();
        
        if (partitionedDoc.exists) {
            await partitionedRef.update({ userDeleted: true });
        } else {
            const proRef = firestore.collection('pro_projects').doc(userId).collection('userProjects').doc(projectId);
            const proDoc = await proRef.get();
            if (proDoc.exists) {
                await proRef.update({ userDeleted: true });
            } else {
                const musicRef = firestore.collection('music_project').doc(userId).collection('userProjects').doc(projectId);
                const musicDoc = await musicRef.get();
                if (musicDoc.exists) {
                    await musicRef.update({ userDeleted: true });
                } else {
                    const musicRootRef = firestore.collection('music_project').doc(projectId);
                    const musicRootDoc = await musicRootRef.get();
                    if (musicRootDoc.exists) {
                        await musicRootRef.update({ userDeleted: true });
                    } else {
                        // Check legacy
                        const legacyRef = firestore.collection('projects').doc(projectId);
                        const legacyDoc = await legacyRef.get();
                        if (legacyDoc.exists && legacyDoc.data()?.userId === userId) {
                            await legacyRef.update({ userDeleted: true });
                        }
                    }
                }
            }
        }
        
        revalidatePath('/history');
        return { success: true, message: 'Project removed from history.' };
    } catch (e: any) {
    reportServerError('src/app/history/actions.ts#2', e);
        return { success: false, message: e.message };
    }
}

/**
 * 🎙️ USER UPDATE PROJECT VOICES ACTION
 */
export async function userUpdateProjectVoicesAction(projectId: string, userId: string, characters: any[]): Promise<{ success: boolean; message: string }> {
    const { firestore } = initializeFirebase();
    try {
        const partitionedRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        const partitionedDoc = await partitionedRef.get();
        
        if (partitionedDoc.exists) {
            await partitionedRef.update({ characters });
        } else {
            const proRef = firestore.collection('pro_projects').doc(userId).collection('userProjects').doc(projectId);
            const proDoc = await proRef.get();
            if (proDoc.exists) {
                await proRef.update({ characters });
            }
        }
        
        revalidatePath('/history');
        return { success: true, message: 'Characters updated.' };
    } catch (e: any) {
    reportServerError('src/app/history/actions.ts#3', e);
        return { success: false, message: e.message };
    }
}

/**
 * 🗑️ DELETE USER THUMBNAIL ACTION
 */
export async function deleteUserThumbnailAction(thumbnailId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const { firestore } = initializeFirebase();
    try {
        // 🔎 MULTI-PATH DELETE: thumbnails live in one of several possible
        // locations depending on when/how they were generated. Check each
        // one and delete from wherever the doc actually exists, otherwise
        // the client shows "Deleted" while the real doc (and card) survives.
        let deleted = false;

        // 1. users/{uid}/thumbnails/{id}
        const usersRef = firestore.collection('users').doc(userId).collection('thumbnails').doc(thumbnailId);
        if ((await usersRef.get()).exists) {
            await usersRef.delete();
            deleted = true;
        }

        // 2. thumbnailProjects/{uid}/userProjects/{id}
        const partitionedRef = firestore.collection('thumbnailProjects').doc(userId).collection('userProjects').doc(thumbnailId);
        if ((await partitionedRef.get()).exists) {
            await partitionedRef.delete();
            deleted = true;
        }

        // 3. thumbnail_projects/{uid}/userProjects/{id}
        const snakeCaseRef = firestore.collection('thumbnail_projects').doc(userId).collection('userProjects').doc(thumbnailId);
        if ((await snakeCaseRef.get()).exists) {
            await snakeCaseRef.delete();
            deleted = true;
        }

        // 4. thumbnailProjects/{id} (root collection, filtered by userId)
        const rootRef = firestore.collection('thumbnailProjects').doc(thumbnailId);
        const rootDoc = await rootRef.get();
        if (rootDoc.exists && rootDoc.data()?.userId === userId) {
            await rootRef.delete();
            deleted = true;
        }

        if (!deleted) {
            return { success: false, message: 'Thumbnail not found in any known location.' };
        }

        revalidatePath('/history');
        return { success: true, message: 'Thumbnail purged.' };
    } catch (e: any) {
    reportServerError('src/app/history/actions.ts#4', e);
        return { success: false, message: e.message };
    }
}

const UpdateProjectSchema = z.object({
  projectName: z.string().min(1, 'Project name is required.'),
  script: z.string().min(1, 'Script cannot be empty.'),
  audioUrl: z.string().optional().or(z.literal('')),
  cost: z.coerce.number().min(0).optional(),
  syncData: z.any().optional().nullable(),
  userId: z.string(), 
});

/**
 * 📂 DUAL-PATH UPDATE ACTION
 */
export async function adminUpdateProjectAction(
    projectId: string,
    updates: z.infer<typeof UpdateProjectSchema>,
    adminUserId: string
): Promise<{ success: boolean; message: string }> {
    if (!projectId || !adminUserId) {
        return { success: false, message: 'Project ID and Admin User ID are required.' };
    }
    
    const validation = UpdateProjectSchema.safeParse(updates);
    if (!validation.success) {
        return { success: false, message: validation.error.flatten().formErrors.join(', ') };
    }

    if (validation.data.audioUrl) {
        validation.data.audioUrl = resolvePublicAudioUrl(validation.data.audioUrl);
    }

    const { firestore } = initializeFirebase();

    try {
        const adminUserRef = firestore.collection('users').doc(adminUserId);
        const adminUserDoc = await adminUserRef.get();
        if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
            throw new Error('Permission denied. Admin privileges required.');
        }

        const { userId, ...updatePayload } = validation.data;
        
        // 1. Check Partitioned Path
        const partitionedRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        const partitionedDoc = await partitionedRef.get();
        if (partitionedDoc.exists) {
            await partitionedRef.update(updatePayload);
        } else {
            // 2. Check Pro Projects Path
            const proRef = firestore.collection('pro_projects').doc(userId).collection('userProjects').doc(projectId);
            const proDoc = await proRef.get();
            if (proDoc.exists) {
                await proRef.update(updatePayload);
            } else {
                // 3. Fallback to Legacy Path
                await firestore.collection('projects').doc(projectId).update(updatePayload);
            }
        }
        
        revalidatePath('/history');
        return { success: true, message: 'Project synchronized successfully.' };

    } catch (error: any) {
    reportServerError('src/app/history/actions.ts#5', error);
        console.error('Error updating project:', error);
        return { success: false, message: error.message || 'Failed to update project.' };
    }
}
