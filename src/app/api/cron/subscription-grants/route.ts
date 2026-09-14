import { NextRequest, NextResponse } from 'next/server';
import { syncAllPendingSubscriptions } from '@/app/actions';
import { reportServerError } from '@/lib/report-error';

export const dynamic = 'force-dynamic';

/**
 * Automated Cron Endpoint for Weekly Consistency Grants
 * Called automatically by Vercel Cron (see vercel.json) every hour.
 * GET or POST /api/cron/subscription-grants
 */
export async function GET(req: NextRequest) {
  // Vercel signs cron-triggered requests with this header. If CRON_SECRET is
  // set in the environment, reject any request that doesn't carry it so this
  // endpoint can't be triggered by outsiders.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await syncAllPendingSubscriptions();
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error: any) {
            reportServerError('src/app/api/cron/subscription-grants/route.ts:29', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Cron execution failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
