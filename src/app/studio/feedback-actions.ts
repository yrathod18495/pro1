'use server';

import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';
import { initializeFirebase } from '@/firebase/server';
import crypto from 'crypto';

/**
 * Post-generation like/dislike feedback.
 *
 * Likes still go to the Telegram bot log only, same as always — a bare
 * thumbs-up is still signal worth seeing, but it isn't something anyone
 * needs to follow up on with the user directly.
 *
 * Dislikes are different: they get dropped straight into that user's Live
 * Chat thread (as if they'd said it themselves) instead of a Telegram
 * post, so an admin who wants to follow up can just open that chat and
 * ask — no separate bot-log-vs-chat context switch. Nothing else is
 * stored — this is the message's only home.
 */
export async function submitGenerationFeedbackAction(input: {
  rating: 'like' | 'dislike';
  reason?: string;
  projectName?: string;
  userEmail?: string;
  userId?: string;
  userName?: string;
  engine?: string;
  mode?: string;
}): Promise<{ success: boolean }> {
  try {
    const { rating, reason, projectName, userEmail, userId, userName, engine, mode } = input;
    const trimmedReason = (reason || '').trim();

    if (rating === 'dislike' && userId) {
      await postDislikeToLiveChat({ userId, userName, userEmail, projectName, engine, mode, reason: trimmedReason });
      return { success: true };
    }

    const isLike = rating === 'like';
    const header = isLike ? '👍 <b>LIKED</b>' : '👎 <b>DISLIKED</b>';

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

/**
 * Writes a dislike as a regular message in the user's own Live Chat
 * thread — same RTDB shape sendUserChatMessage uses, so it shows up in
 * the admin chat dock (isReadByAdmin: false) exactly like a real message
 * the user typed, and the admin can just reply in place to ask about it.
 *
 * Called twice per dislike (immediately on pick, then again if the user
 * adds a reason) — writing two short chat messages reads naturally as a
 * conversation ("disliked this" then "reason: ...") rather than the
 * duplicate-Telegram-post problem this replaces.
 */
async function postDislikeToLiveChat(input: {
  userId: string;
  userName?: string;
  userEmail?: string;
  projectName?: string;
  engine?: string;
  mode?: string;
  reason: string;
}) {
  const { userId, userName, userEmail, projectName, engine, mode, reason } = input;
  const { database } = initializeFirebase();

  let text: string;
  if (reason) {
    text = `Reason: ${reason}`;
  } else {
    const details = [`Project: ${projectName || 'Untitled'}`];
    if (mode) details.push(`Mode: ${mode}`);
    if (engine) details.push(`Engine: ${engine}`);
    text = `👎 Disliked a generation — ${details.join(' · ')}`;
  }

  const clientMessageId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const updates: { [key: string]: any } = {};
  updates[`chats/${userId}/messages/${clientMessageId}`] = {
    sender: 'user',
    timestamp,
    clientMessageId,
    text,
  };
  updates[`chats/${userId}/userId`] = userId;
  updates[`chats/${userId}/userName`] = userName || userEmail || 'N/A';
  updates[`chats/${userId}/userEmail`] = userEmail || 'N/A';
  updates[`chats/${userId}/lastMessage`] = text;
  updates[`chats/${userId}/lastMessageTimestamp`] = timestamp;
  updates[`chats/${userId}/isReadByAdmin`] = false;

  await database.ref().update(updates);
}
