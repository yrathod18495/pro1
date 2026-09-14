'use server';

import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

/**
 * Post-generation like/dislike feedback.
 *
 * NOTHING IS STORED. This deliberately writes to no database — not
 * Firestore, not RTDB, not a log collection. The rating goes to the
 * Telegram bot and that is the whole lifecycle of it. If someone later
 * wants dashboards or per-user history, that is a separate decision with
 * separate privacy consequences; don't quietly add a write here.
 *
 * Every case is reported, including a like with no reason typed — a bare
 * thumbs-up is still signal worth seeing.
 */
export async function submitGenerationFeedbackAction(input: {
  rating: 'like' | 'dislike';
  reason?: string;
  projectName?: string;
  userEmail?: string;
  engine?: string;
  mode?: string;
}): Promise<{ success: boolean }> {
  try {
    const { rating, reason, projectName, userEmail, engine, mode } = input;

    const isLike = rating === 'like';
    const header = isLike ? '👍 <b>LIKED</b>' : '👎 <b>DISLIKED</b>';
    const trimmedReason = (reason || '').trim();

    const lines = [
      `${header} — generation feedback`,
      '———————————————',
      `👤 <b>User:</b> ${escapeHtml(userEmail || 'unknown')}`,
      `📂 <b>Project:</b> ${escapeHtml(projectName || 'Untitled')}`,
    ];

    if (mode) lines.push(`⚙️ <b>Mode:</b> ${escapeHtml(mode)}`);
    if (engine) lines.push(`🎙️ <b>Engine:</b> ${escapeHtml(engine)}`);

    lines.push(
      trimmedReason
        ? `💬 <b>Reason:</b> ${escapeHtml(trimmedReason)}`
        : '💬 <b>Reason:</b> — (none given)'
    );

    await sendToTelegram(lines.join('\n'));
    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/studio/feedback-actions.ts', error);
    // Feedback failing must never look like a problem to the user — they
    // did their part. Swallow it and report success-shaped silence.
    return { success: false };
  }
}
