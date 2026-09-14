"""
🎙️ VOICE CLONING ENGINE
========================
Same submit/listener pattern as voice_replacement.py — the frontend no
longer calls the Gradio space directly (that was `generateVoiceCloningAction`
in src/app/voice-cloning/actions.ts, running the whole multi-space/multi-token
rotation INSIDE the Next.js server action on every request). Instead it just
writes a job to RTDB and this file's listener on the HF Space HQ server does
the actual work — same shift every other heavy engine (script analysis, music,
voice replacement, thumbnails) already made.

Listens on RTDB `voice_cloning/{requestId}` for jobs shaped like:

{
  "userId": "USER_ABCDE",
  "userEmail": "user@example.com",
  "userName": "Yash",                 # optional, used in project title only
  "status": "pending",
  "timestamp": 1772590885,            # unix SECONDS
  "text": "Namaste, aaj hum baat karenge...",
  "language": "hi",                   # or "Hindi" / "English" / "Auto" etc.
  "refAudioUrl": "https://r2.../temp/voice_clone_ref/<token>.wav",
  "refText": "",                      # optional — reference transcript
  "numStep": 32,
  "guidanceScale": 2.0,
  "denoise": true,
  "speed": 1.0,
  "preprocessPrompt": true,
  "postprocessOutput": true,
  "creditCost": 40                    # what was already deducted client-side
}

IMPORTANT — refAudioUrl, not refAudioBase64:
  The old server-action took the reference clip as a raw base64 data URI
  straight in the function call. Do NOT put that in RTDB — a multi-MB base64
  string sitting in a realtime node gets re-downloaded by every listener
  event exactly like the bug that hit voice_replacement/pending_script_analysis
  (see app.py's /admin/cleanup-old-jobs comment). Upload the reference clip to
  R2 first (temp/voice_clone_ref/<token>.wav is fine — nothing else needs to
  clean it up, it's tiny and short-lived) and submit its URL instead.

What it does:
  1. Downloads the reference clip from refAudioUrl to a temp file.
  2. Runs the SAME randomized double-rotation dispatch the old server action
     used (shuffled Space IDs from RTDB settings/generalPurpose/hfNodes ×
     shuffled tokens from HF_TOKENS/HF_SUPERFAST/HF_TOKEN/H1/H2/H3), calling
     each candidate node's `/_clone_fn` endpoint via gradio_client until one
     succeeds or all are exhausted.
  3. Downloads the generated clip, uploads it to R2, saves a `projects` doc
     (projectType: "voice-clone" — same shape saveClonedVoiceProjectAction
     used to write client-side), and marks the RTDB job "completed".
  4. On total failure, refunds the already-deducted credits and marks the
     job "error".

NEW DEPENDENCY:
  pip install gradio_client

NOTE — duplication vs app.py / voice_replacement.py:
  Logging helpers, the Netlify/Telegram relay, refund_credits, the abuse
  safety net, and clean_error_message are intentionally duplicated here
  rather than imported, same reasoning as voice_replacement.py's own note:
  avoids a circular import, since app.py imports this module at load time
  to register the listener in its lifespan.
"""

import os
import re
import time
import random
import string
import secrets
import threading
from datetime import datetime
from urllib.parse import urlparse

import requests
from gradio_client import Client, handle_file
from firebase_admin import db, firestore
from r2_netlify import upload_to_r2, random_object_key

# 🔴 FIX (403 on refAudioUrl fetch): plain `requests.get()` sends a bare
# "python-requests/x.x" User-Agent with no Accept header. The domain sits
# behind Cloudflare, and Cloudflare's bot-management challenges/blocks that
# exact fingerprint with a 403 — before the request ever reaches our Next.js
# /api/download route (that route only ever returns 400/404/200 itself, so a
# 403 here can only be an edge block, not app logic). A browser-shaped
# User-Agent + Accept header is enough to pass as ordinary traffic.
REF_AUDIO_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "audio/wav, audio/*;q=0.9, */*;q=0.8",
}


# --- 🎨 LOGGING (mirrors app.py / voice_replacement.py) ---
class bcolors:
    OKGREEN = '\033[92m'
    OKCYAN = '\033[96m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

def log_success(msg):
    print(f"{bcolors.OKGREEN}[VC-SUCCESS] {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)

def log_error(msg, detail=None):
    print(f"{bcolors.FAIL}[VC-ERROR]   {datetime.now().strftime('%H:%M:%S')} - 🚨 {msg}{bcolors.ENDC}", flush=True)
    if detail: print(f"{bcolors.FAIL}{detail}{bcolors.ENDC}", flush=True)

def log_info(msg):
    print(f"{bcolors.OKCYAN}[VC-NODE]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def escapeHtml(text):
    """Escapes strings for safe Telegram HTML parsing (same as app.py)."""
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# --- 🔗 NETLIFY RELAY (duplicated — see module docstring) ---
NETLIFY_RELAY = "https://creative-bombolone-fe8bba.netlify.app/.netlify/functions/send-log"
_relay_session = requests.Session()

def send_telegram_log(message):
    def _dispatch():
        try:
            r = _relay_session.post(NETLIFY_RELAY, json={"message": message}, timeout=10)
            if r.status_code != 200:
                log_error(f"[Relay Error] HTTP {r.status_code}: {r.text}")
        except Exception as e:
            log_error(f"[Relay Connection Fault] {e}")
    threading.Thread(target=_dispatch, daemon=True).start()


# ============================================================
# 💳 CREDIT REFUND — same pattern/shape as voice_replacement.py
# ============================================================
FIRESTORE_USERS_COLLECTION = "users"
FIRESTORE_CREDITS_FIELD = "credits"

# Must be passed explicitly to firestore.client(): newer google-cloud-
# firestore versions no longer resolve "(default)" on their own and raise
# instead. Same value/behaviour as studio.py — defined here rather than
# imported for the same circular-import reason as the helpers above.
FIRESTORE_DATABASE_ID = os.environ.get("FIRESTORE_DATABASE_ID", "(default)")

def _get_credits_charged(data):
    for key in ("creditCost", "cost"):
        val = data.get(key)
        if isinstance(val, (int, float)) and val > 0:
            return val
    return 0

def _claim_refund_amount(job_id, requested_amount, credits_charged):
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
    if not uid or not amount or amount <= 0:
        return

    if job_id and credits_charged:
        amount = _claim_refund_amount(job_id, amount, credits_charged)
        if amount <= 0:
            log_info(f"💳 Refund skipped for {job_id} — already fully refunded.")
            return

    try:
        firestore.client(database_id=FIRESTORE_DATABASE_ID).collection(FIRESTORE_USERS_COLLECTION).document(uid).update({
            FIRESTORE_CREDITS_FIELD: firestore.Increment(amount)
        })
    except Exception as e:
        log_error(f"💳 Firestore balance credit FAILED for {uid} (amount={amount})", str(e))

    try:
        db.reference(f'creditHistory/{uid}').push({
            "amount": amount,
            "reason": reason,
            "timestamp": datetime.now().isoformat(),
            "type": "refund",
            **({"projectId": job_id} if job_id else {}),
        })
        log_success(f"💳 Refunded {amount} credits to {uid} — {reason}")
        send_telegram_log(
            f"💳 <b>Credit Refund</b>\n\n"
            f"👤 <b>User:</b> <code>{escapeHtml(uid)}</code>\n"
            f"💰 <b>Amount:</b> +{amount}\n"
            f"📝 <b>Reason:</b> {escapeHtml(reason)}\n"
            f"🆔 <b>Job:</b> <code>{escapeHtml(job_id) if job_id else '—'}</code>"
        )
    except Exception as e:
        log_error(f"💳 creditHistory refund entry FAILED for {uid} (amount={amount})", str(e))


def clean_error_message(e, max_len=120):
    """Same as voice_replacement.py — short, user-facing, no URLs."""
    msg = str(e).strip()
    http_match = re.match(r"(\d{3}) (Client|Server) Error:", msg)
    if http_match:
        return f"Node request failed ({http_match.group(1)})"
    msg = re.sub(r"https?://\S+", "", msg).strip(" :-")
    if not msg:
        msg = "Unexpected error"
    if len(msg) > max_len:
        msg = msg[:max_len - 1].rstrip() + "…"
    return msg


# ============================================================
# 🎙️ NEURAL CLONING DISPATCHER
# Same randomized double-rotation logic as the old
# generateVoiceCloningAction in src/app/voice-cloning/actions.ts, just
# running server-side (gradio_client) instead of client-triggered
# (@gradio/client) — same env vars, same RTDB node for space IDs.
# ============================================================
LANG_MAP = {'hi': 'Hindi', 'en': 'English', 'ja': 'Japanese', 'zh': 'Chinese', 'ko': 'Korean'}

def _collect_hf_tokens():
    tokens = [t.strip() for t in os.environ.get("HF_TOKENS", "").split(',') if t.strip()]
    # PRIORITY SYNC: HF_SUPERFAST goes first (private/fast nodes), same as actions.ts
    superfast = os.environ.get("HF_SUPERFAST")
    if superfast:
        tokens.insert(0, superfast)
    for env_name in ("HF_TOKEN", "H1", "H2", "H3"):
        val = os.environ.get(env_name)
        if val:
            tokens.append(val)
    # de-dupe, keep order
    seen = set()
    deduped = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    return deduped

def _get_space_ids():
    try:
        snap = db.reference('settings/generalPurpose/hfNodes').get()
        if snap:
            return list(snap)
    except Exception as e:
        log_error("Failed to read settings/generalPurpose/hfNodes, using fallback", str(e))
    return ['k2-fsa/OmniVoice']

def dispatch_voice_clone(text, language, ref_audio_path, num_step, guidance_scale,
                          denoise, speed, preprocess_prompt, postprocess_output,
                          user_email):
    """Tries every (space, token) pair in random order until one returns
    audio. Tracks failures per token per space for better debugging.
    Returns (audio_bytes, content_type, used_space_id) or raises the
    last error if every node/token was exhausted."""
    space_ids = _get_space_ids()
    tokens = _collect_hf_tokens()
    if not tokens:
        raise Exception("CRITICAL: no HF token configured (HF_TOKENS / HF_SUPERFAST / HF_TOKEN / H1-3).")

    target_language = LANG_MAP.get(language, language if language and language != 'Auto' else 'English')

    shuffled_spaces = space_ids[:]
    random.shuffle(shuffled_spaces)
    shuffled_tokens = tokens[:]
    random.shuffle(shuffled_tokens)

    # Track failures: {(space, token_short): error_message}
    failure_log = {}
    last_error = "All production nodes are currently busy or reached quota."

    for space_id in shuffled_spaces:
        for token in shuffled_tokens:
            token_short = token[-8:] + '...' if len(token) > 8 else token
            try:
                log_info(f"🚀 Trying space={space_id}, token={token_short}")
                client = Client(space_id, token=token)
                result = client.predict(
                    text=text.strip(),
                    lang=target_language,
                    ref_aud=handle_file(ref_audio_path) if ref_audio_path else None,
                    ref_text="",
                    instruct="",
                    ns=int(num_step),
                    gs=float(guidance_scale),
                    dn=bool(denoise),
                    sp=float(speed),
                    du=0,
                    pp=bool(preprocess_prompt),
                    po=bool(postprocess_output),
                    api_name="/_clone_fn",
                )

                # gradio_client returns a local filepath (str) or a dict with
                # a "path"/"url" key depending on space version — handle both.
                audio_path = None
                if isinstance(result, str):
                    audio_path = result
                elif isinstance(result, (list, tuple)) and result:
                    first = result[0]
                    audio_path = first.get('path') or first.get('url') if isinstance(first, dict) else first
                elif isinstance(result, dict):
                    audio_path = result.get('path') or result.get('url')

                if not audio_path:
                    raise Exception("Node returned empty result.")

                if audio_path.startswith('http'):
                    audio_res = requests.get(audio_path, timeout=60)
                    audio_res.raise_for_status()
                    audio_bytes = audio_res.content
                    content_type = audio_res.headers.get('content-type', 'audio/wav')
                else:
                    with open(audio_path, 'rb') as f:
                        audio_bytes = f.read()
                    content_type = 'audio/wav'

                log_success(f"✅ Voice clone SUCCESS on {space_id} with token={token_short}")
                send_telegram_log(
                    f"🎙️✅ <b>Voice Clone Generated</b>\n"
                    f"<b>User:</b> {escapeHtml(user_email)}\n"
                    f"<b>Language:</b> {escapeHtml(target_language)}\n"
                    f"<b>Node:</b> <code>{escapeHtml(space_id)}</code>\n"
                    f"<b>Token:</b> {token_short}\n"
                    f"<b>Text:</b> <i>{escapeHtml(text[:100])}{'...' if len(text) > 100 else ''}</i>"
                )
                return audio_bytes, content_type, space_id

            except Exception as err:
                err_msg = str(err) or repr(err)
                failure_log[(space_id, token_short)] = err_msg
                last_error = f"[Space: {space_id}, Token: {token_short}] {err_msg}"
                log_error(f"❌ Token failover: {space_id}@{token_short} failed, trying next...", err_msg[:100])

    # All attempts exhausted
    fail_detail = "\n".join([f"  • {s}@{t}: {e[:60]}" for (s, t), e in list(failure_log.items())[-5:]])
    raise Exception(f"All nodes exhausted. Last failures:\n{fail_detail}")


# ============================================================
# 🔧 CORE JOB
# ============================================================
processing_ids = set()
MAX_CONCURRENT_CLONING = 3
_VC_JOB_CLEANUP_DELAY_SECONDS = 30

def _cleanup_voice_cloning_job_later(request_id, delay=_VC_JOB_CLEANUP_DELAY_SECONDS):
    def _do_cleanup():
        time.sleep(delay)
        try:
            db.reference(f"voice_cloning/{request_id}").delete()
        except Exception as cleanup_err:
            log_error(f"Failed to clean up finished voice_cloning job {request_id}", str(cleanup_err))
    threading.Thread(target=_do_cleanup, daemon=True).start()

# --- 🚨 ABUSE SAFETY NET (same pattern as voice_replacement.py) ---
_ABUSE_WINDOW_SECONDS = 60
_ABUSE_THRESHOLD = 6
_ABUSE_ALERT_COOLDOWN_SECONDS = 10 * 60
_abuse_job_times = {}
_abuse_last_alert = {}
_abuse_lock = threading.Lock()

def _check_job_abuse(user_id, context_label):
    if not user_id:
        return
    try:
        now = time.time()
        with _abuse_lock:
            times = [t for t in _abuse_job_times.get(user_id, []) if now - t < _ABUSE_WINDOW_SECONDS]
            times.append(now)
            _abuse_job_times[user_id] = times
            if len(times) < _ABUSE_THRESHOLD:
                return
            last_alert = _abuse_last_alert.get(user_id, 0)
            if now - last_alert < _ABUSE_ALERT_COOLDOWN_SECONDS:
                return
            _abuse_last_alert[user_id] = now
        send_telegram_log(
            f"🚨 <b>Possible job-spam</b> ({escapeHtml(context_label)})\n"
            f"👤 <b>User:</b> <code>{escapeHtml(user_id)}</code>\n"
            f"📈 <b>{len(times)} jobs</b> in the last {_ABUSE_WINDOW_SECONDS}s"
        )
    except Exception as e:
        log_error("Abuse check failed (non-fatal)", str(e))


def process_voice_cloning(request_id, data):
    job_ref = db.reference(f'voice_cloning/{request_id}')
    uid = data.get('userId')
    user_email = data.get('userEmail', '—')
    user_name = data.get('userName') or 'User'
    text = data.get('text', '')
    language = data.get('language', 'Auto')
    ref_audio_url = data.get('refAudioUrl')
    credits_charged = _get_credits_charged(data)
    ref_local_path = None

    try:
        job_ref.update({"status": "processing", "startedAt": datetime.now().isoformat()})

        if not text.strip():
            raise Exception("Empty script text.")
        if not ref_audio_url:
            raise Exception("Missing reference audio URL.")

        # --- 1. Download reference clip to a temp file ---
        import tempfile
        try:
            ref_res = requests.get(ref_audio_url, headers=REF_AUDIO_FETCH_HEADERS, timeout=60)
            ref_res.raise_for_status()
        except requests.exceptions.HTTPError as e:
            # One retry — the edge block this header fix targets is a
            # per-request heuristic, not a hard IP ban, so a same-second
            # retry with identical headers occasionally clears on its own.
            time.sleep(1.5)
            ref_res = requests.get(ref_audio_url, headers=REF_AUDIO_FETCH_HEADERS, timeout=60)
            ref_res.raise_for_status()
        tmp_dir = tempfile.gettempdir()
        ref_local_path = os.path.join(
            tmp_dir, f"vc_ref_{secrets.token_hex(8)}.wav"
        )
        with open(ref_local_path, 'wb') as f:
            f.write(ref_res.content)

        # --- 2. Dispatch to HF (randomized double rotation) ---
        audio_bytes, content_type, used_space = dispatch_voice_clone(
            text=text,
            language=language,
            ref_audio_path=ref_local_path,
            num_step=data.get('numStep', 32),
            guidance_scale=data.get('guidanceScale', 2.0),
            denoise=data.get('denoise', True),
            speed=data.get('speed', 1.0),
            preprocess_prompt=data.get('preprocessPrompt', True),
            postprocess_output=data.get('postprocessOutput', True),
            user_email=user_email,
        )

        # --- 3. Upload result to R2 ---
        ext = 'mp3' if 'mp3' in content_type else 'wav'
        object_key = random_object_key('voice_clone_gen', ext)
        audio_url = upload_to_r2(object_key, audio_bytes, content_type)

        # --- 4. Save project (same shape as saveClonedVoiceProjectAction) ---
        # Same document shape saveClonedVoiceProjectAction wrote client-side,
        # including the `id` field — the history screen reads it, so an
        # auto-id .add() (which leaves `id` unset) would render a broken row.
        project_name = f"Voice Clone - {datetime.now().strftime('%m/%d/%Y')}"
        project_ref = firestore.client(database_id=FIRESTORE_DATABASE_ID).collection('projects').document()
        project_ref.set({
            "id": project_ref.id,
            "userId": uid,
            "projectName": project_name,
            "script": text,
            "audioUrl": audio_url,
            "projectType": "voice-clone",
            "createdAt": datetime.now().isoformat(),
            "characters": [{"name": "Cloned Voice", "voice": "Custom", "gender": "N/A", "age": "N/A", "emotion": "N/A"}],
        })

        # --- 5. Mark job completed ---
        job_ref.update({
            "status": "completed",
            "audioUrl": audio_url,
            "usedNode": used_space,
            "completedAt": datetime.now().isoformat(),
        })
        log_success(f"✅ Voice clone DONE: {request_id} ({used_space})")
        _cleanup_voice_cloning_job_later(request_id)

    except Exception as e:
        log_error(f"Voice cloning FAILED: {request_id}", str(e))
        job_ref.update({"status": "error", "error": clean_error_message(e)})
        _cleanup_voice_cloning_job_later(request_id)
        send_telegram_log(
            f"🎙️🚨 <b>Voice Clone Dispatch Failed</b>\n\n"
            f"<b>User:</b> {escapeHtml(user_email)}\n"
            f"<b>Error:</b> <pre>{escapeHtml(str(e))}</pre>"
        )
        if credits_charged > 0:
            refund_credits(uid, credits_charged, f"Voice cloning failed: {clean_error_message(e)}", request_id, credits_charged)
    finally:
        if ref_local_path and os.path.exists(ref_local_path):
            try:
                os.remove(ref_local_path)
            except Exception:
                pass
        processing_ids.discard(request_id)


# ============================================================
# 🔊 LISTENER — same event-driven, grace-period pattern as
# voice_replacement.py. Reacts only to the entry that changed, never
# re-reads the whole node, and ignores our own status field-writes.
# ============================================================
REQUIRED_FIELDS = ("userId", "text", "refAudioUrl")
WRITE_GRACE_SECONDS = 3

def _looks_incomplete(data):
    return any(not data.get(k) for k in REQUIRED_FIELDS)

def _maybe_start_cloning(rid, data):
    if len(processing_ids) >= MAX_CONCURRENT_CLONING:
        return
    if not isinstance(data, dict):
        return
    if data.get('status') != 'pending' or rid in processing_ids:
        return
    if _looks_incomplete(data):
        ts = data.get('timestamp')
        if ts and (time.time() - ts) < WRITE_GRACE_SECONDS:
            return  # still being written — wait for the next event
    processing_ids.add(rid)
    _check_job_abuse(data.get("userId"), "voice_cloning")
    threading.Thread(target=process_voice_cloning, args=(rid, data), daemon=True).start()


def _on_voice_cloning_event(event):
    _listener_last_event_ts[0] = time.time()
    _listener_event_count[0] += 1
    try:
        parts = [p for p in (event.path or "/").split("/") if p]
        data = event.data

        if len(parts) == 0:
            if isinstance(data, dict):
                for rid, job_data in data.items():
                    if len(processing_ids) >= MAX_CONCURRENT_CLONING:
                        break
                    _maybe_start_cloning(rid, job_data)
        elif len(parts) == 1:
            _maybe_start_cloning(parts[0], data)
        # len(parts) > 1 -> field-level patch (our own write) -> ignore
    except Exception as e:
        log_error("voice_cloning listener callback error", str(e))


# ⚠️ Same caveat as every other .listen()-based worker in this project:
# Firebase Admin's SSE stream can silently drop without reconnecting. No
# compensating poll loop on purpose (see app.py's cleanup-old-jobs note on
# why polling was removed) — pickup runs purely off .listen() state.
_listener_last_event_ts = [time.time()]
_listener_event_count = [0]
_listener_registration = [None]


def _attach_voice_cloning_listener():
    try:
        reg = db.reference('voice_cloning').listen(_on_voice_cloning_event)
        _listener_registration[0] = reg
        _listener_last_event_ts[0] = time.time()
        log_success("👂 Realtime listener attached: voice_cloning")
    except Exception as e:
        log_error("Failed to attach voice_cloning listener", str(e))


def start_pending_voice_cloning_listener():
    """Attaches the realtime listener only — no startup full-scan, no poll
    loop (see voice_replacement.py for the reasoning, it's identical here).
    Safe to call once from app.py's lifespan."""
    _attach_voice_cloning_listener()
    log_success("Voice-cloning worker ready: realtime listener only")
