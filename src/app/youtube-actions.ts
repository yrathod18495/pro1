
'use server';

import { getSubtitles } from 'youtube-captions-scraper';
import { z } from 'zod';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

export type TranscriptActionResult = {
  success: boolean;
  transcript?: string;
  message: string;
};

const YouTubeUrlSchema = z.string().url('Please enter a valid YouTube URL.').refine(
  (url) => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname === 'www.youtube.com' || parsedUrl.hostname === 'youtube.com' || parsedUrl.hostname === 'youtu.be';
    } catch (e) {
            reportServerError('src/app/youtube-actions.ts:20', e);
      return false;
    }
  },
  'The URL must be a valid YouTube video link.'
);

function extractVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

async function fetchCaptions(videoID: string, lang: string): Promise<string | null> {
    try {
        const captions = await getSubtitles({ videoID, lang });
        if (captions && captions.length > 0) {
            return captions.map((line) => line.text).join(' ');
        }
        return null;
    } catch (error) {
    reportServerError('src/app/youtube-actions.ts#1', error);
        console.warn(`Could not fetch captions for video ${videoID} with lang=${lang}. Error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}


export async function getYouTubeTranscriptAction(
  videoUrl: string,
  userEmail: string,
  lang: string
): Promise<TranscriptActionResult> {
  const validation = YouTubeUrlSchema.safeParse(videoUrl);

  if (!validation.success) {
    return {
      success: false,
      message: validation.error.flatten().formErrors[0] || 'Invalid YouTube URL.',
    };
  }

  const videoID = extractVideoId(validation.data);
  if (!videoID) {
    return { success: false, message: 'Could not extract a valid video ID from the URL.' };
  }

  try {
    const transcript = await fetchCaptions(videoID, lang);
    
    if (transcript) {
      await sendToTelegram(`📜 <b>Transcript Fetched (${lang.toUpperCase()})</b>\n<b>User:</b> ${userEmail}\n<b>Video:</b> ${videoUrl}`);
      return { success: true, transcript, message: 'Transcript fetched successfully.' };
    }

    return { success: false, message: `Could not find any captions for the selected language. Please try another.` };

  } catch (error: any) {
    reportServerError('src/app/youtube-actions.ts#2', error);
    console.error('An unexpected error occurred in getYouTubeTranscriptAction:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while fetching captions.';
    await sendToTelegram(`📜🚨 <b>Transcript FAILED</b>\n<b>User:</b> ${userEmail}\n<b>Video:</b> ${videoUrl}\n<b>Lang:</b> ${lang}\n<b>Error:</b> ${errorMessage}`);
    return {
      success: false,
      message: `Failed to fetch transcript. This can happen if the video has disabled captions or is region-locked.`,
    };
  }
}

