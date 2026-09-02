
import { NextResponse } from 'next/server';
import { Client } from "@gradio/client";
import { z } from 'zod';
import { reportServerError } from '@/lib/report-error';

export const maxDuration = 120; // 2 minutes

const GenerateVideoInputSchema = z.object({
  prompt: z.string().default("Make this image come alive with cinematic motion, smooth animation"),
  input_image: z.string().optional(), // data URI from client
  duration: z.number().min(1).max(10).default(3),
  enhance_prompt: z.boolean().default(true),
  seed: z.number().default(42),
  randomize_seed: z.boolean().default(true),
  height: z.number().default(512),
  width: z.number().default(768),
});

type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (!text || text.trim() === '') {
        return NextResponse.json({ success: false, error: "Empty request body received." }, { status: 400 });
    }

    let body;
    try {
        body = JSON.parse(text);
    } catch (e) {
            reportServerError('src/app/api/text-to-video/route.ts:31', e);
        return NextResponse.json({ success: false, error: "Invalid JSON in request body." }, { status: 400 });
    }

    const validation = GenerateVideoInputSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.flatten().formErrors.join(', ') }, { status: 400 });
    }

    const {
      prompt,
      input_image,
      duration,
      enhance_prompt,
      seed,
      randomize_seed,
      height,
      width
    } = validation.data;

    const client = await Client.connect("12labs/ltx-2-distilled");

    let imageBlob: Blob | undefined = undefined;
    if (input_image) {
      const response = await fetch(input_image);
      imageBlob = await response.blob();
    } else {
        return NextResponse.json({ success: false, error: "An input image is required to generate a video." }, { status: 400 });
    }

    const result = await client.predict("/generate_video", {
        input_image: imageBlob,
        prompt,
        duration,
        enhance_prompt,
        seed,
        randomize_seed,
        height,
        width,
    });

    if (result && Array.isArray(result.data) && result.data.length > 0) {
        const videoData = result.data[0] as { url: string };
        const seedUsed = result.data[1] as number;
        return NextResponse.json({ success: true, videoUrl: videoData.url, seedUsed });
    } else {
        throw new Error("Invalid response format from the video generation API.");
    }
  } catch (error: any) {
    console.error("Error generating video:", error);
    let errorMessage = "An unknown error occurred while generating the video.";
    if (error.message) {
        const message = error.message.toLowerCase();
        if (message.includes('space metadata could not be loaded')) {
            errorMessage = 'Could not connect to the video generation service. It may be offline or warming up.';
        } else if (message.includes('unexpected end of json input')) {
            errorMessage = 'The video service returned an empty or invalid response. This is a temporary issue. Please try again.';
        } else {
            errorMessage = error.message;
        }
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
