"""
🛒 STORE SCRIPT GENERATION — Idea → Script → Image → Store/Voice Studio submission
=====================================================================================
This is `gradio_app.py` converted into an importable FastAPI router, so it runs
inside the SAME process/port as the main HQ app (app.py) — exactly the way
script_analysis.py is already wired in. No separate Gradio server needed.

WIRE-UP (in app.py):
    from store_script_generation import router as store_script_router
    app.include_router(store_script_router)

That's it — two lines. Everything else (Firebase, R2, Vertex calls) is
self-contained in this file.

ENDPOINTS:
    POST /store-script/generate
        Body: see StoreScriptRequest below. Send several different requests
        in ONE call via "items":
            {
              "items": [
                {"request_text": "10 moral stories", "count": 10, "genre": "moral"},
                {"request_text": "5 horror stories", "count": 5, "genre": "horror"}
              ],
              "destination": "Digital Store (pendingProducts)",
              "uid": "...", "user_name": "..."
            }
        Price is NOT set manually — it's auto-calculated from each script's
        character count (default rate: 1000 chars = ₹10, whole number,
        override with "rate_per_1000_chars" if needed).
        Starts the full pipeline (ideas -> script -> metadata -> image ->
        watermark -> upload -> Firestore/RTDB submission) in a background
        thread and returns immediately with a batch_id.

    GET  /store-script/status/{batch_id}
        Poll this to see live logs / progress / results for a batch.

Everything below (generate_ideas, generate_script, generate_image, watermarking,
R2 upload, Firestore/RTDB writes, pendingProducts submission) is the exact same
logic as the original gradio_app.py — only the driving layer changed (FastAPI
background thread + in-memory status dict, instead of a Gradio button click +
gr.Progress()).

ENV VARS NEEDED (same names as before, Space/server secrets):
    FIREBASE_SERVICE_ACCOUNT_KEY - reused for BOTH Firebase AND Vertex AI calls
                                    (same GCP service account, no separate key
                                    needed) — app.py already sets this up, this
                                    file only initializes Firebase itself if
                                    app.py hasn't already done so.
                                    If you ever want a DIFFERENT key just for
                                    Vertex, set VERTEX_SERVICE_ACCOUNT_KEY and
                                    it'll be preferred automatically, or pass
                                    `sa_json` per-request.
    FIREBASE_DB_URL              - optional, defaults to the same RTDB URL app.py uses.
    R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_URL
    NETLIFY_RELAY                - optional, defaults to the same relay app.py uses.
"""

import os
import io
import re
import json
import time
import random
import base64
import string
import secrets
import threading
import traceback
from datetime import datetime
from typing import Optional, List

import requests
from PIL import Image
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import firebase_admin
from firebase_admin import credentials, db, firestore
import boto3
from botocore.client import Config as BotoConfig

from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleAuthRequest

router = APIRouter()

# ------------------------------------------------------------------ #
# 🔧 CONFIG (unchanged from gradio_app.py)
# ------------------------------------------------------------------ #
VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "global")

TEXT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]

STYLE_PRESETS = {
    "Desi Story Thumbnail": (
        "vibrant 2D flat-cartoon illustration, Indian YouTube moral-story thumbnail art style, "
        "expressive semi-realistic cartoon characters with big eyes, rural Indian village setting, "
        "bright saturated colors, clean bold outlines, warm daylight, cheerful storybook look, "
        "with a large bold eye-catching title text baked into the image like a professional "
        "YouTube thumbnail, correctly spelled and legible"
    ),
    "None": "",
    "Cinematic": "cinematic lighting, dramatic composition, film grain, 35mm photography, high detail",
    "Cyberpunk": "cyberpunk aesthetic, neon lights, futuristic city, high-contrast neon colors, rain-slicked streets",
    "Anime": "anime style illustration, vibrant colors, detailed line art, studio quality",
    "Realistic": "photorealistic, ultra-detailed, natural lighting, sharp focus",
    "Fantasy Art": "epic fantasy digital painting, magical atmosphere, dramatic light rays",
}
ASPECT_RATIO = "16:9"

SCRIPT_MIN_CHARS = 17000
SCRIPT_MAX_CHARS = 25000

FIREBASE_SERVICE_ACCOUNT_KEY = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "")
FIREBASE_DB_URL = os.environ.get(
    "FIREBASE_DB_URL",
    "https://twelvelabs-copy-88796906-8d524-default-rtdb.asia-southeast1.firebasedatabase.app"
)

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")

NETLIFY_RELAY = os.environ.get(
    "NETLIFY_RELAY",
    "https://creative-bombolone-fe8bba.netlify.app/.netlify/functions/send-log"
)

WATERMARK_URL = "https://ik.imagekit.io/bgdcdxitr/4988%20(1).png"
IMAGE_MODEL = "gemini-3.1-flash-image"
PREVIEW_PCT = 0.30

# Known-good, already-registered seller profile — the approval system checks
# sellerId + sellerName against a real seller record, so these must match an
# existing profile exactly, not be made up. Env-overridable if the seller
# account ever changes.
DEFAULT_SELLER_UID = os.environ.get("DEFAULT_SELLER_UID", "ZXAjUAxPv2SA5e1e0N7avpEptCx2")
DEFAULT_SELLER_NAME = os.environ.get("DEFAULT_SELLER_NAME", "toonday")
DEFAULT_SELLER_EMAIL = os.environ.get("DEFAULT_SELLER_EMAIL", "toonday378@gmail.com")

_relay_session = requests.Session()
_watermark_cache = {}


def _log(msg):
    print(f"[STORE-SCRIPT] [{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def send_telegram_log(message):
    try:
        r = _relay_session.post(NETLIFY_RELAY, json={"message": message}, timeout=10)
        if r.status_code != 200:
            _log(f"[Relay Error] HTTP {r.status_code}: {r.text}")
    except Exception as e:
        _log(f"[Relay Connection Fault] {e}")


# ------------------------------------------------------------------ #
# 🔌 LAZY CLIENTS — reuse app.py's Firebase app if it's already
# initialized (it will be, since app.py sets it up at import time);
# otherwise initialize it ourselves so this file also works standalone.
# R2 gets its own boto3 client, built once and cached.
# ------------------------------------------------------------------ #
def _ensure_firebase():
    if firebase_admin._apps:
        return
    if not FIREBASE_SERVICE_ACCOUNT_KEY:
        raise Exception("FIREBASE_SERVICE_ACCOUNT_KEY not set — Firestore/RTDB writes will fail.")
    info = json.loads(FIREBASE_SERVICE_ACCOUNT_KEY)
    cred = credentials.Certificate(info)
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
    _log("✅ Firebase connected (initialized by store_script_generation.py).")


def _get_firestore():
    _ensure_firebase()
    return firestore.client()


_r2_client = None


def _get_r2():
    global _r2_client
    if _r2_client is not None:
        return _r2_client
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY):
        raise Exception("R2 credentials not set — R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.")
    _r2_client = boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=BotoConfig(signature_version="s3v4"),
        region_name="auto",
    )
    return _r2_client


# ------------------------------------------------------------------ #
# 🧩 JSON ROBUSTNESS
# ------------------------------------------------------------------ #
def extract_json(raw_text):
    raw = raw_text.strip()
    raw = re.sub(r"^```json|^```|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(raw[start:end + 1])
        raise Exception(f"Model didn't return valid JSON. Raw output:\n{raw[:300]}")


# ------------------------------------------------------------------ #
# 🧠 TEXT GENERATION (Vertex REST)
# ------------------------------------------------------------------ #
def generate_text(access_token, project_id, model, prompt, temperature=0.9,
                   system_instruction=None, location=VERTEX_LOCATION, timeout=180, retries=1):
    url = (
        f"https://aiplatform.googleapis.com/v1/projects/{project_id}"
        f"/locations/{location}/publishers/google/models/{model}:generateContent"
    )
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = requests.post(
                url,
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json=payload,
                timeout=timeout,
            )
            if resp.status_code != 200:
                raise Exception(f"Vertex text request failed ({resp.status_code}): {resp.text[:300]}")

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise Exception("Vertex returned no text candidates.")
            parts = candidates[0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts)
        except requests.exceptions.Timeout as e:
            last_err = e
            if attempt < retries:
                _log(f"⏱️ Vertex request timed out (attempt {attempt + 1}/{retries + 1}) — retrying...")
                continue
            raise
    raise last_err


def generate_ideas(access_token, project_id, model, request_text, count, genre, language="Hindi"):
    prompt = f"""You are a creative story ideation engine.
Request: "{request_text}"
Genre: {genre or "moral"}
Language: write the title and premise in {language}.
Generate exactly {count} distinct short-story ideas that fit the request.

Return ONLY raw JSON (no markdown fences, no extra text), in this exact shape:
{{"ideas": [{{"title": "...", "premise": "..."}}, ...]}}
"""
    raw = generate_text(access_token, project_id, model, prompt, temperature=1.0)
    data = extract_json(raw)
    return data["ideas"]


def generate_script(access_token, project_id, model, partial_script, target_length, language="Hindi"):
    prompt = f"""You are a professional {language} script and story writer. Your task is to write or complete a script/story based on the user's input.

STRICT RULES:
1. ONLY output the script/story content. Do not include any intro, outro, explanations, or meta-notes.
2. LANGUAGE (CRITICAL & ABSOLUTE): Write the ENTIRE script — every line, every word — in {language}. Do not switch to any other language partway through.
3. FORMAT: Use a colon (:) as the separator for dialogue or narrative lines:
   'Character Name: Dialogue'
   'Narrator: Narrative text' (translate "Narrator" into {language} too, e.g. "नैरेटर" for Hindi)
4. DIALOGUE: Prioritize dialogue/narrative to build a compelling story.
5. LENGTH CONTROL (CRITICAL & ABSOLUTE):
   - The total generated text MUST be approximately {target_length} characters long (letters + spaces, where 1 letter is 1 character count).
   - Avoid being much shorter or much longer than {target_length} characters. Adjust details, pacing, dialogues and description to match this exact target size.
6. Maintain the same tone and style as the input.
7. SOUND HUMAN, NOT AI-GENERATED (CRITICAL): This must read like it was written by an actual human storyteller for a real audience — not like a generic AI-generated story. Concretely:
   - Do NOT open with clichéd AI framings like "In a small village..." / "Once upon a time, in a land far away..." / "In today's fast-paced world..." unless the story genuinely calls for it — start where something is actually happening.
   - Do NOT close with an explicit, spelled-out moral/lesson tacked on at the end ("And so, our story teaches us that...", "This teaches us the importance of..."). Let the ending land through the story itself, the way a person telling a story to a friend would — trust the audience to get it.
   - Avoid AI-essay phrasing and stock transitions: "moreover", "furthermore", "in conclusion", "little did they know", "on the other hand", "at the end of the day". Real spoken/written storytelling doesn't lean on these.
   - Avoid over-polished, symmetrical sentences and repeated sentence openers (e.g. every line of narration starting the same way). Vary sentence length and rhythm the way a real writer's draft does — some short punchy lines, some longer ones, occasional fragments for effect.
   - Use specific, concrete, slightly messy sensory details instead of generic ones (a particular smell, a specific object, an odd habit a character has) rather than vague description.
   - Dialogue should sound like actual speech for that language/region — natural interruptions, colloquial words, contractions, regional flavor where appropriate — not textbook-correct, formally balanced sentences.
   - Do not make every character equally articulate or wise; give personality quirks, minor flaws, and imperfect reactions instead of uniformly "correct" behavior.

User Input/Partial Script:
{partial_script}
"""
    return generate_text(access_token, project_id, model, prompt, temperature=0.9)


def generate_metadata_from_script(access_token, project_id, model, idea, script):
    prompt = f"""Here is a full story script:

{script}

Based on this script, generate:
1. A short catchy title for it (in the same language/script as the story).
2. A 2-3 sentence store-listing description that teases the story without spoiling it — this will be used as the product description on submission.
3. A thumbnail image prompt for a text-to-image model. This is CRITICAL: the prompt must explicitly instruct the image model to render the story's title as large, bold, eye-catching text ALREADY BAKED INTO the image — correctly spelled, legible, styled like a professional YouTube thumbnail title (bold outline/glow, vivid color) — depicting the story's key/most dramatic scene, vibrant 2D flat-cartoon illustration style, expressive characters, rural Indian setting where relevant.

Return ONLY raw JSON (no markdown fences), in this exact shape:
{{
  "projectName": "short title",
  "description": "2-3 sentence store-listing blurb",
  "thumbnail_prompt": "the full text-to-image prompt described above, including the exact title text to render"
}}
"""
    raw = generate_text(access_token, project_id, model, prompt, temperature=0.8)
    return extract_json(raw)


# ------------------------------------------------------------------ #
# 🔑 CREDENTIALS
# ------------------------------------------------------------------ #
def parse_service_account(sa_text):
    info = json.loads(sa_text)
    project_id = info.get("project_id")
    if not project_id:
        raise Exception("Couldn't find 'project_id' in the service account JSON.")
    return info, project_id


def get_access_token(sa_info):
    creds = service_account.Credentials.from_service_account_info(
        sa_info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(GoogleAuthRequest())
    return creds.token


def build_final_prompt(base_prompt, style):
    parts = [base_prompt.strip()]
    style_kw = STYLE_PRESETS.get(style, "")
    if style_kw:
        parts.append(style_kw)
    parts.append("widescreen cinematic 16:9 aspect ratio format")
    return ", ".join(p for p in parts if p)


# ------------------------------------------------------------------ #
# 🎨 IMAGE GENERATION (Vertex REST, gemini-3.1-flash-image)
# ------------------------------------------------------------------ #
def generate_image(access_token, project_id, image_prompt, style, location=VERTEX_LOCATION):
    final_prompt = build_final_prompt(image_prompt, style)

    url = (
        f"https://aiplatform.googleapis.com/v1/projects/{project_id}"
        f"/locations/{location}/publishers/google/models/{IMAGE_MODEL}:generateContent"
    )
    payload = {
        "contents": [{"role": "user", "parts": [{"text": final_prompt}]}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": ASPECT_RATIO},
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


# ------------------------------------------------------------------ #
# 🖼️ WATERMARK + WEBP COMPRESS
# ------------------------------------------------------------------ #
def apply_watermark_and_compress(image_bytes, watermark_url=WATERMARK_URL):
    base = Image.open(io.BytesIO(image_bytes)).convert("RGBA")

    if watermark_url not in _watermark_cache:
        wm_resp = requests.get(watermark_url, timeout=15)
        wm_resp.raise_for_status()
        _watermark_cache[watermark_url] = Image.open(io.BytesIO(wm_resp.content)).convert("RGBA")
    wm = _watermark_cache[watermark_url].copy()

    target_w = int(base.width * 0.15)
    ratio = target_w / wm.width
    wm = wm.resize((target_w, max(1, int(wm.height * ratio))))

    pad = int(base.width * 0.02)
    pos = (base.width - wm.width - pad, base.height - wm.height - pad)
    base.alpha_composite(wm, dest=pos)

    out = io.BytesIO()
    base.convert("RGB").save(out, format="WEBP", quality=82, method=6)
    return out.getvalue()


# ------------------------------------------------------------------ #
# ☁️ R2 UPLOAD
# ------------------------------------------------------------------ #
def upload_to_r2(webp_bytes, uid, project_id):
    r2 = _get_r2()
    file_path = f"scriptserver/{uid}/{project_id}.webp"
    r2.put_object(Bucket=R2_BUCKET, Key=file_path, Body=webp_bytes, ContentType="image/webp")
    return f"{R2_PUBLIC_URL}/{file_path}"


def upload_text_to_r2(text, uid, product_id, suffix):
    r2 = _get_r2()
    file_path = f"scriptserver/{uid}/{product_id}_{suffix}.txt"
    r2.put_object(
        Bucket=R2_BUCKET, Key=file_path,
        Body=text.encode("utf-8"), ContentType="text/plain; charset=utf-8",
    )
    return f"{R2_PUBLIC_URL}/{file_path}"


# ------------------------------------------------------------------ #
# 🔥 RTDB (30% preview) + FIRESTORE (full, permanent)
# ------------------------------------------------------------------ #
def make_project_id():
    return "SCR_" + "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(10))


def write_rtdb_and_firestore(uid, user_name, user_email, project_id, project_name,
                              script, genre, image_url):
    fdb = _get_firestore()

    preview_len = max(1, int(len(script) * PREVIEW_PCT))
    preview_script = script[:preview_len]

    rtdb_payload = {
        "id": project_id, "userId": uid, "userName": user_name, "userEmail": user_email,
        "projectName": project_name, "script": preview_script, "genre": genre or "general",
        "emotion_added": "no", "status": "awaiting_approval", "imageUrl": image_url,
        "createdAt": datetime.now().isoformat(),
    }
    db.reference(f"pending_projects/{project_id}").set(rtdb_payload)

    fs_payload = {
        "id": project_id, "userId": uid, "projectName": project_name, "script": script,
        "genre": genre or "general", "emotion_added": "no", "status": "awaiting_approval",
        "imageUrl": image_url, "createdAt": firestore.SERVER_TIMESTAMP,
    }
    fdb.collection("projects").document(uid) \
        .collection("userProjects").document(project_id).set(fs_payload, merge=True)


def calculate_price(char_count, rate_per_1000_chars=10.0):
    """Price is derived from script length, NOT set manually — rate_per_1000_chars
    controls it (default: 1000 chars = 10 rs). Always a whole number, no decimals."""
    return int(round((char_count / 1000.0) * rate_per_1000_chars))


# ------------------------------------------------------------------ #
# 🛒 DIGITAL STORE — pendingProducts/{productId}
# ------------------------------------------------------------------ #
def write_pending_product(seller_id, seller_name, title, description,
                           full_script, preview_script, full_txt_url, preview_txt_url,
                           thumbnail_url, rate_per_1000_chars=10.0):
    product_id = "PROD_" + "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(10))
    price = calculate_price(len(full_script), rate_per_1000_chars)
    payload = {
        "id": product_id, "sellerId": seller_id, "sellerName": seller_name,
        "title": title, "description": description, "price": price,
        "productType": "Hand Written Script", "isOneTimePurchase": True,
        "fullScriptContent": full_script, "characterCount": len(full_script),
        "scriptPreviewUrl": preview_txt_url,
        "downloadableFiles": [{"fileName": f"{title}.txt", "url": full_txt_url}],
        # "previews" is an ARRAY of {type, url} objects (confirmed from an
        # existing live document) — NOT a plain string. That mismatch was
        # what broke the Admin Preview Node Control panel earlier.
        "previews": [{"type": "image", "url": thumbnail_url}],
        "createdAt": datetime.now().isoformat(), "status": "pending",
    }
    db.reference(f"pendingProducts/{product_id}").set(payload)
    return product_id, price


# ------------------------------------------------------------------ #
# 📦 IN-MEMORY BATCH STATUS (polled via GET /store-script/status/{id})
# ------------------------------------------------------------------ #
_batches = {}
_batches_lock = threading.Lock()


def _push_log(batch_id, msg):
    _log(msg)
    with _batches_lock:
        b = _batches.get(batch_id)
        if b is not None:
            b["logs"].append(msg)


def _is_cancelled(batch_id):
    with _batches_lock:
        b = _batches.get(batch_id)
        return bool(b and b.get("cancel_requested"))


# ------------------------------------------------------------------ #
# 🚀 FULL PIPELINE — same steps as the Gradio version's run_pipeline,
# minus gr.Progress(); runs inside a background thread.
# ------------------------------------------------------------------ #
def _run_pipeline(batch_id, req: "StoreScriptRequest"):
    try:
        with _batches_lock:
            _batches[batch_id]["status"] = "running"

        if req.destination == "Voice Studio (pending_projects)":
            try:
                _get_firestore()
            except Exception as e:
                _push_log(batch_id, f"🚨 Firestore not connected: {e}")
                with _batches_lock:
                    _batches[batch_id]["status"] = "error"
                return

        # Same GCP service account is reused for Vertex AI as for Firebase —
        # no separate secret needed. Priority: explicit `sa_json` in the request
        # -> VERTEX_SERVICE_ACCOUNT_KEY (if someone ever wants a different key)
        # -> FIREBASE_SERVICE_ACCOUNT_KEY (the shared/default one).
        sa_text = (
            req.sa_json
            or os.environ.get("VERTEX_SERVICE_ACCOUNT_KEY", "")
            or os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "")
        )
        if not sa_text or not sa_text.strip():
            _push_log(batch_id, "🚨 No service-account JSON found — set FIREBASE_SERVICE_ACCOUNT_KEY (or VERTEX_SERVICE_ACCOUNT_KEY / pass sa_json).")
            with _batches_lock:
                _batches[batch_id]["status"] = "error"
            return
        try:
            sa_info, gcp_project_id = parse_service_account(sa_text)
        except Exception as e:
            _push_log(batch_id, f"🚨 Invalid service account JSON: {e}")
            with _batches_lock:
                _batches[batch_id]["status"] = "error"
            return

        try:
            access_token = get_access_token(sa_info)
        except Exception:
            _push_log(batch_id, "🚨 Couldn't generate an access token:\n" + traceback.format_exc())
            with _batches_lock:
                _batches[batch_id]["status"] = "error"
            return

        items = req.resolved_items()
        results = []

        for item_idx, item in enumerate(items, 1):
            if _is_cancelled(batch_id):
                _push_log(batch_id, "\n🛑 Cancelled — stopping before next batch item.")
                break

            _push_log(batch_id, f"\n=== Batch item {item_idx}/{len(items)}: \"{item.request_text}\" "
                                 f"(genre: {item.genre}, language: {item.language}, count: {item.count}) ===")
            try:
                ideas = generate_ideas(access_token, gcp_project_id, item.text_model,
                                        item.request_text, item.count, item.genre, item.language)
                if len(ideas) > item.count:
                    # The model sometimes returns a few extra ideas despite the
                    # exact count in the prompt — hard-clip to what was asked for.
                    ideas = ideas[:item.count]
                _push_log(batch_id, f"✅ Got {len(ideas)} ideas.")
            except Exception as e:
                _push_log(batch_id, f"🚨 Item {item_idx} idea generation failed: {e}")
                continue

            for i, idea in enumerate(ideas, 1):
                if _is_cancelled(batch_id):
                    _push_log(batch_id, f"\n🛑 Cancelled — stopping before story {i}/{len(ideas)}.")
                    break

                _push_log(batch_id, f"\n--- Story {i}/{len(ideas)} (item {item_idx}): {idea.get('title')} ---")
                try:
                    target_length = random.randint(SCRIPT_MIN_CHARS, SCRIPT_MAX_CHARS)
                    _push_log(batch_id, f"📝 Writing full script (target ~{target_length} chars)...")
                    partial_script = f"Title: {idea.get('title')}\nPremise: {idea.get('premise')}\nGenre: {item.genre or 'moral'}"
                    script = generate_script(access_token, gcp_project_id, item.text_model, partial_script,
                                              target_length, item.language)
                    _push_log(batch_id, f"✅ Script written ({len(script)} chars).")

                    _push_log(batch_id, "✍️ Generating metadata + thumbnail prompt from the script...")
                    sp = generate_metadata_from_script(access_token, gcp_project_id, item.text_model, idea, script)
                    project_name = sp.get("projectName") or idea.get("title") or f"Story {i}"
                    description = sp.get("description", "")
                    thumbnail_prompt = sp.get("thumbnail_prompt") or idea.get("premise", "")

                    _push_log(batch_id, "🎨 Generating thumbnail (16:9, title text baked in)...")
                    raw_image = generate_image(access_token, gcp_project_id, thumbnail_prompt, item.style)

                    _push_log(batch_id, "🖼️ Watermarking + compressing to WEBP...")
                    webp_bytes = apply_watermark_and_compress(raw_image)

                    if req.destination == "Digital Store (pendingProducts)":
                        doc_id = make_project_id()
                        _push_log(batch_id, "☁️ Uploading thumbnail to R2...")
                        thumbnail_url = upload_to_r2(webp_bytes, req.uid, doc_id)

                        preview_len = max(1, int(len(script) * PREVIEW_PCT))
                        preview_script = script[:preview_len]

                        _push_log(batch_id, "📄 Uploading full + 30% preview .txt files to R2...")
                        full_txt_url = upload_text_to_r2(script, req.uid, doc_id, "full")
                        preview_txt_url = upload_text_to_r2(preview_script, req.uid, doc_id, "preview")

                        _push_log(batch_id, "🛒 Submitting to pendingProducts for your approval...")
                        product_id, price = write_pending_product(
                            req.uid, req.user_name, project_name, description,
                            script, preview_script, full_txt_url, preview_txt_url, thumbnail_url,
                            rate_per_1000_chars=req.rate_per_1000_chars,
                        )
                        _push_log(batch_id, f"💰 Price: ₹{price} ({len(script)} chars @ ₹{req.rate_per_1000_chars}/1000 chars)")

                        results.append({
                            "title": project_name, "genre": item.genre, "image_url": thumbnail_url,
                            "product_id": product_id, "price": price, "characterCount": len(script),
                        })
                        send_telegram_log(
                            f"✍️ *New Script for Approval*\nSeller: {req.user_name}\n"
                            f"Product: {project_name}\nPrice: ₹{price}"
                        )
                        _push_log(batch_id, f"✅ '{project_name}' submitted to store for approval ({product_id}).")

                    else:  # Voice Studio (pending_projects)
                        doc_id = make_project_id()
                        _push_log(batch_id, "☁️ Uploading to R2...")
                        image_url = upload_to_r2(webp_bytes, req.uid, doc_id)

                        _push_log(batch_id, "🔥 Writing RTDB (30% preview) + Firestore (full) + submitting for approval...")
                        write_rtdb_and_firestore(req.uid, req.user_name, req.user_email, doc_id,
                                                  project_name, script, item.genre, image_url)

                        results.append({"title": project_name, "genre": item.genre, "image_url": image_url, "project_id": doc_id})
                        send_telegram_log(
                            f"📝 <b>New Script Submitted</b>\n👤 {req.user_email}\n📂 {project_name}\n"
                            f"🎭 {item.genre or 'general'}\n🆔 {doc_id}\n⏳ Status: awaiting_approval"
                        )
                        _push_log(batch_id, f"✅ '{project_name}' submitted for approval ({doc_id}).")

                except Exception as e:
                    _push_log(batch_id, f"🚨 Story {i} (item {item_idx}) failed: {e}")
                    continue

        was_cancelled = _is_cancelled(batch_id)
        _push_log(batch_id, "\n🛑 Cancelled by user." if was_cancelled else "\n🎉 All done.")
        with _batches_lock:
            _batches[batch_id]["status"] = "cancelled" if was_cancelled else "done"
            _batches[batch_id]["results"] = results

    except Exception:
        _push_log(batch_id, "🚨 Pipeline failed:\n" + traceback.format_exc())
        with _batches_lock:
            _batches[batch_id]["status"] = "error"


# ------------------------------------------------------------------ #
# 🌐 FASTAPI ROUTES
# ------------------------------------------------------------------ #
class StoreScriptItem(BaseModel):
    """One 'sub-request' inside a batch — e.g. one entry for moral stories,
    another for horror stories, all sent together in a single call."""
    request_text: str
    count: int = 10
    genre: Optional[str] = "moral"
    language: Optional[str] = "Hindi"
    style: Optional[str] = "Desi Story Thumbnail"
    text_model: Optional[str] = TEXT_MODELS[0]
    temperature: Optional[float] = 0.9


class StoreScriptRequest(BaseModel):
    # Preferred: send several different requests in ONE call, e.g.
    #   "items": [
    #     {"request_text": "10 moral stories", "count": 10, "genre": "moral"},
    #     {"request_text": "5 horror stories", "count": 5, "genre": "horror"}
    #   ]
    items: Optional[List[StoreScriptItem]] = None

    # Shorthand for a single request (kept for backward compatibility —
    # used only if `items` isn't provided):
    request_text: Optional[str] = None
    count: int = 10
    genre: Optional[str] = "moral"
    language: Optional[str] = "Hindi"
    style: Optional[str] = "Desi Story Thumbnail"
    text_model: Optional[str] = TEXT_MODELS[0]
    temperature: Optional[float] = 0.9

    destination: Optional[str] = "Digital Store (pendingProducts)"
    # Price is auto-calculated from script length — NOT set manually.
    # rate_per_1000_chars controls the rate (default: 1000 chars = 10 rs).
    rate_per_1000_chars: Optional[float] = 10.0
    # Hardcoded to the registered seller profile that the approval system
    # actually recognizes (sellerName MUST exactly match that profile, or
    # approval fails with "Seller profile for sellerId ... not found").
    # Override only if you're submitting under a different, already-
    # registered seller.
    uid: Optional[str] = DEFAULT_SELLER_UID
    user_name: Optional[str] = DEFAULT_SELLER_NAME
    user_email: Optional[str] = DEFAULT_SELLER_EMAIL
    sa_json: Optional[str] = None  # Vertex service-account JSON; falls back to env VERTEX_SERVICE_ACCOUNT_KEY

    def resolved_items(self) -> List[StoreScriptItem]:
        if self.items:
            return self.items
        if self.request_text:
            return [StoreScriptItem(
                request_text=self.request_text, count=self.count, genre=self.genre,
                language=self.language, style=self.style, text_model=self.text_model,
                temperature=self.temperature,
            )]
        return []


@router.post("/store-script/generate")
async def generate_store_scripts(payload: StoreScriptRequest):
    if not payload.resolved_items():
        raise HTTPException(status_code=400, detail="Provide either `items` (list) or `request_text`.")
    batch_id = "BATCH_" + "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
    with _batches_lock:
        _batches[batch_id] = {"status": "queued", "logs": [], "results": [], "cancel_requested": False}
    threading.Thread(target=_run_pipeline, args=(batch_id, payload), daemon=True).start()
    return {"batch_id": batch_id, "status": "started"}


@router.get("/store-script/status/{batch_id}")
async def get_batch_status(batch_id: str):
    with _batches_lock:
        b = _batches.get(batch_id)
        if not b:
            raise HTTPException(status_code=404, detail="batch not found")
        return dict(b)


@router.post("/store-script/cancel/{batch_id}")
async def cancel_batch(batch_id: str):
    """Stops a running batch as soon as the current story finishes (doesn't
    kill it mid-story — that story's already-started work is wasted otherwise).
    Anything already submitted before cancellation stays submitted."""
    with _batches_lock:
        b = _batches.get(batch_id)
        if not b:
            raise HTTPException(status_code=404, detail="batch not found")
        if b["status"] not in ("queued", "running"):
            return {"batch_id": batch_id, "status": b["status"], "message": "Batch already finished — nothing to cancel."}
        b["cancel_requested"] = True
        return {"batch_id": batch_id, "status": "cancelling"}
