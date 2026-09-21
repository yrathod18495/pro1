
'use server';
import { NextRequest, NextResponse } from 'next/server';

// This webhook is deprecated as the HTML comment containing the userId was causing
// Telegram API errors and has been removed from the notification message.
// Admin replies should be handled through the dashboard.

export async function POST(req: NextRequest) {
    return NextResponse.json({ success: true, message: 'This webhook is deprecated and does not perform any action.' });
}
