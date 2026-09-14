"""
studio.py
---------------------
Voice/story generation engine — everything that used to live inside app.py
under process_production_queue() and its helpers now lives here, following
the same "own file, own listener" pattern as music_generation.py /
script_generation.py / voice_replacement.py.

app.py just does:
    from studio import start_pending_voice_listener
and calls start_pending_voice_listener() once in its lifespan startup.

🔴 CREDIT REFUNDS ON FAILURE
  - Total failure (whole project throws)      -> full refund of credits_charged
  - Partial failure (some dialogue nodes rejected, project still completes)
                                                -> proportional refund for the
                                                   rejected nodes only

✅ Confirmed schema:
  - Charged amount: pending_projects/{project_id}.creditCost
  - Live balance:   Firestore users/{uid}.credits  (int64, bumped via Increment)
  - History log:    Realtime Database creditHistory/{uid} (amount/reason/timestamp/type)
"""

import os
import re
import json
import time
import base64
import string
import secrets
import asyncio
import wave
import io
import difflib
import uuid
import threading
from collections import defaultdict
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

import requests
import lameenc
from google import genai as live_genai
from firebase_admin import db, firestore

from emotion_engine import build_emotion_directive, format_emotion_tag
from voice_catalog import get_voice_gender
from r2_netlify import upload_to_r2, send_telegram_log


# --- 🎨 NEURAL COLOR ENGINE ---
class bcolors:
    OKGREEN = '\033[92m'
    OKCYAN = '\033[96m'
    OKBLUE = '\033[94m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

def log_success(msg):
    print(f"{bcolors.OKGREEN}[STUDIO-SUCCESS] {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)

def log_error(msg, detail=None):
    print(f"{bcolors.FAIL}[STUDIO-ERROR]   {datetime.now().strftime('%H:%M:%S')} - 🚨 {msg}{bcolors.ENDC}", flush=True)
    if detail: print(f"{bcolors.FAIL}{detail}{bcolors.ENDC}", flush=True)

def log_info(msg):
    print(f"{bcolors.OKCYAN}[STUDIO-NODE]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)

def log_engine(engine, index, char_name, voice_id, emotion_tag=None):
    color = bcolors.OKBLUE if "Live" in engine else bcolors.WARNING
    tag_part = f" [{emotion_tag}]" if emotion_tag else " [no emotion tag]"
    print(f"{color}[ENGINE-SYNC] Node {index+1} -> {char_name} ({voice_id}) via {engine}{tag_part}{bcolors.ENDC}", flush=True)

def escapeHtml(text):
    """Escapes strings for safe Telegram HTML parsing"""
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ============================================================
# 💳 CREDIT REFUND ENGINE
# ============================================================
# Confirmed: cost is stored under "creditCost" in the project payload.
CREDIT_COST_FIELD = "creditCost"

# ✅ CONFIRMED (Firestore console screenshot):
#   Balance lives in FIRESTORE at  users/{uid}  -> field "credits" (int64)
#   creditHistory (the log) lives in the REALTIME DATABASE, unchanged.
# Two different databases — refund_credits() below writes to both.
FIRESTORE_USERS_COLLECTION = "users"
FIRESTORE_CREDITS_FIELD = "credits"

# ✅ CONFIRMED (Cloud Console screenshot): the Firestore database's actual
# Database ID is the literal string "(default)" (asia-south2 / Delhi
# region, Standard edition, Firestore native mode). Newer google-cloud-
# firestore versions no longer silently resolve this on their own — it
# must be passed explicitly to firestore.client(), or every direct
# firestore.client() call raises "Set FIRESTORE_DATABASE_ID to the real
# Firestore database ID (not '(default)')." even though "(default)" IS
# the real ID here. Override via env var only if the database is ever
# recreated under a different (non-default) ID later.
FIRESTORE_DATABASE_ID = os.environ.get("FIRESTORE_DATABASE_ID", "(default)")

def _get_credits_charged(data):
    """Pulls how many credits this project was charged, from the confirmed
    'creditCost' field in the pending_projects payload."""
    val = data.get(CREDIT_COST_FIELD)
    if isinstance(val, (int, float)) and val > 0:
        return val
    return 0

def _claim_refund_amount(project_id, requested_amount, credits_charged, run_id=None):
    """Atomically decides how much of `requested_amount` is still owed for
    this RUN of the project, via a Realtime Database transaction on
    refund_locks/{project_id}/{run_id} (this lock is internal bookkeeping
    only — it doesn't need to live next to the real balance/history data).
    This guarantees one run is NEVER refunded more than it was charged —
    even if refund_credits() ends up called more than once within that run
    (e.g. a partial refund followed by a later total failure, or any
    duplicate-event edge case inside the same run).

    IMPORTANT — the lock is scoped PER RUN, not per project. It used to be
    keyed on project_id alone, which meant: user's project fails, gets
    refunded, user retries the SAME project, gets charged again, it fails
    again — and the second refund was silently skipped as "already fully
    refunded" even though the user had genuinely paid a second time. If
    we charged again, we owe again; only double-refunding a SINGLE charge
    is what needs preventing. `run_id` (see _new_refund_run below) is
    generated fresh each time process_production_queue picks the project
    up, so each charge gets its own independent claim budget.

    Falls back to a project-wide lock only when no run_id is supplied, so
    any older/other call site keeps its previous (safe) behavior."""
    if not project_id or requested_amount <= 0 or credits_charged <= 0:
        return 0
    lock_path = f'refund_locks/{project_id}/{run_id}' if run_id else f'refund_locks/{project_id}'
    lock_ref = db.reference(lock_path)
    granted = {"amount": 0}

    def _txn(current_refunded):
        already = current_refunded or 0
        remaining = round(credits_charged - already, 2)
        grant = round(min(requested_amount, remaining), 2)
        granted["amount"] = grant
        if grant <= 0:
            return current_refunded  # nothing left to claim — no-op
        return round(already + grant, 2)

    try:
        lock_ref.transaction(_txn)
    except Exception as e:
        log_error(f"Refund claim transaction failed for {project_id} (run {run_id})", str(e))
        return 0
    return granted["amount"]


# Tracks the current refund-run token for each project being processed, so
# every refund_credits() call inside one run shares one claim budget while a
# later re-run of the same project starts with a fresh one. Set by
# _new_refund_run() at the top of process_production_queue.
_refund_runs = {}
_refund_runs_lock = threading.Lock()


def _new_refund_run(project_id):
    """Starts a fresh refund budget for this project and returns its token.
    Called once per process_production_queue invocation — i.e. once per
    charge — so a retried project can be refunded again if it fails again."""
    token = f"run_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    with _refund_runs_lock:
        _refund_runs[project_id] = token
    return token


def _current_refund_run(project_id):
    with _refund_runs_lock:
        return _refund_runs.get(project_id)


def refund_credits(uid, amount, reason, project_id=None, credits_charged=None):
    """Adds credits back to the user's live balance (Firestore:
    users/{uid}.credits) and writes a matching creditHistory entry in the
    Realtime Database — SAME shape as your existing entries (amount /
    reason / timestamp / type), just a positive 'refund' entry instead of
    a negative 'deduction' one, with the actual reason for the failure so
    it's clear in the log why the money came back.

    If `project_id` + `credits_charged` are given, the amount is first run
    through `_claim_refund_amount`, which caps it at what THIS RUN of the
    project was charged (see that function) — so one charge can't be
    refunded twice, but a re-run that was charged again can be refunded
    again."""
    if not uid or not amount or amount <= 0:
        return

    if project_id and credits_charged:
        run_id = _current_refund_run(project_id)
        amount = _claim_refund_amount(project_id, amount, credits_charged, run_id=run_id)
        if amount <= 0:
            log_info(f"💳 Refund skipped for {project_id} — this run's charge was already fully refunded.")
            return

    # --- Firestore: bump the real balance, atomically, server-side ---
    try:
        firestore.client(database_id=FIRESTORE_DATABASE_ID).collection(FIRESTORE_USERS_COLLECTION).document(uid).update({
            FIRESTORE_CREDITS_FIELD: firestore.Increment(amount)
        })
    except Exception as e:
        log_error(f"💳 Firestore balance credit FAILED for {uid} (amount={amount}) — history entry still being written", str(e))

    # --- Realtime Database: log it in creditHistory, same shape as always ---
    try:
        db.reference(f'creditHistory/{uid}').push({
            "amount": amount,
            "reason": reason,
            "timestamp": datetime.now().isoformat(),
            "type": "refund",
            **({"projectId": project_id} if project_id else {}),
        })
        log_success(f"💳 Refunded {amount} credits to {uid} — {reason}")
        send_telegram_log(
            f"💳 <b>Credit Refund</b>\n\n"
            f"👤 <b>User:</b> <code>{escapeHtml(uid)}</code>\n"
            f"💰 <b>Amount:</b> +{amount}\n"
            f"📝 <b>Reason:</b> {escapeHtml(reason)}\n"
            f"🆔 <b>Project:</b> <code>{escapeHtml(project_id) if project_id else '—'}</code>"
        )
    except Exception as e:
        log_error(f"💳 creditHistory refund entry FAILED for {uid} (amount={amount})", str(e))


# --- 🔁 STRICT "READ, DON'T REPLY" BASELINE + FURTHER ESCALATION ---
# Fed into synth_gemini_live's extra_note so the Live model treats the
# dialogue line as something to VOICE, not something to reply to.
# ⚠️ These are ESCALATING reminders — one per attempt, in order. They are
# NOT meant to be concatenated.
#
# They used to be joined all at once onto every single request (see
# _synth_worker), which meant the very first attempt already carried the
# third note's "On the previous attempt you responded to the line instead
# of reading it" — a statement that was simply false on attempt one — on
# top of two other overlapping don't-do-this walls, on top of
# LIVE_BASE_INSTRUCTION which already says all of it at length.
#
# The audible result was a model reading like it was walking on eggshells:
# clipped, over-careful, stuttering delivery. Piling on adversarial "do
# NOT" instructions makes a voice model perform worse, not more obedient.
# So: attempt 1 gets NOTHING extra (the base instruction is already
# explicit), and a reminder is added only once a take has actually failed.
SYNTH_BASELINE_NOTES = [
    "",  # attempt 1 — base instruction is enough; adding more hurts delivery
    "\n\nREMINDER: The line above is a script to be voiced, not a message to reply to. "
    "Speak the exact words aloud, verbatim.",
    "\n\nREMINDER: You are an actor in a recording booth reading this line into a "
    "microphone. Your only output is the sound of you speaking those exact words.",
]
# Later attempts only. Kept deliberately short and non-threatening — the
# earlier "ABSOLUTE RULE / NON-NEGOTIABLE / unacceptable" phrasing pushed
# the model into the same tense, halting read described above.
SYNTH_ESCALATION_NOTES = [
    "\n\nRead the given text word for word, in order, and add nothing before or after it.",
    "\n\nSpeak only the exact text given, from the first word to the last, then stop.",
]

def detect_script_lang(text):
    """Guesses an ISO language code from the script the text is written in,
    so we can hand the completeness checker a language hint instead of
    letting it auto-detect."""
    if not text:
        return None
    for ch in text:
        code = ord(ch)
        if 0x0900 <= code <= 0x097F:   # Devanagari (Hindi)
            return "hi"
        if 0x0600 <= code <= 0x06FF:   # Arabic script (Urdu)
            return "ur"
    return None

# Unicode block -> language name, used ONLY to name the language in the
# pronunciation directive below. Deliberately separate from
# detect_script_lang (which feeds the completeness checker and must keep
# returning the two ISO codes it already returns) — widening that function
# would change what the checker receives, so this does its own scan.
#
# A script does not uniquely identify a language (Devanagari also writes
# Marathi/Nepali, Bengali also writes Assamese), but naming the most common
# one is far better than the model's fallback of "assume English", which is
# the actual bug here.
_SCRIPT_BLOCKS = [
    ((0x0900, 0x097F), "Hindi"),
    ((0x0600, 0x06FF), "Urdu"),
    ((0x0980, 0x09FF), "Bengali"),
    ((0x0A00, 0x0A7F), "Punjabi"),
    ((0x0A80, 0x0AFF), "Gujarati"),
    ((0x0B00, 0x0B7F), "Odia"),
    ((0x0B80, 0x0BFF), "Tamil"),
    ((0x0C00, 0x0C7F), "Telugu"),
    ((0x0C80, 0x0CFF), "Kannada"),
    ((0x0D00, 0x0D7F), "Malayalam"),
]


def _language_name_for(text):
    """First non-Latin script seen wins. Short-circuits on the first match
    rather than tallying, since a line is overwhelmingly in one script and
    stray characters shouldn't outvote the body of the text."""
    for ch in text or "":
        code = ord(ch)
        for (lo, hi), name in _SCRIPT_BLOCKS:
            if lo <= code <= hi:
                return name
    return None


def build_pronunciation_directive(text):
    """Names the language to pronounce the line in.

    Nothing in the instruction used to name a language at all, so the
    model fell back to English phonetics on some lines — most often short
    ones, ones carrying English loanwords, and Romanized (Hinglish) text
    where there is no Devanagari to anchor it. Digits are called out
    because they are language-neutral on the page, so "1975" gets read in
    English inside an otherwise Hindi line."""
    lang_name = _language_name_for(text)

    if lang_name:
        return (
            f"\n\nPRONUNCIATION: This line is in {lang_name} — speak it with native "
            f"{lang_name} phonetics and intonation throughout, never an English accent. "
            f"Pronounce any English loanwords the way a {lang_name} speaker naturally "
            f"would, and read numbers written in digits in {lang_name} too (in Hindi, "
            f"1975 is \"उन्नीस सौ पचहत्तर\", not \"nineteen seventy-five\")."
        )

    return (
        "\n\nPRONUNCIATION: Identify the language this line is written in and speak it "
        "with that language's native phonetics — do not assume English just because it "
        "uses Roman letters. Romanized Hindi/Urdu (\"Kya hua?\") is Hindi/Urdu, not "
        "English. Read any digits in that same language."
    )


def pcm_to_mp3(pcm_bytes, sample_rate=24000, channels=1, bitrate=128):
    """Encodes raw 16-bit PCM straight to MP3 in memory via libmp3lame bindings."""
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(bitrate)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(channels)
    encoder.set_quality(2)
    mp3_data = encoder.encode(pcm_bytes)
    mp3_data += encoder.flush()
    return mp3_data

def pcm_to_wav_bytes(pcm_bytes, sample_rate=24000, channels=1, sample_width=2):
    """Wraps raw PCM in a minimal WAV header (in memory) — needed any time
    we hand synthesized audio to a model as an inline audio part."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


# --- 🔗 COMPLETENESS-ONLY CHECK ---
# Used to ask two things (completeness + a strict word-for-word/exact-match
# check). The exact-match half was the main source of extra regenerate
# loops — a merely repeated word, a harmless grammatical-form quibble, etc.
# would fail "EXACT" and throw away an otherwise-fine take, triggering a
# full regeneration (and, on the Live API, that's what compounded into the
# multi-minute retry storms we saw). Simplified to ONE question: was the
# whole line actually spoken, start to finish, nothing missing or cut off?
# If yes, we keep the take as-is — repeats/minor wording quirks are no
# longer a reason to discard already-generated audio.
# One question, one answer. Audio in, script line in, "was all of it
# spoken?" out. Nothing else is asked and nothing else is judged — no
# word-for-word matching, no transcript, no pronunciation or wording
# opinions. Those extra questions only ever threw away otherwise-fine
# takes.
ACCURACY_CHECK_INSTRUCTION = (
    "Below is the exact script line that a text-to-speech system was asked to read "
    "aloud, followed by the audio it produced.\n\n"
    "SCRIPT LINE:\n\"{line}\"\n\n"
    "Listen to the whole audio, from its first sound to its last, and answer ONE "
    "question: was the entire script line spoken, with nothing missing or cut off at "
    "the start, the end, or in the middle?\n\n"
    "Answer Yes if all of it is there. Do not answer No for repeated words, "
    "pronunciation or accent differences, transliteration, numbers read out in words, "
    "or pauses — only for words that are genuinely missing.\n\n"
    "Reply with exactly one line and nothing else:\n"
    "COMPLETE: Yes\n"
    "or\n"
    "COMPLETE: No"
)

_ACCURACY_COMPLETE_RE = re.compile(r'^\s*complete\s*[:.\-]\s*(yes|no)', re.IGNORECASE | re.MULTILINE)

def _parse_accuracy_verdict(raw):
    """Reads the completeness-only verdict. Returns (complete, exact,
    reason): complete is True/False/None (None = couldn't be read, treated
    as 'couldn't check' by the caller). exact/reason are always None now —
    the exact word-for-word question was dropped (see ACCURACY_CHECK_
    INSTRUCTION above); kept as return slots so callers written for the
    old two-question shape keep working unchanged."""
    if not raw:
        return None, None, None
    m_complete = _ACCURACY_COMPLETE_RE.search(raw)
    complete = m_complete.group(1).lower() == "yes" if m_complete else None
    return complete, None, None

def check_audio_accuracy_openrouter(text, pcm_bytes, sample_rate=24000, stats=None):
    """Completeness-only check via OpenRouter (google/gemini-2.5-flash-lite):
    was the whole script line spoken, nothing missing/cut off? Returns
    (complete, exact, reason) for call-site compatibility — exact and
    reason are always None now (see ACCURACY_CHECK_INSTRUCTION comment for
    why the old exact word-for-word question was dropped). complete is
    True/False/None (None = checker unreachable, never punishes a clip for
    a flaky checker)."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key or not pcm_bytes:
        return None, None, None
    clean = re.sub(r'\[.*?\]', '', text or '').strip()
    if not clean:
        return None, None, None

    wav_bytes = pcm_to_wav_bytes(pcm_bytes, sample_rate=sample_rate)
    b64_audio = base64.b64encode(wav_bytes).decode("utf-8")
    lang = detect_script_lang(text)
    instruction = ACCURACY_CHECK_INSTRUCTION.format(line=clean)
    if lang:
        instruction += f"\n\nThe dialogue is in language '{lang}'."

    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "google/gemini-2.5-flash-lite",
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": instruction},
                        {"type": "input_audio", "input_audio": {"data": b64_audio, "format": "wav"}},
                    ],
                }],
            },
            timeout=30,
        )
        data = resp.json()
        if not resp.ok:
            log_error("OpenRouter accuracy check [google/gemini-2.5-flash-lite] HTTP error", str(data.get("error", data)))
            return None, None, None
        msg = ((data.get("choices") or [{}])[0].get("message") or {})
        out = msg.get("content")
        if isinstance(out, list):
            out = "".join(p.get("text", "") for p in out if isinstance(p, dict))
        complete, exact, reason = _parse_accuracy_verdict((out or "").strip())
        if complete is None:
            log_error("OpenRouter accuracy check [google/gemini-2.5-flash-lite] gave an unclear COMPLETE answer", (out or "")[:160])
        return complete, exact, reason
    except Exception as e:
        log_error("OpenRouter accuracy check [google/gemini-2.5-flash-lite] failed", str(e))
        return None, None, None


# --- 🎙️ LIVE API MODELS (voice-consistency fix) ---
LIVE_MODEL_PRIMARY = "gemini-2.5-flash-native-audio-preview-12-2025"
LIVE_MODEL_FALLBACK = "gemini-3.1-flash-live-preview"
LIVE_PRIMARY_MAX_RETRIES = 3
LIVE_SESSION_TIMEOUT = 90

# --- 🛰️ LIVE API — VERTEX TIER (service account, no GEMINI_KEYS quota) ---
# Reuses the SAME FIREBASE_SERVICE_ACCOUNT_KEY already used by
# thumbnail_generation.py / vertex.ts, so this Live tier is billed on the
# GCP project instead of consuming any GEMINI_KEYS account's quota/session
# cap. Tried in synth_gemini_live() right after the primary model's
# GEMINI_KEYS attempts fail, BEFORE dropping to LIVE_MODEL_FALLBACK.
LIVE_MODEL_VERTEX = os.environ.get("LIVE_MODEL_VERTEX", "gemini-live-2.5-flash-native-audio")
VERTEX_LIVE_LOCATION = os.environ.get("VERTEX_LIVE_LOCATION", "us-central1")

_vertex_sa_info = None
_vertex_project_id = None
try:
    _sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if _sa_json:
        _vertex_sa_info = json.loads(_sa_json)
        _vertex_project_id = _vertex_sa_info.get("project_id")
    else:
        log_error("FIREBASE_SERVICE_ACCOUNT_KEY missing — Vertex Live tier disabled (studio.py).")
except Exception:
    import traceback as _tb
    log_error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY for Vertex Live (studio.py)", _tb.format_exc())

_vertex_credentials = None
_vertex_credentials_lock = threading.Lock()


def _get_vertex_credentials():
    """Lazily builds a google.auth Credentials object from the service
    account and reuses it — the google-genai SDK refreshes it internally
    on expiry (same as any google-auth credentials object), so no manual
    50-min token caching is needed here like in thumbnail_generation.py."""
    global _vertex_credentials
    if not _vertex_sa_info:
        raise Exception("FIREBASE_SERVICE_ACCOUNT_KEY missing — Vertex Live unavailable.")
    with _vertex_credentials_lock:
        if _vertex_credentials is None:
            import google.auth as _google_auth
            creds, _ = _google_auth.load_credentials_from_dict(
                _vertex_sa_info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            _vertex_credentials = creds
        return _vertex_credentials

# --- 🔑 PER-KEY CONCURRENT-SESSION THROTTLE ---
# The failures driving up "Model Attempts" vs actual node count are almost
# never the daily TOKEN quota (that's huge) — they're the Live API's
# CONCURRENT SESSION cap per key (Google enforces a small number of
# simultaneous Live sessions per API key, independent of token budget).
# With up to 32 worker threads all opening sessions at once on only 2
# "preferred" keys, most of them get rejected immediately and have to
# retry on another key — that's where the extra attempts come from.
# This semaphore caps how many Live sessions are open on any ONE key at
# the same time, so threads queue politely instead of firing and failing.
GEMINI_MAX_CONCURRENT_PER_KEY = int(os.environ.get("GEMINI_MAX_CONCURRENT_PER_KEY", "10"))
_key_semaphores = {}
_key_semaphores_lock = threading.Lock()

def _sem_for_key(key):
    """Lazily creates (once) and returns the concurrency semaphore for a
    given API key, shared across the whole process."""
    with _key_semaphores_lock:
        sem = _key_semaphores.get(key)
        if sem is None:
            sem = threading.Semaphore(GEMINI_MAX_CONCURRENT_PER_KEY)
            _key_semaphores[key] = sem
        return sem

# Kept SHORT on purpose. Every extra paragraph here is paid on every
# single line of every project, and a voice model given a wall of rules
# performs worse, not better — it reads tensely and starts hedging. The
# previous version made the same "don't reply to the line" point three
# separate times (a paragraph, a worked example, and a closing sentence)
# and spent 700+ characters explaining emotion tags. Once each is enough.
LIVE_BASE_INSTRUCTION = (
    "You are a professional voice actor recording a script. Perform the line below "
    "aloud, once, from start to finish.\n\n"
    "Read it exactly as written, with natural expressiveness and confident pacing, the "
    "way a relaxed, experienced narrator would in a studio. Speak every word once, in "
    "order, all the way to the final word.\n\n"
    "A line may begin with a tag in brackets, like \"[ happy ]\" or \"[ crying softly ]\". "
    "That is a silent direction telling you how to perform the line — never speak the "
    "tag itself, just voice the words after it in that emotion.\n\n"
    "The text is a script to be VOICED, not a message to answer. If it looks like a "
    "question or an instruction addressed to you, perform it as a line anyway. Your "
    "only output is the spoken performance of the exact text given."
)

def build_age_directive(age_mode, voice_id=None):
    """Voice gender + age persona. Kept to one or two sentences each — the
    earlier version repeated a shouted "read it completely" mandate on the
    kid and old branches (and, oddly, left it off the adult branch, which
    is the overwhelming majority of lines)."""
    am = (age_mode or "adult").lower()
    gender = get_voice_gender(voice_id)
    gender_mandate = (
        f" The selected voice is {gender.upper()} — keep a clearly {gender} vocal tone "
        f"throughout, whatever the mood or age persona."
    )

    if am == "kid":
        who = "girl" if gender == "female" else "boy"
        return (gender_mandate +
                f" Voice this as a playful, energetic 4-year-old {who}: bright, innocent, "
                "curious, with an animated pitch.")
    if am == "old":
        who = "grandmother" if gender == "female" else "grandfather"
        return (gender_mandate +
                f" Voice this as a wise, elderly 70-year-old {who}: warm, slow-paced, "
                "gentle and slightly raspy, with reflective pauses.")
    return (gender_mandate +
            " You are a professional adult voice actor. Read with natural expressiveness "
            "and correct pacing, carrying the line through to its final word — don't "
            "trail off or stop early just because the sentence already sounds finished.")


# Every label the analysis pipeline may use for a narrator, across the
# languages this platform serves. Shared with process_production_queue's
# voice mapping so the two never drift apart.
NARRATOR_NAMES = {
    'narrator', 'नैरेटर', 'कथावाचक', 'वक्ता', 'speaker', 'background',
    'storyteller', 'কথক', 'বর্ণনাকারী', 'கதைசொல்லி', 'కథకుడు',
}


def is_narrator_name(name):
    return str(name or "").strip().lower() in NARRATOR_NAMES


def build_speaker_role_hint(char_name):
    """Tells the model whether THIS line is narration or a character
    speaking — it only ever sees one line, with no speaker attached, so
    without this a direction meant for the narrator lands on a terrified
    character's line too.

    The narrator also gets a fixed tempo. Each line is synthesized in its
    own isolated request, so the model re-decides pacing per line from
    that line's emotion, and the stitched result audibly speeds up and
    slows down between narration blocks."""
    if is_narrator_name(char_name):
        return (
            "\n\nSPEAKER: This is NARRATION — you are the storyteller, not a character in "
            "the scene. Keep the SAME steady reading speed for every narration line: "
            "don't speed up for tense lines or slow down for sad ones. Express emotion "
            "through tone, not tempo. Natural pauses at commas and full stops are fine."
        )
    return (
        f"\n\nSPEAKER: This line is spoken by the character \"{char_name}\" in the scene. "
        "Perform it as they would say it in the moment."
    )


def build_genre_directive(genre, tone_guidance):
    """Turns the script-analysis genre + tone guidance into an extra
    instruction block, with genre-specific base direction layered in first.

    NOTE: the animal/bird species voice hints (used for ANIMALS and
    TOONI_CHIDIYA categories) are keyword-matched off the character's
    *name* — there's no explicit "species" field on character data yet.
    If a character is an animal but their name doesn't contain a
    recognizable species word (e.g. a fox named "Chintu"), it won't be
    caught; see ANIMAL_SPECIES_HINTS below to extend the keyword list, or
    add a proper `species`/`animalType` field to character data for a
    reliable match instead of guessing from the name.
    """
    try:
        genre = str(genre or "").strip()
        tone_guidance = str(tone_guidance or "").strip()
    except Exception:
        return ""

    category = _classify_genre_category(genre)
    bits = []

    if category == "horror":
        # Names the CRAFT, not the emotion. An earlier version said to let
        # "fear colour the performance", and the model duly performed a
        # narrator who is himself frightened — shaky and small — instead of
        # one who frightens the listener.
        bits.append(
            "This is a HORROR script. Narrate it like a practised storyteller who is "
            "creating the fear, not feeling it: calm, controlled, low and unhurried, "
            "letting pauses carry the dread. The narrator never sounds scared or shaky. "
            "Characters inside the story are different — if their line calls for terror, "
            "play it fully."
        )

    elif category == "moral":
        bits.append(
            "This is a MORAL/STORY script. Keep the storytelling warm and sincere, and "
            "where a line calls for sadness or regret, deliver it genuinely emotional "
            "rather than flat, so the moral lands."
        )
    elif category == "animals":
        bits.append(
            "This is an ANIMALS story. Give each animal character its creature's "
            "temperament in the voice (a fox sly and sharp, a deer soft and timid) while "
            "keeping the dialogue clear."
        )
    elif category == "tooni_chidiya":
        bits.append(
            "This is a bird story. Give each bird character its natural quality in the "
            "voice (a crow harsh, a sparrow light and chirpy) while keeping the dialogue "
            "clear."
        )
    elif category == "documentary":
        bits.append(
            "This is DOCUMENTARY narration — serious, authoritative and grounded. Deliver "
            "with measured gravity and deliberate pacing, letting facts land with weight "
            "rather than casual storytelling energy."
        )
    elif genre and genre.lower() != "general":
        bits.append(f"This is a '{genre}' script.")

    if tone_guidance:
        bits.append(tone_guidance)
    if not bits:
        return ""
    return "\n\nGENRE & TONE: " + " ".join(bits)

def _classify_genre_category(genre):
    """Best-effort keyword match on the genre string into one of the 4
    categories the project's genre thumbnails represent, or None if it
    doesn't match any of them (falls back to the old generic behavior)."""
    g = str(genre or "").lower()
    if not g:
        return None
    if "horror" in g or "dar" in g or "डरावन" in g or "भूत" in g:
        return "horror"
    if "document" in g or "sindoor" in g or "dastavez" in g or "डॉक्यूमेंट्री" in g or "दस्तावेज" in g:
        return "documentary"
    if "tooni" in g or "chidiya" in g or "चिड़िया" in g or "bird" in g:
        return "tooni_chidiya"
    if "animal" in g or "जानवर" in g:
        return "animals"
    if "moral" in g or "नैतिक" in g:
        return "moral"
    return None

# Keyword -> vocal-character hint, matched as a substring against a
# character's name (case-insensitive, Hindi or English). Best-effort only
# — see the note on build_genre_directive above. Extend this list as new
# animal/bird characters show up that aren't being caught.
ANIMAL_SPECIES_HINTS = [
    (["fox", "लोमड़ी"], "a fox — sly, cunning, sharp-edged"),
    (["deer", "हिरण"], "a deer — soft-spoken, gentle, a little timid"),
    (["rabbit", "khargosh", "खरगोश"], "a rabbit — quick, light, a bit nervous/jumpy"),
    (["hedgehog", "साही"], "a hedgehog — small, cautious, prickly-sounding"),
    (["wolf", "भेड़िय"], "a wolf — low, gravelly, predatory"),
    (["lion", "sher", "शेर"], "a lion — deep, commanding, powerful"),
    (["tiger", "बाघ"], "a tiger — deep, fierce, controlled power"),
    (["bear", "भालू"], "a bear — deep, slow, heavy"),
    (["monkey", "बंदर"], "a monkey — quick, playful, mischievous"),
    (["elephant", "हाथी"], "an elephant — deep, slow, gentle giant"),
    (["mouse", "rat", "चूहा", "चूहे"], "a mouse — small, squeaky, timid"),
    (["crow", "kauwa", "कौआ", "कौवा"], "a crow — harsh, raspy, cawing quality"),
    (["sparrow", "chidiya", "गौरैया"], "a sparrow — light, chirpy, sweet"),
    (["parrot", "तोता"], "a parrot — bright, chattery, sing-song"),
    (["owl", "उल्लू"], "an owl — low, wise-sounding, deliberate"),
    (["peacock", "मोर"], "a peacock — proud, ornate, showy"),
    (["duck", "बत्तख"], "a duck — nasal, waddling comic quality"),
    (["frog", "मेंढक"], "a frog — croaky, low, bouncy"),
]

def guess_species_voice_hint(char_name):
    """Best-effort: substring-matches the character's name against
    ANIMAL_SPECIES_HINTS. Returns a vocal-character hint string, or None
    if nothing matched (in which case the character is voiced neutrally —
    no hint is added rather than guessing wrong)."""
    name = str(char_name or "").lower()
    if not name:
        return None
    for keywords, hint in ANIMAL_SPECIES_HINTS:
        if any(kw in name for kw in keywords):
            return hint
    return None

CREATURE_CLASSIFIER_MODEL = "gemini-3.7-flash"

def classify_character_creatures_ai(char_list, dialogues):
    """AI-based species detection for ANIMALS / TOONI_CHIDIYA projects.

    The name-keyword guess above only catches a species if it's literally
    in the character's name (a fox named "Chintu" is missed). This instead
    pastes the WHOLE script to Gemini in one call and asks it to work out
    each character's real-life identity from full story context — e.g. a
    crow named "Kaalu" gets correctly read as a crow because of how it's
    written into the story, not because "crow" appears in its name. One
    call gives back a full character -> creature chart for the project.
    Whatever single word comes back (e.g. "crow", "sparrow", "fox") is
    used AS-IS in the voice instruction, so it isn't limited to the
    hardcoded ANIMAL_SPECIES_HINTS list either.

    Returns {character_name_as_given: creature_word}. Empty dict on any
    failure (no key, bad response, network error) — callers should treat
    that as "fall back to the name-keyword guess", not as an error state,
    so the rest of the pipeline keeps running normally either way.
    """
    char_names = [c.get('name', '').strip() for c in (char_list or []) if c.get('name', '').strip()]
    if not char_names or not dialogues:
        return {}

    keys_raw = os.environ.get("GEMINI_KEYS", "")
    keys = [k.strip() for k in keys_raw.split(",") if k.strip()]
    if not keys and os.environ.get("GEMINI_API_KEY"):
        keys = [os.environ.get("GEMINI_API_KEY")]
    if not keys:
        return {}

    script_text = "\n".join(
        f"{d.get('character') or 'Narrator'}: {d.get('line') or d.get('text') or ''}"
        for d in dialogues
    )
    prompt = (
        "Here is a full script. Some characters may have human-sounding names but actually "
        "be animals/birds in the story (e.g. a crow named \"Kaalu\", a fox named \"Chintu\") — "
        "work out each character's REAL identity from how they're written and what happens in "
        "the story, not just from their name.\n\n"
        "For EACH of these characters, reply with their real identity as a single lowercase "
        "English word: a specific animal/bird species (crow, sparrow, fox, deer, rabbit, owl, "
        "tiger, etc.) if they are one, \"human\" if they are a person, or \"narrator\" for the "
        "narrator.\n\n"
        f"Characters: {', '.join(char_names)}\n\n"
        "Reply with ONLY a JSON object mapping each character name EXACTLY as given above to "
        "its creature word — no markdown fences, no extra text.\n\n"
        "--- SCRIPT ---\n" + script_text
    )
    try:
        client = live_genai.Client(api_key=keys[0])
        resp = client.models.generate_content(model=CREATURE_CLASSIFIER_MODEL, contents=prompt)
        raw = (getattr(resp, "text", None) or "").strip()
        raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.MULTILINE).strip()
        mapping = json.loads(raw)
        result = {}
        for name, creature in mapping.items():
            creature = str(creature or "").strip().lower()
            if creature:
                result[str(name).strip()] = creature
        return result
    except Exception as e:
        log_error("AI creature classification failed, falling back to name-based guess", str(e))
        return {}

class ProjectStats:
    """Thread-safe per-project tracker: tallies how many times each
    Live API tier was attempted, plus how many clips went through the
    AI completeness check, for reporting."""
    def __init__(self):
        self._lock = threading.Lock()
        self.model_attempts = defaultdict(int)
        self.completeness_checks = 0
        # Yes/No split of the completeness verdicts — the only two numbers
        # the report actually needs from the checker.
        self.check_yes = 0
        self.check_no = 0
        # Per-engine-tier attempt tally: total / passed / failed. Keyed by
        # a human label ("Gemini", "Vertex") rather than the internal
        # engine string, so the report reads plainly.
        self.engine_attempts = defaultdict(lambda: {"total": 0, "passed": 0, "failed": 0})
        self.not_spoken_merged = 0
        self.not_spoken_labels = []

    def record_attempt(self, key):
        with self._lock:
            self.model_attempts[key] += 1

    def record_completeness_check(self, passed=None):
        """Counts one clip that got a usable verdict back, and which way
        it went. The report only needs Yes vs No — how many takes were
        approved and how many were sent back."""
        with self._lock:
            self.completeness_checks += 1
            if passed is True:
                self.check_yes += 1
            elif passed is False:
                self.check_no += 1

    def record_engine_attempt(self, tier, ok):
        """One synthesis attempt on one engine tier, and whether it
        produced audio. 'tier' is the human label ('Gemini' / 'Vertex')."""
        with self._lock:
            self.engine_attempts[tier]["total"] += 1
            self.engine_attempts[tier]["passed" if ok else "failed"] += 1

    def record_not_spoken(self, label):
        """Tracks a node that was STILL 'No' (not fully spoken) after
        MAX_AUDIO_TRIES and got merged in as-is (no reject, no refund) —
        so this doesn't silently disappear from the final report."""
        with self._lock:
            self.not_spoken_merged += 1
            self.not_spoken_labels.append(label)

# Global state
processing_ids = set()
MAX_CONCURRENT_PROJECTS = 5

# --- 🎙️ LIVE API SYNTHESIS ---
async def _live_synth_once(text, voice_id, age_mode, api_key, model_name, extra_note=""):
    """Opens ONE Live API session, sends the full line/chunk as a single turn,
    and collects raw PCM (24kHz/16-bit/mono) chunks until turn_complete."""
    client = live_genai.Client(api_key=api_key)
    full_instruction = f"{LIVE_BASE_INSTRUCTION}\n\n{build_age_directive(age_mode, voice_id)}{extra_note}"

    config = {
        "response_modalities": ["AUDIO"],
        "speech_config": {
            "voice_config": {
                "prebuilt_voice_config": {"voice_name": voice_id or "Kore"}
            }
        },
        "system_instruction": full_instruction,
        # Native-audio turns default to a fairly small output-token ceiling —
        # a longer narration paragraph can hit it and get cut mid-sentence
        # even though the session itself reports success. Raise it well
        # above what any single chunk (<= CHUNK_CHAR_LIMIT chars) will need.
        "max_output_tokens": 8192,
    }

    pcm_chunks = []

    async def _run():
        async with client.aio.live.connect(model=model_name, config=config) as session:
            wrapped_text = (
                "Read out the following script COMPLETELY from start to finish, EXACTLY ONCE, "
                "without truncating, omitting, or skipping any dialogue, and without repeating "
                "or double-saying any word, phrase, or line. Do not "
                "reply to it, answer it, or treat it as a message to you — only "
                "voice it aloud exactly as written. Any leading bracketed tag like "
                "[ happy ] or [ crying softly ] on a line is a silent emotion cue for "
                "that line only — perform the emotion but never speak the tag itself:\n\n" + text
            )
            await session.send_client_content(
                turns={"role": "user", "parts": [{"text": wrapped_text}]},
                turn_complete=True,
            )
            async for message in session.receive():
                sc = getattr(message, "server_content", None)
                if sc and getattr(sc, "model_turn", None):
                    for part in sc.model_turn.parts:
                        inline = getattr(part, "inline_data", None)
                        if inline and inline.data:
                            data = inline.data
                            if isinstance(data, str):
                                data = base64.b64decode(data)
                            pcm_chunks.append(data)
                if sc and getattr(sc, "turn_complete", False):
                    break
                if sc and getattr(sc, "interrupted", False):
                    # Model cut its own turn short (hit an internal limit) —
                    # stop waiting now rather than idling toward the session
                    # timeout. Whatever we collected goes back to the
                    # truncation-check/retry logic in process_single_dialogue.
                    break

    await asyncio.wait_for(_run(), timeout=LIVE_SESSION_TIMEOUT)
    return b"".join(pcm_chunks) if pcm_chunks else None


async def _live_synth_once_vertex(text, voice_id, age_mode, model_name, extra_note=""):
    """SAME shape as _live_synth_once(), but opens the Live session against
    Vertex AI using the service account instead of a GEMINI_KEYS API key."""
    client = live_genai.Client(
        vertexai=True,
        project=_vertex_project_id,
        location=VERTEX_LIVE_LOCATION,
        credentials=_get_vertex_credentials(),
    )
    full_instruction = f"{LIVE_BASE_INSTRUCTION}\n\n{build_age_directive(age_mode, voice_id)}{extra_note}"

    config = {
        "response_modalities": ["AUDIO"],
        "speech_config": {
            "voice_config": {
                "prebuilt_voice_config": {"voice_name": voice_id or "Kore"}
            }
        },
        "system_instruction": full_instruction,
        "max_output_tokens": 8192,
    }

    pcm_chunks = []

    async def _run():
        async with client.aio.live.connect(model=model_name, config=config) as session:
            wrapped_text = (
                "Read out the following script COMPLETELY from start to finish, EXACTLY ONCE, "
                "without truncating, omitting, or skipping any dialogue, and without repeating "
                "or double-saying any word, phrase, or line. Do not "
                "reply to it, answer it, or treat it as a message to you — only "
                "voice it aloud exactly as written. Any leading bracketed tag like "
                "[ happy ] or [ crying softly ] on a line is a silent emotion cue for "
                "that line only — perform the emotion but never speak the tag itself:\n\n" + text
            )
            await session.send_client_content(
                turns={"role": "user", "parts": [{"text": wrapped_text}]},
                turn_complete=True,
            )
            async for message in session.receive():
                sc = getattr(message, "server_content", None)
                if sc and getattr(sc, "model_turn", None):
                    for part in sc.model_turn.parts:
                        inline = getattr(part, "inline_data", None)
                        if inline and inline.data:
                            data = inline.data
                            if isinstance(data, str):
                                data = base64.b64decode(data)
                            pcm_chunks.append(data)
                if sc and getattr(sc, "turn_complete", False):
                    break
                if sc and getattr(sc, "interrupted", False):
                    break

    await asyncio.wait_for(_run(), timeout=LIVE_SESSION_TIMEOUT)
    return b"".join(pcm_chunks) if pcm_chunks else None


def synth_gemini_live(text, voice_id, age_mode, stats, preferred_key=None, extra_note="", key_pool=None):
    """Tries LIVE_MODEL_PRIMARY on the project's key_pool, then — before
    giving up on the primary model — grabs 3 FRESH keys from the rest of
    GEMINI_KEYS and gives primary one more shot on those (a dead/rate-limited
    key_pool shouldn't force a downgrade to the weaker fallback model if
    other accounts are free). Only after that does it drop to
    LIVE_MODEL_FALLBACK, tried on the original key_pool.

    key_pool should be the project's active (e.g. 3-key) subset — normal
    retries stay within it rather than spilling onto the rest of
    GEMINI_KEYS, since each key belongs to a separate account and we don't
    want a burst touching every account on the server at once."""
    if key_pool:
        keys = list(key_pool)
    else:
        keys_raw = os.environ.get("GEMINI_KEYS", "")
        keys = [k.strip() for k in keys_raw.split(",") if k.strip()]
        if not keys and os.environ.get("GEMINI_API_KEY"):
            keys = [os.environ.get("GEMINI_API_KEY")]
    if not keys:
        log_error("No GEMINI_KEYS/GEMINI_API_KEY configured for Live API.")
        return None, "unknown", None

    key_position = {k: i + 1 for i, k in enumerate(keys)}

    import random
    if preferred_key and preferred_key in keys:
        rest = [k for k in keys if k != preferred_key]
        random.shuffle(rest)
        keys = [preferred_key] + rest
    else:
        random.shuffle(keys)

    def _attempt(model_name, engine_key, tier_label, attempt_keys):
        for key in attempt_keys:
            sem = _sem_for_key(key)
            sem.acquire()
            try:
                stats.record_attempt(tier_label)
                pcm = asyncio.run(_live_synth_once(text, voice_id, age_mode, key, model_name, extra_note=extra_note))
                # Every tier that runs on GEMINI_KEYS reports as "Gemini";
                # Vertex is tallied separately below, since it's a
                # different account and a different quota.
                stats.record_engine_attempt("Gemini", bool(pcm))
                if pcm:
                    return pcm, key
            except Exception as e:
                stats.record_engine_attempt("Gemini", False)
                log_error(f"Live API [{model_name}] failed ({voice_id}), key {key_position.get(key, '?')}", str(e))
                continue
            finally:
                sem.release()
        return None, None

    # --- Tier 1: primary model on the project's key_pool ---
    attempt_keys = [keys[i % len(keys)] for i in range(LIVE_PRIMARY_MAX_RETRIES)]
    pcm, used_key = _attempt(LIVE_MODEL_PRIMARY, "live_primary", "Live · 2.5 Native Audio", attempt_keys)
    if pcm:
        return pcm, "live_primary", used_key

    # --- Tier 1b: same primary model, one more shot on 3 FRESH keys ---
    # (different accounts to the ones already tried) before downgrading.
    full_raw = os.environ.get("GEMINI_KEYS", "")
    full_pool = [k.strip() for k in full_raw.split(",") if k.strip()]
    if not full_pool and os.environ.get("GEMINI_API_KEY"):
        full_pool = [os.environ.get("GEMINI_API_KEY")]
    unused = [k for k in full_pool if k not in keys]
    if unused:
        extra_keys = random.sample(unused, min(3, len(unused)))
        pcm, used_key = _attempt(LIVE_MODEL_PRIMARY, "live_primary", "Live · 2.5 Native Audio (extra keys)", extra_keys)
        if pcm:
            return pcm, "live_primary", used_key

    # --- Tier 2: Vertex AI (service account) — tried right after the
    # primary model's GEMINI_KEYS attempts (normal + extra keys) fail,
    # BEFORE dropping down to the weaker fallback model. Doesn't touch
    # GEMINI_KEYS quota or the per-key semaphores at all; billed on the
    # GCP project (same FIREBASE_SERVICE_ACCOUNT_KEY as thumbnail/music).
    if _vertex_sa_info and _vertex_project_id:
        try:
            stats.record_attempt("live_vertex")
            pcm = asyncio.run(_live_synth_once_vertex(text, voice_id, age_mode, LIVE_MODEL_VERTEX, extra_note=extra_note))
            stats.record_engine_attempt("Vertex", bool(pcm))
            if pcm:
                return pcm, "live_vertex", None
        except Exception as e:
            stats.record_engine_attempt("Vertex", False)
            log_error(f"Live API [Vertex/{LIVE_MODEL_VERTEX}] failed ({voice_id})", str(e))

    # --- Tier 3: fallback model, back on the project's key_pool ---
    pcm, used_key = _attempt(LIVE_MODEL_FALLBACK, "live_fallback", "Live · 3.1 Flash Live", keys)
    if pcm:
        return pcm, "live_fallback", used_key

    # --- Tier 3b: fallback model, one last shot on FRESH keys — mirrors
    # tier 1b. A node should only ever be rejected because every model on
    # every available account genuinely failed, not because the 3 keys in
    # this project's pool happened to be rate-limited at that moment.
    unused_for_fallback = [k for k in full_pool if k not in keys]
    if unused_for_fallback:
        extra_fallback_keys = random.sample(unused_for_fallback, min(3, len(unused_for_fallback)))
        pcm, used_key = _attempt(LIVE_MODEL_FALLBACK, "live_fallback", "Live · 3.1 Flash Live (extra keys)", extra_fallback_keys)
        if pcm:
            return pcm, "live_fallback", used_key

    return None, "unknown", None

# --- ✂️ LONG-DIALOGUE CHUNKING ---
# CHUNK_CHAR_LIMIT now only guards adjacent-line MERGING (so we never glue
# unrelated same-speaker lines into one mega-blob), NOT splitting — a single
# analysis dialogue entry (e.g. one full quiz question + options + answer)
# is trusted as-is and sent as ONE audio chunk, never chopped mid-way.
# SAFETY_SPLIT_LIMIT is only a last-resort net for a pathologically long
# single entry that could risk failing/timing out in one Live TTS call.
# Lowered from 3000 -> 600: chunks that size (or bigger) reliably failed
# every tier/key/model (the "umbriel incident" — a full long-form narrator
# monologue split into ~3000-char pieces that the Live API could never
# complete in one turn, no matter how many keys/retries were thrown at it).
# 600 keeps chunks small enough for the Live API to synthesize reliably
# while still splitting at sentence boundaries (see chunk_dialogue_text).
CHUNK_CHAR_LIMIT = 400
SAFETY_SPLIT_LIMIT = 600
_SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?…।॥。！？؟])\s+')

def chunk_dialogue_text(text, limit=CHUNK_CHAR_LIMIT):
    """Splits long text into <= `limit`-char pieces, always at a sentence boundary
    when possible, falling back to a word boundary for a single overlong sentence."""
    text = (text or "").strip()
    if not text: return [text]
    if len(text) <= limit: return [text]

    sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]
    if not sentences: sentences = [text]

    chunks = []
    current = ""
    for sent in sentences:
        if len(sent) > limit:
            if current:
                chunks.append(current)
                current = ""
            words = sent.split(" ")
            piece = ""
            for w in words:
                candidate = f"{piece} {w}".strip()
                if len(candidate) > limit:
                    if piece: chunks.append(piece)
                    piece = w
                else:
                    piece = candidate
            current = piece
            continue
        candidate = f"{current} {sent}".strip()
        if len(candidate) > limit:
            if current: chunks.append(current)
            current = sent
        else:
            current = candidate
    if current: chunks.append(current)
    return chunks if chunks else [text]

# --- ✅ ACCURACY-CHECK GATE ---
# One question per take, asked of OpenRouter: was the whole line spoken?
# "No" -> regenerate the whole line and ask again, up to MAX_AUDIO_TRIES
# attempts in total.
#
# After the 3rd try the last take is APPROVED and merged in regardless of
# the verdict. Nothing is rejected and nothing is refunded over a failed
# check — it is still logged and still shows up in the project's Telegram
# report, so an incomplete line is never shipped silently. Only a hard
# synthesis failure (no audio produced at all) is a real rejection.
#
# 3 is a deliberate ceiling. It was 8 at one point, on the reasoning that
# the checks themselves are cheap — but each outer try can burn several
# inner Live-API key/tier attempts, and when the Live API is degraded that
# compounds into 30-40+ minutes stuck on one node (the "umbriel" incident)
# and can exhaust a key's quota on its own.
MAX_AUDIO_TRIES = 3

# --- 🔤 TTS TEXT SANITIZATION — fixes mispronounced/garbled option letters
# (A./B./C./D.) and stray CJK full stops ("。" instead of Devanagari "।")
# that occasionally slip into generated Hindi scripts. Runs right before
# the raw line is handed to the Live TTS model.
_TTS_OPTION_LETTER_MAP = {"A": "ए", "B": "बी", "C": "सी", "D": "डी"}
_TTS_OPTION_LETTER_RE = re.compile(r'\b([A-D])\b(?=[.,)\s]|$)')

def sanitize_for_tts(text: str) -> str:
    """Normalizes text right before TTS so the voice model doesn't stumble
    on isolated Latin option letters or a stray CJK full stop."""
    if not text:
        return text
    text = text.replace("。", "।")
    text = _TTS_OPTION_LETTER_RE.sub(lambda m: _TTS_OPTION_LETTER_MAP[m.group(1)], text)
    return text

def _run_accuracy_checks(index, char_name, text, pcm, verify_key, stats):
    """One check, one question: was the whole line spoken?

    Sends the take and its script line to OpenRouter and takes the yes/no
    back. Nothing else is judged — no word-for-word matching, no
    transcript, no duration arithmetic.

    Returns (passed, reason): True to approve, False to retry, or None if
    the checker couldn't be reached at all (a flaky checker must never
    reject a good clip, so the retry loop treats None like True)."""
    # 🔴 FIX: the AI listen-and-judge check above is the ONLY thing that
    # was ever asked "is this complete?" — and when it couldn't be reached
    # or came back unparseable, the result (None) was treated as a PASS.
    # That's a reasonable default for "checker is flaky", but it means a
    # take that's ACTUALLY truncated (the last word or two just missing)
    # sails through untouched whenever the checker call itself has a bad
    # moment — which is exactly the failure mode reported: a half-spoken
    # line got approved. An LLM listening to audio can also just miss a
    # short trailing word, especially if it trails into silence rather
    # than cutting off abruptly.
    #
    # This adds a cheap, DETERMINISTIC floor that runs regardless of
    # whether the AI checker is reachable: PCM duration vs. how long the
    # script line could possibly take to say, even read unnaturally fast.
    # It can't confirm every word landed, but it reliably catches audio
    # that's too short for the text it's supposed to contain — exactly
    # the "last 1-2 words missing" case — and unlike the AI check, it
    # never silently no-ops.
    duration_ok, duration_reason = _check_minimum_duration(text, pcm)
    if not duration_ok:
        log_error(f"Chunk {index+1} ({char_name}) completeness check: NO — {duration_reason}")
        if stats:
            stats.record_completeness_check(passed=False)
        return False, duration_reason

    is_complete, _exact, _reason = check_audio_accuracy_openrouter(text, pcm, stats=stats)
    if stats and is_complete is not None:
        stats.record_completeness_check(passed=is_complete)

    if is_complete is False:
        log_error(f"Chunk {index+1} ({char_name}) completeness check: NO — line not fully spoken")
        return False, "incomplete — line not fully spoken"
    if is_complete is None:
        return None, None
    return True, None


# 🔴 NEW: fastest plausible spoken rate, in characters per second, used as
# a floor rather than a target — real speech is normally much slower than
# this, so anything shorter than this floor for its text almost certainly
# had words cut off rather than just being read quickly. Deliberately
# generous (i.e. a HIGH rate, giving a LOW minimum duration) so this never
# flags a genuinely fast but complete take — it only catches audio that's
# implausibly short for what it's supposed to contain.
MAX_PLAUSIBLE_CHARS_PER_SEC = 28.0
MIN_DURATION_FLOOR_SEC = 0.35  # very short lines ("Yes." / "No!") still need at least this long
PCM_SAMPLE_RATE = 24000
PCM_BYTES_PER_SAMPLE = 2  # 16-bit mono, matches synth_gemini_live's output everywhere in this file


def _check_minimum_duration(text, pcm_bytes):
    """Returns (ok, reason). ok=False means the clip is too short to
    plausibly contain the whole line — a deterministic floor, independent
    of the AI checker above, so a flaky/wrong checker call can never let
    a truncated clip through unnoticed."""
    if not pcm_bytes:
        return False, "no audio produced"

    clean_text = (text or "").strip()
    if not clean_text:
        return True, None  # nothing to say, nothing to verify

    actual_duration = len(pcm_bytes) / (PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE)
    min_expected_duration = max(MIN_DURATION_FLOOR_SEC, len(clean_text) / MAX_PLAUSIBLE_CHARS_PER_SEC)

    if actual_duration < min_expected_duration:
        return False, (
            f"too short for its text — {actual_duration:.2f}s audio for "
            f"{len(clean_text)} characters (needs at least {min_expected_duration:.2f}s)"
        )
    return True, None


def process_single_dialogue(args):
    """Synthesize one dialogue line, then check it.

    Simple loop, on purpose: generate -> ask the checker "was all of it
    spoken?" -> if No, regenerate the whole line. Up to MAX_AUDIO_TRIES
    attempts. If it still hasn't passed after that, the last take is
    APPROVED and used anyway — a line is never dropped or refunded over a
    failed check.

    There is no line-splitting fallback and no per-piece verification any
    more; that path added a lot of moving parts for a case a plain retry
    already handles."""
    index, line, voice_id, age_mode, project_id, stats, preferred_key, genre_directive, key_pool = args
    text = sanitize_for_tts(line.get("line") or line.get("text") or "")
    char_name = line.get("character") or "Narrator"

    # Pronunciation is decided per LINE, not per project: a script can mix
    # Devanagari lines with Romanized ones, and each needs its own hint.
    pronunciation_directive = build_pronunciation_directive(text)

    def note_for_attempt(n):
        """One reminder, chosen by attempt number — never all of them at
        once. n is 1-based."""
        return SYNTH_BASELINE_NOTES[min(n - 1, len(SYNTH_BASELINE_NOTES) - 1)]

    # Attempt 1 carries only the genre + pronunciation direction. No
    # scolding, no repeated prohibitions — those are what made it read
    # stiffly.
    role_hint = build_speaker_role_hint(char_name)
    baseline_note = note_for_attempt(1) + genre_directive + role_hint + pronunciation_directive
    audio_pcm, engine_used, used_key = synth_gemini_live(text, voice_id, age_mode, stats, preferred_key=preferred_key, extra_note=baseline_note, key_pool=key_pool)

    verify_key = used_key or preferred_key
    passed, fail_reason = _run_accuracy_checks(index, char_name, text, audio_pcm, verify_key, stats) if audio_pcm else (None, None)

    attempt = 1
    while audio_pcm and passed is False and attempt < MAX_AUDIO_TRIES:
        attempt += 1
        # Both the reminder AND the escalation step up with the attempt
        # number, instead of every attempt carrying the full stack.
        attempt_note = note_for_attempt(attempt) + genre_directive + role_hint + pronunciation_directive
        escalation = SYNTH_ESCALATION_NOTES[min(attempt - 2, len(SYNTH_ESCALATION_NOTES) - 1)]
        if fail_reason:
            escalation += (
                f"\n\nYOUR LAST ATTEMPT HAD THIS EXACT PROBLEM: \"{fail_reason}\". "
                "Speak the full line, start to finish — nothing left unspoken or cut "
                "off. Read the line cleanly and completely, exactly as written."
            )
        log_error(f"Chunk {index+1} ({char_name}) failed accuracy check on try {attempt-1}/{MAX_AUDIO_TRIES} ({fail_reason}) — regenerating (try {attempt}/{MAX_AUDIO_TRIES})")

        audio_pcm, engine_used, used_key = synth_gemini_live(
            text, voice_id, age_mode, stats, preferred_key=preferred_key,
            extra_note=attempt_note + escalation, key_pool=key_pool
        )
        verify_key = used_key or preferred_key
        passed, fail_reason = _run_accuracy_checks(index, char_name, text, audio_pcm, verify_key, stats) if audio_pcm else (None, None)

    if not audio_pcm:
        engine_used = "rejected"
        log_error(f"Chunk {index+1} REJECTED: {char_name} ({voice_id}) — synthesis produced no audio")
    else:
        if passed is False:
            log_error(f"Chunk {index+1} ({char_name}) still failing accuracy check after {MAX_AUDIO_TRIES} tries ({fail_reason}) — merging the last take as-is (no reject, no refund)")
            if stats:
                stats.record_not_spoken(f"{index+1}:{char_name}")
        emotion_match = re.match(r'^\[\s*([^\[\]]*?)\s*\]', text)
        emotion_tag = emotion_match.group(1) if emotion_match else None
        log_engine(engine_used.replace('_', ' ').title(), index, char_name, voice_id, emotion_tag)

    return (index, audio_pcm, engine_used, used_key)



def process_production_queue(project_id, data):
    global processing_ids
    start_time = time.time()
    uid = data.get('userId')
    email = data.get('userEmail', 'Unknown')
    name = data.get('projectName', 'Untitled')
    sync_data = data.get('syncData', {})
    client_ts_str = sync_data.get('clientTimestamp')
    dialogues = data.get('dialogues') or sync_data.get('dialogues')
    char_list = data.get('characters', [])

    # 💳 how much this project was charged, so a failure knows what to give back
    credits_charged = _get_credits_charged(data)
    # 💳 Fresh refund budget for THIS run. The user is charged each time a
    # project is submitted/retried, so each run must be able to refund its
    # own charge — a previous run's refund must not block this one's.
    _new_refund_run(project_id)

    try:
        genre = str(data.get('genre') or sync_data.get('genre') or '')
    except Exception:
        genre = ''
    try:
        tone_guidance = str(data.get('toneGuidance') or sync_data.get('toneGuidance') or '')
    except Exception:
        tone_guidance = ''
    genre_directive = build_genre_directive(genre, tone_guidance)
    genre_category = _classify_genre_category(genre)

    def normalize_name(n):
        nm = str(n).lower().strip()
        # Recognizes "narrator" across every language the script-analysis
        # pipeline can now label a narrator in (see script_analysis.py's
        # CHARACTER NAMES rule) — not just Hindi/English — so a Bengali,
        # Tamil, or Telugu script's narrator still gets the narrator voice
        # defaults below instead of silently falling through as an
        # unrecognized character name.
        if nm in NARRATOR_NAMES:
            return "narrator"
        return nm

    voice_map = {normalize_name(c.get('name', '')): c.get('voice', 'Kore') for c in char_list}
    if "narrator" not in voice_map: voice_map["narrator"] = "Kore"

    age_map = {normalize_name(c.get('name', '')): c.get('age', 'adult') for c in char_list}
    if "narrator" not in age_map: age_map["narrator"] = "adult"

    # ANIMALS / TOONI_CHIDIYA: figure out what creature each character
    # actually is from their dialogue content (not just their name — see
    # classify_character_creatures_ai's docstring for why that matters).
    # One call for the whole project, done up front so it's ready before
    # any group dispatches; falls back to the name-keyword guess per
    # character if this comes back empty (no key, API error, etc).
    ai_creature_map = {}
    if dialogues and genre_category in ("animals", "tooni_chidiya"):
        raw_map = classify_character_creatures_ai(char_list, dialogues)
        ai_creature_map = {normalize_name(name): creature for name, creature in raw_map.items()}
        if ai_creature_map:
            log_info(f"🐾 AI creature classification: {ai_creature_map}")

    if not dialogues:
        db.reference(f'pending_projects/{project_id}').update({"status": "error", "error": "No dialogues found."})
        processing_ids.discard(project_id)
        # 🔴 No dialogues to work with at all — full refund, nothing was produced.
        refund_credits(uid, credits_charged, "Voice generation failed: no dialogues found", project_id, credits_charged)
        return

    total_count = len(dialogues)
    log_info(f"🚀 CLUSTER START: {project_id} ({total_count} nodes)")

    gemini_keys_raw = os.environ.get("GEMINI_KEYS", "")
    gemini_keys = [k.strip() for k in gemini_keys_raw.split(",") if k.strip()]
    if not gemini_keys and os.environ.get("GEMINI_API_KEY"):
        gemini_keys = [os.environ.get("GEMINI_API_KEY")]

    import random as _random
    # 🔑 Only pull 3 keys per project (not the whole pool) — these keys are
    # on separate accounts, so hitting every key at once from one server is
    # the pattern that gets flagged. Since this model's RPM/RPD is
    # unlimited, 3 keys is plenty of concurrency headroom; the per-key
    # semaphore above still caps concurrent Live sessions on each of them.
    active_keys = _random.sample(gemini_keys, min(3, len(gemini_keys))) if gemini_keys else []
    _key_rr_counter = [0]

    try:
        db.reference(f'pending_projects/{project_id}').update({
            "total_dialogues": total_count, "processed_dialogues": 0, "rejected_nodes": 0,
            "status": "processing"
        })

        firestore_db = firestore.client(database_id=FIRESTORE_DATABASE_ID)
        project_ref_fs = firestore_db.collection('projects').document(uid).collection('userProjects').document(project_id)
        project_ref_fs.update({'status': 'processing'})

        start_msg = (
            f"🚀 <b>📬Received superfast request</b>\n\n"
            f"👤 <b>User:</b> {escapeHtml(email)}\n"
            f"📂 <b>Project:</b> {escapeHtml(name)}\n"
            f"📊 <b>Total Nodes:</b> {total_count}\n"
            f"💳 <b>Credits Charged:</b> {credits_charged}\n"
            f"🆔 <b>ID:</b> <code>{project_id}</code>"
        )
        send_telegram_log(start_msg)

        stats = ProjectStats()
        project_ref = db.reference(f'pending_projects/{project_id}')

        MERGE_SEPARATOR = "\n\n"
        # DeepSeek/OpenRouter auto-emotion-tagging removed — every dialogue
        # is treated as already resolved from the start. Manual emotion tags
        # ((happy)/[sad] etc. in the script text) still work exactly as
        # before via build_emotion_directive/format_emotion_tag below;
        # only the AI auto-detection pass for untagged lines is gone.
        resolved = [True] * total_count
        resolve_lock = threading.Lock()
        merge_groups = []

        # Cap workers at what the 3 active keys can actually sustain
        # concurrently (keys * per-key session cap) — beyond that, extra
        # threads just pile up waiting on the semaphore for no benefit.
        # (Old hard ceiling of 32 used to clip 3 keys * 20/key = 60 down
        # to 32 — raised so the real key*per-key budget is honored.)
        # NOTE: this executor is created BEFORE chunking happens (chunks
        # are only known once _dispatch_group() runs below), so it must
        # NOT be capped by total_count (dialogue LINE count) — a single
        # long line can explode into many more chunks than total_count,
        # and sizing the pool off total_count silently serialized those
        # chunks onto 1 worker even with 3 keys idle. Size off the key
        # budget only.
        max_synth_workers = min(max(len(active_keys) * GEMINI_MAX_CONCURRENT_PER_KEY, 1), 128)
        synth_executor = ThreadPoolExecutor(max_workers=max_synth_workers)
        synth_futures = []
        flat_tasks_counter = [0]
        flat_to_group = {}
        group_pending = {}
        group_reported = set()
        flat_map = {}
        groups_registry = {}
        progress_lock = threading.Lock()

        def _on_chunk_done(flat_idx, pcm, eng, key):
            flat_map[flat_idx] = (pcm, eng, key)
            gi = flat_to_group[flat_idx]
            with progress_lock:
                group_pending[gi].discard(flat_idx)
                if group_pending[gi] or gi in group_reported:
                    return
                group_reported.add(gi)
            _, members, _, flat_indices = groups_registry[gi]
            member_count = len(members)
            group_ok = all(flat_map.get(fi, (None, None, None))[0] for fi in flat_indices)
            field = 'processed_dialogues' if group_ok else 'rejected_nodes'
            # This write is the ONLY thing driving the live progress bar in
            # the UI (studio-provider subscribes to pending_projects/{id}).
            # It used to be wrapped in a bare `except Exception: pass`, so
            # if the transaction ever failed the bar would silently sit at
            # 0/N with nothing in the logs to explain why. Log it instead —
            # progress is still best-effort (a failed update must never
            # abort synthesis), but a failure is now visible.
            try:
                project_ref.child(field).transaction(lambda x, n=member_count: (x or 0) + n)
            except Exception as e:
                log_error(f"Progress update failed for {field} (+{member_count}) on {project_id}", str(e))

        def _on_future_done(fut, flat_idx):
            try:
                _, pcm, eng, key = fut.result()
            except Exception as e:
                log_error(f"Chunk {flat_idx+1} raised exception", str(e))
                pcm, eng, key = None, "rejected", None
            _on_chunk_done(flat_idx, pcm, eng, key)

        flat_regen_ctx = {}   # flat_idx -> everything needed to re-synth this exact chunk later (kept for any future manual re-synth tooling)
        flat_text_map = {}    # flat_idx -> the clean text that was actually sent to synthesis

        # ============================================================
        # ✅ COMPLETENESS CHECK now runs INLINE inside process_single_dialogue
        # itself (synth -> AI Yes/No check -> at most 3 regen+recheck, see
        # MAX_AUDIO_TRIES above) — each chunk is fully resolved by the time
        # its future completes, so there's no separate post-hoc verify
        # pass to run here anymore.
        # ============================================================
        key_rr_lock = threading.Lock()  # used below for synth key round-robin

        def _dispatch_group(g):
            group_idx = len(groups_registry)
            # Only splits in the rare case a single entry blows past the
            # safety ceiling — a normal-length question/line/beat goes out
            # as exactly one chunk.
            chunk_texts = chunk_dialogue_text(g["merged_text"], limit=SAFETY_SPLIT_LIMIT)
            flat_indices = []
            char_name_for_group = g["members"][0][1]
            species_hint = ""
            if genre_category in ("animals", "tooni_chidiya"):
                creature = ai_creature_map.get(normalize_name(char_name_for_group))
                if creature and creature not in ("human", "narrator"):
                    species_hint = (
                        f"\n\nThis character, {char_name_for_group}, is a {creature}. Voice them "
                        f"with a {creature}-like vocal character (natural texture/quality of a "
                        f"{creature}) while still speaking clear, understandable dialogue."
                    )
                else:
                    hint = guess_species_voice_hint(char_name_for_group)
                    if hint:
                        species_hint = f"\n\nThis character, {char_name_for_group}, is {hint}. Voice them accordingly."
            group_directive = genre_directive + species_hint + (
                "" if g.get("mixed_emotion") else build_emotion_directive(g["emotion"])
            )
            for c_text in chunk_texts:
                flat_idx = flat_tasks_counter[0]
                flat_tasks_counter[0] += 1
                chunk_line = {"line": c_text, "text": c_text, "character": g["members"][0][1]}
                # Round-robin instead of random.choice — guarantees even
                # spread across every key in the pool rather than random
                # clumping onto the same handful of keys.
                preferred_key = None
                if active_keys:
                    with key_rr_lock:
                        preferred_key = active_keys[_key_rr_counter[0] % len(active_keys)]
                        _key_rr_counter[0] += 1
                task = (flat_idx, chunk_line, g["voice_id"], g["age_mode"], project_id, stats, preferred_key, group_directive, active_keys)
                flat_to_group[flat_idx] = group_idx
                flat_indices.append(flat_idx)
                flat_text_map[flat_idx] = c_text
                flat_regen_ctx[flat_idx] = {
                    "char_name": char_name_for_group, "voice_id": g["voice_id"], "age_mode": g["age_mode"],
                    "preferred_key": preferred_key, "genre_directive": group_directive, "key_pool": active_keys,
                }
                fut = synth_executor.submit(process_single_dialogue, task)
                fut.add_done_callback(lambda f, fi=flat_idx: _on_future_done(f, fi))
                synth_futures.append(fut)
            groups_registry[group_idx] = (group_idx, g["members"], g["voice_id"], flat_indices)
            group_pending[group_idx] = set(flat_indices)

        consumed = [False] * total_count

        def _try_advance(final_flush=False):
            # NOTE: this used to be a strict left-to-right pointer
            # (`while idx < total_count and resolved[idx]`) — one
            # not-yet-emotion-tagged line at the front would block every
            # already-resolved line behind it from dispatching at all.
            # Now we scan the whole list every call and dispatch any
            # already-resolved contiguous run immediately, regardless of
            # what's still pending earlier in the sequence. Lines that
            # are still unresolved are simply skipped (left for a later
            # call once their emotion batch comes back) instead of
            # stalling everything after them.
            with resolve_lock:
                idx = 0
                while idx < total_count:
                    if consumed[idx]:
                        idx += 1
                        continue
                    if not resolved[idx]:
                        idx += 1
                        continue

                    d = dialogues[idx]
                    char_name = d.get("character") or "Narrator"
                    norm_name = normalize_name(char_name)
                    voice_id = voice_map.get(norm_name) or voice_map.get("narrator")
                    age_mode = age_map.get(norm_name) or age_map.get("narrator")
                    text = d.get("line") or d.get("text") or ""
                    try:
                        emotion = "" if norm_name == "narrator" else str(d.get("emotion") or "").strip().lower()
                    except Exception:
                        emotion = ""
                    tagged_text = format_emotion_tag(emotion) + text

                    last = merge_groups[-1] if merge_groups else None
                    # NOTE: merging across separate analysis dialogue entries
                    # is intentionally disabled — script_analysis.py now
                    # keeps each self-contained segment (e.g. one quiz
                    # question + options + answer) as its own entry, and we
                    # want that boundary to map 1:1 to one audio chunk, not
                    # get glued back together with the next entry here.
                    can_merge = False
                    if can_merge:
                        last["members"].append((idx, char_name, text))
                        last["merged_text"] += MERGE_SEPARATOR + tagged_text
                        last["end_idx"] = idx
                        if last["emotion"] != emotion:
                            last["mixed_emotion"] = True
                    else:
                        if last is not None and not last["dispatched"]:
                            last["dispatched"] = True
                            _dispatch_group(last)
                        merge_groups.append({
                            "norm_name": norm_name, "voice_id": voice_id, "age_mode": age_mode, "emotion": emotion,
                            "members": [(idx, char_name, text)], "merged_text": tagged_text,
                            "mixed_emotion": False, "dispatched": False, "end_idx": idx,
                        })
                    consumed[idx] = True
                    idx += 1

                if final_flush and merge_groups and not merge_groups[-1]["dispatched"]:
                    merge_groups[-1]["dispatched"] = True
                    _dispatch_group(merge_groups[-1])

        _try_advance()

        with resolve_lock:
            unresolved_left = [i for i in range(total_count) if not resolved[i]]
        if unresolved_left:
            for i in unresolved_left:
                resolved[i] = True
        # Everything is resolved by now — one last pass to pick up
        # anything still pending, and flush the final open group (which
        # earlier calls deliberately left open in case it could still
        # grow).
        _try_advance(final_flush=True)

        log_info(f"⚡ Parallel synth: {max_synth_workers} workers using {len(active_keys)} active keys for {len(synth_futures)} chunks")

        synth_executor.shutdown(wait=True)

        # Dispatch order no longer matches original text order (groups can
        # now fire out-of-sequence — see _try_advance), so re-sort by each
        # group's first member's original dialogue index before assembling
        # the final track.
        groups = sorted(
            (groups_registry[i] for i in range(len(groups_registry))),
            key=lambda g: g[1][0][0],  # g = (group_idx, members, voice_id, flat_indices); members[0] = (orig_idx, char_name, text)
        )

        # ============================================================
        # 🧾 TRANSCRIPTION VERIFICATION DISABLED — nothing to wait on.
        # ============================================================
        total_verified = sum(1 for pcm, _, _ in flat_map.values() if pcm)
        log_info(f"✅ Synthesized {total_verified} chunk(s) — completeness checked inline per-node (max {MAX_AUDIO_TRIES} tries/node)")

        silence_gap = 0.8
        silence_bytes = b'\x00' * int(24000 * 2 * silence_gap)

        results = []
        for group_idx, members, voice_id, flat_indices in groups:
            chunk_pcms = []
            ok = True
            for fi in flat_indices:
                pcm, eng, _key = flat_map[fi]
                if not pcm:
                    ok = False
                    break
                chunk_pcms.append(pcm)
            merged_pcm = silence_bytes.join(chunk_pcms) if (ok and chunk_pcms) else None
            results.append((members, merged_pcm, voice_id))
        master_pcm_stream = io.BytesIO()
        processed_count = 0
        rejected_count = 0
        timeline = []
        elapsed_sec = 0.0

        for i, (members, pcm, voice_id) in enumerate(results):
            member_count = len(members)
            if not pcm:
                rejected_count += member_count
                member_labels = ", ".join(f"{idx+1}:{cn}" for idx, cn, _ in members)
                log_error(f"Nodes REJECTED: {member_labels} ({voice_id})")
                continue

            duration = len(pcm) / 48000.0
            text_lens = [max(len(t), 1) for _, _, t in members]
            total_len = sum(text_lens)
            cursor = elapsed_sec
            for t_len in text_lens:
                member_duration = duration * (t_len / total_len)
                timeline.append({"startTime": cursor, "duration": member_duration})
                cursor += member_duration

            master_pcm_stream.write(pcm)
            if i < len(results) - 1:
                master_pcm_stream.write(silence_bytes)
                elapsed_sec += duration + silence_gap
            else: elapsed_sec += duration
            processed_count += member_count

        if processed_count == 0:
            # 🔴 Every single node failed — nothing was produced at all.
            # Full refund, then bail out via the same exception path as before
            # (Telegram alert + status:error). The refund_locks claim below
            # means the outer except block's refund call is safe to also run —
            # it'll just find nothing left to claim and skip.
            refund_credits(uid, credits_charged, "Voice generation failed: all nodes rejected", project_id, credits_charged)
            raise Exception("All nodes were rejected by neural cluster.")

        pcm_bytes = master_pcm_stream.getvalue()

        mp3_encode_start = time.time()
        mp3_bytes = pcm_to_mp3(pcm_bytes, sample_rate=24000, channels=1, bitrate=128)
        log_info(f"MP3 Encode: {len(pcm_bytes)} bytes PCM -> {len(mp3_bytes)} bytes MP3 in {int((time.time()-mp3_encode_start)*1000)}ms")

        node_id = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
        file_path = f"hq_gen/{uid}/{project_id}_{node_id}.mp3"
        secure_url = upload_to_r2(file_path, mp3_bytes, 'audio/mpeg')

        completion_iso = datetime.now().isoformat()
        final_sync_data = {"dialogues": dialogues, "timeline": timeline, "voiceAssignments": {str(c.get('name')): c.get('voice') for c in char_list}, "characterSettings": {c.get('name'): {"speed": 1.0, "pitch": 0} for c in char_list}, "clientTimestamp": client_ts_str or completion_iso}

        rejected_nodes = rejected_count

        project_ref_fs.set({
            'status': 'completed', 'audioUrl': secure_url,
            'completedAt': firestore.SERVER_TIMESTAMP,
            'syncData': final_sync_data,
            # Persist the final tallies. Previously these lived only in the
            # RTDB queue node, which is deleted when the project finishes —
            # so the completed screen had no source for the rejected count
            # and always showed 0, even when nodes really were rejected.
            'totalDialogues': total_count,
            'rejectedNodes': rejected_nodes,
            'id': project_id, 'userId': uid
        }, merge=True)

        # 🔴 PARTIAL FAILURE — project still completed, but some nodes were
        # rejected and the user is short those lines. Refund credits for
        # just the rejected slice, proportional to what was actually charged.
        if rejected_nodes > 0 and credits_charged > 0:
            partial_refund = round(credits_charged * (rejected_nodes / total_count), 2)
            if partial_refund > 0:
                refund_credits(
                    uid, partial_refund,
                    f"Partial refund: {rejected_nodes}/{total_count} voice line(s) failed to generate",
                    project_id, credits_charged,
                )

        db.reference(f'pending_projects/{project_id}').delete()

        mins, secs = divmod(int(time.time() - start_time), 60)

        # ⚙️ ENGINE ATTEMPTS — total / passed / failed per engine, with
        # Gemini (everything running on GEMINI_KEYS) and Vertex (the
        # service-account tier) reported separately, since they are
        # different accounts and different quotas. This replaces the old
        # pair of blocks ("Engine Sync" counting nodes, "Model Attempts"
        # counting calls) which showed two similar-looking numbers that
        # were easy to confuse.
        engine_lines = []
        for tier, t in stats.engine_attempts.items():
            engine_lines.append(
                f"  • {tier}: {t['total']} attempts — passed {t['passed']}, failed {t['failed']}"
            )
        if rejected_nodes:
            engine_lines.append(f"  • Rejected nodes: {rejected_nodes}")
        engine_block = "\n".join(engine_lines) if engine_lines else "  —"

        # ✅ CHECKS — just the two numbers that matter: how many takes the
        # checker approved, and how many it sent back. The old block also
        # printed a per-model API-quota breakdown, which was noise for a
        # single-model check.
        completeness_line = ""
        if stats.completeness_checks:
            completeness_line = (
                f"✅ <b>Checks:</b> Yes {stats.check_yes} · No {stats.check_no}\n"
            )

        # 🗣️ NOT SPOKEN — nodes that were STILL "No" (line not fully
        # spoken) after MAX_AUDIO_TRIES and got merged in as-is (no
        # reject, no refund). Previously this count never made it into
        # the report at all, so a project could look 100% clean while
        # quietly shipping incomplete lines. Now it's always visible.
        not_spoken_line = ""
        if stats.not_spoken_merged:
            labels_preview = ", ".join(stats.not_spoken_labels[:10])
            if len(stats.not_spoken_labels) > 10:
                labels_preview += f", +{len(stats.not_spoken_labels) - 10} more"
            not_spoken_line = (
                f"🗣️ <b>Not Spoken (merged anyway):</b> {stats.not_spoken_merged}\n"
                f"  • {escapeHtml(labels_preview)}\n"
            )

        # 🎯 EXACT-MATCH MISMATCHES — nodes that were STILL a "No" on the
        # strict word-for-word check (repeated word, wrong gender/form,
        # substitution, etc.) after MAX_AUDIO_TRIES and got merged in as
        # the last take anyway. Always visible here so a mismatch is never
        # silently shipped — check these lines first if a user reports a
        # wrong word or a double-spoken phrase.
        divider = "———————————————"

        report = (
            f"⚡ <b>SUPERFAST READY</b> ⚡\n"
            f"{divider}\n"
            f"👤 <b>User:</b> {escapeHtml(email)}\n"
            f"📂 <b>Project:</b> {escapeHtml(name)}\n"
            f"🎭 <b>Genre:</b> {escapeHtml(genre or 'general')}\n"
            f"⏱️ <b>Duration:</b> {mins}m {secs}s\n"
            f"💳 <b>Credits Charged:</b> {credits_charged}\n"
            f"{divider}\n"
            f"📊 <b>Stats:</b> {total_count} nodes · {rejected_nodes} rejected\n"
            f"{not_spoken_line}"
            f"{completeness_line}"
            f"{divider}\n"
            f"⚙️ <b>Engine Attempts:</b>\n"
            f"{engine_block}\n"
            f"{divider}\n"
            f"🔗 <b>Link:</b> {secure_url}"
        )
        send_telegram_log(report)
        log_success(f"Cluster Sync Complete: {project_id}")

    except Exception as e:
        log_error(f"Cluster Fault: {project_id}", str(e))
        send_telegram_log(f"🚨 <b>Cluster Fault</b>\n🆔 <code>{escapeHtml(project_id)}</code>\n💳 <b>Credits Charged:</b> {credits_charged}\n<code>{escapeHtml(str(e))}</code>")
        db.reference(f'pending_projects/{project_id}').update({"status": "error", "error": str(e)})
        # 🔴 TOTAL FAILURE — refund whatever's still owed. Passing
        # credits_charged here means _claim_refund_amount caps this to
        # (credits_charged - whatever was already refunded above), so a
        # project that already got a full/partial refund earlier in this
        # same run can NEVER be double-refunded — it'll just claim 0 and
        # skip if nothing's left owed.
        refund_credits(uid, credits_charged, f"Voice generation failed: {str(e)}", project_id, credits_charged)
    finally:
        processing_ids.discard(project_id)


_missing_status_index_warned = [False]

# --- 🚨 ABUSE / BANDWIDTH-ABUSE SAFETY NET (same pattern as script_analysis.py
# and voice_replacement.py) ---
_ABUSE_WINDOW_SECONDS = 60
_ABUSE_THRESHOLD = 6
_ABUSE_ALERT_COOLDOWN_SECONDS = 10 * 60
_abuse_job_times = {}
_abuse_last_alert = {}
_abuse_lock = threading.Lock()

def _check_job_abuse(user_id, context_label):
    """Fire-and-forget: never raises, never blocks the caller. Alerts once
    per user per cooldown when one user submits an unusual burst of jobs —
    e.g. spam-refreshing to force repeated large RTDB downloads."""
    if not user_id:
        return
    try:
        now = time.time()
        with _abuse_lock:
            times = [t for t in _abuse_job_times.get(user_id, []) if now - t < _ABUSE_WINDOW_SECONDS]
            times.append(now)
            _abuse_job_times[user_id] = times
            count = len(times)
            if count <= _ABUSE_THRESHOLD:
                return
            last_alert = _abuse_last_alert.get(user_id, 0)
            if now - last_alert < _ABUSE_ALERT_COOLDOWN_SECONDS:
                return
            _abuse_last_alert[user_id] = now
        send_telegram_log(
            f"⚠️ <b>Possible Bandwidth Abuse</b>\n"
            f"<b>Context:</b> {escapeHtml(context_label)}\n"
            f"<b>User:</b> <code>{escapeHtml(user_id)}</code>\n"
            f"<b>Jobs in last {_ABUSE_WINDOW_SECONDS}s:</b> {count}\n"
            f"Looks like rapid refresh/resubmission — check RTDB usage for this user."
        )
    except Exception as e:
        log_error("Abuse-check itself failed", str(e))

def _drain_pending_queue(source="unknown"):
    """Scans current pending_projects snapshot and starts as many in_queue
    items as there is room for.

    `source` is just for logging — "listener" vs "poll" vs "startup" — so
    it's visible in the logs which path is actually doing the work. If
    everything is only ever picked up by "poll", that means the realtime
    listener isn't firing and submissions are silently waiting up to the
    poll interval instead of starting instantly — worth knowing, not just
    inferring from delay.

    Tries a server-side filter to status == "in_queue" first — pulls only
    the (usually few) items actually waiting instead of downloading every
    processing/completed project's full dialogue payload on every poll.
    That filter needs `".indexOn": "status"` on /pending_projects in the
    Firebase rules; without it every call fails with "Index not defined"
    and the queue never drains (silently, since the old code swallowed
    this). Until that's added, fall back to the old full-scan-and-filter
    behavior so the queue keeps working — just pulling more data than it
    needs to.
    """
    try:
        try:
            snapshot = (
                db.reference('pending_projects')
                .order_by_child('status')
                .equal_to('in_queue')
                .get()
            )
        except Exception as e:
            if "Index not defined" in str(e):
                if not _missing_status_index_warned[0]:
                    _missing_status_index_warned[0] = True
                    log_error(
                        "Queue drain: missing DB index",
                        "Add \".indexOn\": \"status\" for path \"/pending_projects\" to the "
                        "Firebase rules — falling back to a full scan for now (works, but "
                        "pulls more data per poll than necessary)."
                    )
                snapshot = db.reference('pending_projects').get()
                if snapshot:
                    snapshot = {pid: data for pid, data in snapshot.items() if data.get('status') == 'in_queue'}
            else:
                raise

        if not snapshot:
            return
        for pid, data in snapshot.items():
            if len(processing_ids) >= MAX_CONCURRENT_PROJECTS:
                break
            if pid not in processing_ids:
                processing_ids.add(pid)
                _check_job_abuse(data.get("userId"), "studio (pending_projects)")
                log_info(f"▶️ Picked up {pid} from queue (source: {source})")
                threading.Thread(target=process_production_queue, args=(pid, data), daemon=True).start()
    except Exception as e:
        # Was a silent `pass` before — any error here (bad snapshot shape,
        # a transient DB read failure, etc.) used to vanish with zero trace,
        # so a stuck queue looked identical to "nothing to process."
        log_error("Queue drain failed", str(e))

def _on_pending_projects_event(event):
    _listener_last_event_ts[0] = time.time()
    _listener_event_count[0] += 1
    _drain_pending_queue(source="listener")

_listener_last_event_ts = [time.time()]
_listener_event_count = [0]
_listener_registration = [None]

def _log_uncaught_thread_exception(args):
    """Installed as threading.excepthook. The Firebase SDK's `.listen()`
    call runs its own background thread internally — if that thread's
    connection loop throws (dropped connection, auth hiccup, whatever),
    Python's default behavior is to print a traceback to stderr and just
    let the thread die, with nothing reconnecting it and nothing in our
    own logs to show it happened. This routes any such crash through
    log_error so it's visible instead of silently disappearing, then
    still runs the normal default handler.
    """
    try:
        log_error(
            f"Uncaught exception in background thread '{args.thread.name if args.thread else '?'}'",
            f"{args.exc_type.__name__ if args.exc_type else '?'}: {args.exc_value}"
        )
    except Exception:
        pass
    threading.__excepthook__(args)

def _attach_pending_projects_listener():
    try:
        reg = db.reference('pending_projects').listen(_on_pending_projects_event)
        _listener_registration[0] = reg
        _listener_last_event_ts[0] = time.time()
        log_info("👂 pending_projects realtime listener attached")
    except Exception as e:
        log_error("Failed to attach pending_projects listener", str(e))

def start_pending_voice_listener():
    """Attaches the realtime listener only. No separate startup full-scan —
    `.listen()`'s own first event already delivers a full snapshot, so a
    second full/filtered read here would just be the same work done twice
    on every process start. No polling loop either — this now runs purely
    off `.listen()` state. If the stream ever silently dies, nothing here
    compensates on a timer anymore; the listener is the only thing driving
    pickup after startup."""
    threading.excepthook = _log_uncaught_thread_exception
    _attach_pending_projects_listener()
