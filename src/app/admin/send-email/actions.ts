
'use server';

import { Resend } from 'resend';
import { z } from 'zod';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

const sendEmailSchema = z.object({
  from: z.string().min(1, 'From address is required.'),
  to: z.string().min(1, 'At least one recipient is required.'),
  subject: z.string().min(1, 'Subject is required.'),
  html: z.string().min(1, 'HTML body is required.'),
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function sendEmailAction(
  input: z.infer<typeof sendEmailSchema>
): Promise<{ success: boolean; message: string }> {
  const validation = sendEmailSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, message: validation.error.flatten().formErrors.join(', ') };
  }

  const { from, to, subject, html } = validation.data;
  const toArray = to.split(',').map(email => email.trim()).filter(email => email);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, message: 'Resend API key is not configured on the server.' };
  }
  const resend = new Resend(apiKey);
  
  let successfulSends = 0;
  const errorMessages: string[] = [];

  try {
    for (const recipient of toArray) {
        try {
            const { error } = await resend.emails.send({
                from,
                to: recipient,
                subject,
                html,
                replyTo: '12labofficial@gmail.com',
            });

            if (error) throw new Error(error.message);
            successfulSends++;
        } catch (e: any) {
    reportServerError('src/app/admin/send-email/actions.ts#1', e);
            errorMessages.push(`Email to ${recipient}: ${e.message}`);
        }
        await sleep(550);
    }
    
    sendToTelegram(`📧 <b>Bulk Email Batch Processed</b>\n<b>Subject:</b> ${escapeHtml(subject)}\n<b>Attempted:</b> ${toArray.length}\n<b>Successful:</b> ${successfulSends}`).catch(() => null);

    if (successfulSends === toArray.length) {
      return { success: true, message: `All ${successfulSends} emails were sent successfully.` };
    } else {
      return { success: true, message: `Email batch processed. ${successfulSends} of ${toArray.length} sent.` };
    }
  } catch (error: any) {
    reportServerError('src/app/admin/send-email/actions.ts#2', error);
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}

/**
 * Sends a specific notification email to a single user.
 * Used primarily by the Live Chat system to notify users of admin replies.
 */
export async function sendTargetedNotificationByEmail(input: {
  email: string;
  title: string;
  message: string;
  adminEmail: string;
  url: string;
  logToTelegram: boolean;
}): Promise<{ success: boolean; message?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return { success: false, message: 'Email service not configured.' };
    }
    
    const resend = new Resend(apiKey);
    
    try {
        const { error } = await resend.emails.send({
            from: '12Labs Support <info@12labs.in>',
            to: input.email,
            subject: input.title,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                    <h2 style="color: #4f46e5;">${input.title}</h2>
                    <p style="font-size: 16px; line-height: 1.6;">${input.message}</p>
                    <div style="margin-top: 30px; text-align: center;">
                        <a href="${input.url}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">View Message on 12Labs</a>
                    </div>
                    <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
                    <p style="font-size: 12px; color: #999;">Sent by 12Labs AI Studio. Replied by: ${input.adminEmail}</p>
                </div>
            `,
            replyTo: '12labofficial@gmail.com',
        });

        if (error) throw error;
        
        if (input.logToTelegram) {
            await sendToTelegram(`📧 <b>Targeted Email Sent</b>\n<b>To:</b> ${input.email}\n<b>Subject:</b> ${input.title}`);
        }

        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/admin/send-email/actions.ts#3', e);
        console.error("Failed to send targeted email:", e);
        return { success: false, message: e.message };
    }
}
