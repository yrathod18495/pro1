'use server';

import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

// Push notification logic removed as system is disabled.
// Restoring empty export to fix build dependencies.
export async function sendPushNotificationToAdmins(title: string, body: string, url: string) {
    // Push notifications are currently handled via Targeted Push Hub.
    return { success: true };
}

/**
 * 📊 ADMIN DASHBOARD STATS (Admin SDK — bypasses Firestore security rules)
 * Client-side getCountFromServer() was failing silently for admins not in
 * the hardcoded email list / without the custom 'role' claim, causing the
 * Global Registry / Verified Output Nodes cards to show 0.
 */
export async function getAdminDashboardStatsAction(): Promise<{ success: boolean; totalUsers: number; totalProjects: number; message?: string }> {
    try {
        const { firestore } = initializeFirebase();
        if (!firestore) throw new Error('Firestore service unavailable.');

        const [usersSnap, projectsSnap] = await Promise.all([
            firestore.collection('users').count().get(),
            firestore.collection('projects').count().get(),
        ]);

        return {
            success: true,
            totalUsers: usersSnap.data().count || 0,
            totalProjects: projectsSnap.data().count || 0,
        };
    } catch (error: any) {
        reportServerError('src/app/admin/actions.ts#stats', error);
        return { success: false, totalUsers: 0, totalProjects: 0, message: error.message || 'Failed to fetch stats.' };
    }
}

export async function saveDailyFreeScriptLimitAction(data: { limit: number; todayCount: number; today: string }) {
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        const numLimit = Math.max(1, Number(data.limit) || 40);
        const numCount = Math.max(0, Number(data.todayCount) || 0);

        await database.ref('settings/app/dailyFreeScriptLimit').set(numLimit);
        await database.ref(`dailyFreeScriptGenerations/${data.today}/count`).set(numCount);

        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#1', error);
        console.error("Error updating daily script limit:", error);
        return { success: false, error: error.message || 'Failed to update limit.' };
    }
}

export async function saveHqBackendUrlAction(url: string) {
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('admin/config/hq_backend_url').set(url.trim());
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#2', error);
        console.error("Error updating HQ backend url:", error);
        return { success: false, error: error.message || 'Failed to update HQ backend URL.' };
    }
}

export async function saveEditingHfBackendAction(data: { url: string; enabled: boolean }) {
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('settings/editingHfBackend').update({
            url: (data.url || '').trim(),
            enabled: data.enabled !== false,
            updatedAt: new Date().toISOString(),
        });
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#3', error);
        console.error("Error updating editing HF backend:", error);
        return { success: false, error: error.message || 'Failed to update Editing HF Backend.' };
    }
}

export async function toggleToolLockAction(id: string, locked: boolean) {
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref(`toolSettings/${id}/locked`).set(locked);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#4', error);
        console.error("Error toggling tool lock:", error);
        return { success: false, error: error.message || 'Failed to toggle tool status.' };
    }
}

export async function saveMusicWatermarkUrlAction(url: string) {
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('settings/app').update({ musicWatermarkUrl: url });
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#5', error);
        console.error("Error updating music watermark:", error);
        return { success: false, error: error.message || 'Failed to update watermark URL.' };
    }
}

export async function setAnalysisExecutionModeAction(mode: 'realtime' | 'server') {
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('settings/analysisExecutionMode').set(mode);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#6', error);
        console.error("Error updating analysis execution mode:", error);
        return { success: false, error: error.message || 'Failed to update execution mode.' };
    }
}

