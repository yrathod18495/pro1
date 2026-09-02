'use server';

import { escapeHtml } from '@/lib/utils';

/**
 * Sends a message or photo to one or more Telegram chat IDs.
 * Strictly uses the main TELEGRAM_BOT_TOKEN for logging and notifications.
 */
export async function sendToTelegram(
  message: string, 
  photoUrl?: string,
  options: { disable_web_page_preview?: boolean, targetChatId?: string } = {}
): Promise<void> {
  // Use ONLY the main bot token for logs
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatIds = process.env.TELEGRAM_CHAT_ID;
  const rawChatIds = options.targetChatId || adminChatIds;
  
  if (!token || !rawChatIds) {
    console.error('[Telegram] Main bot token or chat ID missing.');
    return;
  }

  const chatIdArray = rawChatIds.split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);

  const endpoint = photoUrl ? 'sendPhoto' : 'sendMessage';
  const url = `https://api.telegram.org/bot${token}/${endpoint}`;

  try {
      await Promise.all(chatIdArray.map(async (chatId) => {
          const body: any = {
              chat_id: chatId,
              parse_mode: 'HTML',
              disable_web_page_preview: options.disable_web_page_preview || false,
          };

          if (photoUrl) {
              body.photo = photoUrl;
              body.caption = message.slice(0, 1024);
          } else {
              body.text = message.slice(0, 4096);
          }

          const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              cache: 'no-store'
          });
          return res.ok;
      }));
  } catch (error: any) {
      console.error(`[Telegram Logger] Failed to dispatch:`, error.message);
  }
}

/**
 * Sends a text string as a .txt document to multiple Telegram chat IDs.
 */
export async function sendDocumentToTelegram(
    content: string,
    filename: string = 'debug_log.txt',
    caption: string = ''
): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const rawChatIds = process.env.TELEGRAM_CHAT_ID;
    
    if (!token || !rawChatIds) {
        console.error("[Telegram Log] Missing main token or chat ID.");
        return;
    }

    const chatIdArray = rawChatIds.split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);

    const url = `https://api.telegram.org/bot${token}/sendDocument`;

    try {
        await Promise.all(chatIdArray.map(async (chatId) => {
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
            
            const blob = new Blob([content], { type: 'text/plain' });
            formData.append('document', blob, filename);

            const res = await fetch(url, {
                method: 'POST',
                body: formData,
                cache: 'no-store'
            });

            return res.ok;
        }));
    } catch (e: any) {
        console.error("[Telegram Log] Document dispatch failure:", e.message);
    }
}
