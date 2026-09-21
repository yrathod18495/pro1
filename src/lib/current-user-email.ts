import { initializeFirebase } from '@/firebase';

/**
 * Best-effort read of the currently logged-in user's email, for attaching
 * to error reports. Never throws — returns 'anonymous' if Firebase isn't
 * initialized yet or no one is logged in, so callers can always show
 * *something* useful in the Telegram log.
 *
 * Deliberately does NOT call reportClientError on failure: this function
 * is itself called BY reportClientError (to label the "User:" field), so
 * reporting here would recurse if the failure were persistent rather than
 * transient — same guard as reportClientError's own catch.
 */
export function getCurrentUserEmail(): string {
  try {
    const { auth } = initializeFirebase();
    return auth?.currentUser?.email || 'anonymous';
  } catch {
    return 'anonymous';
  }
}
