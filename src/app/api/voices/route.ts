import { NextResponse } from 'next/server';
import { voices as standardVoices } from '@/lib/voices';
import { proVoices } from '@/lib/pro-voices';
import { chatterboxVoices } from '@/lib/chatterbox-voices';
import { studioVoices } from '@/lib/new-studio-voices';

export interface PublicVoice {
  id: string;
  name: string;
  gender: string;
  category: 'standard' | 'pro' | 'chatterbox' | 'new-studio';
  description?: string;
  demo_url: string;
  tags?: string[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category')?.toLowerCase();
    const gender = searchParams.get('gender')?.toLowerCase();
    const search = searchParams.get('search')?.toLowerCase();

    // Format voices
    const formattedStandard: PublicVoice[] = (standardVoices || []).map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      category: 'standard',
      description: v.description,
      demo_url: v.demoUrl,
      tags: v.tags,
    }));

    const formattedPro: PublicVoice[] = (proVoices || []).map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      category: 'pro',
      description: `High-fidelity neural voice: ${v.name}`,
      demo_url: v.demoUrl,
      tags: ['pro', 'neural'],
    }));

    const formattedChatterbox: PublicVoice[] = (chatterboxVoices || []).map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      category: 'chatterbox',
      description: v.description,
      demo_url: v.url,
      tags: ['chatterbox', 'expressive'],
    }));

    const formattedNewStudio: PublicVoice[] = (studioVoices || []).map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      category: 'new-studio',
      description: `${v.age || 'Adult'} voice persona for AI Studio`,
      demo_url: v.link,
      tags: ['new-studio', v.age?.toLowerCase() || 'adult'],
    }));

    let allVoices: PublicVoice[] = [
      ...formattedStandard,
      ...formattedPro,
      ...formattedChatterbox,
      ...formattedNewStudio,
    ];

    if (category) {
      if (category === 'standard' || category === 'voice-studio') {
        allVoices = allVoices.filter((v) => v.category === 'standard');
      } else if (category === 'pro' || category === 'pro-studio') {
        allVoices = allVoices.filter((v) => v.category === 'pro');
      } else if (category === 'chatterbox') {
        allVoices = allVoices.filter((v) => v.category === 'chatterbox');
      } else if (category === 'new-studio') {
        allVoices = allVoices.filter((v) => v.category === 'new-studio');
      }
    }

    if (gender) {
      allVoices = allVoices.filter((v) => v.gender.toLowerCase() === gender);
    }

    if (search) {
      allVoices = allVoices.filter(
        (v) =>
          v.name.toLowerCase().includes(search) ||
          v.id.toLowerCase().includes(search) ||
          (v.description && v.description.toLowerCase().includes(search))
      );
    }

    return NextResponse.json(
      {
        success: true,
        count: allVoices.length,
        voices: allVoices,
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching voices API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve voices list.' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
