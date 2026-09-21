// This API route is no longer in use and has been cleared.
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    return NextResponse.json({ success: false, error: "This endpoint is deprecated." }, { status: 410 });
}
