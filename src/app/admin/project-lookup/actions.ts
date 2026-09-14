
'use server';

import { initializeFirebase } from '@/firebase/server';
import type { Project } from '@/lib/types';
import { reportServerError } from '@/lib/report-error';

/**
 * Finds a project by its unique ID across the entire partitioned hierarchy.
 * Capable of resolving both Legacy and Partitioned nodes.
 */
export async function findProjectById(projectId: string): Promise<{ success: boolean; project?: any; message: string }> {
    const id = projectId?.trim();
    if (!id) {
        return { success: false, message: 'Project ID is required.' };
    }

    const { firestore } = initializeFirebase();

    try {
        let docSnap = null;
        let data: any = null;

        // 1. Check Legacy Path First (Direct Lookup)
        const legacyDoc = await firestore.collection('projects').doc(id).get();
        if (legacyDoc.exists) {
            docSnap = legacyDoc;
            data = legacyDoc.data();
        } 
        else {
            /**
             * 📂 PARTITIONED LOOKUP NODE
             * Since SuperFast projects are nested under users, we use a Collection Group query.
             * This requires the 'id' field to be present inside the document.
             */
            const querySnapshot = await firestore.collectionGroup('userProjects')
                .where('id', '==', id)
                .limit(1)
                .get();

            if (!querySnapshot.empty) {
                docSnap = querySnapshot.docs[0];
                data = docSnap.data();
            }
        }

        if (!docSnap || !data) {
            return { success: false, message: 'Project node not found in any partition.' };
        }
        
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
        
        const project = {
            id: docSnap.id,
            userId: data.userId,
            projectName: data.projectName,
            script: data.script,
            audioUrl: data.audioUrl,
            createdAt: createdAt,
            generationParams: data.generationParams,
            characters: data.characters,
            projectType: data.projectType,
            status: data.status,
            scriptUrl: data.scriptUrl || '',
            syncData: data.syncData,
            path: docSnap.ref.path // CRITICAL: Return full path for correct ref mapping
        };

        return {
            success: true,
            message: 'Project node synchronized.',
            project: project,
        };

    } catch (error: any) {
    reportServerError('src/app/admin/project-lookup/actions.ts#1', error);
        console.error("Error finding project by ID:", error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}
