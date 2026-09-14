import { initializeFirebase } from '@/firebase/server';

/**
 * SECURITY: Next.js Server Actions are exposed as callable network
 * endpoints. The client-side "admin only" UI gating does NOT stop
 * someone from calling an admin/seller server action directly with a
 * crafted request. Every action that reads/writes sensitive or
 * privileged data MUST verify the caller's Firebase ID token on the
 * server before doing anything — do not trust a plain userId/sellerId
 * string passed in as an argument.
 *
 * Usage in a server action:
 *
 *   'use server';
 *   import { requireAdmin } from '@/lib/auth-guard';
 *
 *   export async function deleteProductAdminAction(idToken: string, productId: string) {
 *     const guard = await requireAdmin(idToken);
 *     if (!guard.ok) return { success: false, message: guard.message };
 *     ...
 *   }
 *
 * On the client, pass the current user's fresh ID token:
 *   const idToken = await auth.currentUser.getIdToken();
 *   await deleteProductAdminAction(idToken, productId);
 */

const ADMIN_EMAILS = [
  'toonday378@gmail.com',
  'yrathod18495@gmail.com',
  'Yashsharma4638@gmail.com',
  'abcdtoon30@gmail.com',
  '12labofficial@gmail.com',
].map((e) => e.toLowerCase());

type GuardResult =
  | { ok: true; uid: string; email: string | null }
  | { ok: false; message: string };

export async function requireUser(idToken: string | undefined | null): Promise<GuardResult> {
  if (!idToken) return { ok: false, message: 'Not signed in.' };
  try {
    const { auth } = initializeFirebase();
    const decoded = await auth.verifyIdToken(idToken);
    return { ok: true, uid: decoded.uid, email: decoded.email || null };
  } catch {
    return { ok: false, message: 'Invalid or expired session. Please sign in again.' };
  }
}

export async function requireAdmin(idToken: string | undefined | null): Promise<GuardResult> {
  const result = await requireUser(idToken);
  if (!result.ok) return result;

  try {
    const { auth } = initializeFirebase();
    const user = await auth.getUser(result.uid);
    const claimRole = (user.customClaims as any)?.role;
    const isAdminByClaim = claimRole === 'admin';
    const isAdminByEmail = !!result.email && ADMIN_EMAILS.includes(result.email.toLowerCase());

    if (!isAdminByClaim && !isAdminByEmail) {
      return { ok: false, message: 'Admin access required.' };
    }
    return result;
  } catch {
    return { ok: false, message: 'Could not verify admin access.' };
  }
}
