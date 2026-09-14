"""
11.py
---------------------
"11Labs Studio" — everything in ONE file, same submit-and-listen pattern
as studio.py, but its OWN dedicated node — not layered onto/filtered out
of pro_projects (that stays 100% untouched, still just the Gemini flow).

Frontend submits:  11_projects/{project_id}   status:"in_queue"
  - src/app/studio/actions.ts  (main studio, when the voice engine
    toggle is set to 11Labs) — the normal path
  - src/app/pro-studio/actions.ts (older route, still supported)

This file listens on 11_projects, generates the audio, and writes
status/progress back into that SAME node while it runs — which is what
drives the existing live progress bar — then writes the finished result
to the Firestore doc the frontend actually renders and clears the queue
node. Which Firestore collection that is comes from the payload's
`firestoreCollection` field (see DEFAULT_FIRESTORE_COLLECTION below).

This file does NOT deal with the voice catalog at all. Browsing and
searching voices is handled entirely on the Vercel side
(src/app/api/voices/route.ts). By the time a project reaches this file
the user has already picked a voice and its voice_id is in the submitted
payload — so there is nothing to look up here.

No completeness/QA re-check on the generated audio (unlike studio.py's
OpenRouter-based check for the Gemini Live path) — ElevenLabs' TTS output
is trusted as-is.

────────────────────────────────────────────────────────────────────────
🔑 SINGLE KEY (changed)
────────────────────────────────────────────────────────────────────────
This file used to run a POOL of keys with rotation, per-key low-credit
parking keyed to each key's monthly reset DATE, permanent-error
sidelining, and a persisted state node at RTDB 11_key_state. All of that
is GONE. There is now exactly one key:

    ELEVENLABS_API_KEY      ← the paid key, the only one used

No longer read (safe to delete from the Space's secrets):
    ELEVENLABS_KEYS, SPECIAL_ELEVENLABS_KEY,
    ELEVENLABS_MIN_CREDITS, ELEVENLABS_MAX_HARD_FAILURES

The RTDB node `11_key_state` is no longer written or read. Nothing
cleans it up automatically — delete it by hand in the Firebase console
whenever you like.

Concurrency is unchanged: ElevenLabs allows several simultaneous
requests on one key, so a project's lines still generate in parallel,
ELEVENLABS_CONCURRENCY at a time, all on this one key.

────────────────────────────────────────────────────────────────────────
💳 CREDIT REPORTING (new)
────────────────────────────────────────────────────────────────────────
Every finished line logs how many credits are left on the key, next to
what it was at the START of this project, so the delta is visible at a
glance:

    [11Labs] line 3/12 ✓ · 41 chars · balance 182,940 (start 183,150,
             used 210 this project) · voice Rachel

Two numbers are tracked, and they are NOT the same thing:

  • used_local — characters this worker actually submitted, summed with
    a lock. Exact, monotonic, and unaffected by anything else touching
    the key. This is what "used this project" reports.

  • balance — remaining credits read from ElevenLabs. Truthful but
    shared: if you run two projects at once (or generate anywhere else
    on the same key) it drops for reasons this project didn't cause.

Concurrency-safety: with ELEVENLABS_CONCURRENCY lines in flight, a
naive balance-check-per-line would fire N overlapping HTTP calls whose
replies arrive out of order, so the logged balance could jump UP between
consecutive lines and look broken. So the balance read is throttled
(BALANCE_POLL_INTERVAL) and shared under a lock: whoever polls last wins,
everyone else reuses the cached figure and the line is marked "~". The
per-line character count and used_local are always exact regardless.
────────────────────────────────────────────────────────────────────────

Mount into app.py:
    import importlib.util, os
    _spec = importlib.util.spec_from_file_location(
        "eleven_labs_studio", os.path.join(os.path.dirname(__file__), "11.py")
    )
    eleven_labs_studio = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(eleven_labs_studio)
    # then, inside lifespan():
    eleven_labs_studio.start_11labs_listener()

(Plain `import 11` is a SyntaxError — module names can't start with a
digit — hence the importlib.util loader above instead of a normal import.)

RTDB rules needed (database.rules.json) — same shape as pro_projects:
    "11_projects": { ...owner-or-admin read/write, ".indexOn": ["status"]... }
Firestore rules: no new ones needed for the main-studio path — results
land in the existing "projects" collection. The pro-studio path also
needs the "11_projects" collection rules.
"""

import os
import io
import time
import secrets
import string
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from firebase_admin import db, firestore

from studio import (
    log_info, log_error, log_success, escapeHtml, refund_credits,
    FIRESTORE_DATABASE_ID, pcm_to_mp3,
)
from r2_netlify import upload_to_r2, send_telegram_log


ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


# ============================================================
# 🔑 SINGLE KEY + 💳 CREDIT METER
# ============================================================

def _get_api_key():
    """Read at call time, not import time, so a Space secret added after
    boot is picked up on the next project instead of needing a restart."""
    return (os.environ.get("ELEVENLABS_API_KEY") or "").strip()


# 7 was inherited from the key-pool era, where parallel requests were
# spread across several keys. On ONE key that number sits right on top of
# most accounts' concurrent-request ceiling, which is what produced the
# scattered 429s. Retries above now absorb those, but starting lower means
# fewer of them; raise it if your plan allows more.
ELEVENLABS_CONCURRENCY = int(os.environ.get("ELEVENLABS_CONCURRENCY", "3"))
# Eleven v3 Conversational — more expressive, lower-latency delivery than
# plain eleven_v3, which is what we want for dialogue lines. Still
# overridable per-Space via the ELEVENLABS_MODEL_ID secret if a future
# model supersedes it.
ELEVENLABS_MODEL_ID = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_v3_conversational")
ELEVENLABS_OUTPUT_FORMAT = "pcm_24000"
PCM_SAMPLE_RATE = 24000

# Minimum seconds between two balance reads. Below this, in-flight lines
# reuse the cached figure rather than each firing their own request.
BALANCE_POLL_INTERVAL = float(os.environ.get("ELEVENLABS_BALANCE_POLL_INTERVAL", "3"))

# How long to wait, right before the closing Telegram report, for
# ElevenLabs' own usage counter to catch up with what this project just
# spent. A short project can otherwise finish and report before/after
# balances that are identical even though credits were genuinely used.
CREDIT_REFRESH_DELAY_SEC = float(os.environ.get("ELEVENLABS_CREDIT_REFRESH_DELAY_SEC", "15"))


def _key_label(key):
    """Non-secret label for logs — last 4 chars only."""
    return f"…{key[-4:]}" if key and len(key) >= 4 else "(unset)"


def _fmt(n):
    return f"{n:,}" if isinstance(n, int) else str(n)


def _get_credits(key):
    """Returns (remaining_credits, reset_unix), or ("invalid", None) on a
    401/403, or (None, None) if the lookup itself failed.
    remaining = character_limit - character_count."""
    try:
        resp = requests.get(
            f"{ELEVENLABS_API_BASE}/user/subscription",
            headers={"xi-api-key": key},
            timeout=15,
        )
        if resp.status_code in (401, 403):
            return "invalid", None
        if not resp.ok:
            return None, None
        data = resp.json() or {}
        limit = data.get("character_limit")
        used = data.get("character_count")
        reset = data.get("next_character_count_reset_unix")
        if limit is None or used is None:
            return None, None
        return max(0, int(limit) - int(used)), reset
    except Exception as e:
        log_error(f"Credit lookup failed for key {_key_label(key)}", str(e))
        return None, None


class _CreditMeter:
    """Per-project credit accounting, safe to call from every worker
    thread at once.

    `add_chars` is exact and local. `balance` is the shared remaining
    figure on the key, throttled so N concurrent lines don't fire N
    overlapping requests (see the module docstring)."""

    def __init__(self, key):
        self._key = key
        self._lock = threading.Lock()
        self.start_balance = None      # int, or None if the read failed
        self.reset_unix = None
        self._balance = None           # last known remaining
        self._balance_at = 0.0         # monotonic time of that read
        self.used_local = 0            # chars this project submitted

    def prime(self):
        """Read the opening balance. Returns "invalid" if the key is bad,
        so the caller can fail the project immediately rather than
        burning through every line on a dead key."""
        remaining, reset = _get_credits(self._key)
        if remaining == "invalid":
            return "invalid"
        with self._lock:
            self.start_balance = remaining if isinstance(remaining, int) else None
            self.reset_unix = reset
            self._balance = self.start_balance
            self._balance_at = time.monotonic()
        return self.start_balance

    def add_chars(self, n):
        with self._lock:
            self.used_local += int(n or 0)
            return self.used_local

    def balance(self):
        """(remaining, is_cached). Polls at most once per
        BALANCE_POLL_INTERVAL; concurrent callers get the cached value."""
        now = time.monotonic()
        with self._lock:
            fresh_enough = (now - self._balance_at) < BALANCE_POLL_INTERVAL
            if fresh_enough:
                return self._balance, True

        remaining, reset = _get_credits(self._key)
        with self._lock:
            if isinstance(remaining, int):
                self._balance = remaining
                self._balance_at = time.monotonic()
                if reset:
                    self.reset_unix = reset
                if self.start_balance is None:
                    # Opening read had failed; anchor on the first good one
                    # so the "used" delta below is at least self-consistent.
                    self.start_balance = remaining + self.used_local
                return self._balance, False
            # Read failed — keep serving the last good figure.
            return self._balance, True

    def force_refresh(self):
        """Bypass the throttle for a one-off authoritative read."""
        remaining, reset = _get_credits(self._key)
        with self._lock:
            if isinstance(remaining, int):
                self._balance = remaining
                self._balance_at = time.monotonic()
                if reset:
                    self.reset_unix = reset
        return self._balance

    def summary(self):
        """(start, end, used_local, used_on_key) for the closing report.
        used_on_key can exceed used_local if something else was hitting
        the same key at the same time; that's real, not a bug."""
        with self._lock:
            start = self.start_balance
            end = self._balance
            used_on_key = (start - end) if isinstance(start, int) and isinstance(end, int) else None
            return start, end, self.used_local, used_on_key


# ============================================================
# 🎤 TTS
# ============================================================

class _QuotaExceeded(Exception):
    """429, or the key is out of credits."""
    pass


class _AuthError(Exception):
    """401/403 — bad or revoked key."""
    pass


class _VoiceBusy(Exception):
    """409 already_running — ElevenLabs is mid-way through adding this
    library voice to the account and another request touched it at the
    same moment. Its own message says to retry shortly, so this is a
    wait-and-repeat, never a real failure."""
    pass


def _tts_request(text, voice_id, key, model_id=None):
    """One TTS call -> raw 16-bit PCM at PCM_SAMPLE_RATE (same format
    studio.py uses, so silence can be inserted and durations measured).
    Raises _QuotaExceeded on 429, _AuthError on 401/403, Exception
    otherwise."""
    resp = requests.post(
        f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}",
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/pcm"},
        params={"output_format": ELEVENLABS_OUTPUT_FORMAT},
        json={"text": text, "model_id": model_id or ELEVENLABS_MODEL_ID,
              "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}},
        timeout=60,
    )
    if resp.status_code == 409:
        raise _VoiceBusy(resp.text[:200])
    if resp.status_code == 429:
        raise _QuotaExceeded("429 rate/quota limit")
    if resp.status_code in (401, 403):
        raise _AuthError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    if not resp.ok:
        raise Exception(f"HTTP {resp.status_code}: {resp.text[:300]}")
    return resp.content


# How many times to re-attempt a single line before giving up on it, and
# how long to wait between attempts (doubling each time, plus jitter).
ELEVENLABS_MAX_RETRIES = int(os.environ.get("ELEVENLABS_MAX_RETRIES", "4"))
ELEVENLABS_RETRY_BASE_DELAY = float(os.environ.get("ELEVENLABS_RETRY_BASE_DELAY", "2"))


# A library voice that isn't on the account yet gets auto-added on first
# use. Fire several lines for that voice at once and the adds collide —
# ElevenLabs answers 409 already_running. So the FIRST call for each voice
# runs alone; once it returns, the voice exists and the rest go in
# parallel as normal. Costs one serialised request per distinct voice per
# process, nothing more.
_voice_warmup_locks = {}
_voice_warmed = set()
_voice_warmup_guard = threading.Lock()


def _voice_gate(voice_id):
    """Lock to hold for this voice's first request, or None if it's already
    been used successfully in this process."""
    with _voice_warmup_guard:
        if voice_id in _voice_warmed:
            return None
        lock = _voice_warmup_locks.get(voice_id)
        if lock is None:
            lock = threading.Lock()
            _voice_warmup_locks[voice_id] = lock
        return lock


def _mark_voice_warmed(voice_id):
    with _voice_warmup_guard:
        _voice_warmed.add(voice_id)


def synth_elevenlabs(text, voice_id, key=None, model_id=None, on_attempt_failed=None):
    """Synthesizes one line as raw PCM on the single configured key.

    Returns (pcm_bytes, None) on success, or (None, reason) if the line
    could not be produced after every retry.

    ⚠️ Retries matter more here than they did with the key pool. The pool
    version answered a 429 by rotating to a different key and trying
    again, so a busy account still got the line out. With one key there is
    nothing to rotate to — dropping the line on the first 429 silently
    loses dialogue and (correctly) triggers a partial refund, which looks
    like "11Labs randomly fails" from the outside. ELEVENLABS_CONCURRENCY
    parallel requests routinely brush the account's concurrency ceiling,
    so a 429 is an ordinary "wait your turn", not a fatal error: back off
    and re-send the same request instead.

    Auth errors are never retried — the key is wrong and will stay wrong."""
    key = key or _get_api_key()
    if not key:
        return None, "ELEVENLABS_API_KEY is not set"

    model_id = model_id or ELEVENLABS_MODEL_ID
    last_reason = "unknown error"

    for attempt in range(1, ELEVENLABS_MAX_RETRIES + 1):
        gate = _voice_gate(voice_id)
        try:
            if gate is not None:
                # First use of this voice: hold the gate so concurrent lines
                # for the same voice queue behind the auto-add instead of
                # racing it into a 409.
                with gate:
                    audio = _tts_request(text, voice_id, key, model_id=model_id)
            else:
                audio = _tts_request(text, voice_id, key, model_id=model_id)
            _mark_voice_warmed(voice_id)
            return audio, None

        except _VoiceBusy as e:
            last_reason = "voice busy (409 already_running)"

        except _AuthError as e:
            # Bad/revoked key — retrying cannot help.
            reason = f"auth rejected ({str(e)[:80]})"
            log_error(f"ElevenLabs key {_key_label(key)} rejected — check ELEVENLABS_API_KEY", str(e))
            return None, reason

        except _QuotaExceeded as e:
            # 429 covers BOTH "too many at once" and "out of credits", and
            # the response doesn't reliably distinguish them. Ask the
            # account: if credits really are gone, stop retrying.
            remaining, _ = _get_credits(key)
            if isinstance(remaining, int) and remaining <= 0:
                log_error("ElevenLabs account is out of credits — top up to continue")
                return None, "account out of credits"
            last_reason = "rate limited (concurrency)"

        except Exception as e:
            last_reason = str(e)[:120] or "request failed"

        if attempt < ELEVENLABS_MAX_RETRIES:
            delay = ELEVENLABS_RETRY_BASE_DELAY * (2 ** (attempt - 1))
            delay += random.uniform(0, 0.75)  # jitter, so parallel lines don't retry in lockstep
            log_info(
                f"[11Labs] retry {attempt}/{ELEVENLABS_MAX_RETRIES - 1} in {delay:.1f}s "
                f"({last_reason}) · voice {voice_id}"
            )
            if on_attempt_failed:
                on_attempt_failed(attempt, last_reason)
            time.sleep(delay)

    log_error(f"ElevenLabs gave up on a line after {ELEVENLABS_MAX_RETRIES} attempts (voice {voice_id})", last_reason)
    return None, last_reason


# ============================================================
# 📦 QUEUE / PROJECT PLUMBING (unchanged from the pool version)
#
#   submit: 11_projects/{project_id}  status:"in_queue"
#   result: live progress written back to the same RTDB node, final
#           result written to the Firestore doc named by the payload's
#           `firestoreCollection`, then the RTDB node is cleared.
# ============================================================
PROJECTS_PATH = "11_projects"
# Process one project at a time by default. All of a project's lines run
# on the single key, so running several projects at once would put many
# threads on that one key and trip its concurrency limit. The per-project
# ThreadPoolExecutor (ELEVENLABS_CONCURRENCY) still parallelises the lines
# within a project.
MAX_CONCURRENT_PROJECTS = int(os.environ.get("ELEVENLABS_MAX_CONCURRENT_PROJECTS", "1"))

_processing_ids = set()
_processing_lock = threading.Lock()


# Firestore collection holding the user-facing project doc. This is NOT
# the same as the RTDB node above: the RTDB node is this worker's queue,
# while the Firestore doc is what the frontend renders. The submitting
# action tells us which collection it used via `firestoreCollection`,
# because the two front-ends differ — the main studio writes "projects"
# (and its provider reads "projects"), while the older pro-studio route
# writes "11_projects". Hardcoding either one here silently breaks the
# other: the audio generates fine but the project never flips to
# "completed" on screen, because we updated a document nobody reads.
DEFAULT_FIRESTORE_COLLECTION = "projects"


def _firestore_user_project_ref(uid, project_id, collection=None):
    return (
        firestore.client(database_id=FIRESTORE_DATABASE_ID)
        .collection(collection or DEFAULT_FIRESTORE_COLLECTION).document(uid)
        .collection("userProjects").document(project_id)
    )


def _build_voice_map(data):
    """Maps character name -> ElevenLabs voice_id.

    The studio submits the same `characters` array for both engines; when
    the user picked the 11Labs engine, each character's `voice` field is
    already an ElevenLabs voice id (a default premade one, one from the
    library, or one they pasted by hand). So there is nothing to
    translate here — just index it by name.

    Falls back to a single project-wide `elevenLabsVoiceId` if present,
    which is what the older Pro Studio payload looked like."""
    voice_map = {}
    for ch in data.get("characters") or []:
        if not isinstance(ch, dict):
            continue
        name = (ch.get("name") or "").strip()
        voice = (ch.get("voice") or "").strip()
        if name and voice:
            voice_map[name] = voice
    return voice_map


def process_11labs_project(project_id, data):
    uid = data.get("userId")
    project_name = data.get("projectName") or project_id
    email = data.get("userEmail") or "unknown"
    voice_map = _build_voice_map(data)
    fallback_voice_id = data.get("elevenLabsVoiceId")
    dialogues = data.get("dialogues") or (data.get("syncData") or {}).get("dialogues") or []
    credits_charged = data.get("creditCost") or data.get("cost") or 0
    total = len(dialogues)
    start_time = time.time()

    rtdb_ref = db.reference(f"{PROJECTS_PATH}/{project_id}")
    fs_collection = data.get("firestoreCollection") or DEFAULT_FIRESTORE_COLLECTION
    fs_ref = _firestore_user_project_ref(uid, project_id, fs_collection) if uid else None

    meter = None

    try:
        if not voice_map and not fallback_voice_id:
            raise Exception("No 11Labs voice assigned to any character in this project.")
        if not dialogues:
            raise Exception("No dialogue lines to generate.")

        api_key = _get_api_key()
        if not api_key:
            raise Exception("ELEVENLABS_API_KEY is not set on this Space.")

        # 💳 Opening balance. A bad key is caught here, before a single
        # line is attempted.
        meter = _CreditMeter(api_key)
        opening = meter.prime()
        if opening == "invalid":
            raise Exception("ELEVENLABS_API_KEY was rejected by ElevenLabs (401/403).")
        if isinstance(opening, int):
            log_info(f"💳 [11Labs] {project_name}: opening balance {_fmt(opening)} credits on key {_key_label(api_key)}")
        else:
            log_info(f"💳 [11Labs] {project_name}: opening balance unavailable (lookup failed) — "
                     f"per-line character counts will still be exact")

        rtdb_ref.update({"status": "processing", "total_dialogues": total, "processed_dialogues": 0, "rejected_nodes": 0})
        if fs_ref: fs_ref.update({"status": "processing"})

        results = {}
        processed = [0]
        rejected = [0]
        failure_reasons = []
        progress_lock = threading.Lock()

        def _run_one(idx, line_text, character):
            # Per-character voice, exactly as the user assigned it in the
            # studio. Falls back to the project-wide voice, then to any
            # assigned voice, so one unmapped speaker never kills the job.
            line_voice = (
                voice_map.get(character)
                or fallback_voice_id
                or (next(iter(voice_map.values())) if voice_map else None)
            )
            if line_voice:
                audio, fail_reason = synth_elevenlabs(line_text, line_voice, key=api_key)
            else:
                audio, fail_reason = None, "no voice assigned to this character"

            # 💳 Per-line credit line. Characters submitted are exact and
            # counted locally; the balance is the throttled shared read
            # (see the module docstring on why these differ).
            if audio:
                chars = len(line_text or "")
                used_local = meter.add_chars(chars)
                start = meter.start_balance
                # ⚠️ Deliberately NOT showing a live balance per line.
                # ElevenLabs' /user/subscription counter lags well behind
                # actual usage — during a 20s project it sat at exactly the
                # opening figure for every single line, which reads as
                # "credits aren't being consumed" and is just wrong. The
                # characters we sent are exact and immediate, so the running
                # total is derived from those; the real balance is read once
                # at the start and once at the end, where the lag has caught
                # up enough to be meaningful.
                start_txt = f" · balance at start {_fmt(start)}" if isinstance(start, int) else ""
                log_success(
                    f"[11Labs] line {idx + 1}/{total} ✓ · {chars} chars · "
                    f"{_fmt(used_local)} chars used this project{start_txt} · voice {line_voice}"
                )
            else:
                log_error(
                    f"[11Labs] line {idx + 1}/{total} ✗ · {fail_reason or 'unknown'} · "
                    f"voice {line_voice or '(none assigned)'}"
                )

            with progress_lock:
                results[idx] = audio
                processed[0] += 1
                if not audio:
                    rejected[0] += 1
                    # Record WHY, so the completion report can explain the
                    # rejected count instead of just stating it.
                    failure_reasons.append(fail_reason or "unknown")
                rtdb_ref.update({"processed_dialogues": processed[0], "rejected_nodes": rejected[0]})

        with ThreadPoolExecutor(max_workers=min(max(total, 1), ELEVENLABS_CONCURRENCY)) as ex:
            futures = [
                ex.submit(
                    _run_one,
                    idx,
                    (d.get("line") or d.get("text") or ""),
                    (d.get("character") or "").strip(),
                )
                for idx, d in enumerate(dialogues)
            ]
            for fut in as_completed(futures):
                fut.result()  # surfaces any unexpected exception from _run_one itself

        rejected_nodes = rejected[0]
        if rejected_nodes >= total:
            raise Exception("Every line failed to generate (check ELEVENLABS_API_KEY and its remaining credits).")

        # ============================================================
        # 🔗 STITCH — identical treatment to studio.py's HQ path:
        # 0.8s of real silence between lines, and a timeline entry per
        # line so the frontend editor can seek to any dialogue.
        # Concatenating MP3s would give neither, which is why the synth
        # above asks ElevenLabs for raw PCM.
        # ============================================================
        SILENCE_GAP = 0.8
        silence_bytes = b"\x00" * int(PCM_SAMPLE_RATE * 2 * SILENCE_GAP)

        master_pcm = io.BytesIO()
        timeline = []
        elapsed_sec = 0.0
        last_kept_idx = max((i for i in range(total) if results.get(i)), default=-1)

        # ⚠️ The timeline MUST have one entry per dialogue, in the same
        # order, because the editor indexes them together
        # (voice-editor-dialog.tsx does syncData.timeline[idx] against
        # syncData.dialogues[idx]). Emitting entries only for the lines
        # that succeeded would shift every entry after a failed line, and
        # clicking dialogue 5 would play dialogue 4's audio. A failed line
        # therefore gets a zero-length entry at the current position
        # rather than being skipped.
        for idx in range(total):
            pcm = results.get(idx)
            if not pcm:
                timeline.append({"startTime": elapsed_sec, "duration": 0.0})
                continue

            # 16-bit mono at PCM_SAMPLE_RATE -> 2 bytes per sample.
            duration = len(pcm) / float(PCM_SAMPLE_RATE * 2)
            timeline.append({"startTime": elapsed_sec, "duration": duration})

            master_pcm.write(pcm)
            if idx < last_kept_idx:
                # Gap goes between lines only — never trailing after the
                # last one that actually produced audio.
                master_pcm.write(silence_bytes)
                elapsed_sec += duration + SILENCE_GAP
            else:
                elapsed_sec += duration

        pcm_bytes = master_pcm.getvalue()
        audio_bytes = pcm_to_mp3(pcm_bytes, sample_rate=PCM_SAMPLE_RATE, channels=1, bitrate=128)
        log_info(f"11Labs MP3 encode: {len(pcm_bytes)} bytes PCM -> {len(audio_bytes)} bytes MP3")

        node_id = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
        file_path = f"{PROJECTS_PATH}/{uid or 'unknown'}/{project_id}_{node_id}.mp3"
        audio_url = upload_to_r2(file_path, audio_bytes, "audio/mpeg")

        # syncData shaped exactly like studio.py's, so the existing editor
        # and player read an 11Labs project the same way as a Gemini one.
        completion_iso = datetime.now().isoformat()
        char_list = data.get("characters") or []
        final_sync_data = {
            "dialogues": dialogues,
            "timeline": timeline,
            "voiceAssignments": {str(c.get("name")): c.get("voice") for c in char_list if isinstance(c, dict)},
            "characterSettings": {
                c.get("name"): {"speed": 1.0, "pitch": 0}
                for c in char_list if isinstance(c, dict)
            },
            "clientTimestamp": data.get("clientTimestamp") or completion_iso,
        }

        rtdb_ref.update({
            "status": "completed", "audioUrl": audio_url,
            "processed_dialogues": total, "rejected_nodes": rejected_nodes,
        })
        if fs_ref:
            fs_ref.set({
                "status": "completed",
                "audioUrl": audio_url,
                "completedAt": firestore.SERVER_TIMESTAMP,
                "syncData": final_sync_data,
                # Persist final tallies — the RTDB queue node is deleted on
                # completion, so without these the completed screen has no
                # source for the rejected count and shows 0.
                "totalDialogues": total,
                "rejectedNodes": rejected_nodes,
                "id": project_id,
                "userId": uid,
            }, merge=True)

        if rejected_nodes > 0 and credits_charged > 0:
            partial_refund = round(credits_charged * (rejected_nodes / total), 2)
            if partial_refund > 0:
                refund_credits(
                    uid, partial_refund,
                    f"Partial refund: {rejected_nodes}/{total} 11Labs line(s) failed to generate",
                    project_id, credits_charged,
                )

        # Clear the queue node, same as studio.py does with
        # pending_projects. Without this the RTDB node grows without bound
        # (every finished project stays forever), and every listener event
        # re-scans all of them. The frontend is unaffected: it falls back
        # to the Firestore doc, which is already marked completed above.
        try:
            rtdb_ref.delete()
        except Exception as e:
            log_error(f"Could not clear queue node for {project_id}", str(e))

        mins, secs = divmod(int(time.time() - start_time), 60)
        send_telegram_log(
            f"😥😂 <b>11LABS STUDIO — READY</b>\n"
            f"———————————————\n"
            f"👤 <b>User:</b> {escapeHtml(email)}\n"
            f"📂 <b>Project:</b> {escapeHtml(project_name)}\n"
            f"⏱️ <b>Duration:</b> {mins}m {secs}s\n"
            f"💳 <b>Credits Charged:</b> {credits_charged}\n"
            f"📊 <b>Stats:</b> {total} nodes · {rejected_nodes} rejected\n"
            f"{_failure_summary(failure_reasons)}"
            f"🔗 <b>Link:</b> {audio_url}\n"
            f"{_credit_report(meter)}"
        )
        log_success(f"11Labs Studio project complete: {project_id}")

    except Exception as e:
        log_error(f"11Labs Studio project failed: {project_id}", str(e))
        rtdb_ref.update({"status": "error", "error": str(e)})
        if fs_ref: fs_ref.update({"status": "error"})
        send_telegram_log(
            f"🚨 <b>11Labs Studio Fault</b>\n🆔 <code>{escapeHtml(project_id)}</code>\n"
            f"💳 <b>Credits Charged:</b> {credits_charged}\n<code>{escapeHtml(str(e))}</code>\n"
            f"{_credit_report(meter)}"
        )
        if uid and credits_charged:
            refund_credits(uid, credits_charged, f"11Labs generation failed: {str(e)}", project_id, credits_charged)
    finally:
        with _processing_lock:
            _processing_ids.discard(project_id)


def _failure_summary(reasons):
    """One line per distinct failure cause, with a count. Without this the
    report says "4 rejected" and nothing else, which is not actionable."""
    if not reasons:
        return ""
    counts = {}
    for r in reasons:
        counts[r] = counts.get(r, 0) + 1
    parts = [f"{n}× {escapeHtml(r)}" for r, n in sorted(counts.items(), key=lambda kv: -kv[1])]
    return f"⚠️ <b>Failures:</b> {' · '.join(parts)}\n"


def _credit_report(meter):
    """Closing 💳 block for the Telegram message: just the 11Labs key's
    balance before this project started and after it finished — no local
    character count and no "moved by" delta line, both dropped per
    request since they only muddied the one number that actually
    matters here. Returns "" if the project failed before the meter
    existed, or if the balance couldn't be read at all (a bare character
    count with no credit figure next to it is not what was asked for).

    ElevenLabs' own usage counter updates on a short delay — a project that
    finishes in a few seconds can read back the exact same "before" and
    "after" balance even though it just spent real credits, because the
    key's side hasn't caught up yet. Waiting here before the one
    authoritative read gives it that time, so the number in the report
    is far more likely to already reflect this project."""
    if meter is None:
        return ""
    time.sleep(CREDIT_REFRESH_DELAY_SEC)
    # Force a fresh read rather than reusing a throttled one, so the closing
    # figure is as current as the API will give us.
    meter.force_refresh()
    start, end, _, _ = meter.summary()
    if isinstance(start, int) and isinstance(end, int):
        return f"———————————————\n💳 <b>11Labs Credits:</b> {_fmt(start)} → {_fmt(end)}"
    if isinstance(end, int):
        return f"———————————————\n💳 <b>11Labs Credits Left:</b> {_fmt(end)}"
    return ""


def _drain_projects_queue(source="unknown"):
    try:
        try:
            snapshot = db.reference(PROJECTS_PATH).order_by_child("status").equal_to("in_queue").get()
        except Exception as e:
            if "Index not defined" in str(e):
                log_error(
                    "11Labs queue drain: missing DB index",
                    f"Add \".indexOn\": [\"status\"] for path \"/{PROJECTS_PATH}\" to the Firebase "
                    "rules — falling back to a full scan for now."
                )
                full = db.reference(PROJECTS_PATH).get()
                snapshot = {pid: d for pid, d in (full or {}).items() if isinstance(d, dict) and d.get("status") == "in_queue"} if full else None
            else:
                raise

        if not snapshot:
            return

        for pid, data in snapshot.items():
            if not isinstance(data, dict):
                continue
            with _processing_lock:
                if len(_processing_ids) >= MAX_CONCURRENT_PROJECTS or pid in _processing_ids:
                    continue
                _processing_ids.add(pid)
            log_info(f"▶️ [11Labs] Picked up {pid} from {PROJECTS_PATH} (source: {source})")
            threading.Thread(target=process_11labs_project, args=(pid, data), daemon=True).start()
    except Exception as e:
        log_error("11Labs queue drain failed", str(e))


def _on_projects_event(event):
    _drain_projects_queue(source="listener")


def _attach_projects_listener():
    try:
        db.reference(PROJECTS_PATH).listen(_on_projects_event)
        log_info(f"👂 {PROJECTS_PATH} realtime listener attached (11Labs Studio)")
    except Exception as e:
        log_error("Failed to attach 11_projects listener (11Labs Studio)", str(e))


# ============================================================
# 🚀 ENTRY POINT — call once from app.py's lifespan startup
# ============================================================
def start_11labs_listener():
    if not _get_api_key():
        log_error(
            "ELEVENLABS_API_KEY is not set",
            "11Labs Studio will accept jobs but every project will fail immediately. "
            "Add the secret to this Space and restart."
        )
    _attach_projects_listener()
