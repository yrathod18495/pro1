import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET(req: NextRequest) {
  return new NextResponse('This endpoint is no longer in use as audio is hosted on Cloudinary.', { status: 410 });
}
