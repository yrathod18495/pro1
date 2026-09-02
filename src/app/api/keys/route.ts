import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { initializeFirebase } from '@/firebase/server';
import {
  DeveloperApiAuthError,
  maskApiKey,
  requireDeveloperIdentity,
  toIsoDate,
  type DeveloperIdentity,
} from '@/lib/developer-api-server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';

function authErrorResponse(error: unknown) {
  if (error instanceof DeveloperApiAuthError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error('[Developer API] keys route failed:', error);
  return NextResponse.json({ success: false, error: 'Developer API service unavailable.' }, { status: 500 });
}

function formatKey(id: string, data: Record<string, any>, balance?: number) {
  return {
    id,
    apiKey: id,
    maskedKey: maskApiKey(id),
    name: String(data.name || data.note || data.owner || 'Developer key'),
    owner: String(data.owner || ''),
    userId: String(data.userId || data.uid || ''),
    disabled: data.disabled === true,
    createdAt: toIsoDate(data.createdAt),
    lastUsedAt: data.lastUsedAt ? toIsoDate(data.lastUsedAt) : null,
    balance: typeof balance === 'number' ? balance : undefined,
  };
}

/**
 * Shared ownership lookup used by both DELETE (permanent revoke) and PATCH
 * (enable/disable toggle) — finds the key in Firestore, falls back to the
 * legacy RTDB store, and confirms the caller is allowed to touch it.
 */
async function findOwnedKey(identity: DeveloperIdentity, keyId: string) {
  const { firestore, database } = initializeFirebase();
  if (!firestore) return { error: NextResponse.json({ success: false, error: 'Database is not configured.' }, { status: 503 }) } as const;

  const keyRef = firestore.collection('api_keys').doc(keyId);
  const keySnapshot = await keyRef.get();
  const keyData = (keySnapshot.data() || {}) as Record<string, any>;

  let legacyData: Record<string, any> | null = null;
  if (!keySnapshot.exists && database) {
    const legacySnapshot = await database.ref(`api_keys/${keyId}`).once('value');
    legacyData = legacySnapshot.exists() ? (legacySnapshot.val() as Record<string, any>) : null;
  }

  if (!keySnapshot.exists && !legacyData) {
    return { error: NextResponse.json({ success: false, error: 'API key not found.' }, { status: 404 }) } as const;
  }

  const ownerId = String(keyData.userId || keyData.uid || legacyData?.userId || legacyData?.uid || '');
  if (!identity.isAdmin && ownerId !== identity.uid) {
    return { error: NextResponse.json({ success: false, error: 'You cannot modify this API key.' }, { status: 403 }) } as const;
  }

  return { firestore, database, keyRef, keyExists: keySnapshot.exists, hasLegacy: !!legacyData } as const;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await requireDeveloperIdentity(request);
    const { firestore, database } = initializeFirebase();
    if (!firestore) return NextResponse.json({ success: false, error: 'Database is not configured.' }, { status: 503 });

    const result = new Map<string, ReturnType<typeof formatKey>>();
    // This page is the developer's own dashboard — always scope to the
    // caller's own keys, even for admins. Fetching every user's keys here
    // was wasted reads and confusing (admin's own dashboard showed other
    // people's key names). Full cross-user visibility belongs in
    // /admin/users, not this page.
    const snapshot = await firestore.collection('api_keys').where('userId', '==', identity.uid).get();

    // Disabled keys are still returned (not filtered out) so the dashboard
    // can show their status and let the owner re-enable them.
    const balanceByUser = new Map<string, number>();
    for (const document of snapshot.docs) {
      const data = (document.data() || {}) as Record<string, any>;
      const userId = String(data.userId || data.uid || '');
      let balance = balanceByUser.get(userId);
      if (balance === undefined && userId) {
        const user = await firestore.collection('users').doc(userId).get();
        balance = Number(user.data()?.credits || 0);
        balanceByUser.set(userId, balance);
      }
      result.set(document.id, formatKey(document.id, data, balance));
    }

    // Support older RTDB keys while the migration settles. Firestore remains
    // the source used by the Python API for authentication and billing.
    if (database) {
      const legacySnapshot = await database.ref('api_keys').once('value');
      const legacyKeys = (legacySnapshot.val() || {}) as Record<string, Record<string, any>>;
      for (const [id, data] of Object.entries(legacyKeys)) {
        const ownerId = String(data.userId || data.uid || '');
        if (ownerId !== identity.uid) continue;
        if (!result.has(id)) result.set(id, formatKey(id, data));
      }
    }

    return NextResponse.json({ success: true, keys: [...result.values()] });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireDeveloperIdentity(request);
    const { firestore, database } = initializeFirebase();
    if (!firestore) return NextResponse.json({ success: false, error: 'Database is not configured.' }, { status: 503 });

    // One active secret key per user (admins are exempt). Check both the
    // Firestore collection and legacy RTDB entries so an old key still
    // counts against the limit.
    if (!identity.isAdmin) {
      const existing = await firestore
        .collection('api_keys')
        .where('userId', '==', identity.uid)
        .get();
      const hasActiveFirestoreKey = existing.docs.some((doc) => doc.data()?.disabled !== true);

      let hasActiveLegacyKey = false;
      if (database) {
        const legacySnapshot = await database.ref('api_keys').once('value');
        const legacyKeys = (legacySnapshot.val() || {}) as Record<string, Record<string, any>>;
        hasActiveLegacyKey = Object.values(legacyKeys).some((data) => {
          const ownerId = String(data.userId || data.uid || '');
          return ownerId === identity.uid && data.disabled !== true;
        });
      }

      if (hasActiveFirestoreKey || hasActiveLegacyKey) {
        return NextResponse.json(
          { success: false, error: 'You already have an active API key. Disable or revoke it before creating a new one.' },
          { status: 400 },
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || body.note || 'Developer key').trim().slice(0, 80) || 'Developer key';
    const apiKey = crypto.randomBytes(24).toString('base64url');
    const data = {
      userId: identity.uid,
      uid: identity.uid,
      owner: identity.email || identity.uid,
      name,
      note: name,
      credits: 0,
      disabled: false,
      createdAt: new Date(),
      lastUsedAt: null,
    };

    await firestore.collection('api_keys').doc(apiKey).set(data);
    if (database) {
      await database.ref(`api_keys/${apiKey}`).set({
        ...data,
        createdAt: new Date().toISOString(),
      });
    }

    // Telegram-only log: new key created (fire-and-forget, never blocks the response).
    sendToTelegram(
      `🔑 <b>New API Key Created</b>\n` +
      `👤 User: <code>${escapeHtml(identity.email || identity.uid)}</code>\n` +
      `🆔 UID: <code>${escapeHtml(identity.uid)}</code>\n` +
      `🏷 Name: <code>${escapeHtml(name)}</code>\n` +
      `🔒 Key: <code>${escapeHtml(maskApiKey(apiKey))}</code>`
    ).catch(() => null);

    return NextResponse.json({ success: true, apiKey, key: formatKey(apiKey, data) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Toggle a key's enabled/disabled state without revoking it — the key
 * keeps its history and balance, it's just rejected by /api/v1/* (see
 * resolveDeveloperKey in src/lib/hf-proxy.ts) while disabled.
 * Body: { keyId: string, disabled: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const identity = await requireDeveloperIdentity(request);
    const body = await request.json().catch(() => ({}));
    const keyId = String(body.keyId || '').trim();
    const disabled = body.disabled === true;

    if (!keyId) return NextResponse.json({ success: false, error: 'keyId is required.' }, { status: 400 });

    const owned = await findOwnedKey(identity, keyId);
    if ('error' in owned) return owned.error;

    const { database, keyRef, keyExists } = owned;

    // Server-side cooldown to back up the client-side lock: reject rapid
    // on/off/on toggling even if someone bypasses the UI and hits the
    // endpoint directly.
    const TOGGLE_COOLDOWN_MS = 3000;
    if (keyExists) {
      const currentData = (await keyRef!.get()).data() || {};
      const lastToggledAt = currentData.lastToggledAt?.toDate ? currentData.lastToggledAt.toDate() : (currentData.lastToggledAt ? new Date(currentData.lastToggledAt) : null);
      if (lastToggledAt && Date.now() - lastToggledAt.getTime() < TOGGLE_COOLDOWN_MS) {
        return NextResponse.json(
          { success: false, error: 'Please wait a few seconds before toggling this key again.' },
          { status: 429 },
        );
      }
    }

    const patch = disabled
      ? { disabled: true, disabledAt: new Date(), lastToggledAt: new Date() }
      : { disabled: false, disabledAt: null, lastToggledAt: new Date() };

    if (keyExists) await keyRef!.update(patch);
    if (database) {
      await database.ref(`api_keys/${keyId}`).update({
        ...patch,
        disabledAt: disabled ? new Date().toISOString() : null,
        lastToggledAt: new Date().toISOString(),
      });
    }

    sendToTelegram(
      `${disabled ? '⛔' : '✅'} <b>API Key ${disabled ? 'Disabled' : 'Enabled'}</b>\n` +
      `👤 User: <code>${escapeHtml(identity.email || identity.uid)}</code>\n` +
      `🔒 Key: <code>${escapeHtml(maskApiKey(keyId))}</code>`
    ).catch(() => null);

    return NextResponse.json({ success: true, disabled });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Permanently deletes a key (as opposed to PATCH, which just flips the
 * disabled flag). The document is removed from both Firestore and the
 * legacy RTDB store so the owner's "one active key" slot is freed up
 * immediately and they can generate a brand-new key right away.
 */
export async function DELETE(request: NextRequest) {
  try {
    const identity = await requireDeveloperIdentity(request);
    const keyId = new URL(request.url).searchParams.get('keyId')?.trim();
    if (!keyId) return NextResponse.json({ success: false, error: 'keyId is required.' }, { status: 400 });

    const owned = await findOwnedKey(identity, keyId);
    if ('error' in owned) return owned.error;

    const { database, keyRef, keyExists } = owned;
    if (keyExists) await keyRef!.delete();
    if (database) await database.ref(`api_keys/${keyId}`).remove();

    sendToTelegram(
      `🗑 <b>API Key Deleted</b>\n` +
      `👤 User: <code>${escapeHtml(identity.email || identity.uid)}</code>\n` +
      `🔒 Key: <code>${escapeHtml(maskApiKey(keyId))}</code>`
    ).catch(() => null);

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
