import type { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { initializeFirebase } from '@/firebase/server';

export class DeveloperApiAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number = 401,
  ) {
    super(message);
    this.name = 'DeveloperApiAuthError';
  }
}

export interface DeveloperIdentity {
  uid: string;
  email: string;
  isAdmin: boolean;
  token: DecodedIdToken;
}

export async function requireDeveloperIdentity(request: NextRequest): Promise<DeveloperIdentity> {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    throw new DeveloperApiAuthError('A Firebase ID token is required.');
  }

  const { auth, firestore } = initializeFirebase();
  if (!auth) {
    throw new DeveloperApiAuthError('Authentication service is not configured.', 503);
  }

  let token: DecodedIdToken;
  try {
    token = await auth.verifyIdToken(authorization.slice('Bearer '.length));
  } catch {
    throw new DeveloperApiAuthError('Your session has expired. Please sign in again.');
  }

  let profile: Record<string, any> = {};
  try {
    const profileSnapshot = firestore?.collection('users').doc(token.uid);
    if (profileSnapshot) {
      const snapshot = await profileSnapshot.get();
      profile = (snapshot.data() || {}) as Record<string, any>;
    }
  } catch (error) {
    console.error('[Developer API] profile lookup failed:', error);
  }

  const claimRole = (token as any).role || (token as any).adminRole;
  const isAdmin = profile.role === 'admin' || claimRole === 'admin' || (token as any).admin === true;

  return {
    uid: token.uid,
    email: String(profile.email || token.email || ''),
    isAdmin,
    token,
  };
}

export function toIsoDate(value: unknown): string {
  if (!value) return new Date(0).toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
  }
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date ? date.toISOString() : new Date(0).toISOString();
  }
  return new Date(0).toISOString();
}

export function maskApiKey(value: string): string {
  return value.length > 6 ? `••••••${value.slice(-6)}` : '••••••';
}
