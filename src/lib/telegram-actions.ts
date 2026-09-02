'use server';

/**
 * Server action to upload files to the Telegram storage channel.
 * Strictly uses the "cloud-bot" for all storage operations.
 */
export async function uploadToTelegramAction(formData: FormData): Promise<{ success: boolean; fileId?: string; error?: string }> {
    const file = formData.get('file') as File;
    
    // Explicitly use ONLY the storage bot token
    const token = process.env['cloud-bot'] || process.env.CLOUD_BOT;
    const chatId = '-1003743278361'; // Targeted Storage Channel

    if (!token) {
        return { success: false, error: 'Cloud storage token missing in environment node.' };
    }

    // 50MB (Maximum allowed by Telegram Bot API for uploads)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { success: false, error: 'File size exceeds 50MB limit.' };
    }

    try {
        const tgFormData = new FormData();
        tgFormData.append('chat_id', chatId);
        tgFormData.append('document', file);

        const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            body: tgFormData,
        });

        const result = await response.json();
        if (!result.ok) {
            throw new Error(result.description || 'Telegram storage node error.');
        }

        // Extract the file_id from the document object
        const fileId = result.result.document.file_id;

        return { success: true, fileId: `tg://${fileId}` };

    } catch (error: any) {
        console.error('[Cloud Storage] Upload Failed:', error.message);
        return { success: false, error: error.message };
    }
}
