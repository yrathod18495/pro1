import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');
  const customFilename = searchParams.get('filename') || `12labs_thumbnail_${Date.now()}.png`;

  if (!imageUrl) {
    return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${res.statusText}` }, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${customFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: any) {
    console.error('Proxy image download error:', error);
    return NextResponse.json({ error: error.message || 'Download failed' }, { status: 500 });
  }
}
