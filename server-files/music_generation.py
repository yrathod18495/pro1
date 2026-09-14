"""
music_generation.py
---------------------
Standalone Music Generation node for the HQ Cluster — Firestore only, no RTDB.

Contract (per Music Studio Hub spec):
  - Frontend writes a pending job flat under:   music_project/{mappingId}
        { userId, userEmail, userName, mode/productionMode, prompt, script,
          lyrics?, genre, mood, duration, language, category, cost, tags,
          isMusic: true, projectType, projectName, status: "pending",
          timestamp, createdAt }
  - This module attaches a Firestore REAL-TIME LISTENER (not polling) on the
    music_project collection, filtered to status == "pending". Firestore
    only charges a read when a document is added/changed — there is no
    fixed per-interval cost like a 5-second poll loop.
  - Picked-up jobs are copied + updated into the nested result doc:
        music_project/{userId}/userProjects/{mappingId}
        processing -> merge status:"processing" + all source fields
        done       -> merge status:"ok", audioUrl, completedAt,
                       durationMs (elapsed since frontend-sent createdAt,
                       skipped if createdAt missing/unparsable)
        error      -> merge status:"error", error
  - On success the flat music_project/{mappingId} pending doc is deleted
    (cleanup). On failure it's left behind with status:"error" for
    debugging.

Import into app.py like:
    from music_generation import start_pending_music_listener
    ...
    start_pending_music_listener()   # call once, inside lifespan/startup
"""

import os
import json
import time
import base64
import threading
import traceback
import collections
import requests
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

from firebase_admin import firestore, db

import google.auth
from google.auth.transport.requests import Request as GoogleRequest

from r2_netlify import upload_to_r2, random_object_key


# ============================================================
# LOGGING
# ============================================================
class bcolors:
    OKGREEN = '\033[92m'
    OKCYAN = '\033[96m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'


def log_success(msg):
    print(f"{bcolors.OKGREEN}[MUSIC-GEN-SUCCESS] {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def log_error(msg, detail=None):
    print(f"{bcolors.FAIL}[MUSIC-GEN-ERROR]   {datetime.now().strftime('%H:%M:%S')} - 🚨 {msg}{bcolors.ENDC}", flush=True)
    if detail:
        print(f"{bcolors.FAIL}{detail}{bcolors.ENDC}", flush=True)


def log_info(msg):
    print(f"{bcolors.OKCYAN}[MUSIC-GEN-NODE]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def log_warn(msg):
    print(f"{bcolors.WARNING}[MUSIC-GEN-WARN]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def escape_html(text):
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ============================================================
# ⏱️ DURATION — frontend sends "createdAt" (device wall-clock ISO string,
# e.g. "2026-08-11T17:59:25.000Z") at submit time. We only ever use it to
# compute an ELAPSED duration (completedAt - createdAt), never as an
# absolute timestamp to compare across users/servers — a duration cancels
# out any timezone/offset difference since both ends came off the same
# device clock. If it's missing or unparsable we just skip the field
# instead of failing the whole job.
# ============================================================
def _elapsed_ms_since_created(data):
    created_raw = data.get("createdAt")
    if not created_raw:
        return None
    try:
        # Normalize trailing "Z" (Zulu/UTC) to a fromisoformat-friendly offset.
        created_str = created_raw.replace("Z", "+00:00") if isinstance(created_raw, str) else created_raw
        created_dt = datetime.fromisoformat(created_str)
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - created_dt).total_seconds() * 1000
        return max(0, int(elapsed))
    except (ValueError, TypeError) as e:
        log_warn(f"Could not parse createdAt={created_raw!r} for duration calc: {e}")
        return None


# ============================================================
# 💳 CREDIT REFUND ENGINE — same pattern/shape as studio.py's, ported here
# since music jobs had NO refund logic at all before this (checked: no
# credit/refund/balance/deduct reference anywhere in this file previously).
#
# ⚠️ CREDIT_COST_FIELD: this module's own docstring lists the flat
# music_project payload as including a "cost" field (not "creditCost" like
# the voice/story payload). Checking both below so this works either way —
# confirm which one it actually is and I'll drop the fallback.
#
# ✅ CONFIRMED (Firestore console screenshot):
#   Balance lives in FIRESTORE at  users/{uid}  -> field "credits" (int64)
#   creditHistory (the log) lives in the REALTIME DATABASE, unchanged.
# Two different databases — refund_credits() below writes to both, exactly
# mirroring studio.py so both engines' refunds land in the same places.
# ============================================================
FIRESTORE_USERS_COLLECTION = "users"
FIRESTORE_CREDITS_FIELD = "credits"

def _get_credits_charged(data):
    for key in ("creditCost", "cost"):
        val = data.get(key)
        if isinstance(val, (int, float)) and val > 0:
            return val
    return 0

def _claim_refund_amount(job_id, requested_amount, credits_charged):
    """Same idempotency guard as studio.py — a Firebase RTDB transaction on
    refund_locks/{job_id} ensures this specific music job is never refunded
    more than it was charged, no matter how many times/places refund is
    triggered from for it."""
    if not job_id or requested_amount <= 0 or credits_charged <= 0:
        return 0
    lock_ref = db.reference(f'refund_locks/{job_id}')
    granted = {"amount": 0}

    def _txn(current_refunded):
        already = current_refunded or 0
        remaining = round(credits_charged - already, 2)
        grant = round(min(requested_amount, remaining), 2)
        granted["amount"] = grant
        if grant <= 0:
            return current_refunded
        return round(already + grant, 2)

    try:
        lock_ref.transaction(_txn)
    except Exception as e:
        log_error(f"Refund claim transaction failed for {job_id}", str(e))
        return 0
    return granted["amount"]

def refund_credits(uid, amount, reason, job_id=None, credits_charged=None):
    """Adds credits back to the user's live balance (Firestore:
    users/{uid}.credits) and writes a creditHistory entry in the Realtime
    Database — SAME shape/node as the voice side (amount / reason /
    timestamp / type:'refund'), so both engines' refunds show up together
    in one history list."""
    if not uid or not amount or amount <= 0:
        return

    if job_id and credits_charged:
        amount = _claim_refund_amount(job_id, amount, credits_charged)
        if amount <= 0:
            log_info(f"💳 Refund skipped for {job_id} — already fully refunded.")
            return

    # --- Firestore: bump the real balance, atomically, server-side ---
    try:
        firestore.client().collection(FIRESTORE_USERS_COLLECTION).document(uid).update({
            FIRESTORE_CREDITS_FIELD: firestore.Increment(amount)
        })
    except Exception as e:
        log_error(f"💳 Firestore balance credit FAILED for {uid} (amount={amount}) — history entry still being written", str(e))

    # --- Realtime Database: log it in creditHistory, same shape as always ---
    try:
        db.reference(f'creditHistory/{uid}').push({
            "amount": amount,
            "reason": reason,
            "timestamp": datetime.now(IST).isoformat(),
            "type": "refund",
            **({"projectId": job_id} if job_id else {}),
        })
        log_success(f"💳 Refunded {amount} credits to {uid} — {reason}")
        send_telegram_log(
            f"💳 <b>Credit Refund</b>\n\n"
            f"👤 <b>User:</b> <code>{escape_html(uid)}</code>\n"
            f"💰 <b>Amount:</b> +{amount}\n"
            f"📝 <b>Reason:</b> {escape_html(reason)}\n"
            f"🆔 <b>Job:</b> <code>{escape_html(job_id) if job_id else '—'}</code>"
        )
    except Exception as e:
        log_error(f"💳 creditHistory refund entry FAILED for {uid} (amount={amount})", str(e))


# ============================================================
# TELEGRAM / NETLIFY RELAY
# ============================================================
NETLIFY_RELAY = "https://creative-bombolone-fe8bba.netlify.app/.netlify/functions/send-log"
relay_session = requests.Session()


def send_telegram_log(message):
    def _dispatch():
        try:
            relay_session.post(NETLIFY_RELAY, json={"message": message}, timeout=10)
        except Exception:
            pass
    threading.Thread(target=_dispatch, daemon=True).start()


# ============================================================
# CLOUDFLARE R2 — client + upload_to_r2 + random_object_key live in
# r2_netlify.py (shared across the whole cluster), imported above.
# ============================================================
# SERVICE ACCOUNT / GOOGLE OAUTH (Vertex Lyria only)
# ============================================================
service_account_info = None
try:
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if sa_json:
        service_account_info = json.loads(sa_json)
    else:
        log_error("FIREBASE_SERVICE_ACCOUNT_KEY missing — Vertex Lyria calls will fail (music_generation.py).")
except Exception:
    log_error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY (music_generation.py)", traceback.format_exc())

cached_google_token = None
token_expiry = 0

# Lazy — set inside start_pending_music_listener(), NOT at import time.
# app.py imports this module (top of file) before it calls
# firebase_admin.initialize_app() (later, in its service-init section), so
# calling firestore.client() at module load would fail with "default
# Firebase app does not exist". start_pending_music_listener() is only
# called from app.py's startup event, by which point init_app() has
# already run.
firestore_db = None


def get_access_token():
    """Generates a fresh OAuth2 token with 50-minute caching logic."""
    global cached_google_token, token_expiry

    if cached_google_token and time.time() < token_expiry:
        return cached_google_token

    if not service_account_info:
        raise Exception("Service account info missing.")

    log_info("Refreshing Vertex AI OAuth Token...")
    credentials_google, _ = google.auth.load_credentials_from_dict(service_account_info)
    scoped_credentials = credentials_google.with_scopes(['https://www.googleapis.com/auth/cloud-platform'])
    auth_request = GoogleRequest()
    scoped_credentials.refresh(auth_request)

    cached_google_token = scoped_credentials.token
    token_expiry = time.time() + 3000  # Cache for 50 mins
    return cached_google_token


def is_policy_rejection(err_str):
    """True if the Vertex error is a content-policy rejection (non-retryable,
    user must edit their prompt) rather than a transient/server failure."""
    lowered = err_str.lower()
    return (
        "prohibited use policy" in lowered
        or "sensitive words" in lowered
        or '"code":"invalid_request"' in lowered
    )


def recursive_find_audio(obj):
    """Walks a nested dict/list response looking for a base64 audio payload."""
    if not obj:
        return None
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in ["data", "inline_data", "audio", "output_audio"] and isinstance(v, str) and len(v) > 500:
                return v
            res = recursive_find_audio(v)
            if res:
                return res
    elif isinstance(obj, list):
        for item in obj:
            res = recursive_find_audio(item)
            if res:
                return res
    return None


def build_final_prompt(mode, prompt, lyrics, genre, mood, tempo, duration, language=None,
                        category=None, instruments=None, tags=None):
    """Every field the frontend collects is folded in here, but kept as
    light comma-separated descriptors (never instructional/enforcement
    wording like "use exact lyrics, do not translate") — that verbose
    style is what previously tripped Vertex's content policy filter.
    Duration is intentionally NOT sent (it's a generation-length control,
    not a musical descriptor, and gets set elsewhere); it's still saved
    to Firestore from the raw job data."""
    if mode == "vocal":
        base = f"Professional studio vocal track: {prompt}"
        if genre:
            base += f", genre: {genre}"
        if mood:
            base += f", mood: {mood}"
        if tempo:
            base += f", tempo: {tempo}"
        if category:
            base += f", style: {category}"
        if instruments:
            instruments_str = ", ".join(instruments) if isinstance(instruments, list) else instruments
            if instruments_str:
                base += f", instruments: {instruments_str}"
        if tags:
            tags_str = ", ".join(tags) if isinstance(tags, list) else tags
            if tags_str:
                base += f", vibe: {tags_str}"
        if language:
            base += f", sung in {language}"
        if lyrics:
            base += f"\nLyrics: {lyrics}"
        return base
    else:
        base = f"Professional studio instrumental: {prompt}"
        if genre:
            base += f", genre: {genre}"
        if mood:
            base += f", mood: {mood}"
        if tempo:
            base += f", tempo: {tempo}"
        if category:
            base += f", style: {category}"
        if instruments:
            instruments_str = ", ".join(instruments) if isinstance(instruments, list) else instruments
            if instruments_str:
                base += f", instruments: {instruments_str}"
        if tags:
            tags_str = ", ".join(tags) if isinstance(tags, list) else tags
            if tags_str:
                base += f", vibe: {tags_str}"
        return base


# ============================================================
# CONCURRENCY BUCKET
# ============================================================
MAX_CONCURRENT_MUSIC_JOBS = int(os.environ.get("MAX_CONCURRENT_MUSIC_JOBS", "5"))
music_job_bucket = threading.Semaphore(MAX_CONCURRENT_MUSIC_JOBS)

processing_ids = set()
processing_lock = threading.Lock()

# Jobs that arrived while the bucket was full — retried in-memory when a
# slot frees up, so we never need a second Firestore read to "check again".
waiting_queue = collections.deque()


# ============================================================
# TASK PROCESSOR
# ============================================================
def process_music_generation_task(mapping_id, data):
    # Frontend may send fields flat OR nested inside "metadata" — support both.
    meta = data.get("metadata") or {}

    user_id = data.get("userId")
    user_email = data.get("userEmail", "unknown")
    mode = (meta.get("productionMode") or data.get("productionMode") or data.get("mode") or "instrumental").lower()
    prompt = data.get("prompt") or data.get("script") or ""
    lyrics = meta.get("lyrics") or data.get("lyrics")
    genre = meta.get("genre") or data.get("genre")
    mood = meta.get("mood") or data.get("mood")
    tempo = meta.get("tempo") or data.get("tempo")
    duration = meta.get("duration") or data.get("duration")
    language = meta.get("language") or data.get("language")
    category = meta.get("category") or data.get("category")
    instruments = meta.get("instruments") or data.get("instruments")
    tags = meta.get("tags") or data.get("tags")
    project_name = data.get("projectName") or f"AI Music: {(prompt or 'Untitled')[:40]}"
    credits_charged = _get_credits_charged(data)

    log_info(f"📥 Music Input: {mapping_id} for {user_email}")

    # Nested result doc: music_project/{userId}/userProjects/{mappingId}
    project_doc = (
        firestore_db.collection("music_project")
        .document(user_id)
        .collection("userProjects")
        .document(mapping_id)
    )
    # Flat pending doc this job was picked up from.
    pending_doc = firestore_db.collection("music_project").document(mapping_id)

    try:
        # Copy every field the frontend already sent, plus mark processing.
        result_payload = dict(data)
        result_payload.update({
            "status": "processing",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        project_doc.set(result_payload, merge=True)
        pending_doc.update({"status": "processing"})

        token = get_access_token()
        project_id = service_account_info["project_id"]

        url = f"https://aiplatform.googleapis.com/v1beta1/projects/{project_id}/locations/global/interactions"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        payload = {
            "model": "lyria-3-pro-preview",
            "input": build_final_prompt(mode, prompt, lyrics, genre, mood, tempo, duration, language, category, instruments, tags),
        }

        log_info("🛰️ Contacting Vertex Music Node...")
        try:
            res = requests.post(url, headers=headers, json=payload, timeout=60)
        except requests.exceptions.Timeout:
            raise Exception("TIMEOUT: Music node did not respond within 60 seconds.")

        if not res.ok:
            raise Exception(f"Vertex Rejection: {res.text}")

        audio_base64 = recursive_find_audio(res.json())
        if not audio_base64:
            raise Exception("Empty binary received from music node.")

        audio_bytes = base64.b64decode(audio_base64)

        file_path = random_object_key("temp/music", "wav")
        log_info(f"🚀 Deploying to R2: {file_path}")
        audio_url = upload_to_r2(file_path, audio_bytes, "audio/wav")

        duration_ms = _elapsed_ms_since_created(data)
        project_doc.set({
            "status": "ok",
            "audioUrl": audio_url,
            "completedAt": int(time.time() * 1000),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            **({"durationMs": duration_ms} if duration_ms is not None else {}),
        }, merge=True)

        # Cleanup — job is done, remove the flat pending doc.
        pending_doc.delete()

        report = (
            f"🎵 <b>MUSIC NODE READY</b>\n\n"
            f"👤 <b>User:</b> {escape_html(user_email)}\n"
            f"📂 <b>Project:</b> {escape_html(project_name)}\n"
            f"🆔 <b>Node:</b> <code>{mapping_id}</code>\n"
            f"💳 <b>Credits Charged:</b> {credits_charged}\n"
            f"📍 <b>Link:</b> {audio_url}"
        )
        send_telegram_log(report)
        log_success(f"Music Node Ready: {mapping_id}")

    except Exception as e:
        err_str = str(e)
        log_error(f"Music Node Error: {mapping_id}", err_str)

        is_timeout = err_str.startswith("TIMEOUT:")
        is_blocked = is_policy_rejection(err_str)

        if is_blocked:
            # Non-retryable: the prompt itself was rejected by Google's
            # generative-AI policy. Don't alarm on Telegram like a server
            # failure — just log it quietly and give the user a clean,
            # actionable message instead of raw Vertex JSON.
            user_message = (
                "Your prompt was rejected by the AI provider's content policy. "
                "Please rephrase it (avoid explicit, violent, or copyrighted "
                "material) and try again."
            )
            log_warn(f"Music Node Blocked (policy): {mapping_id}")
            report = (
                f"🚫 <b>MUSIC NODE BLOCKED (policy)</b>\n\n"
                f"👤 <b>User:</b> {escape_html(user_email)}\n"
                f"🆔 <b>Node:</b> <code>{mapping_id}</code>\n"
                f"📝 <b>Prompt:</b> {escape_html((prompt or '')[:300])}"
            )
        else:
            report = (
                f"⏱️ <b>MUSIC NODE TIMEOUT (60s)</b>\n\n" if is_timeout else
                f"🚨 <b>MUSIC NODE FAILED</b>\n\n"
            )
            report += (
                f"👤 <b>User:</b> {escape_html(user_email)}\n"
                f"🆔 <b>Node:</b> <code>{mapping_id}</code>\n"
                f"❌ <b>Error:</b> {escape_html(err_str[:500])}"
            )
            user_message = err_str[:500]

        send_telegram_log(report)

        try:
            status = "blocked" if is_blocked else "error"
            project_doc.set({
                "status": status,
                "error": user_message,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }, merge=True)
            pending_doc.update({"status": status, "error": user_message})
        except Exception:
            pass

        # 🔴 Refund — a music job is one all-or-nothing unit (unlike voice's
        # per-line partial refunds), so any failure here means the user got
        # zero audio for what they were charged: full refund every time,
        # whether it was a hard failure, a timeout, or a policy block.
        # (If you'd rather NOT refund policy-block cases — since that's the
        # user's prompt being rejected, not a system fault — say so and
        # I'll gate this behind `if not is_blocked`.)
        refund_credits(user_id, credits_charged, f"Music generation failed: {user_message}", mapping_id, credits_charged)
    finally:
        music_job_bucket.release()
        with processing_lock:
            processing_ids.discard(mapping_id)
            _start_next_waiting()


def _start_next_waiting():
    """Called with processing_lock held. Pulls the next queued job (if any)
    now that a bucket slot is free — no extra Firestore read needed."""
    if waiting_queue and len(processing_ids) < MAX_CONCURRENT_MUSIC_JOBS:
        next_id, next_data = waiting_queue.popleft()
        processing_ids.add(next_id)
        music_job_bucket.acquire()
        threading.Thread(
            target=process_music_generation_task, args=(next_id, next_data), daemon=True
        ).start()


# ============================================================
# FIRESTORE REAL-TIME LISTENER (no polling — only reads on actual change)
# ============================================================
def _on_pending_snapshot(col_snapshot, changes, read_time):
    for change in changes:
        if change.type.name not in ("ADDED", "MODIFIED"):
            continue

        doc = change.document
        mapping_id = doc.id
        data = doc.to_dict()
        if not data:
            continue

        if data.get("status") != "pending":
            continue
        if not (data.get("isMusic") or str(data.get("projectType", "")).startswith("music")):
            continue

        with processing_lock:
            if mapping_id in processing_ids:
                continue  # already picked up / duplicate event

            if len(processing_ids) >= MAX_CONCURRENT_MUSIC_JOBS:
                log_warn(f"Bucket full — queuing {mapping_id} in memory (no extra read).")
                waiting_queue.append((mapping_id, data))
                continue

            processing_ids.add(mapping_id)
            music_job_bucket.acquire()
            threading.Thread(
                target=process_music_generation_task, args=(mapping_id, data), daemon=True
            ).start()


def start_pending_music_listener():
    """Call once at app startup (e.g. inside FastAPI lifespan).

    Attaches a Firestore snapshot listener on music_project filtered to
    status == "pending". Firestore bills a read for the initial matching
    set and for each subsequent add/change — there is no fixed per-second
    cost like a poll loop, and pickup is near-instant instead of waiting
    up to 5 seconds.
    """
    global firestore_db
    firestore_db = firestore.client()

    query = firestore_db.collection("music_project").where("status", "==", "pending")
    query.on_snapshot(_on_pending_snapshot)
    log_info("Music Generation Firestore listener started (music_project, status=pending).")
