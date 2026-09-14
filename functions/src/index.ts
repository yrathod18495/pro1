import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

admin.initializeApp();

const firestore = admin.firestore();
const database = admin.database();
firestore.settings({ ignoreUndefinedProperties: true });

const FieldValue = admin.firestore.FieldValue;

/**
 * Sends a message to the same Telegram bot/chat the web app uses for admin
 * logs. Mirrors src/lib/telegram-logger.ts::sendToTelegram. Reads
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from functions/.env (see
 * functions/.env.example).
 */
async function sendToTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const rawChatIds = process.env.TELEGRAM_CHAT_ID;

  if (!token || !rawChatIds) {
    logger.warn('[Telegram] Bot token or chat ID missing — skipping notification.');
    return;
  }

  const chatIdArray = rawChatIds.split(',').map((id) => id.trim()).filter(Boolean);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await Promise.all(
      chatIdArray.map((chatId) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: 'HTML',
            text: message.slice(0, 4096),
          }),
        })
      )
    );
  } catch (error: any) {
    logger.error('[Telegram] Failed to dispatch notification:', error.message);
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Credit amount granted per installment, per plan. Keep this in sync with
// `weeklyCredits` in src/lib/plans.ts on the web app.
const WEEKLY_CREDITS: Record<string, number> = {
  autopay_pro: 20000,
  test_sub: 2,
};

const PLAN_NAMES: Record<string, string> = {
  autopay_pro: 'Consistent Creator',
  test_sub: 'Test Sub (Weekly)',
};

// Days between installments, per plan. Keep in sync with `grantIntervalDays`
// in src/lib/plans.ts. autopay_pro grants weekly (7 days); test_sub grants
// daily (1 day) so its 7-day billing cycle pays out 2 credits every day.
const GRANT_INTERVAL_DAYS: Record<string, number> = {
  autopay_pro: 7,
  test_sub: 1,
};

// Total installments before the plan auto-completes and deactivates. Keep in
// sync with `maxGrants` in src/lib/plans.ts.
const MAX_GRANTS: Record<string, number> = {
  autopay_pro: 4,
  test_sub: 7,
};

interface UserSubscription {
  planId: string;
  status: 'active' | 'past_due' | 'cancelled';
  subscriptionId?: string;
  startDate: string;
  nextWeeklyGrantDate: string;
  weeklyGrantCount: number;
  currentCycleMonth: string;
  manuallyGranted?: boolean;
}

function parseSubscriptionDate(value: any): Date {
  if (value?.toDate && typeof value.toDate === 'function') return value.toDate();
  if (value?._seconds || value?.seconds) {
    return new Date(Number(value._seconds ?? value.seconds) * 1000);
  }
  return new Date(value);
}

/**
 * Grants any weekly installments that are due for a single user. Mirrors the
 * logic in src/app/actions.ts::syncUserSubscriptionInstallments so behavior
 * stays identical whether the grant fires from the web app or from here.
 */
async function grantDueInstallmentsForUser(userId: string): Promise<{ granted: boolean; weekCount?: number; email?: string }> {
  const userRef = firestore.collection('users').doc(userId);

  return firestore.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) return { granted: false };

    const userData = userDoc.data() as any;
    const sub = userData.subscription as UserSubscription | undefined;

    if (!sub || (sub.planId !== 'autopay_pro' && sub.planId !== 'test_sub') ||
        (sub.status !== 'active' && sub.status !== 'cancelled')) {
      return { granted: false };
    }

    const maxGrants = MAX_GRANTS[sub.planId] ?? 4;
    if (sub.weeklyGrantCount >= maxGrants) {
      return { granted: false };
    }

    const serverNow = new Date();
    let currentNextGrantDate = parseSubscriptionDate(sub.nextWeeklyGrantDate);
    if (Number.isNaN(currentNextGrantDate.getTime())) {
      logger.error(`Invalid nextWeeklyGrantDate for user ${userId}`);
      return { granted: false };
    }

    let currentWeekCount = sub.weeklyGrantCount;
    let totalCreditsToGrant = 0;
    const newHistoryEntries: any[] = [];
    const newNotifications: any[] = [];

    const grantAmount = WEEKLY_CREDITS[sub.planId] ?? (sub.planId === 'test_sub' ? 2 : 20000);
    const planName = PLAN_NAMES[sub.planId] || 'Consistency Plan';
    const intervalDays = GRANT_INTERVAL_DAYS[sub.planId] ?? 7;
    const unitLabel = intervalDays === 1 ? 'Day' : 'Week';

    while (serverNow >= currentNextGrantDate && currentWeekCount < maxGrants) {
      const scheduledTimestamp = currentNextGrantDate.toISOString();
      totalCreditsToGrant += grantAmount;
      currentWeekCount++;

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
        type: 'credits',
      });

      currentNextGrantDate = new Date(currentNextGrantDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    }

    if (totalCreditsToGrant <= 0) return { granted: false };

    const isPlanFinished = currentWeekCount >= maxGrants;
    const updateData: any = { credits: FieldValue.increment(totalCreditsToGrant) };

    if (isPlanFinished) {
      updateData.subscription = FieldValue.delete();
      newNotifications.push({
        id: `sub-complete-${Date.now()}`,
        message: `Congratulations! Your ${maxGrants * intervalDays}-day Consistency Plan is complete. Your credits will expire 30 days from the original purchase date.`,
        timestamp: serverNow.toISOString(),
        read: false,
        type: 'system',
      });
    } else {
      updateData.subscription = {
        ...sub,
        weeklyGrantCount: currentWeekCount,
        nextWeeklyGrantDate: currentNextGrantDate.toISOString(),
      };
    }

    transaction.update(userRef, updateData);

    const historyLogRef = userRef.collection('creditHistory').doc('history_log');
    transaction.set(historyLogRef, { entries: FieldValue.arrayUnion(...newHistoryEntries) }, { merge: true });

    const notificationRef = userRef.collection('notifications').doc('user_notifications');
    transaction.set(notificationRef, { entries: FieldValue.arrayUnion(...newNotifications) }, { merge: true });

    // RTDB history writes can't happen inside a Firestore transaction callback
    // (it may retry), so queue them and fire after the transaction commits.
    // We return the entries and push them below, outside the transaction.
    return {
      granted: true,
      weekCount: currentWeekCount,
      planId: sub.planId,
      email: userData.email,
      _rtdbEntries: newHistoryEntries,
      _userId: userId,
    } as any;
  }).then(async (result: any) => {
    if (result?.granted && result._rtdbEntries?.length) {
      for (const entry of result._rtdbEntries) {
        await database.ref(`creditHistory/${result._userId}`).push(entry).catch((e) =>
          logger.error(`RTDB history write failed for ${result._userId}`, e)
        );
      }
      await sendToTelegram(
        `⚡ <b>Consistency Grants Synchronized</b>\n<b>User:</b> ${escapeHtml(result.email || result._userId)}\n<b>Status:</b> ${result.weekCount >= (MAX_GRANTS[result.planId] ?? 4) ? 'Plan Completed (Deactivated)' : `Grant ${result.weekCount}/${MAX_GRANTS[result.planId] ?? 4}`}`
      );
    }
    return result;
  });
}

async function syncAllDueSubscriptions(): Promise<{ syncedCount: number; syncedUsers: string[] }> {
  const usersSnap = await firestore
    .collection('users')
    .where('subscription.status', 'in', ['active', 'cancelled'])
    .get();

  const syncedUsers: string[] = [];

  for (const doc of usersSnap.docs) {
    const sub = doc.data().subscription as UserSubscription | undefined;
    if (!sub || (sub.planId !== 'autopay_pro' && sub.planId !== 'test_sub') || (sub.weeklyGrantCount || 0) >= (MAX_GRANTS[sub.planId] ?? 4)) {
      continue;
    }
    try {
      const res = await grantDueInstallmentsForUser(doc.id);
      if (res.granted) {
        syncedUsers.push(`${res.email || doc.id} (Week ${res.weekCount ?? 4})`);
      }
    } catch (e) {
      logger.error(`Failed syncing subscription for user ${doc.id}`, e);
    }
  }

  return { syncedCount: syncedUsers.length, syncedUsers };
}

/**
 * Runs every hour. Grants any weekly subscription credits that have become
 * due, for every user, regardless of whether they've opened the app. This
 * replaces relying on a host-specific cron (e.g. Vercel Cron) — it runs on
 * Firebase's own Cloud Scheduler and only needs the Blaze (pay-as-you-go)
 * plan, which still has a generous free monthly quota for Cloud Functions
 * and Cloud Scheduler.
 */
export const grantWeeklySubscriptionCredits = onSchedule('every 1 hours', async () => {
  const result = await syncAllDueSubscriptions();
  logger.info(`Subscription grant sync complete. Synced ${result.syncedCount} user(s).`, result.syncedUsers);
});

/**
 * Optional manual trigger, e.g. for testing from a browser or curl, or for
 * wiring up an external cron service instead of Cloud Scheduler. Protect it
 * with a shared secret via the CRON_SECRET environment/config value.
 */
export const grantWeeklySubscriptionCreditsManual = onRequest(async (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const provided = req.get('authorization');
    if (provided !== `Bearer ${expected}`) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
  }

  try {
    const result = await syncAllDueSubscriptions();
    res.status(200).json({ success: true, timestamp: new Date().toISOString(), ...result });
  } catch (e: any) {
    logger.error('Manual subscription grant sync failed', e);
    res.status(500).json({ success: false, error: e.message || 'Sync failed' });
  }
});
