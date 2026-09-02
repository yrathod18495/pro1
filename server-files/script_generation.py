"""
script_generation.py
---------------------
Standalone Script Generation node for the HQ Cluster — Firestore only, no RTDB.

Contract (per Script Generator Hub spec):
  - Frontend writes a pending job flat under:   script_projects/{mappingId}
        { mappingId, userId, userEmail, scriptType, targetLength,
          type: "script_generation", status: "pending", timestamp, prompt? }
  - This module attaches a Firestore REAL-TIME LISTENER (not polling) on the
    script_projects collection, filtered to status == "pending". Firestore
    only charges a read when a document is added/changed — there is no
    fixed per-interval cost like a 5-second poll loop.
  - Picked-up jobs are copied + updated into the nested result doc:
        script_projects/{userId}/userProjects/{mappingId}
        processing -> merge status:"processing", projectName, timestamp
        done       -> merge status:"ok", scriptUrl, fullText, teaser,
                      modelUsed, completedAt
        error      -> merge status:"error", error
  - On success the flat script_projects/{mappingId} pending doc is deleted
    (cleanup). On failure it's left behind with status:"error" for
    debugging.

Import into app.py like:
    from script_generation import start_pending_script_generation_listener
    ...
    start_pending_script_generation_listener()   # call once, inside lifespan/startup

TEXT GENERATION:
    Uses the Gemini API (generativelanguage.googleapis.com) — the SAME model
    list as store_script_generation.py — instead of DeepSeek/OpenRouter.
    Auth is via plain API keys (not a Vertex service account), read from the
    GEMINI_KEYS env var / Space secret as a comma-separated list, e.g.:
        GEMINI_KEYS = "key1,key2,key3"
    On any failure (rate limit, bad key, empty output, etc.) it rotates to
    the next key, and after exhausting all keys for a model it falls back
    to the next model in the chain. If a call succeeds but gets cut off at
    maxOutputTokens, it auto-continues from where it stopped and stitches
    the pieces into one full script.
"""

import os
import re
import time
import threading
import traceback
import collections
import requests
from datetime import datetime, timedelta, timezone

from firebase_admin import firestore

from r2_netlify import upload_to_r2, random_object_key
from firebase_admin import db


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
    print(f"{bcolors.OKGREEN}[SCRIPT-GEN-SUCCESS] {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def log_error(msg, detail=None):
    print(f"{bcolors.FAIL}[SCRIPT-GEN-ERROR]   {datetime.now().strftime('%H:%M:%S')} - 🚨 {msg}{bcolors.ENDC}", flush=True)
    if detail:
        print(f"{bcolors.FAIL}{detail}{bcolors.ENDC}", flush=True)


def log_info(msg):
    print(f"{bcolors.OKCYAN}[SCRIPT-GEN-NODE]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def log_warn(msg):
    print(f"{bcolors.WARNING}[SCRIPT-GEN-WARN]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


def escape_html(text):
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


# ============================================================
# 💳 CREDIT REFUND ENGINE — same pattern/shape as studio.py / music_generation.py.
# Script generation had NO refund logic before this: a failed generation
# left the user's credits deducted with nothing to show for it.
#   Balance:        Firestore users/{uid}.credits (int64, bumped via Increment)
#   History log:    Realtime Database creditHistory/{uid} (amount/reason/timestamp/type)
#   Idempotency:    Realtime Database refund_locks/{job_id} transaction, so
#                   this mapping_id is never refunded more than it was charged.
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
    Database — same shape/node as the other engines, so refunds show up
    together in one history list."""
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
            "timestamp": datetime.now().isoformat(),
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
# GEMINI API HELPERS
# ------------------------------------------------------------------ #
# Same model list as store_script_generation.py — kept in sync on purpose
# so both nodes generate with identical models.
# ------------------------------------------------------------------ #
TEXT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]
TEXT_MODEL_FALLBACK_CHAIN = TEXT_MODELS

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _load_gemini_keys():
    """GEMINI_KEYS secret is a comma-separated list, e.g. 'key1,key2,key3'."""
    raw = os.environ.get("GEMINI_KEYS", "")
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    return keys


GEMINI_KEYS = _load_gemini_keys()


def call_gemini_model(model_name, api_key, prompt, generation_config, timeout=240):
    url = f"{GEMINI_API_BASE}/{model_name}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": generation_config.get("temperature", 0.8),
            "maxOutputTokens": generation_config.get("maxOutputTokens", 8192),
            # 🧠 Gemini 3.x Flash models think by default, and thinking tokens
            # are deducted from the SAME maxOutputTokens budget as the actual
            # script text. Without capping this, the model can burn most of
            # a 30k token budget on hidden reasoning before writing a single
            # line of script — which is what was causing constant MAX_TOKENS
            # truncation (and therefore lots of continuation rounds / very
            # slow, mismatched-length output). Script writing is plain
            # creative writing, not multi-step reasoning, so we force LOW
            # thinking to leave (almost) the entire budget for real text.
            "thinkingConfig": {
                "thinkingLevel": generation_config.get("thinkingLevel", "low"),
            },
        },
    }

    res = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if not res.ok:
        raise Exception(f"[{model_name}] Gemini API Rejection ({res.status_code}): {res.text[:300]}")

    response_json = res.json()
    candidates = response_json.get("candidates", [])
    if not candidates:
        raise Exception(f"[{model_name}] No candidates in response: {str(response_json)[:500]}")

    candidate = candidates[0]
    finish_reason = candidate.get("finishReason", "UNKNOWN")
    parts = candidate.get("content", {}).get("parts", [])
    text_out = "".join(p.get("text", "") for p in parts)

    if not text_out:
        raise Exception(f"[{model_name}] Node returned empty/zero-length string. finishReason={finish_reason}")
    if finish_reason == "MAX_TOKENS":
        log_warn(f"[{model_name}] Hit maxOutputTokens limit — output may still be truncated.")
    return text_out, finish_reason


def call_gemini_with_fallback(primary_model, fallback_chain, prompt, generation_config, context=""):
    """Tries the primary model first, then each model in fallback_chain.
    For every model it rotates through ALL configured GEMINI_KEYS before
    giving up on that model and moving to the next one.

    If a call succeeds but Gemini stopped early because it hit
    maxOutputTokens (finishReason == "MAX_TOKENS"), this automatically
    asks the SAME model/key to continue from where it left off (up to
    MAX_CONTINUATIONS times) and stitches the pieces into one full text,
    instead of silently returning a cut-off script."""
    if not GEMINI_KEYS:
        raise Exception("GEMINI_KEYS missing/empty in environment — add it as a comma-separated list of Gemini API keys.")

    # Hard cap is now a safety net, not the normal stopping point — a long
    # Hindi/Devanagari script can legitimately need many rounds since it
    # costs more tokens per character than English. We keep continuing
    # until Gemini actually reports finishReason != MAX_TOKENS, or until
    # this many rounds have passed (should basically never be hit).
    MAX_CONTINUATIONS = 15

    attempt_order = []
    if primary_model:
        attempt_order.append(primary_model)
    for m in fallback_chain:
        if m not in attempt_order:
            attempt_order.append(m)

    tag = f"[{context}] " if context else ""
    last_error = None

    for m_idx, model_name in enumerate(attempt_order):
        log_info(f"{tag}🧠 Trying model {m_idx + 1}/{len(attempt_order)} → {model_name} ({len(GEMINI_KEYS)} key(s) available)")
        for key_idx, api_key in enumerate(GEMINI_KEYS):
            try:
                log_info(f"{tag}   ↳ attempt with key #{key_idx + 1}/{len(GEMINI_KEYS)}")
                text_out, finish_reason = call_gemini_model(model_name, api_key, prompt, generation_config)

                # Auto-continue if Gemini stopped because it ran out of
                # output tokens, not because it actually finished.
                continuations = 0
                while finish_reason == "MAX_TOKENS" and continuations < MAX_CONTINUATIONS:
                    continuations += 1
                    log_warn(f"{tag}   ↳ truncated at MAX_TOKENS, requesting continuation #{continuations}...")
                    tail = text_out[-800:]
                    continue_prompt = (
                        f"{prompt}\n\n---\n"
                        f"You already wrote the following and were cut off. "
                        f"Continue EXACTLY from where it stopped — do not repeat "
                        f"any of this text, do not add preamble, just keep writing "
                        f"until the piece is fully complete:\n\n...{tail}"
                    )
                    more_text, finish_reason = call_gemini_model(model_name, api_key, continue_prompt, generation_config)
                    text_out += more_text

                if finish_reason == "MAX_TOKENS":
                    # Exhausted MAX_CONTINUATIONS rounds and Gemini is STILL
                    # cutting off mid-script. Previously this fell through
                    # and got reported as a normal success — the script
                    # would silently save half-finished. Fail loudly instead
                    # so it retries (next key/model) rather than shipping a
                    # truncated script as "ok".
                    raise Exception(
                        f"[{model_name}] Still truncated (MAX_TOKENS) after {continuations} "
                        f"continuation rounds — {len(text_out)} chars so far. Giving up on "
                        f"this key/model rather than saving an incomplete script."
                    )

                log_success(f"{tag}✅ Success → model={model_name}, key=#{key_idx + 1}, {len(text_out)} chars"
                            f"{f' (+{continuations} continuation(s))' if continuations else ''}")
                return text_out, model_name
            except Exception as e:
                last_error = e
                log_warn(f"{tag}   ↳ key #{key_idx + 1} failed on {model_name}: {str(e)[:300]}")
                continue
        log_warn(f"{tag}⚠️ All keys exhausted for model {model_name}, falling back to next model...")

    raise Exception(f"All Gemini models/keys exhausted. Last error: {last_error}")


DEFAULT_SCRIPT_LANGUAGE = "English"

# Single source of truth for allowed emotion tags — MUST stay identical to
# whatever studio.py / the Live voice engine actually recognizes. If that
# list changes there, change it here too.
EMOTION_ALLOWED_TAGS = [
    "happy", "sad", "angry", "excited", "surprised", "scared", "anxious",
    "calm", "nervous", "confident", "joyful", "frustrated", "disappointed",
    "confused", "embarrassed", "lonely", "hopeful", "romantic", "serious",
    "playful", "curious", "determined", "grateful", "relieved", "shocked",
    "proud", "guilty", "jealous", "bored", "sleepy", "tired", "energetic",
    "emotional", "crying", "laughing", "blushing", "affectionate",
    "sarcastic", "sympathetic", "worried",
    "whispering", "singing", "mocking", "teasing", "pleading", "shouting",
]
# Lowercased set for fast membership checks; "neutral" is a special
# sentinel (not a real tag) meaning "no emotion tag needed at all".
_EMOTION_ALLOWED_SET = {e.lower() for e in EMOTION_ALLOWED_TAGS} | {"neutral"}


def build_default_prompt(data):
    """Passes the structured fields the Script Generator Hub frontend sends
    (scriptType, genre, tone, audience, perspective, numberOfCharacters,
    plotSummary, additionalInstructions, targetLength/wordCount) straight
    through to the model as labeled raw values, instead of us hand-writing
    a bespoke English sentence per field. Hand-crafted per-field phrasing
    was brittle — every time the frontend introduced a new enum value
    (e.g. "2 Characters" instead of a bare "2") the hard-coded sentence
    logic went stale/confusing without anyone noticing. Handing Gemini the
    raw label:value pairs directly and telling it to correctly satisfy ALL
    of them removes that whole class of bug — the model interprets each
    setting itself instead of relying on brittle string templates.
    Used whenever the frontend didn't send a fully custom 'prompt' string.
    Language and dialogue/emotion structure are enforced separately (see
    build_language_directive / build_format_instructions) so they apply no
    matter which prompt this combines with — custom or this fallback."""
    script_type = data.get("scriptType") or "story script"
    genre = (data.get("genre") or "").strip()
    tone = (data.get("tone") or "").strip()
    audience = (data.get("audience") or "").strip()
    perspective = (data.get("perspective") or "").strip()
    number_of_characters = str(data.get("numberOfCharacters") or "").strip()
    plot_summary = (data.get("plotSummary") or "").strip()
    additional_instructions = (data.get("additionalInstructions") or "").strip()

    target_length = data.get("targetLength") or data.get("wordCount")
    try:
        target_length = int(target_length)
    except Exception:
        target_length = 5000

    fields = [f"Script type / purpose: {script_type}"]
    if genre:
        fields.append(f"Genre: {genre}")
    if tone:
        fields.append(f"Emotional tone: {tone}")
    if audience:
        fields.append(f"Target audience: {audience}")
    if perspective:
        fields.append(f"Narrative perspective / POV: {perspective}")
    if number_of_characters:
        fields.append(f"Character count setting: {number_of_characters}")
    fields.append(
        f"Target length: MINIMUM {target_length} characters — this is a floor, not a cap. "
        f"Do NOT wrap up, conclude, or end the story early just because the plot feels resolved — "
        f"add more scenes, more dialogue, more sensory/emotional detail, slower pacing, subplots, "
        f"or additional beats to comfortably clear this length. Stopping short of {target_length} "
        f"characters is a failure; going noticeably over it is fine and preferred over falling short."
    )
    if plot_summary:
        fields.append(f"Plot summary / story idea:\n{plot_summary}")
    # additionalInstructions is sometimes sent as an exact duplicate of
    # plotSummary by the frontend — skip it in that case instead of feeding
    # the model the same paragraph twice under two different headers.
    if additional_instructions and additional_instructions != plot_summary:
        fields.append(f"Additional instructions from the user:\n{additional_instructions}")

    fields_block = "\n".join(fields)
    return (
        "You are an expert scriptwriter. Below are the exact settings the user chose "
        "for this script, given to you as raw label: value pairs — read every one "
        "carefully and correctly satisfy ALL of them in the script you write: the "
        "genre, the emotional tone, the target audience, the narrative perspective/POV, "
        "the character-count setting (if it says a specific mode like storyteller-only, "
        "use exactly that; if it names a number, use exactly that many distinct named "
        "characters — not more, not fewer), the target length, and the plot/instructions "
        "below.\n\n"
        f"{fields_block}"
    )


def build_language_directive(language):
    """Forces the model to actually write in the language the frontend
    sent, instead of silently defaulting to English (the bug this fixes).
    Native script, not a Romanized/Hinglish transliteration, unless the
    language itself is one normally written in Roman letters. Explicitly
    covers character names too — without this, the model tends to keep
    names in Roman/English script even when the dialogue itself is
    correctly in the target language."""
    language = (language or DEFAULT_SCRIPT_LANGUAGE).strip() or DEFAULT_SCRIPT_LANGUAGE
    return (
        f"\n\nLANGUAGE — STRICT: Write the ENTIRE script — every word of dialogue AND "
        f"every character name — in {language}. Use the natural native script for "
        f"{language} (not a Romanized/transliterated version) unless {language} itself "
        f"is normally written in Roman letters. This applies to character names too: "
        f"write names in {language}'s native script, the same way they'd naturally be "
        f"written in that language — do not leave names in English/Roman letters just "
        f"because the format example uses Roman letters for illustration. Do not switch "
        f"into English or any other language at any point, and do not mix languages "
        f"within a line or within a name."
    )


def build_naturalness_instructions():
    """Nothing in the prompt previously told the model HOW to write dialogue
    beyond the tag format — so it defaulted to generic, stiff, AI-sounding
    lines with wildly inconsistent length (one-word lines next to paragraph-
    long monologues). This fixes both: push toward natural human speech
    patterns, and keep every line in a believable spoken-length range."""
    return (
        "\n\nWRITING STYLE — sound human, not AI-generated:\n"
        "- Write dialogue the way real people actually talk: contractions, "
        "interruptions, small hesitations, reactions to what was just said — "
        "not polished textbook sentences. Avoid generic AI phrasing/clichés "
        "(e.g. \"little did they know\", overly neat summarizing lines, "
        "characters explaining their own feelings out loud instead of showing them).\n"
        "- LINE LENGTH — keep every line in a natural spoken range: roughly "
        "8 to 30 words per line (one to two short sentences). Do NOT write "
        "one-or-two-word lines as a whole line (\"Yes.\" / \"Okay.\" alone) — "
        "give even short reactions a bit of real content. Do NOT write "
        "long monologue-style lines that go on for many sentences — if a "
        "character has a lot to say, break it naturally across multiple "
        "lines the way a real conversation would, with the other character "
        "reacting, interrupting, or asking something in between.\n"
        "- Vary sentence rhythm and length between lines like real conversation "
        "does — don't let every line settle into the same length or shape."
    )



def build_format_instructions():
    """Matches the EXACT tag format studio.py's Live API voice engine expects
    (see LIVE_BASE_INSTRUCTION in studio.py): "[ emotion ]" with a space
    right after the opening bracket and right before the closing bracket,
    and the tag word itself must come from EMOTION_ALLOWED_TAGS — nothing
    else. Keeping this identical is what lets Studio parse/perform the
    emotion correctly. Emotion tag WORDS stay in English always (they are
    literal keywords Studio matches against EMOTION_ALLOWED_TAGS) — only the
    character name and dialogue text follow the target language."""
    allowed_list = ", ".join(EMOTION_ALLOWED_TAGS)
    return (
        "\n\nOUTPUT FORMAT — STRICT (this script will be read directly by a voice-acting "
        "engine, not a human):\n"
        "Write ONLY spoken dialogue lines, one character's line per line, in exactly this "
        "shape:\n"
        "CHARACTERNAME:[ emotion ] Dialogue text goes here.\n"
        "(CHARACTERNAME above is just a placeholder showing the shape — write the actual "
        "name in the target language's own script, not in English/Roman letters, unless "
        "the target language itself is English.)\n\n"
        "Rules:\n"
        "- Every line starts with the character's name (in the target language's script), "
        "immediately followed by a colon (no space before the colon). If the target "
        "language's script has no concept of capital letters (e.g. Devanagari, Bengali, "
        "Tamil, Arabic, etc.), just write the name naturally — don't force English-style "
        "capitalization onto it.\n"
        "- The EMOTION TAG WORD ITSELF always stays in English, exactly as listed below — "
        "never translate it — even though the character name and dialogue are in the "
        "target language. You may ONLY use one of these exact English words inside the "
        f"brackets, nothing else, no synonyms, no new words:\n{allowed_list}\n"
        "- The tag must be written as \"[ emotion ]\" — a space right after the opening "
        "bracket and right before the closing bracket — immediately followed by the "
        "dialogue text, e.g. CHARACTERNAME:[ happy ] Dialogue text.\n"
        "- If a line genuinely has no strong emotional delivery, omit the tag entirely "
        "instead of inventing one — write CHARACTERNAME: Dialogue text with no brackets "
        "at all. Never write a tag that isn't in the allowed list above, and never write "
        "[ neutral ] literally — just leave the brackets out.\n"
        "- Each character's line is on its own new line. Never merge two characters' lines "
        "into one line, and never put more than one character's dialogue on the same line.\n"
        "- Do NOT include scene directions, camera directions, markdown formatting "
        "(no **bold**, no # headers), titles, running-time notes, or any narration/meta text "
        "outside of dialogue lines.\n"
        "- Do NOT add any preamble, explanation, disclaimer, or notes before or after the "
        "script — output ONLY the dialogue lines, starting from the very first character."
    )


_EMOTION_TAG_RE = re.compile(r"\[\s*([^\[\]]+?)\s*\]")


def sanitize_emotion_tags(text, context=""):
    """Safety net behind the prompt instructions: strips out any bracketed
    tag the model wrote that isn't in EMOTION_ALLOWED_TAGS (typos,
    invented emotions, literal "[ neutral ]", etc.) so Studio never
    receives a tag it doesn't recognize. Returns (clean_text, dropped)."""
    dropped = []

    def _replace(match):
        tag = match.group(1).strip().lower()
        if tag in _EMOTION_ALLOWED_SET and tag != "neutral":
            return f"[ {tag} ]"
        dropped.append(match.group(1).strip())
        return ""

    clean = _EMOTION_TAG_RE.sub(_replace, text)
    # Collapse the double space/leading space left behind when a tag is
    # stripped (e.g. "NAME: [ blah ] text" -> "NAME:  text" -> "NAME: text").
    clean = re.sub(r":[ \t]+", ": ", clean)
    if dropped:
        log_warn(f"[{context}] Dropped {len(dropped)} disallowed emotion tag(s): {dropped}")
    return clean, dropped


# ============================================================
# CONCURRENCY BUCKET
# ============================================================
MAX_CONCURRENT_SCRIPT_JOBS = int(os.environ.get("MAX_CONCURRENT_SCRIPT_JOBS", "5"))
script_job_bucket = threading.Semaphore(MAX_CONCURRENT_SCRIPT_JOBS)

processing_ids = set()
processing_lock = threading.Lock()

# Jobs that arrived while the bucket was full — retried in-memory when a
# slot frees up, so we never need a second Firestore read to "check again".
waiting_queue = collections.deque()

# Lazy — set inside start_pending_script_generation_listener(), NOT at
# import time. app.py imports this module before it calls
# firebase_admin.initialize_app(), so calling firestore.client() at module
# load would fail with "default Firebase app does not exist".
firestore_db = None


# ============================================================
# TASK PROCESSOR
# ============================================================
def process_script_generation_task(mapping_id, data):
    user_id = data.get("userId")
    user_email = data.get("userEmail", "unknown")
    script_type = data.get("scriptType")
    target_length = data.get("targetLength") or data.get("wordCount")
    # Prefer the frontend's own project name; fall back to scriptType only
    # when the caller didn't send one (previously this ignored data["projectName"]
    # entirely and always overwrote it with scriptType).
    project_name = data.get("projectName") or script_type or "AI Script Generation"
    model_name = data.get("model")
    genre = data.get("genre")
    tone = data.get("tone")
    audience = data.get("audience")
    number_of_characters = data.get("numberOfCharacters")
    language = data.get("language")
    if not language:
        log_warn(f"[{mapping_id}] No 'language' field sent by frontend — defaulting to {DEFAULT_SCRIPT_LANGUAGE}.")
    language = language or DEFAULT_SCRIPT_LANGUAGE

    base_prompt = data.get("prompt") or build_default_prompt(data)
    # Language + Studio dialogue/emotion format are enforced on EVERY prompt —
    # whether it came from the frontend or the fallback builder — so a script
    # never silently comes back in English, with the wrong structure, or with
    # emotion tags outside the allowed list.
    prompt = base_prompt + build_naturalness_instructions() + build_language_directive(language) + build_format_instructions()
    credits_charged = _get_credits_charged(data)

    log_info(
        f"📥 Script Node Input: {mapping_id} for {user_email} | type={script_type} | "
        f"language={language} | genre={genre} | tone={tone} | audience={audience} | "
        f"characters={number_of_characters} | targetLength={target_length}"
    )
    log_info(f"📝 [{mapping_id}] Prompt preview: {prompt[:200]!r}{'...' if len(prompt) > 200 else ''}")

    # Nested result doc: script_projects/{userId}/userProjects/{mappingId}
    project_doc = (
        firestore_db.collection("script_projects")
        .document(user_id)
        .collection("userProjects")
        .document(mapping_id)
    )
    # Flat pending doc this job was picked up from.
    pending_doc = firestore_db.collection("script_projects").document(mapping_id)

    try:
        result_payload = dict(data)
        result_payload.update({
            "status": "processing",
            "projectName": project_name,
            "language": language,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        project_doc.set(result_payload, merge=True)
        pending_doc.update({"status": "processing"})
        log_info(f"🔥 [{mapping_id}] Firestore status set to 'processing'.")

        generation_config = {"temperature": 0.8, "maxOutputTokens": 30000}
        log_info(f"🚀 [{mapping_id}] Starting Gemini generation (requested model: {model_name or TEXT_MODELS[0]})...")
        text_out, model_used = call_gemini_with_fallback(
            model_name, TEXT_MODEL_FALLBACK_CHAIN, prompt, generation_config, context=mapping_id
        )
        log_info(f"📦 [{mapping_id}] Script generated: {len(text_out)} chars via {model_used}.")

        # Safety net: strip any emotion tag the model wrote that isn't in
        # EMOTION_ALLOWED_TAGS, so Studio never receives an unrecognized tag.
        text_out, _dropped_tags = sanitize_emotion_tags(text_out, context=mapping_id)

        script_file_path = random_object_key("temp/scripts", "txt")
        log_info(f"☁️ [{mapping_id}] Uploading script to R2 at {script_file_path}...")
        script_url = upload_to_r2(script_file_path, text_out.encode("utf-8"), "text/plain")
        log_info(f"☁️ [{mapping_id}] Uploaded → {script_url}")

        # No fullText here — the complete script already lives at scriptUrl
        # in R2; duplicating the whole thing into Firestore too was dead
        # weight on the document. teaser stays as a short preview only.
        teaser_preview = text_out[:300].rstrip()
        if len(text_out) > 300:
            teaser_preview += "..."

        project_doc.set({
            "status": "ok",
            "projectName": project_name,
            "scriptUrl": script_url,
            "teaser": teaser_preview,
            "language": language,
            "modelUsed": model_used,
            "completedAt": int(time.time() * 1000),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }, merge=True)
        log_info(f"🔥 [{mapping_id}] Firestore status set to 'ok'.")

        # 📡 Mirror completion into RTDB tempScriptGenerations/{userId}/{mappingId}
        # too — this is the node the Script Generator frontend actually polls
        # (see page.tsx's "RTDB SYNC FOR LIVE GENERATIONS" effect). It was
        # previously only ever set to 'ok' by the client-side Gemini call;
        # now that generation happens here, this node writes it instead so
        # the frontend's existing progress bar / auto-open-in-reader flow
        # keeps working without needing a rewrite on that side.
        try:
            db.reference(f"tempScriptGenerations/{user_id}/{mapping_id}").update({
                "status": "ok",
                "projectName": project_name,
                "scriptUrl": script_url,
                "teaser": teaser_preview,
                "modelUsed": model_used,
                "completedAt": int(time.time() * 1000),
            })
        except Exception as e:
            log_error(f"⚠️ [{mapping_id}] RTDB tempScriptGenerations update failed (Firestore is still updated)", str(e))

        # Cleanup — job is done, remove the flat pending doc.
        pending_doc.delete()
        log_info(f"🧹 [{mapping_id}] script_projects pending doc cleaned up.")

        ist_now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
        today_ist = ist_now.strftime("%Y-%m-%d")
        firestore_db.collection("dailySummaries").document(today_ist).set(
            {"scriptsGenerated": firestore.Increment(1)}, merge=True
        )

        report = (
            f"📝 <b>SCRIPT NODE READY</b>\n\n"
            f"👤 <b>User:</b> {escape_html(user_email)}\n"
            f"📂 <b>Project:</b> {escape_html(project_name)}\n"
            f"🆔 <b>Node:</b> <code>{mapping_id}</code>\n"
            f"🧠 <b>Model:</b> {model_used}"
        )
        send_telegram_log(report)
        log_success(f"Script Node Ready: {mapping_id} (model: {model_used})")

    except Exception as e:
        err_str = str(e)
        log_error(f"Script Node Error: {mapping_id}", traceback.format_exc())

        report = (
            f"🚨 <b>SCRIPT NODE FAILED</b>\n\n"
            f"👤 <b>User:</b> {escape_html(user_email)}\n"
            f"📂 <b>Project:</b> {escape_html(project_name)}\n"
            f"🆔 <b>Node:</b> <code>{mapping_id}</code>\n"
            f"❌ <b>Error:</b> {escape_html(err_str[:500])}"
        )
        send_telegram_log(report)

        try:
            project_doc.set({
                "status": "error",
                "error": err_str[:500],
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }, merge=True)
            pending_doc.update({"status": "error", "error": err_str[:500]})
        except Exception:
            pass

        # 📡 Mirror the failure into RTDB too, so the frontend's progress
        # bar doesn't spin forever with no explanation — see the matching
        # 'ok' write above for why this node matters.
        try:
            db.reference(f"tempScriptGenerations/{user_id}/{mapping_id}").update({
                "status": "error",
                "error": err_str[:500],
            })
        except Exception:
            pass

        # 🔴 Refund — a failed script generation means the user got nothing
        # for what they were charged: full refund every time.
        if credits_charged > 0:
            refund_credits(user_id, credits_charged, f"Script generation failed: {err_str[:200]}", mapping_id, credits_charged)
    finally:
        script_job_bucket.release()
        with processing_lock:
            processing_ids.discard(mapping_id)
            _start_next_waiting()
        log_info(f"🔓 [{mapping_id}] Bucket slot released.")


def _start_next_waiting():
    """Called with processing_lock held. Pulls the next queued job (if any)
    now that a bucket slot is free — no extra Firestore read needed."""
    if waiting_queue and len(processing_ids) < MAX_CONCURRENT_SCRIPT_JOBS:
        next_id, next_data = waiting_queue.popleft()
        processing_ids.add(next_id)
        script_job_bucket.acquire()
        threading.Thread(
            target=process_script_generation_task, args=(next_id, next_data), daemon=True
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
        if data.get("type") not in (None, "script_generation"):
            continue

        with processing_lock:
            if mapping_id in processing_ids:
                continue  # already picked up / duplicate event

            if len(processing_ids) >= MAX_CONCURRENT_SCRIPT_JOBS:
                log_warn(f"Bucket full — queuing {mapping_id} in memory (no extra read).")
                waiting_queue.append((mapping_id, data))
                continue

            processing_ids.add(mapping_id)
            script_job_bucket.acquire()
            log_info(f"🆕 Picked up pending script_generation job: {mapping_id}")
            threading.Thread(
                target=process_script_generation_task, args=(mapping_id, data), daemon=True
            ).start()


def start_pending_script_generation_listener():
    """Call once at app startup (e.g. inside FastAPI lifespan).

    Attaches a Firestore snapshot listener on script_projects filtered to
    status == "pending". Firestore bills a read for the initial matching
    set and for each subsequent add/change — there is no fixed per-second
    cost like a poll loop, and pickup is near-instant instead of waiting
    up to 5 seconds.
    """
    global firestore_db
    if not GEMINI_KEYS:
        log_warn("GEMINI_KEYS is not set (or empty) — script generation will fail until it's configured.")

    firestore_db = firestore.client()
    query = firestore_db.collection("script_projects").where("status", "==", "pending")
    query.on_snapshot(_on_pending_snapshot)
    log_info(f"Script Generation Firestore listener started (script_projects, status=pending). "
             f"Models: {TEXT_MODELS} | Gemini keys loaded: {len(GEMINI_KEYS)}")