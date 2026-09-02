import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/server';
import {
  DeveloperApiAuthError,
  requireDeveloperIdentity,
  toIsoDate,
} from '@/lib/developer-api-server';

function getDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function GET(request: NextRequest) {
  try {
    const identity = await requireDeveloperIdentity(request);
    const { database } = initializeFirebase();
    if (!database) return NextResponse.json({ success: false, error: 'Database is not configured.' }, { status: 503 });

    const all = identity.isAdmin && new URL(request.url).searchParams.get('all') === '1';
    const root = all ? await database.ref('apiUsage').once('value') : await database.ref(`apiUsage/${identity.uid}`).once('value');
    const rows: Array<Record<string, any>> = [];
    const raw = (root.val() || {}) as Record<string, any>;

    const collect = (value: any, userId: string) => {
      if (!value || typeof value !== 'object') return;
      if (value.requestId || value.endpoint || value.api) {
        rows.push({ ...value, userId: value.userId || userId });
        return;
      }
      for (const child of Object.values(value)) collect(child, userId);
    };
    if (all) {
      for (const [userId, value] of Object.entries(raw)) collect(value, userId);
    } else {
      collect(raw, identity.uid);
    }

    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = rows
      .map((row) => ({ ...row, timestamp: toIsoDate(row.timestamp || row.createdAt) }))
      .filter((row) => new Date(row.timestamp).getTime() >= since)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const byDay = new Map<string, { date: string; requests: number; credits: number; latency: number; _latencyTotal: number }>();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
      const key = getDayKey(date.toISOString());
      byDay.set(key, { date: key, requests: 0, credits: 0, latency: 0, _latencyTotal: 0 });
    }
    for (const row of recent) {
      const key = getDayKey(row.timestamp);
      const day = byDay.get(key);
      if (!day) continue;
      const latency = Number(row.latencyMs ?? row.latency ?? 0);
      day.requests += 1;
      day.credits += Number(row.cost ?? row.credits ?? 0);
      day._latencyTotal += latency;
      day.latency = Math.round(day._latencyTotal / day.requests);
    }

    return NextResponse.json({
      success: true,
      usageData: [...byDay.values()].map(({ _latencyTotal, ...day }) => day),
      recent,
      totalRequests: recent.length,
      totalCredits: recent.reduce((sum, row) => sum + Number(row.cost ?? row.credits ?? 0), 0),
    });
  } catch (error) {
    if (error instanceof DeveloperApiAuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[Developer API] analytics route failed:', error);
    return NextResponse.json({ success: false, error: 'Analytics service unavailable.' }, { status: 500 });
  }
}
