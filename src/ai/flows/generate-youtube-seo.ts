
'use server';

/**
 * @fileOverview An AI agent that generates YouTube SEO content (title, description, tags).
 * 
 * Synchronized with the 12Labs Neural Dispatcher (Intelligence Node).
 * Decoupled from hardcoded models to support Admin Panel rotation.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { GENERAL_PURPOSE_MODEL } from '@/ai/config';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

const GenerateYouTubeSEOInputSchema = z.object({
  topic: z.string().describe('The topic of the YouTube video.'),
  userEmail: z.string().describe('The email of the user generating the SEO content.'),
  mappingId: z.string().optional().describe('RTDB Hub tracking ID.'),
});

export type GenerateYouTubeSEOInput = z.infer<typeof GenerateYouTubeSEOInputSchema>;

const GenerateYouTubeSEOOutputSchema = z.object({
  titles: z.array(z.string()).describe('An array of 3 engaging, SEO-friendly titles (each under 100 characters).'),
  description: z.string().describe('A detailed YouTube video description (150-250 words) with keywords.'),
  tags: z.array(z.string()).describe('A list of 10-15 high-ranking tags/keywords.'),
});

export type GenerateYouTubeSEOOutput = z.infer<typeof GenerateYouTubeSEOOutputSchema>;

const promptTemplate = `You are a world-class YouTube SEO expert. 
Your task is to generate an optimized set of titles, a description, and tags for a video based on the provided topic.

TOPIC: "{{topic}}"

INSTRUCTIONS:
1. TITLES: Create 3 catchy, click-worthy titles. Each MUST be under 100 characters.
2. DESCRIPTION: Write a comprehensive description (150-250 words) that includes relevant keywords naturally and 3-5 hashtags at the end.
3. TAGS: Provide 10-15 high-ranking keywords for the YouTube search algorithm.

FORMAT: Respond ONLY with a valid JSON object matching the requested schema.`;

export async function generateYouTubeSEO(input: GenerateYouTubeSEOInput): Promise<{ success: boolean; usedBridge: boolean; result?: GenerateYouTubeSEOOutput }> {
  try {
    const response = await ai.generate({
      model: GENERAL_PURPOSE_MODEL,
      prompt: promptTemplate.replace('{{topic}}', input.topic),
      output: {
        format: 'json',
        schema: GenerateYouTubeSEOOutputSchema,
      },
      config: {
        temperature: 0.7,
      },
      // @ts-ignore - Metadata extension for Neural Dispatcher high-reliability logic
      metadata: {
        userEmail: input.userEmail,
        taskType: "YouTube SEO Kit",
        charCount: input.topic.length,
        mappingId: input.mappingId
      }
    });

    const usedBridge = !!(response as any).custom?.bridge;
    const output = response.output;

    // If using bridge, we don't expect immediate output here
    if (!output && !usedBridge) {
        throw new Error('The AI engine failed to return a valid SEO package.');
    }

    return {
      success: true,
      usedBridge,
      result: output || undefined
    };

  } catch (error: any) {
    reportServerError('src/ai/flows/generate-youtube-seo.ts#1', error);
    const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
    const errorMessage = `🚨 **Flow Error: generateYouTubeSEO**\n\n` +
                         `<b>User:</b> ${input.userEmail}\n` +
                         `<b>Topic:</b> ${input.topic}\n` +
                         `<b>Error:</b> <pre>${mainErrorMessage}</pre>`;
    
    await sendToTelegram(errorMessage).catch(() => null);
    throw new Error(`SEO Kit failed: ${mainErrorMessage}`);
  }
}
