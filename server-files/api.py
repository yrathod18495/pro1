"""
api.py
---------------------
🌐 PUBLIC DIRECT API — no SDK, no cloud login, just plain HTTPS + JSON.

This does NOT talk to Firestore/Realtime DB, has NO credit system, and is
completely separate from the pending_projects queue pipeline the webapp
uses. It's a thin synchronous wrapper around the SAME voice engine already
running in this Space:

    voice endpoint   -> studio.py's Gemini Live TTS engine (same voices,
                         same chunking/retry/truncation-guard logic)

Every response either:
  - returns an R2 link (audio file), uploaded under its own folder so it
    never collides with the webapp's own queue-driven uploads:
        api/voice/{request_id}.mp3
    (an R2 Object Lifecycle Rule on that prefix auto-deletes old files —
    see the bucket settings, not this code)
  - or a clear 4xx JSON error (e.g. bad voice name -> lists every valid
    name back, so the caller can fix it in one round trip).

Mount into app.py:
    from api import router as public_api_router
    app.include_router(public_api_router)

🔑 AUTH: header key, `X-API-Key: <key>`, checked against Firestore's
`api_keys` collection (doc id = the key). Uses the SAME
FIREBASE_SERVICE_ACCOUNT_KEY env var already used for Vertex elsewhere
in this Space — no firestore.rules changes needed, the admin SDK
always bypasses rules. Issue a new key with issue_api_key(owner=...)
(a plain Firestore write, no redeploy required).
"""

import os
import io
import math
import time
import uuid
import hashlib
import wave
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field
from typing import Optional, List

# --- Reuse the EXACT voice engine already running in this Space ---
from studio import (
    ProjectStats, process_single_dialogue, chunk_dialogue_text,
    pcm_to_mp3, log_info, log_error, log_success, escapeHtml,
    GEMINI_MAX_CONCURRENT_PER_KEY,
)
from r2_netlify import upload_to_r2, random_object_key
# NOTE: Telegram logging for the public API used to happen right here via
# send_telegram_log(). It has moved to the Vercel side (src/app/api/v1/*
# route handlers, via src/lib/telegram-logger.ts) so every product surface
# logs through the same bot/token config instead of the Python host needing
# its own Telegram credentials. This file now only *returns* the data a
# caller needs to build that message (see _record_api_usage's return value
# and the `_telemetry` key attached to each response below).

import base64
import json
import secrets as _secrets_mod
import datetime

import firebase_admin
from firebase_admin import credentials, firestore, db


router = APIRouter(prefix="/api/v1", tags=["public-api"])


# ============================================================
# 🔑 AUTH — Firestore-backed, service-account only (no security rules
# needed: the admin SDK always bypasses Firestore rules entirely, so
# this works even if firestore.rules never mentions the `api_keys`
# collection).
# ============================================================
_FIRESTORE_DB = None

def _get_db():
    """Lazy-init firebase_admin using the SAME service account JSON
    already used elsewhere in this Space (music_generation.py etc)."""
    global _FIRESTORE_DB
    if _FIRESTORE_DB is not None:
        return _FIRESTORE_DB

    sa_raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if not sa_raw:
        log_error("FIREBASE_SERVICE_ACCOUNT_KEY not set — public API auth cannot work.")
        return None

    try:
        if not firebase_admin._apps:
            sa_info = json.loads(sa_raw)
            cred = credentials.Certificate(sa_info)
            firebase_admin.initialize_app(cred)
        _FIRESTORE_DB = firestore.client()
        log_info("🔑 Public API auth ENABLED — Firestore (api_keys collection).")
    except Exception as e:
        log_error("Failed to init Firestore for public API auth", str(e))
        _FIRESTORE_DB = None
    return _FIRESTORE_DB


def require_api_key(x_api_key: Optional[str] = Header(None)) -> dict:
    """Looks the key up in Firestore's `api_keys` collection (doc id =
    the key itself). Raises 401 if missing/invalid/disabled, else
    returns the key's doc data so routes can use it (credits, userId,
    etc). No PUBLIC_API_KEYS env var anymore — issuing a key is just
    a Firestore write, no redeploy needed.

    Every failure mode is logged server-side (log_error) and the caller
    only ever sees a clean, short HTTPException — no raw Firestore/
    exception text ever reaches the user."""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header.")

    try:
        db = _get_db()
        if db is None:
            raise HTTPException(status_code=503, detail="Auth backend unavailable. Try again shortly.")

        doc = db.collection("api_keys").document(x_api_key).get()
        if not doc.exists:
            raise HTTPException(status_code=401, detail="Invalid X-API-Key.")

        data = doc.to_dict() or {}
        if data.get("disabled"):
            raise HTTPException(status_code=401, detail="This API key has been disabled.")

    except HTTPException:
        raise  # already a clean, intentional response — pass through as-is
    except Exception as e:
        # Anything unexpected (Firestore hiccup, malformed doc, etc.) —
        # log the real reason, never leak it to the caller.
        log_error(f"[auth] unexpected error validating key ...{x_api_key[-6:]}", str(e))
        raise HTTPException(status_code=503, detail="Auth check failed. Please try again.")

    # best-effort: bump last-used timestamp, non-blocking on failure
    try:
        doc.reference.update({"lastUsedAt": firestore.SERVER_TIMESTAMP})
    except Exception as e:
        log_error(f"[auth] failed to bump lastUsedAt for ...{x_api_key[-6:]}", str(e))

    return data


def require_internal_access(
    x_internal_api_key: Optional[str] = Header(None, alias="X-Internal-API-Key"),
) -> None:
    """Private second gate between Vercel and the Python host.

    The value is an operator-chosen secret, not a customer key. It must be
    identical in Vercel's HF_INTERNAL_API_KEY and the Python host's
    HF_INTERNAL_API_KEY environment variables.
    """
    expected = (os.environ.get("HF_INTERNAL_API_KEY") or "").strip()
    if not expected or not x_internal_api_key or x_internal_api_key.strip() != expected:
        raise HTTPException(status_code=401, detail="Unauthorized upstream access.")


def issue_api_key(owner: str, note: str = "", credits: int = 0, user_id: str = "") -> str:
    """Helper to generate + store a new key. Call this from wherever
    you want to hand a key to a user (an admin route, a signup flow,
    a one-off script) — not exposed as a public endpoint here.

    Also pings the Telegram bot so you always know who a new key
    belongs to, without needing to check Firestore by hand."""
    db = _get_db()
    if db is None:
        raise RuntimeError("Firestore not initialized — check FIREBASE_SERVICE_ACCOUNT_KEY.")

    key = _secrets_mod.token_urlsafe(24)
    try:
        db.collection("api_keys").document(key).set({
            "owner": owner,
            # Required for credit deduction. Pass the Firebase Auth UID here.
            "userId": user_id or owner,
            "note": note,
            "credits": credits,
            "disabled": False,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "lastUsedAt": None,
        })
    except Exception as e:
        log_error(f"[auth] failed to write new key for owner={owner}", str(e))
        raise

    # This helper isn't wired to any route in this Space — key issuance for
    # the webapp goes through Vercel's own /api/keys route (Firebase Admin
    # directly), which is where its Telegram "new key issued" notification
    # belongs too, for the same reason usage logs moved out of this file
    # (see the note near the r2_netlify import above). Kept here only as a
    # server-side convenience for one-off scripts; log locally instead.
    log_success(f"[auth] issued new public API key for owner={owner} (...{key[-6:]})")

    return key


# ============================================================
# 🎙️ VOICE CATALOG
# ============================================================
# Tries your real voice_catalog.py first (ALL_VOICE_NAMES + get_voice_gender).
# Falls back to the standard 30 Gemini native-audio prebuilt voice names if
# voice_catalog.py doesn't export a name list yet.
#
# ⚠️ ACTION NEEDED: if your real catalog uses different/custom names, add
#     ALL_VOICE_NAMES = [...]   (list of every valid voice_id, exact case)
# to voice_catalog.py so this picks up the real list instead of the fallback.
try:
    from voice_catalog import ALL_VOICE_NAMES, get_voice_gender
except ImportError:
    from voice_catalog import get_voice_gender
    ALL_VOICE_NAMES = [
        "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
        "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
        "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
        "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird",
        "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
    ]
    log_error("voice_catalog.py has no ALL_VOICE_NAMES — using the default "
               "30-voice Gemini list as a fallback. Confirm this matches your "
               "actual catalog.")

_VOICE_LOOKUP = {v.lower(): v for v in ALL_VOICE_NAMES}

# Public API billing rule. Deliberately a server-side constant — callers
# cannot choose their own cost in the request body. 1 credit per character.
VOICE_CREDIT_MULTIPLIER = 1


def _user_billing_snapshot(user_id: str) -> dict:
    """Read the current balance for operator logs without trusting request data."""
    if not user_id:
        return {}
    try:
        database = _get_db()
        if database is None:
            return {}
        snapshot = database.collection("users").document(user_id).get()
        return snapshot.to_dict() or {}
    except Exception as e:
        log_error(f"[billing] failed to read balance for {user_id}", str(e))
        return {}


def _record_api_usage(
    *,
    request_id: str,
    endpoint: str,
    key_data: dict,
    user_id: str,
    cost: int,
    latency_ms: int,
    status: str,
    extra: Optional[dict] = None,
) -> dict:
    """Persist one compact usage record to Realtime DB and return it so the
    caller (a route handler below) can attach it to the response as
    `_telemetry`. Vercel reads that field to send the operator Telegram log
    and then strips it before the response ever reaches the real customer —
    see src/lib/hf-proxy.ts / src/app/api/v1/*/route.ts.

    The audio URL is intentionally never included here. The URL belongs in
    the customer-facing response only; this record is a billing/operations
    audit trail.
    """
    user = _user_billing_snapshot(user_id)
    username = (
        user.get("displayName")
        or user.get("name")
        or user.get("username")
        or key_data.get("owner")
        or user.get("email")
        or user_id
        or "unlinked"
    )
    remaining = int(user.get("credits") or 0)
    now = datetime.datetime.now(datetime.timezone.utc)
    record = {
        "requestId": request_id,
        "endpoint": endpoint,
        "api": f"Public API {endpoint.title()}",
        "userId": user_id or "unlinked",
        "username": str(username),
        "apiKeySuffix": f"...{str(key_data.get('_keySuffix') or 'unknown')}",
        "cost": int(cost or 0),
        "remainingCredits": remaining,
        "latencyMs": int(max(latency_ms, 0)),
        "status": status,
        "timestamp": now.isoformat().replace("+00:00", "Z"),
        **(extra or {}),
    }

    try:
        database = _get_db()
        if database is not None:
            usage_uid = user_id or "unlinked"
            database_ref = db.reference(f"apiUsage/{usage_uid}/{request_id}")
            database_ref.set(record)
    except Exception as e:
        log_error(f"[API {endpoint}:{request_id}] usage record failed", str(e))

    return record


def _idempotency_doc_id(user_id: str, endpoint: str, value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None
    digest = hashlib.sha256(f"{user_id}:{endpoint}:{value}".encode("utf-8")).hexdigest()
    return digest[:64]


def _get_idempotent_response(user_id: str, endpoint: str, value: Optional[str]):
    doc_id = _idempotency_doc_id(user_id, endpoint, value)
    if not doc_id:
        return None
    try:
        database = _get_db()
        if database is None:
            return None
        snapshot = database.collection("api_idempotency").document(doc_id).get()
        if snapshot.exists:
            cached = snapshot.to_dict() or {}
            if cached.get("response"):
                log_info(f"[API {endpoint}] idempotent replay {doc_id[:12]}")
                return cached["response"]
    except Exception as e:
        log_error(f"[API {endpoint}] idempotency lookup failed", str(e))
    return None


def _store_idempotent_response(user_id: str, endpoint: str, value: Optional[str], response: dict) -> None:
    doc_id = _idempotency_doc_id(user_id, endpoint, value)
    if not doc_id:
        return
    try:
        database = _get_db()
        if database is not None:
            database.collection("api_idempotency").document(doc_id).set({
                "userId": user_id,
                "endpoint": endpoint,
                "response": response,
                "createdAt": firestore.SERVER_TIMESTAMP,
            })
    except Exception as e:
        log_error(f"[API {endpoint}] idempotency write failed", str(e))


def _billing_user_id(key_data: dict) -> str:
    """The API key must be issued for a Firebase user.

    `userId` is preferred; `uid` is accepted for older key documents. We do
    not accept a user id from the request body because that would allow one
    customer to charge another customer's account.
    """
    return str(key_data.get("userId") or key_data.get("uid") or "").strip()


def _charge_credits(user_id: str, amount: int, reason: str) -> None:
    if not user_id:
        raise HTTPException(status_code=403, detail="This API key is not linked to a user account.")
    if amount <= 0:
        return

    db_firestore = _get_db()
    user_ref = db_firestore.collection("users").document(user_id)
    try:
        db_firestore.transaction
        transaction = db_firestore.transaction()

        @firestore.transactional
        def deduct(tx):
            snap = user_ref.get(transaction=tx)
            if not snap.exists:
                raise HTTPException(status_code=404, detail="Billing user account not found.")
            balance = int((snap.to_dict() or {}).get("credits") or 0)
            if balance < amount:
                raise HTTPException(
                    status_code=402,
                    detail={"error": "Insufficient credits.", "required": amount, "available": balance},
                )
            tx.update(user_ref, {"credits": firestore.Increment(-amount), "hasMadeFirstPurchase": True})
            return balance - amount

        deduct(transaction)
    except HTTPException:
        raise
    except Exception as e:
        log_error(f"[billing] deduction failed for {user_id}", str(e))
        raise HTTPException(status_code=503, detail="Credit billing unavailable. Please try again.")

    try:
        db.reference(f"creditHistory/{user_id}").push({
            "amount": -amount,
            "reason": reason,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "type": "usage",
        })
    except Exception as e:
        log_error(f"[billing] history write failed for {user_id}", str(e))


def _refund_credits(user_id: str, amount: int, reason: str) -> None:
    if not user_id or amount <= 0:
        return
    try:
        db_firestore = _get_db()
        db_firestore.collection("users").document(user_id).update(
            {"credits": firestore.Increment(amount)}
        )
        db.reference(f"creditHistory/{user_id}").push({
            "amount": amount,
            "reason": reason,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "type": "refund",
        })
    except Exception as e:
        log_error(f"[billing] refund failed for {user_id}", str(e))


def resolve_voice_name(name: str):
    """Case-insensitive match against the catalog. Returns the canonical
    name, or None if it isn't a valid voice."""
    return _VOICE_LOOKUP.get((name or "").strip().lower())


# ============================================================
# 🎙️ VOICE ENDPOINT
# ============================================================
class VoiceRequest(BaseModel):
    name: str = Field(..., description="Voice name — must be one of the available voices.")
    text: str = Field(..., min_length=1)
    age: Optional[str] = Field("adult", description="'adult' | 'kid' | 'old'")
    response_format: Optional[str] = Field(
        "url",
        description=(
            "'url' (default) — uploads the MP3 to R2 and returns a hosted "
            "audio_url. 'binary' — skips the R2 upload entirely (and the "
            "idempotency-cache read/write, which also costs a round trip) "
            "and returns the raw MP3 bytes directly in the response body. "
            "Use 'binary' when you're going to consume the audio "
            "immediately and don't need a persistent link — it removes the "
            "R2 network hop from the request's critical path, so it comes "
            "back noticeably faster."
        ),
    )

SAMPLE_RATE = 24000
SAMPLE_WIDTH = 2  # 16-bit PCM


@router.post("/voice", dependencies=[])
def generate_voice(
    payload: VoiceRequest,
    x_api_key: Optional[str] = Header(None),
    x_internal_api_key: Optional[str] = Header(None, alias="X-Internal-API-Key"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    require_internal_access(x_internal_api_key)
    key_data = require_api_key(x_api_key)
    key_data["_keySuffix"] = (x_api_key or "")[-6:]
    billing_user_id = _billing_user_id(key_data)
    started_at = datetime.datetime.now(datetime.timezone.utc)

    # 'binary' mode skips the idempotency-cache lookup too — that cache only
    # ever stores a JSON {audio_url: ...} shape (see _store_idempotent_response
    # below), so there's nothing meaningful to replay for a raw-bytes response,
    # and skipping the read here saves a Firestore round trip on this path.
    want_binary = (payload.response_format or "url").strip().lower() == "binary"
    cached_response = None if want_binary else _get_idempotent_response(billing_user_id, "voice", idempotency_key)
    if cached_response:
        return cached_response

    canonical = resolve_voice_name(payload.name)
    if not canonical:
        raise HTTPException(status_code=400, detail={
            "error": f"Invalid voice name: {payload.name}",
            "available_names": ALL_VOICE_NAMES,
        })
    resolved_lines = [(canonical, payload.text, payload.age or "adult")]

    request_id = uuid.uuid4().hex[:12]
    log_info(f"🌐 [API voice:{request_id}] {len(resolved_lines)} line(s)")
    total_chars = sum(len(text) for _, text, _ in resolved_lines)
    charged_amount = math.ceil(total_chars * VOICE_CREDIT_MULTIPLIER)
    _charge_credits(billing_user_id, charged_amount, f"Public API voice: {request_id}")

    # --- Build every synthesis task (line -> possibly several chunks) ---
    stats = ProjectStats()
    tasks = []          # (flat_idx, line_idx, chunk_idx, args_tuple)
    line_chunk_counts = []
    flat_idx = 0
    for line_idx, (voice_id, text, age) in enumerate(resolved_lines):
        chunks = chunk_dialogue_text(text)
        line_chunk_counts.append(len(chunks))
        for c_text in chunks:
            chunk_line = {"line": c_text, "text": c_text, "character": voice_id}
            args = (flat_idx, chunk_line, voice_id, age, request_id, stats, None, "", None)
            tasks.append((flat_idx, line_idx, args))
            flat_idx += 1

    results = {}
    max_workers = min(max(len(tasks), 1), GEMINI_MAX_CONCURRENT_PER_KEY * 3, 32)
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(process_single_dialogue, args): fidx for fidx, _, args in tasks}
        for fut in as_completed(futures):
            fidx = futures[fut]
            try:
                result = fut.result()
                # studio.process_single_dialogue's return tuple isn't owned
                # by this file — it lives in the Space's studio.py and can
                # grow extra trailing fields over time (it did: this used to
                # be a strict 3-tuple unpack and started throwing "too many
                # values to unpack" once studio.py added a field, taking the
                # whole /voice endpoint down with 502s). Index defensively
                # instead of unpacking, so this only cares about the two
                # positions it actually uses.
                pcm = result[1] if len(result) > 1 else None
                engine = result[2] if len(result) > 2 else "unknown"
            except Exception as e:
                log_error(f"[API voice:{request_id}] chunk {fidx} raised", str(e))
                pcm, engine = None, "rejected"
            results[fidx] = pcm

    failed = [fidx for fidx in range(len(tasks)) if not results.get(fidx)]
    if failed:
        _refund_credits(billing_user_id, charged_amount, f"Public API voice failed: {request_id}")
        raise HTTPException(status_code=502, detail={
            "error": "Voice generation failed for one or more lines.",
            "failed_chunk_indices": failed,
        })

    # --- Stitch chunks of the single line back together in order ---
    master = io.BytesIO()
    for idx in range(len(tasks)):
        master.write(results[idx])

    try:
        pcm_bytes = master.getvalue()
        mp3_bytes = pcm_to_mp3(pcm_bytes, sample_rate=SAMPLE_RATE, channels=1, bitrate=128)
    except Exception as e:
        _refund_credits(billing_user_id, charged_amount, f"Public API voice conversion failed: {request_id}")
        log_error(f"[API voice:{request_id}] conversion failed", str(e))
        raise HTTPException(status_code=502, detail="Voice generated but audio conversion failed. Please retry.")

    file_path = random_object_key("api/voice", "mp3")

    # --- 🚀 'binary' fast path: skip the R2 upload entirely and hand the
    # MP3 bytes straight back. This is the actual latency win — no upload
    # round trip, no idempotency write, no audio_url to generate. ---
    if want_binary:
        latency_ms = int((datetime.datetime.now(datetime.timezone.utc) - started_at).total_seconds() * 1000)
        log_success(f"[API voice:{request_id}] ✅ audio generated (binary, no upload)")
        usage_record = _record_api_usage(
            request_id=request_id,
            endpoint="voice",
            key_data=key_data,
            user_id=billing_user_id,
            cost=charged_amount,
            latency_ms=latency_ms,
            status="success",
            extra={"lines": len(resolved_lines), "characters": total_chars, "responseFormat": "binary"},
        )
        return Response(
            content=bytes(mp3_bytes),
            media_type="audio/mpeg",
            headers={
                "X-Request-Id": request_id,
                "X-Credits-Charged": str(charged_amount),
                "X-Latency-Ms": str(latency_ms),
                "Content-Disposition": f'inline; filename="{request_id}.mp3"',
            },
        )

    try:
        audio_url = upload_to_r2(file_path, mp3_bytes, "audio/mpeg")
    except Exception as e:
        _refund_credits(billing_user_id, charged_amount, f"Public API voice upload failed: {request_id}")
        log_error(f"[API voice:{request_id}] upload failed", str(e))
        raise HTTPException(status_code=502, detail="Voice generated but failed to save. Please retry.")

    latency_ms = int((datetime.datetime.now(datetime.timezone.utc) - started_at).total_seconds() * 1000)
    log_success(f"[API voice:{request_id}] ✅ audio generated")
    usage_record = _record_api_usage(
        request_id=request_id,
        endpoint="voice",
        key_data=key_data,
        user_id=billing_user_id,
        cost=charged_amount,
        latency_ms=latency_ms,
        status="success",
        extra={"lines": len(resolved_lines), "characters": total_chars},
    )

    response = {"success": True, "request_id": request_id, "audio_url": audio_url}
    # Cache the customer-facing response only — no _telemetry inside it, or
    # a retried request would re-trigger a Telegram log on every replay.
    _store_idempotent_response(billing_user_id, "voice", idempotency_key, response)
    response["_telemetry"] = usage_record
    return response


@router.get("/voice/names")
def list_voice_names(
    x_api_key: Optional[str] = Header(None),
    x_internal_api_key: Optional[str] = Header(None, alias="X-Internal-API-Key"),
):
    """Lets a caller fetch the valid name list up front instead of only
    discovering it via a 400 error."""
    require_internal_access(x_internal_api_key)
    require_api_key(x_api_key)
    return {"available_names": ALL_VOICE_NAMES}


