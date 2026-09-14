import { NextRequest, NextResponse } from 'next/server';
import { isValidDeveloperKey, resolveDeveloperKey } from '@/lib/hf-proxy';
import { initializeFirebase } from '@/firebase/server';
import { getDisplayUrl } from '@/lib/utils';
import { withCors, corsPreflight } from '@/lib/cors';

/**
 * 🌐 PUBLIC API — GET /api/v1/generate/{projectId}
 * ---------------------------------------------------
 * Polls the status of a job submitted via POST /api/v1/generate. Reads
 * straight from the SAME Firestore doc (projects/{uid}/userProjects/{id})
 * the website's /history page listens to — studio.py/11.py update this
 * doc directly, so there's nothing extra to keep in sync here.
 *
 * Auth: header x-api-key: <developer key> — must be the SAME key (or any
 * key belonging to the same account) that submitted the job; the project
 * lookup is scoped to the key's own userId, so one customer can never
 * poll another's project by guessing an id.
 */
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
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

  const { projectId } = await params;
  if (!projectId) {
    return NextResponse.json({ error: 'Missing project id.' }, { status: 400 });
  }

  try {
    const { firestore } = initializeFirebase();
    const doc = await firestore
      .collection('projects')
      .doc(keyRecord.userId)
      .collection('userProjects')
      .doc(projectId)
      .get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Project not found for this API key.' }, { status: 404 });
    }

    const data = doc.data() || {};
    const status = String(data.status || 'unknown');
    const audioUrl = data.audioUrl ? getDisplayUrl(data.audioUrl) : null;

    return NextResponse.json({
      project_id: projectId,
      status,
      engine: data.voiceEngine || 'gemini',
      project_name: data.projectName || null,
      audio_url: status === 'completed' && audioUrl ? audioUrl : null,
      error: status === 'error' ? (data.error || 'Generation failed.') : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not fetch project status.' }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> }
) {
  return withCors(await handleGET(request, ctx));
}

export async function OPTIONS() {
  return corsPreflight();
}
