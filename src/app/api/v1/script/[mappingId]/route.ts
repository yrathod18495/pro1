import { NextRequest, NextResponse } from 'next/server';
import { isValidDeveloperKey, resolveDeveloperKey } from '@/lib/hf-proxy';
import { initializeFirebase } from '@/firebase/server';
import { withCors, corsPreflight } from '@/lib/cors';

/**
 * 🌐 PUBLIC API — GET /api/v1/script/{mapping_id}
 * ----------------------------------------------------
 * Polls the status of a job submitted via POST /api/v1/script. Reads
 * straight from script_projects/{uid}/userProjects/{mapping_id} — the
 * exact same Firestore doc server-files/script_generation.py writes to
 * and the website's /script-generator page listens on.
 */
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ mappingId: string }> }
) {
  const apiKey = request.headers.get('x-api-key');
  if (!isValidDeveloperKey(apiKey)) {
    return NextResponse.json({ error: 'Missing or invalid x-api-key header.' }, { status: 401 });
  }
  const keyRecord = await resolveDeveloperKey(apiKey);
  if (!keyRecord.exists) {
    return NextResponse.json({ error: 'Invalid API key.' }, { status: 401 });
  }
  if (keyRecord.disabled) {
    return NextResponse.json({ error: 'This API key has been disabled. Re-enable it in the Developer dashboard.' }, { status: 403 });
  }

  const { mappingId } = await params;
  if (!mappingId) {
    return NextResponse.json({ error: 'Missing mapping id.' }, { status: 400 });
  }

  try {
    const { firestore } = initializeFirebase();
    const doc = await firestore
      .collection('script_projects')
      .doc(keyRecord.userId)
      .collection('userProjects')
      .doc(mappingId)
      .get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Script job not found for this API key.' }, { status: 404 });
    }

    const data = doc.data() || {};
    // The worker writes "ok" on success — normalized to "completed" here
    // so this endpoint's status values read the same as
    // /api/v1/generate/{project_id}'s, rather than introducing a second
    // vocabulary for "done".
    const rawStatus = String(data.status || 'unknown');
    const status = rawStatus === 'ok' ? 'completed' : rawStatus === 'pending' ? 'processing' : rawStatus;

    return NextResponse.json({
      mapping_id: mappingId,
      status,
      script_url: status === 'completed' ? (data.scriptUrl || null) : null,
      teaser: data.teaser || null,
      error: status === 'error' ? (data.error || 'Script generation failed.') : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not fetch script job status.' }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ mappingId: string }> }
) {
  return withCors(await handleGET(request, ctx));
}

export async function OPTIONS() {
  return corsPreflight();
}
