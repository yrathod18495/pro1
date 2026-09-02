"""
script_analysis.py
-------------------
Job-queue based script-analysis worker. No HTTP endpoints, no API-key auth.
Attach the listener once at app startup:

    from script_analysis import start_pending_script_listener
    start_pending_script_listener()

(Add this AFTER firebase_admin.initialize_app(...) runs, since every
Firebase call here happens inside the listener callback, not at import time.)

JOB FLOW — RTDB path: pending_script_analysis/{userId}/{jobId}

  Frontend creates (push()+set()):
    { "status": "pending", "script": "<full script text>", "addEmotion": true|false }

  Backend picks up ONLY jobs where status == "pending", processes them,
  then updates the SAME node in place:

    Success, addEmotion == false:
      {
        "status": "ok",
        "analysis": {
          "characters": [{"name": "...", "gender": "male|female", "ageGroup": "kid|adult|old"}],
          "dialogues": [{"character": "...", "line": "..."}],
          "genre": "...",
          "toneGuidance": "..."
        }
      }

    Success, addEmotion == true:
      {
        "status": "ok",
        "characters": [{"name": "...", "gender": "male|female", "ageGroup": "kid|adult|old", "dialogueCount": 4}],
        "lines": [{"character": "...", "emotion": "...", "text": "..."}],
        "stats": {"totalCharacters": 3, "totalDialogues": 9, "totalChars": 640}
      }

    Failure:
      { "status": "error", "error": "Message here" }

Nothing else is written to the job node — no engine/model/fileUrl/stats/
voice fields, since the frontend doesn't ask for them here.
"""

import os
import re
import json
import time
import threading
import traceback
from datetime import datetime

import requests
from firebase_admin import db, auth as firebase_auth

import google.auth
from google.auth.transport.requests import Request as GoogleRequest


# --- 🎨 LOGGING (self-contained, no import from app.py to avoid circularity) ---
class _c:
    OK = '\033[92m'; CYAN = '\033[96m'; WARN = '\033[93m'; FAIL = '\033[91m'; END = '\033[0m'

def log_info(msg):    print(f"{_c.CYAN}[SCRIPT-AI] {datetime.now().strftime('%H:%M:%S')} - {msg}{_c.END}", flush=True)
def log_success(msg): print(f"{_c.OK}[SCRIPT-AI] {datetime.now().strftime('%H:%M:%S')} - {msg}{_c.END}", flush=True)
def log_warn(msg):    print(f"{_c.WARN}[SCRIPT-AI] {datetime.now().strftime('%H:%M:%S')} - {msg}{_c.END}", flush=True)
def log_error(msg, detail=None):
    print(f"{_c.FAIL}[SCRIPT-AI] {datetime.now().strftime('%H:%M:%S')} - 🚨 {msg}{_c.END}", flush=True)
    if detail: print(f"{_c.FAIL}{detail}{_c.END}", flush=True)

def escape_html(text):
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def _get_user_email(user_id):
    """Best-effort email lookup via Firebase Auth — never raises, just
    falls back to 'unknown' so a lookup failure can't break a job."""
    try:
        return firebase_auth.get_user(user_id).email or "unknown"
    except Exception:
        return "unknown"

# --- 📡 TELEGRAM / NETLIFY RELAY (same relay endpoint as script_generation.py,
# so analysis events show up in the same bot log as script generation). ---
NETLIFY_RELAY = "https://creative-bombolone-fe8bba.netlify.app/.netlify/functions/send-log"
relay_session = requests.Session()

def send_telegram_log(message):
    def _dispatch():
        try:
            relay_session.post(NETLIFY_RELAY, json={"message": message}, timeout=10)
        except Exception:
            pass
    threading.Thread(target=_dispatch, daemon=True).start()

# --- ⚙️ CONFIG ---
# Plain Gemini API keys (generativelanguage.googleapis.com), same method as
# script_generation.py — NOT Vertex/service-account. GEMINI_KEYS is a
# comma-separated list of API keys; every model rotates through ALL of them
# before falling back to the next model in the chain.
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

def _load_gemini_keys():
    raw = os.environ.get("GEMINI_KEYS", "")
    return [k.strip() for k in raw.split(",") if k.strip()]

GEMINI_KEYS = _load_gemini_keys()

GEMINI_MODELS = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
]

# Short scripts get a lighter/faster model first — gemini-3.5-flash-lite is
# light enough that it's only trusted below this char count; falls through
# to the normal GEMINI_MODELS chain above if it fails.
SHORT_SCRIPT_CHAR_LIMIT = 2000
SHORT_SCRIPT_MODEL = "gemini-3.5-flash-lite"

# Plain-key stage tries at most this many keys per model before moving to
# the next model — keeps the plain-API-key stage short so we fall through
# to Vertex quickly instead of burning through every key on every model.
GEMINI_KEY_TRY_LIMIT = 2

# --- ⚙️ VERTEX AI FALLBACK (2nd stage) — same service-account pattern as
# thumbnail_generation.py / store_script_generation.py. Reuses
# FIREBASE_SERVICE_ACCOUNT_KEY (already set for those modules) so no new
# secret is needed. Only 3.7/3.6 — 3.5 is intentionally excluded here. ---
VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "global")
VERTEX_MODELS = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
]

_vertex_service_account_info = None
_vertex_project_id = None
try:
    _sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if _sa_json:
        _vertex_service_account_info = json.loads(_sa_json)
        _vertex_project_id = _vertex_service_account_info.get("project_id")
except Exception:
    pass  # logged lazily on first actual use below

_cached_vertex_token = None
_vertex_token_expiry = 0

def get_vertex_access_token():
    """Fresh OAuth2 token with 50-minute caching — same pattern as
    thumbnail_generation.py's get_access_token()."""
    global _cached_vertex_token, _vertex_token_expiry

    if _cached_vertex_token and time.time() < _vertex_token_expiry:
        return _cached_vertex_token

    if not _vertex_service_account_info:
        raise Exception("FIREBASE_SERVICE_ACCOUNT_KEY missing/unparsable — Vertex fallback unavailable.")

    credentials_google, _ = google.auth.load_credentials_from_dict(_vertex_service_account_info)
    scoped_credentials = credentials_google.with_scopes(['https://www.googleapis.com/auth/cloud-platform'])
    scoped_credentials.refresh(GoogleRequest())

    _cached_vertex_token = scoped_credentials.token
    _vertex_token_expiry = time.time() + 3000  # cache for 50 mins
    return _cached_vertex_token

def call_vertex_model(model_name, access_token, project_id, prompt, temperature=0.9, location=VERTEX_LOCATION, timeout=180):
    """Same generateContent call shape as call_gemini_model(), but hitting
    Vertex AI (Bearer token, project/location-scoped URL) instead of the
    plain Gemini API key endpoint."""
    url = (
        f"https://aiplatform.googleapis.com/v1/projects/{project_id}"
        f"/locations/{location}/publishers/google/models/{model_name}:generateContent"
    )
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if resp.status_code != 200:
        raise ModelCallError(f"[vertex:{model_name}] Vertex Rejection ({resp.status_code}): {resp.text[:300]}", status_code=resp.status_code)

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise Exception(f"[vertex:{model_name}] No candidates in response: {str(data)[:300]}")
    parts = candidates[0].get("content", {}).get("parts", [])
    text_out = "".join(p.get("text", "") for p in parts)
    if not text_out:
        raise Exception(f"[vertex:{model_name}] Empty response text.")
    return text_out

# --- ⚙️ OPENROUTER FALLBACK (3rd/last stage) — only used if BOTH the plain
# Gemini keys and Vertex AI fail. Only google/gemini-3.7-flash — no other
# model is tried here. ---
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = "google/gemini-3.7-flash"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

def call_openrouter_model(prompt, temperature=0.9, timeout=180):
    if not OPENROUTER_API_KEY:
        raise Exception("OPENROUTER_API_KEY missing/empty — OpenRouter fallback unavailable.")

    headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": OPENROUTER_MODEL,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }

    resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=timeout)
    if resp.status_code != 200:
        raise Exception(f"[openrouter:{OPENROUTER_MODEL}] Rejection ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise Exception(f"[openrouter:{OPENROUTER_MODEL}] No choices in response: {str(data)[:300]}")
    text_out = (choices[0].get("message", {}) or {}).get("content", "")
    if not text_out:
        raise Exception(f"[openrouter:{OPENROUTER_MODEL}] Empty response text.")
    return text_out

# --- 🧠 ANALYSIS PROMPT (direct — full script in, full JSON out, no local
# pre-parsing/patching). The model does the whole formatting job itself:
# verbatim dialogue extraction, character/voice-name resolution, emotion
# tagging, and the character chart (now including gender) in one pass. ---
def build_analysis_prompt(script_text):
    return f"""You are a professional script formatter and breakdown engine for a voice-dubbing pipeline.

CRITICAL - VERBATIM REQUIREMENT:
1. Do NOT change, rephrase, expand, or modify even a SINGLE WORD of the dialogues or narration.
2. Maintain the EXACT wording, grammar, and punctuation used by the speakers in the input.
3. If the input has spelling mistakes or odd phrasing, DO NOT FIX THEM. Keep them as is.
4. You are a formatter, NOT an editor. Creativity is FORBIDDEN.

CHARACTER NAMES:
- If the input contains a "VOICE ASSIGNMENTS" list (e.g., "Character - VoiceName",
  "Character: VoiceName", or "Character (Neutral): VoiceName"), use ONLY the
  "Character" part as the character name in your output — NEVER the VoiceName
  (e.g. Algenib, Alnilam, Zephyr, Gacrux, Achird, Achernar).
- If the character name has an emotion/neutral tag in parentheses (e.g.
  "रघुवीर (Neutral)" or "Character (Happy)"), strip the parenthetical and keep
  only the pure name (e.g. "रघुवीर", "Character").
- If no specific narrator name is given, default to "नैरेटर".
- NEVER translate or transliterate character names from English to Hindi or vice versa.

EMOTIONS:
- Tag every spoken line with exactly ONE emotion, lowercase single word, from
  this list: happy, sad, angry, excited, surprised, scared, anxious, calm,
  nervous, confident, joyful, frustrated, disappointed, confused, embarrassed,
  lonely, hopeful, romantic, serious, playful, curious, determined, grateful,
  relieved, shocked, proud, guilty, jealous, bored, sleepy, tired, energetic,
  emotional, crying, laughing, blushing, affectionate, sarcastic, sympathetic,
  worried, neutral.
- Narrator / storyteller lines are always "neutral".

GK / QUIZ QUESTIONS — MANDATORY MERGE RULE (read this before the general
merge rule below, it OVERRIDES it for quiz-style content):
- Whenever the script contains a GK/quiz-style question — a question stem
  followed by options (e.g. "A)", "B)", "1.", "2.", "पहला विकल्प", etc.) and
  optionally an answer/explanation — treat the question stem + ALL of its
  options + its answer (if present) as ONE SINGLE dialogue entry. Concatenate
  them verbatim (in original order, original wording) into that one entry's
  "line" field, exactly as they appear in the script.
- Do NOT create a separate dialogue entry for the question, and then another
  for each option, and then another for the answer. That produces many tiny
  entries and must never happen. One full question block (stem + options +
  answer) = one array element in "dialogues", no matter how many options it has.
- Only when the NEXT question starts (new numbered item like "सवाल नंबर 2",
  "Q2", "2)") do you start a new, separate dialogue entry.

OTHER FORMATTING RULES (for everything that is NOT a GK/quiz question):
- MERGE consecutive dialogue/narration from the same speaker into a single
  entry ONLY when it is truly one continuous beat/thought with no separating
  blank line.
- Do NOT merge across a blank line, a numbered item, or any other clearly
  self-contained segment (e.g. one list item, one distinct scene beat) —
  even if the same speaker/narrator says all of them. Each such
  self-contained segment must be its own separate dialogue entry so it maps
  to exactly one audio chunk downstream.
- REMOVE all scene descriptions (e.g. "Scene 1", "Location: Forest") entirely —
  they must not appear anywhere in your output.
- REMOVE all action descriptions or stage directions (e.g. "sote hue", "bhagte
  hue") entirely — they must not appear anywhere in your output.
- Include every dialogue and narrative beat from the script — do not skip anything.
- Identify each speaker correctly from context.
- Maintain the original language of each line (Hindi/English/mixed) exactly as written.
- A dialogue's "line" must contain ONLY the spoken words — never a leftover
  "Name:" / "Name-" prefix.

CHARACTER CHART (always required):
- List every distinct speaking character across the WHOLE script, including
  "नैरेटर" if used.
- For each character, infer "gender" ("male" or "female") from their name, how
  others address them, and context — best guess if unclear (default "female"
  if truly ambiguous).
- For each character, infer "ageGroup" ("kid"/"adult"/"old") from context —
  default "adult" if unclear.

SCRIPT CLASSIFICATION:
- "genre": the single closest-fitting genre, e.g. "horror", "moral", "comedy",
  "romantic", "drama", "thriller", "motivational", "devotional", or "general"
  if nothing specific fits.
- "toneGuidance": 1-2 sentences telling a voice actor HOW to perform this
  script given its genre/content. Base it on what the script actually
  contains, don't just restate the genre name.

SCRIPT TO PROCESS:
---
{script_text}
---

RETURN JSON ONLY — no markdown fences, no commentary, exactly this shape:
{{
  "characters": [
    {{"name": "<character name>", "gender": "male|female", "ageGroup": "kid|adult|old"}}
  ],
  "dialogues": [
    {{"character": "<character name>", "line": "<verbatim spoken text, no name prefix>", "emotion": "<emotion>"}}
  ],
  "genre": "<genre>",
  "toneGuidance": "<1-2 sentence performance direction>"
}}
"""

# --- 🧩 JSON ROBUSTNESS (same as store_script_generation.py) ---
class ModelCallError(Exception):
    """Same shape as a plain Exception, but carries the HTTP status code
    (when known) so callers can tell a model-wide outage (503/429 — no
    point burning more keys on the same model) apart from a key-specific
    problem (401/403/400 — worth trying the next key)."""
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code

# Status codes that mean "this model itself is unavailable/overloaded right
# now" rather than "this particular key is bad". No amount of retrying with
# a different key fixes these — move to the next model immediately.
MODEL_UNAVAILABLE_STATUS_CODES = {503, 429}

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

# --- 🤖 MODEL CALL — plain Gemini API key (x-goog-api-key), same shape as
# call_gemini_model() in script_generation.py. No Vertex, no service
# account, no project ID needed — just a key from GEMINI_KEYS. ---
def call_gemini_model(model_name, api_key, prompt, temperature=0.9, timeout=180):
    url = f"{GEMINI_API_BASE}/{model_name}:generateContent"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if not resp.ok:
        raise ModelCallError(f"[{model_name}] Gemini API Rejection ({resp.status_code}): {resp.text[:300]}", status_code=resp.status_code)

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise Exception(f"[{model_name}] No candidates in response: {str(data)[:300]}")
    parts = candidates[0].get("content", {}).get("parts", [])
    text_out = "".join(p.get("text", "") for p in parts)
    if not text_out:
        raise Exception(f"[{model_name}] Empty response text.")
    return text_out

def _parse_model_response(raw, engine, model_name):
    parsed = extract_json(raw)
    dialogues = parsed.get("dialogues", [])
    log_info(f"{engine}:{model_name} full-JSON analysis: {len(dialogues)} dialogue line(s)")
    return {
        "genre": parsed.get("genre"),
        "toneGuidance": parsed.get("toneGuidance"),
        "characters": parsed.get("characters", []),
        "dialogues": dialogues,
    }

def run_analysis(script_text):
    """Three-stage fallback chain:

      1. Plain Gemini API keys (GEMINI_KEYS) — models 3.7 -> 3.6 -> 3.5,
         at most GEMINI_KEY_TRY_LIMIT keys per model, then moves on to the
         next model. Scripts under SHORT_SCRIPT_CHAR_LIMIT try
         SHORT_SCRIPT_MODEL (light/fast) first with the same key limit.
      2. Vertex AI (service account) — 3.7 -> 3.6 only. 3.5 is intentionally
         excluded from this stage.
      3. OpenRouter — google/gemini-3.7-flash only, last resort.

    First stage+model+key combo that returns valid JSON wins. No local
    pre-parsing: the full raw script is sent to the model in one shot and
    the model returns the complete formatted JSON directly."""
    prompt = build_analysis_prompt(script_text)
    last_err = None

    # --- Stage 1: plain Gemini API keys ---
    if GEMINI_KEYS:
        if len(script_text) < SHORT_SCRIPT_CHAR_LIMIT:
            models = [SHORT_SCRIPT_MODEL] + [m for m in GEMINI_MODELS if m != SHORT_SCRIPT_MODEL]
        else:
            models = GEMINI_MODELS

        for model_name in models:
            keys_to_try = GEMINI_KEYS[:GEMINI_KEY_TRY_LIMIT]
            for key_idx, api_key in enumerate(keys_to_try):
                try:
                    raw = call_gemini_model(model_name, api_key, prompt)
                    analysis = _parse_model_response(raw, "gemini", model_name)
                    return analysis, "gemini", model_name
                except Exception as e:
                    last_err = e
                    log_warn(f"gemini:{model_name} key #{key_idx + 1}/{len(keys_to_try)} failed: {str(e)[:300]}")
                    if getattr(e, "status_code", None) in MODEL_UNAVAILABLE_STATUS_CODES:
                        log_warn(f"⚠️ {model_name} is overloaded/rate-limited ({e.status_code}) — that's a model-wide issue, not a key problem. Skipping remaining key(s) and moving to next model right away.")
                        break
                    continue
            log_warn(f"⚠️ Gemini plain-key stage exhausted for {model_name} ({len(keys_to_try)} key(s) tried), moving to next model...")
    else:
        log_warn("GEMINI_KEYS is empty — skipping plain-key stage, going straight to Vertex.")

    log_warn("⚠️ All Gemini plain-key attempts exhausted — falling back to Vertex AI (3.7/3.6 only)...")

    # --- Stage 2: Vertex AI (3.7, 3.6 only — never 3.5) ---
    try:
        vertex_token = get_vertex_access_token()
        for model_name in VERTEX_MODELS:
            try:
                raw = call_vertex_model(model_name, vertex_token, _vertex_project_id, prompt)
                analysis = _parse_model_response(raw, "vertex", model_name)
                return analysis, "vertex", model_name
            except Exception as e:
                last_err = e
                log_warn(f"vertex:{model_name} failed: {str(e)[:300]}")
                continue
    except Exception as e:
        last_err = e
        log_warn(f"Vertex AI stage unavailable: {str(e)[:300]}")

    log_warn("⚠️ Vertex AI stage exhausted — falling back to OpenRouter (gemini-3.7-flash only)...")

    # --- Stage 3: OpenRouter (google/gemini-3.7-flash only, last resort) ---
    try:
        raw = call_openrouter_model(prompt)
        analysis = _parse_model_response(raw, "openrouter", OPENROUTER_MODEL)
        return analysis, "openrouter", OPENROUTER_MODEL
    except Exception as e:
        last_err = e
        log_warn(f"openrouter:{OPENROUTER_MODEL} failed: {str(e)[:300]}")

    raise RuntimeError(f"All stages exhausted (Gemini keys, Vertex, OpenRouter). Last error: {last_err}")

def strip_speaker_prefix_from_lines(dialogues, characters=None):
    """Safety-net (belt-and-suspenders on top of the prompt instruction).
    The model is told not to repeat the character name inside "line", but
    it sometimes does anyway (e.g. "राहुल: मीना, तुम क्या कर रही हो?").
    If a dialogue's "line" starts with a character name followed by ':',
    '-', '—', or '–' (with optional surrounding spaces), we strip the
    prefix so only the actual spoken text remains.

    Checks the line's OWN assigned character first, then falls back to
    every OTHER known character name in the scene. Mutates `dialogues`."""
    known_names = []
    seen = set()
    for c in (characters or []):
        nm = (c.get("name") or "").strip()
        if nm and nm.lower() not in seen:
            known_names.append(nm)
            seen.add(nm.lower())

    def _try_strip(line, name):
        if not name:
            return None
        stripped = line.lstrip()
        if stripped[:len(name)].lower() == name.lower():
            rest = stripped[len(name):].lstrip()
            if rest[:1] in (":", "-", "—", "–"):
                return rest[1:].lstrip()
        return None

    for d in dialogues:
        assigned_name = (d.get("character") or "").strip()
        line = (d.get("line") or "")
        if not line:
            continue

        new_line = _try_strip(line, assigned_name)
        if new_line is None:
            for other_name in known_names:
                if other_name.lower() == assigned_name.lower():
                    continue  # already tried above
                new_line = _try_strip(line, other_name)
                if new_line is not None:
                    break

        if new_line is not None:
            d["line"] = new_line
    return dialogues


def finalize_analysis(analysis):
    """Post-processes the raw model output: normalizes gender/ageGroup on
    every character and strips any leftover speaker-name prefixes from
    dialogue lines. No stats, no voice assignment — the frontend owns
    both of those for this job-queue flow."""
    characters = analysis.get("characters", [])
    dialogues = analysis.get("dialogues", [])

    strip_speaker_prefix_from_lines(dialogues, characters)

    for d in dialogues:
        emotion = (d.get("emotion") or "").strip().lower()
        d["emotion"] = emotion or "neutral"

    for c in characters:
        gender = (c.get("gender") or "").strip().lower()
        if gender not in ("male", "female"):
            gender = "female"  # safe default if the model left it ambiguous
        c["gender"] = gender

        age_group = str(c.get("ageGroup") or "adult").strip().lower()
        if age_group not in ("kid", "adult", "old"):
            age_group = "adult"
        c["ageGroup"] = age_group

    analysis["characters"] = characters
    analysis["dialogues"] = dialogues
    analysis["genre"] = analysis.get("genre") or "general"
    analysis["toneGuidance"] = analysis.get("toneGuidance") or ""
    return analysis

def build_structured_result(characters, dialogues):
    """Builds the addEmotion=true output shape:
      {
        "characters": [{"name", "gender", "dialogueCount"}, ...],
        "lines": [{"character", "emotion", "text"}, ...],
        "stats": {"totalCharacters", "totalDialogues", "totalChars"}
      }
    dialogues here are the emotion-annotated ones (each has "character",
    "line", "emotion"). dialogueCount is computed per character by
    counting how many lines each one actually speaks."""
    counts = {}
    total_chars = 0
    lines_out = []
    for d in dialogues:
        name = d.get("character", "")
        text = d.get("line", "")
        counts[name] = counts.get(name, 0) + 1
        total_chars += len(text)
        lines_out.append({
            "character": name,
            "emotion": d.get("emotion") or "neutral",
            "text": text,
        })

    characters_out = [
        {
            "name": c.get("name"),
            "gender": c.get("gender"),
            "ageGroup": c.get("ageGroup"),
            "dialogueCount": counts.get(c.get("name"), 0),
        }
        for c in characters
    ]

    return {
        "characters": characters_out,
        "lines": lines_out,
        "stats": {
            "totalCharacters": len(characters_out),
            "totalDialogues": len(lines_out),
            "totalChars": total_chars,
        },
    }

# --- 📡 REALTIME LISTENER: pending_script_analysis/{userId}/{jobId} ---
# Frontend pushes a new job with push()+set() to this path as
# {status: "pending", script: "..."}. Emotion tagging is hardcoded ON below
# (ADD_EMOTION_HARDCODED) — every job always gets the structured
# characters/lines/stats output shape, regardless of what (if anything)
# the job doc sends. We attach ONE
# persistent Firebase Admin `.listen()` on the whole `pending_script_analysis`
# node (a real streaming connection, not polling) and react to every event —
# an initial full snapshot on attach, then incremental patches after that.
# Each pending job runs on its own thread; only status=="pending" jobs are
# ever picked up, and each job_id is only started once even if Firebase
# re-sends the same event.
#
# ⚠️ `.listen()` CAN DIE SILENTLY. Firebase Admin's realtime listener runs its
# own background SSE thread that can drop its connection (network blip, HF
# space idling, auth token refresh hiccup, whatever) WITHOUT reconnecting.
# The process keeps running and looks perfectly healthy — no crash, no error —
# but no more events ever fire, so any job pushed after that point just sits
# at status "pending" forever and the frontend spinner never resolves until
# its own client-side timeout. Restarting the server "fixes" it only because
# a fresh process re-attaches a fresh listener.
#
# Fix (mirrors the same pattern already used for pending_projects in
# studio.py): an independent poll loop that (1) acts as a safety net so jobs
# get picked up even if the stream is dead, and (2) proves whether the
# listener is actually alive — if a poll finds and starts a pending job but
# the listener hasn't fired in a while, that's confirmation the stream died,
# so we close it and attach a brand new one automatically.
_pending_job_ids = set()
_pending_job_lock = threading.Lock()

ADD_EMOTION_HARDCODED = True  # emotion tagging always on for every job

def _write_job_result(user_id, job_id, analysis, add_emotion):
    job_ref = db.reference(f'pending_script_analysis/{user_id}/{job_id}')
    if add_emotion:
        result = build_structured_result(analysis.get("characters", []), analysis.get("dialogues", []))
        job_ref.update({
            "status": "ok",
            "characters": result["characters"],
            "lines": result["lines"],
            "stats": result["stats"],
        })
    else:
        job_ref.update({
            "status": "ok",
            "analysis": {
                "characters": [
                    {"name": c.get("name"), "gender": c.get("gender"), "ageGroup": c.get("ageGroup")}
                    for c in analysis.get("characters", [])
                ],
                "dialogues": analysis.get("dialogues", []),
                "genre": analysis.get("genre"),
                "toneGuidance": analysis.get("toneGuidance"),
            },
        })

def _process_pending_job(user_id, job_id, job_data):
    """Runs the full analysis pipeline for one realtime job and writes the
    result back to pending_script_analysis/{user_id}/{job_id}."""
    job_ref = db.reference(f'pending_script_analysis/{user_id}/{job_id}')
    try:
        script_text = (job_data.get("script") or "").strip()
        if not script_text:
            job_ref.update({"status": "error", "error": "Empty script."})
            return

        add_emotion = ADD_EMOTION_HARDCODED
        log_info(f"Job picked up: {user_id}/{job_id} ({len(script_text)} chars, addEmotion={add_emotion})")

        analysis, engine, model_used = run_analysis(script_text)
        analysis = finalize_analysis(analysis)

        _write_job_result(user_id, job_id, analysis, add_emotion)
        char_count = len(analysis.get("characters", []))
        dialogue_count = len(analysis.get("dialogues", []))
        engine_label = {"gemini": "Google Gemini (direct)", "vertex": "Vertex AI", "openrouter": "OpenRouter"}.get(engine, engine)
        user_email = _get_user_email(user_id)
        log_success(
            f"Analysis complete: {user_id}/{job_id} via {engine}:{model_used} "
            f"({char_count} character(s), {dialogue_count} dialogue line(s)) "
            f"→ written to pending_script_analysis/{user_id}/{job_id}"
        )
        send_telegram_log(
            f"📝 <b>SCRIPT ANALYSIS READY</b>\n\n"
            f"🆔 <b>Job:</b> <code>{escape_html(job_id)}</code>\n"
            f"👤 <b>User:</b> <code>{escape_html(user_id)}</code>\n"
            f"📧 <b>Email:</b> {escape_html(user_email)}\n"
            f"🧠 <b>Engine:</b> {escape_html(engine_label)} | <b>Model:</b> {escape_html(model_used)}\n"
            f"🎭 <b>Characters:</b> {char_count} | <b>Dialogues:</b> {dialogue_count}\n"
            f"📂 <b>Path:</b> <code>pending_script_analysis/{escape_html(user_id)}/{escape_html(job_id)}</code>"
        )
    except Exception:
        err_str = traceback.format_exc()
        log_error(f"Job failed: {user_id}/{job_id}", err_str)
        try:
            job_ref.update({"status": "error", "error": "Analysis failed."})
        except Exception:
            pass
        send_telegram_log(
            f"🚨 <b>SCRIPT ANALYSIS FAILED</b>\n\n"
            f"🆔 <b>Job:</b> <code>{escape_html(job_id)}</code>\n"
            f"👤 <b>User:</b> <code>{escape_html(user_id)}</code>\n"
            f"📧 <b>Email:</b> {escape_html(_get_user_email(user_id))}\n"
            f"❌ <b>Error:</b> {escape_html(err_str[-500:])}"
        )
    finally:
        with _pending_job_lock:
            _pending_job_ids.discard(job_id)

def _maybe_start_job(user_id, job_id, job_data):
    """Guards against re-processing: only fires for status=='pending', and
    only once per job_id even if Firebase re-sends the same event."""
    if not isinstance(job_data, dict) or job_data.get("status") != "pending":
        return
    with _pending_job_lock:
        if job_id in _pending_job_ids:
            return
        _pending_job_ids.add(job_id)
    threading.Thread(target=_process_pending_job, args=(user_id, job_id, job_data), daemon=True).start()

def _on_pending_script_event(event):
    """Callback for db.reference('pending_script_analysis').listen(...).
    Firebase sends events at whatever depth actually changed, so this has
    to handle every shape:
      path == "/"                     -> full snapshot on first attach: {userId: {jobId: {...}}}
      path == "/{userId}"             -> that user's whole job-list replaced/added
      path == "/{userId}/{jobId}"     -> a single job created (the push+set from frontend)
      path == "/{userId}/{jobId}/..." -> a single field changed (e.g. our own status
                                          writes below) -> deliberately ignored so we
                                          don't loop on our own updates
    """
    try:
        parts = [p for p in (event.path or "/").split("/") if p]
        data = event.data

        if len(parts) == 0:
            if isinstance(data, dict):
                for user_id, jobs in data.items():
                    if isinstance(jobs, dict):
                        for job_id, job_data in jobs.items():
                            _maybe_start_job(user_id, job_id, job_data)
        elif len(parts) == 1:
            user_id = parts[0]
            if isinstance(data, dict):
                for job_id, job_data in data.items():
                    _maybe_start_job(user_id, job_id, job_data)
        elif len(parts) == 2:
            user_id, job_id = parts
            _maybe_start_job(user_id, job_id, data)
        # len(parts) > 2 -> field-level patch, ignore
    except Exception:
        log_error("pending_script_analysis listener callback error", traceback.format_exc())

def _drain_pending_script_queue(source="unknown"):
    """Full-scan safety net: reads the whole pending_script_analysis snapshot
    and starts any job with status=='pending' that isn't already running.

    `source` shows up in the "Job picked up" log context so it's visible
    whether jobs are being started by the realtime "listener" or by the
    "poll"/"startup" safety net. If it's ever "poll", that's proof the
    realtime stream isn't firing right now.
    """
    try:
        snapshot = db.reference("pending_script_analysis").get()
        if not isinstance(snapshot, dict):
            return
        for user_id, jobs in snapshot.items():
            if not isinstance(jobs, dict):
                continue
            for job_id, job_data in jobs.items():
                _maybe_start_job(user_id, job_id, job_data)
    except Exception:
        # Was previously not attempted at all outside the listener path —
        # any error here (transient DB read failure, bad snapshot shape)
        # must be visible, not silently eaten, or a stuck queue looks
        # identical to "nothing to process."
        log_error("Script-analysis queue drain failed", traceback.format_exc())
    finally:
        if source != "poll":
            log_info(f"Script-analysis queue drain complete (source: {source})")


_listener_last_event_ts = [time.time()]
_listener_event_count = [0]
_listener_registration = [None]
_listener_reattach_count = [0]


def _log_uncaught_thread_exception(args):
    """threading.excepthook — the Firebase SDK's `.listen()` call runs its
    own background thread internally. If that thread's connection loop
    throws (dropped connection, auth hiccup, whatever), Python's default
    behavior is to print a traceback to stderr and just let the thread die,
    with nothing reconnecting it and nothing in our own logs to show it
    happened. This routes any such crash through log_error so it's visible,
    then still runs the normal default handler."""
    try:
        log_error(
            f"Uncaught exception in background thread '{args.thread.name if args.thread else '?'}'",
            f"{args.exc_type.__name__ if args.exc_type else '?'}: {args.exc_value}"
        )
    except Exception:
        pass
    threading.__excepthook__(args)


def _on_pending_script_event_tracked(event):
    """Wraps _on_pending_script_event to also record that the listener is
    still alive, so the poll loop can tell a live stream from a dead one."""
    _listener_last_event_ts[0] = time.time()
    _listener_event_count[0] += 1
    _on_pending_script_event(event)


def _attach_pending_script_listener():
    global _pending_script_listener_handle
    try:
        _pending_script_listener_handle = db.reference("pending_script_analysis").listen(_on_pending_script_event_tracked)
        _listener_registration[0] = _pending_script_listener_handle
        _listener_last_event_ts[0] = time.time()
        log_success("👂 Realtime listener (re)attached: pending_script_analysis")
    except Exception:
        log_error("Failed to attach pending_script_analysis listener", traceback.format_exc())


def _script_queue_poll_loop():
    """Runs forever alongside the realtime listener. Every 5s it re-scans
    the whole queue as a safety net (so a dead stream can never stall a job
    indefinitely), and it's also what proves whether the listener is alive:
    if a poll finds and starts a pending job but the listener hasn't fired
    in the meantime, the stream is confirmed dead and gets closed + replaced
    with a fresh one automatically — no manual restart needed."""
    while True:
        time.sleep(5)
        before = len(_pending_job_ids)
        _drain_pending_script_queue(source="poll")
        picked_up_something = len(_pending_job_ids) > before
        stale_for = time.time() - _listener_last_event_ts[0]
        if picked_up_something and stale_for > 10:
            _listener_reattach_count[0] += 1
            log_error(
                "pending_script_analysis listener confirmed dead — reattaching",
                f"A job was just picked up via poll, but the listener hasn't fired in "
                f"{stale_for:.0f}s (fired {_listener_event_count[0]} times total, "
                f"reattach #{_listener_reattach_count[0]}). The '.listen()' stream "
                f"disconnected silently."
            )
            try:
                if _listener_registration[0] is not None:
                    _listener_registration[0].close()
            except Exception:
                log_error("Error closing dead script-analysis listener registration", traceback.format_exc())
            _attach_pending_script_listener()


_pending_script_listener_handle = None
def start_pending_script_listener():
    """Attaches the persistent realtime listener PLUS a polling safety net
    that catches anything the listener misses (including a silently dead
    connection, which it auto-reattaches). Call once at app startup (e.g.
    from app.py's lifespan). Safe to call more than once — only the first
    call actually starts anything."""
    global _pending_script_listener_handle
    if _pending_script_listener_handle is not None:
        return
    if not GEMINI_KEYS:
        log_warn("GEMINI_KEYS is not set (or empty) — plain-key stage will be skipped, falling straight to Vertex.")
    if not _vertex_service_account_info:
        log_warn("FIREBASE_SERVICE_ACCOUNT_KEY missing/unparsable — Vertex fallback stage will be unavailable.")
    if not OPENROUTER_API_KEY:
        log_warn("OPENROUTER_API_KEY is not set — final OpenRouter fallback stage will be unavailable.")

    if threading.excepthook is threading.__excepthook__:
        threading.excepthook = _log_uncaught_thread_exception

    _drain_pending_script_queue(source="startup")
    _attach_pending_script_listener()
    threading.Thread(target=_script_queue_poll_loop, daemon=True).start()

    log_success(
        f"Script-analysis worker ready: realtime listener + 5s poll safety-net attached | "
        f"Gemini keys: {len(GEMINI_KEYS)} | Vertex ready: {bool(_vertex_service_account_info)} | "
        f"OpenRouter ready: {bool(OPENROUTER_API_KEY)}"
    )
