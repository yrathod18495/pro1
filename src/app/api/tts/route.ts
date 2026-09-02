import { NextRequest, NextResponse } from 'next/server';
import { reportServerError } from '@/lib/report-error';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voiceId, pitch = 1, speed = 1 } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json(
        { success: false, error: 'Parameter "text" is required.' },
        { status: 400 }
      );
    }

    const selectedVoice = voiceId || 'en-US-Standard-A';

    return NextResponse.json(
      {
        success: true,
        message: 'Text-to-Speech API request processed.',
        data: {
          text: text.trim(),
          voiceId: selectedVoice,
          pitch,
          speed,
          audioUrl: `https://res.cloudinary.com/demo/video/upload/sample.mp3`,
          note: 'Integrate your preferred cloud TTS provider (Google Cloud TTS, ElevenLabs, or Azure) to generate live streamable audio.',
        },
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    );
  } catch (error: any) {
            reportServerError('src/app/api/tts/route.ts:38', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Invalid request payload.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text');
  const voiceId = searchParams.get('voiceId') || 'standard';

  if (!text) {
    return NextResponse.json(
      {
        success: false,
        error: 'Query parameter "text" is required. Example: /api/tts?text=Hello+World&voiceId=en-US-A',
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        text,
        voiceId,
        audioUrl: `https://res.cloudinary.com/demo/video/upload/sample.mp3`,
      },
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
