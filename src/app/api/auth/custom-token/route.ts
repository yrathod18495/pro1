import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { uid, projectId, apiKey } = body;

    const authHeader = request.headers.get('authorization');
    const xApiKey = request.headers.get('x-api-key');

    const { auth, database } = initializeFirebase();

    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Firebase Admin Auth is not configured on the server.' },
        { status: 500 }
      );
    }

    let targetUid = uid;

    // Verify Bearer ID token or X-API-Key if provided
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        targetUid = decodedToken.uid;
      } catch (err: any) {
        console.warn('ID Token verification failed in custom-token route:', err.message);
      }
    } else if (xApiKey && database) {
      const snapshot = await database.ref(`api_keys/${xApiKey}`).once('value');
      const keyData = snapshot.val();
      if (keyData && keyData.uid) {
        targetUid = keyData.uid;
      }
    }

    if (!targetUid) {
      return NextResponse.json(
        { success: false, error: 'User ID (uid) or valid authentication is required to generate a custom token.' },
        { status: 400 }
      );
    }

    // Custom claims attached to token
    const additionalClaims: Record<string, any> = {
      developer: true,
      timestamp: Date.now(),
    };

    if (projectId) additionalClaims.projectId = projectId;
    if (apiKey) additionalClaims.apiKey = apiKey;

    // Generate custom Firebase Auth token using Firebase Admin SDK
    const customToken = await auth.createCustomToken(targetUid, additionalClaims);

    return NextResponse.json(
      {
        success: true,
        customToken,
        uid: targetUid,
        projectId: projectId || null,
        expiresIn: 3600,
        createdAt: new Date().toISOString(),
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        },
      }
    );
  } catch (error: any) {
    console.error('Error generating custom Firebase Auth token:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate custom token' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}
