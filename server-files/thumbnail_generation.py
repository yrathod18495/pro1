"""
thumbnail_generation.py
------------------------
Standalone Thumbnail Generation node for the HQ Cluster — Firestore only,
same shape as music_generation.py.

Contract (inferred from thumbnail_projects Firestore console screenshots):
  - Frontend writes a pending job flat under: thumbnail_projects/{mappingId}
        { userId, userEmail, projectId, projectName, title, prompt, style,
          aspectRatio, width, height, referenceImageUrl?, sourceImageUrl?,
          ytLink?, cost, creditCost, type: "thumbnail_generation",
          status: "pending", timestamp, createdAt }
  - This module attaches a Firestore REAL-TIME LISTENER (not polling) on the
    thumbnail_projects collection, filtered to status == "pending". Same
    read-billing behavior as music_generation.py — only charged on
    add/change, no fixed per-interval poll cost.
  - Picked-up jobs are copied + updated into the nested result doc:
        thumbnail_projects/{userId}/userProjects/{mappingId}
        processing -> merge status:"processing" + all source fields
        done       -> merge status:"ok", imageUrl, completedAt,
                       durationMs (elapsed since frontend-sent createdAt,
                       skipped if createdAt missing/unparsable)
        error      -> merge status:"error", error
  - On success the flat thumbnail_projects/{mappingId} pending doc is
    deleted (cleanup). On failure it's left behind with status:"error".

Image generation method: SAME method as store_script_generation.py's
generate_image() — a Vertex AI REST call to gemini-3.1-flash-image's
generateContent endpoint (responseModalities TEXT+IMAGE, imageConfig
aspectRatio), not the Vertex Imagen SDK. Ported here as-is, plus optional
multimodal image input: if referenceImageUrl / sourceImageUrl are present
on the job, they're fetched and passed in as extra inlineData parts
alongside the text prompt (generateContent already accepts image+text
input for this model — same endpoint, just more parts).

Import into app.py like:
    from thumbnail_generation import start_pending_thumbnail_listener
    ...
    start_pending_thumbnail_listener()   # call once, inside lifespan/startup
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

print("🟢 thumbnail_generation.py MODULE LOADED", flush=True)


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
    print(f"{bcolors.OKGREEN}[THUMB-GEN-SUCCESS] {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def log_error(msg, detail=None):
    print(f"{bcolors.FAIL}[THUMB-GEN-ERROR]   {datetime.now().strftime('%H:%M:%S')} - 🚨 {msg}{bcolors.ENDC}", flush=True)
    if detail:
        print(f"{bcolors.FAIL}{detail}{bcolors.ENDC}", flush=True)


def log_info(msg):
    print(f"{bcolors.OKCYAN}[THUMB-GEN-NODE]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def log_warn(msg):
    print(f"{bcolors.WARNING}[THUMB-GEN-WARN]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def escape_html(text):
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ============================================================
# ⏱️ DURATION — same elapsed-since-createdAt logic as music_generation.py.
# ============================================================
def _elapsed_ms_since_created(data):
    created_raw = data.get("createdAt")
    if not created_raw:
        return None
    try:
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
# 💳 CREDIT REFUND ENGINE — same pattern as music_generation.py.
# Balance: Firestore users/{uid}.credits (int64). History: RTDB creditHistory/{uid}.
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
    """Firebase RTDB transaction on refund_locks/{job_id} — same idempotency
    guard as music_generation.py/studio.py, so a job is never refunded more
    than it was charged."""
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
        firestore.client().collection(FIRESTORE_USERS_COLLECTION).document(uid).update({
            FIRESTORE_CREDITS_FIELD: firestore.Increment(amount)
        })
    except Exception as e:
        log_error(f"💳 Firestore balance credit FAILED for {uid} (amount={amount}) — history entry still being written", str(e))

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
# SERVICE ACCOUNT / GOOGLE OAUTH (Vertex gemini-3.1-flash-image)
# Same FIREBASE_SERVICE_ACCOUNT_KEY reused for Vertex, same caching
# pattern (50-min token cache) as music_generation.py.
# ============================================================
VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "global")
IMAGE_MODEL = "gemini-3.1-flash-image"

service_account_info = None
gcp_project_id = None
try:
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if sa_json:
        service_account_info = json.loads(sa_json)
        gcp_project_id = service_account_info.get("project_id")
    else:
        log_error("FIREBASE_SERVICE_ACCOUNT_KEY missing — Vertex image calls will fail (thumbnail_generation.py).")
except Exception:
    log_error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY (thumbnail_generation.py)", traceback.format_exc())

cached_google_token = None
token_expiry = 0

# Lazy — set inside start_pending_thumbnail_listener(), NOT at import time,
# same reason as music_generation.py (app.py's initialize_app() hasn't run
# yet when this module is first imported).
firestore_db = None


def get_access_token():
    """Fresh OAuth2 token with 50-minute caching, same as music_generation.py."""
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
    lowered = err_str.lower()
    return (
        "prohibited use policy" in lowered
        or "sensitive words" in lowered
        or '"code":"invalid_request"' in lowered
    )


# ============================================================
# 🎨 STYLE PRESETS — same idea as store_script_generation.py's
# STYLE_PRESETS, tuned for thumbnails. Falls back to using the raw
# `style` string as-is if it doesn't match a known preset, so any style
# label the frontend sends still works.
# ============================================================
STYLE_PRESETS = {
    "YouTube Clickbait": (
        "professional YouTube clickbait thumbnail style, bold high-contrast composition, "
        "expressive exaggerated facial expressions, vivid saturated colors, dramatic lighting, "
        "large bold eye-catching title text baked into the image, correctly spelled and legible, "
        "thick outline/glow on the text like top-performing YouTube thumbnails"
    ),
    "Desi Story Thumbnail": (
        "vibrant 2D flat-cartoon illustration, Indian YouTube moral-story thumbnail art style, "
        "expressive semi-realistic cartoon characters with big eyes, bright saturated colors, "
        "clean bold outlines, warm daylight, cheerful storybook look"
    ),
    "Cinematic": "cinematic lighting, dramatic composition, film grain, 35mm photography, high detail",
    "Cyberpunk": "cyberpunk aesthetic, neon lights, futuristic city, high-contrast neon colors, rain-slicked streets",
    "Anime": "anime style illustration, vibrant colors, detailed line art, studio quality",
    "Realistic": "photorealistic, ultra-detailed, natural lighting, sharp focus",
    "Fantasy Art": "epic fantasy digital painting, magical atmosphere, dramatic light rays",
    "None": "",
}


def build_final_prompt(prompt, style, title=None):
    parts = [(prompt or "").strip()]
    style_kw = STYLE_PRESETS.get(style, style or "")
    if style_kw:
        parts.append(style_kw)
    if title:
        parts.append(f'render the exact title text "{title}" baked into the thumbnail, correctly spelled and legible')
    return ", ".join(p for p in parts if p)


def _fetch_image_part(url, timeout=20):
    """Downloads a reference/source image and wraps it as a Vertex
    inlineData part. Returns None (never raises) if the fetch fails —
    a bad reference URL shouldn't kill the whole generation, it just
    falls back to text-only."""
    if not url:
        return None
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip() or "image/jpeg"
        if not content_type.startswith("image/"):
            content_type = "image/jpeg"
        b64 = base64.b64encode(resp.content).decode("utf-8")
        return {"inlineData": {"mimeType": content_type, "data": b64}}
    except Exception as e:
        log_warn(f"Could not fetch reference image {url}: {e}")
        return None


def generate_image(access_token, project_id, prompt, style, aspect_ratio="16:9",
                    title=None, reference_image_url=None, source_image_url=None,
                    location=VERTEX_LOCATION):
    """SAME method as store_script_generation.py's generate_image(): Vertex
    REST call to gemini-3.1-flash-image's generateContent, responseModalities
    TEXT+IMAGE, imageConfig aspectRatio. Extended with optional image parts —
    sourceImageUrl (the base image to work from) and referenceImageUrl (a
    style/likeness reference) are fetched and sent alongside the text prompt
    when present; the endpoint is unchanged either way."""
    final_prompt = build_final_prompt(prompt, style, title)

    parts = []
    source_part = _fetch_image_part(source_image_url)
    if source_part:
        parts.append(source_part)
    reference_part = _fetch_image_part(reference_image_url)
    if reference_part:
        parts.append(reference_part)
    parts.append({"text": final_prompt})

    url = (
        f"https://aiplatform.googleapis.com/v1/projects/{project_id}"
        f"/locations/{location}/publishers/google/models/{IMAGE_MODEL}:generateContent"
    )
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": aspect_ratio or "16:9"},
        },
    }
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    if resp.status_code != 200:
        raise Exception(f"Vertex image request failed ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise Exception("Vertex returned no candidates.")
    for part in candidates[0]["content"]["parts"]:
        inline = part.get("inlineData")
        if inline and inline.get("data"):
            return base64.b64decode(inline["data"])
    raise Exception("Image model returned no inlineData image bytes.")


# ============================================================
# CONCURRENCY BUCKET
# ============================================================
MAX_CONCURRENT_THUMBNAIL_JOBS = int(os.environ.get("MAX_CONCURRENT_THUMBNAIL_JOBS", "5"))
thumbnail_job_bucket = threading.Semaphore(MAX_CONCURRENT_THUMBNAIL_JOBS)

processing_ids = set()
processing_lock = threading.Lock()

# Jobs that arrived while the bucket was full — retried in-memory when a
# slot frees up, same as music_generation.py.
waiting_queue = collections.deque()


# ============================================================
# TASK PROCESSOR
# ============================================================
def process_thumbnail_generation_task(mapping_id, data):
    user_id = data.get("userId")
    user_email = data.get("userEmail", "unknown")
    project_name = data.get("projectName") or f"Thumbnail: {(data.get('title') or 'Untitled')[:40]}"
    # IMPORTANT: use titleTextForImage (what the user actually typed into
    # "Text to show on thumbnail"), NOT `title` — `title` always has a
    # fallback value like "AI Thumbnail Project" for project naming/logging,
    # and using it here was causing that fallback text to get baked into
    # every thumbnail whenever the user left the text field blank.
    title = data.get("titleTextForImage") or None
    prompt = data.get("prompt") or ""
    style = data.get("style")
    aspect_ratio = data.get("aspectRatio") or "16:9"
    reference_image_url = data.get("referenceImageUrl")
    source_image_url = data.get("sourceImageUrl")
    yt_link = data.get("ytLink")
    credits_charged = _get_credits_charged(data)

    log_info(f"📥 Thumbnail Input: {mapping_id} for {user_email}")

    # Nested result doc: thumbnail_projects/{userId}/userProjects/{mappingId}
    project_doc = (
        firestore_db.collection("thumbnail_projects")
        .document(user_id)
        .collection("userProjects")
        .document(mapping_id)
    )
    # Flat pending doc this job was picked up from.
    pending_doc = firestore_db.collection("thumbnail_projects").document(mapping_id)

    try:
        result_payload = dict(data)
        result_payload.update({
            "status": "processing",
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        project_doc.set(result_payload, merge=True)
        pending_doc.update({"status": "processing"})

        token = get_access_token()

        log_info("🎨 Contacting Vertex Image Node...")
        if yt_link:
            log_info(f"🔗 ytLink present ({yt_link}) — stored, not fetched (no processing wired up for it yet).")

        image_bytes = generate_image(
            token, gcp_project_id, prompt, style, aspect_ratio,
            title=title, reference_image_url=reference_image_url,
            source_image_url=source_image_url,
        )

        file_path = random_object_key("temp/thumbnail", "png")
        log_info(f"🚀 Deploying to R2: {file_path}")
        image_url = upload_to_r2(file_path, image_bytes, "image/png")

        duration_ms = _elapsed_ms_since_created(data)
        project_doc.set({
            "status": "ok",
            "imageUrl": image_url,
            "completedAt": int(time.time() * 1000),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            **({"durationMs": duration_ms} if duration_ms is not None else {}),
        }, merge=True)

        # Cleanup — job is done, remove the flat pending doc.
        pending_doc.delete()

        report = (
            f"🖼️ <b>THUMBNAIL NODE READY</b>\n\n"
            f"👤 <b>User:</b> {escape_html(user_email)}\n"
            f"📂 <b>Project:</b> {escape_html(project_name)}\n"
            f"🆔 <b>Node:</b> <code>{mapping_id}</code>\n"
            f"💳 <b>Credits Charged:</b> {credits_charged}\n"
            f"📍 <b>Link:</b> {image_url}"
        )
        send_telegram_log(report)
        log_success(f"Thumbnail Node Ready: {mapping_id}")

    except Exception as e:
        err_str = str(e)
        log_error(f"Thumbnail Node Error: {mapping_id}", err_str)

        is_timeout = "timed out" in err_str.lower() or "timeout" in err_str.lower()
        is_blocked = is_policy_rejection(err_str)

        if is_blocked:
            user_message = (
                "Your prompt was rejected by the AI provider's content policy. "
                "Please rephrase it (avoid explicit, violent, or copyrighted "
                "material) and try again."
            )
            log_warn(f"Thumbnail Node Blocked (policy): {mapping_id}")
            report = (
                f"🚫 <b>THUMBNAIL NODE BLOCKED (policy)</b>\n\n"
                f"👤 <b>User:</b> {escape_html(user_email)}\n"
                f"🆔 <b>Node:</b> <code>{mapping_id}</code>\n"
                f"📝 <b>Prompt:</b> {escape_html((prompt or '')[:300])}"
            )
        else:
            report = (
                f"⏱️ <b>THUMBNAIL NODE TIMEOUT</b>\n\n" if is_timeout else
                f"🚨 <b>THUMBNAIL NODE FAILED</b>\n\n"
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

        # 🔴 A thumbnail job is one all-or-nothing unit — any failure means
        # the user got zero image for what they were charged: full refund
        # every time (same policy as music_generation.py).
        refund_credits(user_id, credits_charged, f"Thumbnail generation failed: {user_message}", mapping_id, credits_charged)
    finally:
        thumbnail_job_bucket.release()
        with processing_lock:
            processing_ids.discard(mapping_id)
            _start_next_waiting()


def _start_next_waiting():
    """Called with processing_lock held. Pulls the next queued job (if any)
    now that a bucket slot is free — no extra Firestore read needed."""
    if waiting_queue and len(processing_ids) < MAX_CONCURRENT_THUMBNAIL_JOBS:
        next_id, next_data = waiting_queue.popleft()
        processing_ids.add(next_id)
        thumbnail_job_bucket.acquire()
        threading.Thread(
            target=process_thumbnail_generation_task, args=(next_id, next_data), daemon=True
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
        if data.get("type") != "thumbnail_generation":
            continue

        with processing_lock:
            if mapping_id in processing_ids:
                continue  # already picked up / duplicate event

            if len(processing_ids) >= MAX_CONCURRENT_THUMBNAIL_JOBS:
                log_warn(f"Bucket full — queuing {mapping_id} in memory (no extra read).")
                waiting_queue.append((mapping_id, data))
                continue

            processing_ids.add(mapping_id)
            thumbnail_job_bucket.acquire()
            threading.Thread(
                target=process_thumbnail_generation_task, args=(mapping_id, data), daemon=True
            ).start()


def start_pending_thumbnail_listener():
    """Call once at app startup (e.g. inside FastAPI lifespan).

    Attaches a Firestore snapshot listener on thumbnail_projects filtered to
    status == "pending". Same billing behavior as music_generation.py — a
    read per initial matching doc and per subsequent add/change, no fixed
    per-second poll cost.
    """
    print("🟢 start_pending_thumbnail_listener() CALLED", flush=True)
    global firestore_db
    firestore_db = firestore.client()

    query = firestore_db.collection("thumbnail_projects").where("status", "==", "pending")
    query.on_snapshot(_on_pending_snapshot)
    log_info("Thumbnail Generation Firestore listener started (thumbnail_projects, status=pending).")
    print("🟢 start_pending_thumbnail_listener() FINISHED (listener attached)", flush=True)
