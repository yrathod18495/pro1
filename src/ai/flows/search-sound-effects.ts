'use server';

/**
 * @fileOverview A flow for searching copyright-free sound effects from FreeSound.org.
 *
 * - searchSoundEffects - A function that searches for sounds.
 * - SearchSoundEffectsInput - The input type for the function.
 * - SearchSoundEffectsOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { reportServerError } from '@/lib/report-error';

const SearchSoundEffectsInputSchema = z.object({
  query: z.string().describe('The search term for the sound effect.'),
  userEmail: z.string().describe('The email of the user searching.'),
  page: z.number().optional().default(1).describe('The page number for pagination.'),
});
export type SearchSoundEffectsInput = z.infer<typeof SearchSoundEffectsInputSchema>;

const SoundEffectSchema = z.object({
    id: z.number(),
    name: z.string(),
    tags: z.array(z.string()),
    previews: z.object({
        'preview-hq-mp3': z.string(),
    }),
    duration: z.number(),
    username: z.string(),
});

const FreeSoundResponseSchema = z.object({
    results: z.array(SoundEffectSchema),
    next: z.string().nullable(), // The 'next' URL indicates if there are more pages.
});

const SearchSoundEffectsOutputSchema = z.object({
    sounds: z.array(SoundEffectSchema),
    hasMore: z.boolean(),
});
export type SearchSoundEffectsOutput = z.infer<typeof SearchSoundEffectsOutputSchema>;

export async function searchSoundEffects(input: SearchSoundEffectsInput): Promise<SearchSoundEffectsOutput> {
    try {
        return await searchSoundEffectsFlow(input);
    } catch (error: any) {
    reportServerError('src/ai/flows/search-sound-effects.ts#1', error);
        const errorString = String(error?.message || error || '').toLowerCase();
        const isRateLimitError = errorString.includes('429');
        
        if (!isRateLimitError) {
            const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
            const errorMessage = `🚨 **Flow Error: searchSoundEffects**

**User:** ${input.userEmail}
**Query:** "${input.query}"
**Error:**
<pre>${mainErrorMessage}</pre>`;
            await sendToTelegram(errorMessage);
        }
        throw error;
    }
}

const searchSoundEffectsFlow = ai.defineFlow(
  {
    name: 'searchSoundEffectsFlow',
    inputSchema: SearchSoundEffectsInputSchema,
    outputSchema: SearchSoundEffectsOutputSchema,
  },
  async (input) => {
    const apiKey = process.env.FREESOUND_API_KEY;
    if (!apiKey) {
      throw new Error('FreeSound API key is not configured. Please set FREESOUND_API_KEY in your .env file.');
    }
    
    const filter = 'license:"Creative Commons 0" duration:[3 TO 60]';

    const searchParams = {
        query: input.query,
        token: apiKey,
        filter: filter,
        fields: 'id,name,tags,previews,duration,username',
        page_size: '30',
        page: String(input.page),
    };
    
    const queryString = Object.entries(searchParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');

    const url = `https://freesound.org/apiv2/search/text/?${queryString}`;

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            let errorDetail = `API error with status ${response.status}.`;
            try {
                const errorJson = await response.json();
                errorDetail = errorJson.detail || errorDetail;
            } catch (jsonError) {
    reportServerError('src/ai/flows/search-sound-effects.ts#2', jsonError);
                errorDetail = response.statusText || errorDetail;
            }
            throw new Error(`FreeSound API error: ${errorDetail}`);
        }

        const responseText = await response.text();
        if (!responseText.trim()) {
            return { sounds: [], hasMore: false };
        }
        
        const data = JSON.parse(responseText);
        const validatedData = FreeSoundResponseSchema.parse(data);
        const results = validatedData.results;
        const hasMore = !!validatedData.next;
        
        if (input.page === 1 && results && results.length > 0) {
            await logSummaryEvent('soundSearches');
        }

        return {
            sounds: results || [],
            hasMore: hasMore,
        };
    } catch (error: any) {
    reportServerError('src/ai/flows/search-sound-effects.ts#3', error);
        console.error("FreeSound API call failed:", error);
        if (error instanceof SyntaxError) {
             throw new Error("The sound search service returned an invalid response. Please try again later.");
        }
        throw new Error(error.message || "Failed to fetch sound effects from FreeSound.");
    }
  }
);
