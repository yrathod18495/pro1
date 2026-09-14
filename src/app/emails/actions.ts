
'use server';

import { Resend } from 'resend';
import { z } from 'zod';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

const WelcomeEmailSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

const ProjectReadyEmailSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  projectName: z.string(),
  script: z.string(),
  characters: z.array(z.object({
    name: z.string(),
    voice: z.string(),
    gender: z.string(),
    age: z.string(),
    emotion: z.string(),
  })),
});

function getProjectReadyEmailHtml(name: string, projectName: string, script: string, characters: any[]): string {
    const year = new Date().getFullYear();
    const completionTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long', timeStyle: 'short' });
    const logoUrl = 'https://drive.google.com/uc?export=view&id=1l-W6fd5dtVqM8LNo5cpzJrM6LiyNXD2a';

    const characterRows = characters.map(char => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #edf2f7; font-weight: 600; color: #1a202c;">${char.name}</td>
            <td style="padding: 12px; border-bottom: 1px solid #edf2f7; color: #4a5568;">${char.voice}</td>
            <td style="padding: 12px; border-bottom: 1px solid #edf2f7; color: #718096; font-size: 12px;">${char.gender} | ${char.age}</td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your AI Voiceover is Ready!</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body { margin: 0; padding: 0; background-color: #f7fafc; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
            .header { background-color: #111827; padding: 40px 20px; text-align: center; }
            .content { padding: 40px; color: #2d3748; line-height: 1.6; }
            .footer { background-color: #f8fafc; padding: 30px; text-align: center; color: #a0aec0; font-size: 12px; border-top: 1px solid #edf2f7; }
            .button { display: inline-block; background-color: #4f46e5; color: #ffffff !important; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; margin: 20px 0; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); }
            .section-title { font-size: 14px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; margin-top: 32px; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px; }
            .meta-box { background-color: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #f3f4f6; margin-bottom: 24px; }
            .script-box { background-color: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #edf2f7; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; color: #4a5568; white-space: pre-wrap; max-height: 400px; overflow-y: auto; line-height: 1.8; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { text-align: left; font-size: 12px; color: #a0aec0; text-transform: uppercase; padding: 12px; border-bottom: 2px solid #edf2f7; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="${logoUrl}" width="140" alt="12Labs Logo" style="margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 28px; color: #ffffff; font-weight: 800; letter-spacing: -0.02em;">Generation Complete 🎉</h1>
            </div>
            <div class="content">
                <p style="font-size: 18px; margin-top: 0; font-weight: 600;">Hi ${name},</p>
                <p style="font-size: 16px; color: #4a5568;">Great news! Your high-quality AI voiceover project <strong>"${projectName}"</strong> has been successfully processed and is now available for download.</p>
                
                <div class="meta-box">
                    <div style="font-size: 14px; margin-bottom: 4px; color: #718096;">Completion Time</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1a202c;">${completionTime} (IST)</div>
                </div>

                <div class="section-title">Voice Assignments</div>
                <table>
                    <thead>
                        <tr>
                            <th>Character</th>
                            <th>Voice Engine</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${characterRows}
                    </tbody>
                </table>

                <div class="section-title">Final Script Content</div>
                <div class="script-box">${script}</div>

                <div style="text-align: center; margin-top: 40px;">
                    <a href="https://www.12labs.in/history" class="button">Download Final Audio</a>
                    <p style="font-size: 13px; color: #718096; margin-top: 16px;">Or visit 12labs.in > My History</p>
                </div>

                <p style="margin-top: 40px; font-size: 15px; color: #4a5568;">Keep creating incredible content!<br><strong>Team 12Labs</strong></p>
            </div>
            <div class="footer">
                <p style="margin: 0 0 10px 0;">&copy; ${year} 12Labs AI Studio. All Rights Reserved.</p>
                <p style="margin: 0;">You are receiving this because your high-quality project was completed on <a href="https://www.12labs.in" style="color: #4f46e5; text-decoration: none; font-weight: 600;">12labs.in</a></p>
            </div>
        </div>
    </body>
    </html>
    `;
}

export async function sendWelcomeEmailAction(
  input: z.infer<typeof WelcomeEmailSchema>
): Promise<{ success: boolean; message?: string }> {
    // Welcome email disabled as per user request to reduce noise on joining.
    return { success: true };
}

export async function sendProjectReadyEmailAction(
  input: z.infer<typeof ProjectReadyEmailSchema>
): Promise<{ success: boolean; message?: string }> {
  const validation = ProjectReadyEmailSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, message: validation.error.flatten().formErrors.join(', ') };
  }

  const { name, email, projectName, script, characters } = validation.data;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error('Resend API key is not configured.');
    return { success: false, message: 'Email service not configured.' };
  }
  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: '12Labs <info@12labs.in>',
      to: [email],
      subject: `Your Project "${projectName}" is Ready! 🎉`,
      html: getProjectReadyEmailHtml(name, projectName, script, characters),
      replyTo: '12labofficial@gmail.com',
    });

    if (error) throw error;
    return { success: true };

  } catch (error: any) {
    reportServerError('src/app/emails/actions.ts#1', error);
    console.error(`Error sending detailed project ready email to ${email}:`, error);
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}
