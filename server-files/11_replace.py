"""
11_replace.py
---------------------
🎙️ ELEVENLABS VOICE REPLACEMENT ENGINE
========================================
Same job as voice_replacement.py (splice a new voice into just the
mapped characters' lines, leave every other line byte-identical) but for
projects generated on the 11Labs engine instead of Gemini Live.

WHY A SEPARATE FILE INSTEAD OF BRANCHING voice_replacement.py:
  - Different synthesis backend entirely (ElevenLabs REST TTS vs Gemini
    Live websocket) — different retry/error shapes (429 quota, 401/403
    auth, 409 voice-still-warming), different auth (xi-api-key header
    vs GEMINI_KEYS pool).
  - Keeping them on separate RTDB queue nodes (`elevenlabs_replacement`
    here vs `voice_replacement` for Gemini) means a burst of one kind of
    job never blocks or competes for MAX_CONCURRENT_REPLACEMENTS slots
    with the other, and a bug in one worker can't take the other down.

Listens on RTDB `elevenlabs_replacement/{requestId}` for jobs shaped
EXACTLY like voice_replacement.py's (frontend reuses the same payload
builder, just points it at a different node — see
src/components/history/voice-editor-dialog.tsx):

{
  "projectId": "HQ_12345",
  "userId": "USER_ABCDE",
  "status": "pending",
  "timestamp": 1772590885,
  "mappings": [
    {
      "characterName": "John",
      "targetVoiceId": "21m00Tcm4TlvDq8ikWAM",   # an ElevenLabs voice_id
      "ageGroup": "adult"
    }
  ],
  "originalAudioUrl": "https://r2.twelvelabs.co/hq_gen/UID/HQ_12345.mp3",
  "creditsCharged": 40
}

What it does — identical shape to voice_replacement.py:
  1. Reads the project's syncData (dialogues + timeline) from Firestore,
     from whichever collection the project actually lives in (11Labs
     engine projects submitted from the main studio land in the same
     `projects/{uid}/userProjects/{projectId}` doc as Gemini ones — see
     src/app/studio/actions.ts's `voiceEngine` field — so this defaults
     to "projects", not "11_projects"; override via the job's
     `firestoreCollection` field if a caller ever needs to).
  2. Downloads + decodes the ORIGINAL master mp3 back to raw PCM.
  3. For every dialogue line spoken by a mapped character, re-synthesizes
     just that line with the new ElevenLabs voice_id.
  4. Every other line is sliced straight out of the original audio —
     untouched — using the saved timeline.
  5. Rebuilds the master track in original order, re-encodes to mp3,
     uploads it to R2, updates Firestore (audioUrl / edited / syncData),
     deletes the OLD R2 object, and marks the RTDB job "completed".

NOTE — duplication vs 11.py / studio.py, deliberately, same reasoning
voice_replacement.py already documents for itself: the ElevenLabs TTS
call (_tts_request/synth_elevenlabs) is duplicated here in trimmed form
rather than imported from 11.py, because "11.py" isn't a valid Python
module name (leading digit) and is loaded via importlib.util by path in
app.py — reaching into that already-loaded module from a second
importlib-loaded file adds fragile load-order coupling for no real
benefit. Logging/refund/pcm helpers (log_*, escapeHtml, refund_credits,
FIRESTORE_DATABASE_ID, pcm_to_mp3) ARE imported from studio.py, same as
11.py itself does — those have no such naming problem and are the
single source of truth for credit refunds.

NEW DEPENDENCY: none beyond what voice_replacement.py already needs
(pydub + ffmpeg for decoding the existing mp3 back into raw PCM).

Mount into app.py (same importlib pattern as 11.py, since "11_replace"
also starts with a digit):
    _eleven_replace_spec = importlib.util.spec_from_file_location(
        "eleven_labs_replace", os.path.join(os.path.dirname(__file__), "11_replace.py")
    )
    eleven_labs_replace = importlib.util.module_from_spec(_eleven_replace_spec)
    _eleven_replace_spec.loader.exec_module(eleven_labs_replace)
    # then, inside lifespan():
    eleven_labs_replace.start_pending_elevenlabs_replacement_listener()

RTDB rules needed (database.rules.json) — same shape as voice_replacement:
    "elevenlabs_replacement": { ...owner-or-admin read/write, ".indexOn": [...] }
"""

import os
import io
import time
import string
import secrets
import threading
import requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from pydub import AudioSegment
from firebase_admin import db, firestore
from r2_netlify import upload_to_r2, delete_from_r2

from studio import (
    log_info, log_error, log_success, escapeHtml, refund_credits,
    FIRESTORE_DATABASE_ID, pcm_to_mp3,
)
from r2_netlify import send_telegram_log


ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


def _get_api_key():
    """Same single paid key as 11.py — read at call time, not import time,
    so a Space secret added after boot is picked up on the next job."""
    return (os.environ.get("ELEVENLABS_API_KEY") or "").strip()


ELEVENLABS_MODEL_ID = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_v3_conversational")
ELEVENLABS_OUTPUT_FORMAT = "pcm_24000"  # matches BYTES_PER_SEC math below


class _QuotaExceeded(Exception):
    """429, or the key is out of credits."""
    pass


class _AuthError(Exception):
    """401/403 — bad or revoked key."""
    pass


class _VoiceBusy(Exception):
    """409 already_running — ElevenLabs is mid-way through adding this
    library voice to the account. Its own message says to retry shortly."""
    pass


def build_age_delivery_hint(age_group):
    """ElevenLabs has no Gemini-style natural-language prompt to steer
    delivery — but the v3 conversational model DOES support inline
    bracketed audio-direction tags in the text itself (e.g. "[whispers]",
    "[old, frail voice]"). This is the ElevenLabs-side equivalent of
    voice_replacement.py's build_age_directive() for Gemini — same intent
    (make the Age Group picker actually change the performance), different
    mechanism because the two APIs don't share one."""
    am = (age_group or "adult").lower()
    if am in ("kid", "child", "young"):
        return "[speaking in a bright, playful child's voice] "
    if am in ("old", "senior", "elderly"):
        return "[speaking in a slower, frailer, elderly voice] "
    return ""


def voice_settings_for_age(age_group):
    """Secondary lever alongside the text hint above — nudges stability/
    similarity_boost per age band. Modest adjustments only; ElevenLabs
    voice_settings can't fully re-age a voice on their own, the text hint
    is doing most of the work."""
    am = (age_group or "adult").lower()
    if am in ("kid", "child", "young"):
        return {"stability": 0.35, "similarity_boost": 0.65}  # more expressive/varied
    if am in ("old", "senior", "elderly"):
        return {"stability": 0.65, "similarity_boost": 0.75}  # steadier, less erratic
    return {"stability": 0.5, "similarity_boost": 0.75}


def _tts_request(text, voice_id, key, model_id=None, age_group=None):
    """One TTS call -> raw 16-bit PCM at 24kHz mono (same format the
    splice math below and pcm_to_mp3 expect). age_group (Kid/Adult/Old)
    steers delivery via an inline v3 audio-direction tag + voice_settings
    — see build_age_delivery_hint/voice_settings_for_age above; previously
    this was accepted from the frontend and simply never used."""
    hinted_text = build_age_delivery_hint(age_group) + text
    resp = requests.post(
        f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}",
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/pcm"},
        params={"output_format": ELEVENLABS_OUTPUT_FORMAT},
        json={"text": hinted_text, "model_id": model_id or ELEVENLABS_MODEL_ID,
              "voice_settings": voice_settings_for_age(age_group)},
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


# Retries per line, same numbers 11.py uses for consistency.
ELEVENLABS_MAX_RETRIES = int(os.environ.get("ELEVENLABS_MAX_RETRIES", "4"))
ELEVENLABS_RETRY_BASE_DELAY = float(os.environ.get("ELEVENLABS_RETRY_BASE_DELAY", "2"))


def synth_elevenlabs_line(text, voice_id, key, age_group=None):
    """Retries a single line through 409 (voice warming) / 429 (quota) /
    transient errors. Returns (pcm_bytes_or_None, fail_reason_or_None)."""
    last_reason = None
    for attempt in range(ELEVENLABS_MAX_RETRIES):
        try:
            return _tts_request(text, voice_id, key, age_group=age_group), None
        except _VoiceBusy as e:
            last_reason = f"voice warming up ({e})"
        except _QuotaExceeded as e:
            last_reason = str(e)
            # No point retrying a quota-exhausted key repeatedly — but a
            # single 429 CAN be a burst/rate-limit rather than true
            # exhaustion, so still back off and retry within the budget.
        except _AuthError as e:
            # Bad key — retrying won't help, fail this line immediately.
            return None, f"auth error ({e})"
        except Exception as e:
            last_reason = str(e)[:200]

        if attempt < ELEVENLABS_MAX_RETRIES - 1:
            delay = ELEVENLABS_RETRY_BASE_DELAY * (2 ** attempt)
            time.sleep(delay)

    return None, last_reason or "unknown error"


def normalize_name(n):
    nm = str(n).lower().strip()
    if nm in ['narrator', 'नैरेटर', 'कथावाचक', 'वक्ता', 'speaker', 'background',
              'storyteller', 'কথক', 'বর্ণনাকারী', 'கதைசொல்லி', 'కథకుడు']:
        return "narrator"
    return nm


def clean_error_message(e, max_len=120):
    """Same as voice_replacement.py's — short, user-facing, no URLs."""
    import re
    msg = str(e).strip()
    http_match = re.match(r"(\d{3}) (Client|Server) Error:", msg)
    if http_match:
        return f"Audio fetch failed ({http_match.group(1)})"
    msg = re.sub(r"https?://\S+", "", msg).strip(" :-")
    if not msg:
        msg = "Unexpected error"
    if len(msg) > max_len:
        msg = msg[:max_len - 1].rstrip() + "…"
    return msg


def r2_key_from_url(url):
    """Same as voice_replacement.py's — pulls the object key out of an R2
    public URL regardless of which domain fronts it."""
    try:
        from urllib.parse import urlparse
        path = urlparse(url).path
        key = path.lstrip("/")
        return key or None
    except Exception:
        return None


def _firestore_user_project_ref(uid, project_id, collection=None):
    """11Labs-engine projects submitted from the main studio live in the
    SAME `projects` collection as Gemini ones (see src/app/studio/
    actions.ts's `voiceEngine` field on the doc) — this is NOT the
    `11_projects` RTDB queue node. Defaults to "projects"; overridable
    via the job's `firestoreCollection` field for any other caller."""
    return (
        firestore.client(database_id=FIRESTORE_DATABASE_ID)
        .collection(collection or "projects").document(uid)
        .collection("userProjects").document(project_id)
    )


# --- 🔧 CORE JOB (splice math identical to voice_replacement.py's) ---
BYTES_PER_SEC = 24000 * 2  # 24kHz, 16-bit mono
SILENCE_GAP = 0.8
SILENCE_BYTES = b'\x00' * int(BYTES_PER_SEC * SILENCE_GAP)

processing_ids = set()
MAX_CONCURRENT_REPLACEMENTS = 3

_VR_JOB_CLEANUP_DELAY_SECONDS = 30


def _cleanup_job_later(request_id, delay=_VR_JOB_CLEANUP_DELAY_SECONDS):
    def _do_cleanup():
        time.sleep(delay)
        try:
            db.reference(f"elevenlabs_replacement/{request_id}").delete()
        except Exception as cleanup_err:
            log_error(f"Failed to clean up finished elevenlabs_replacement job {request_id}", str(cleanup_err))
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


def process_elevenlabs_replacement(request_id, data):
    global processing_ids
    project_id = data.get("projectId")
    uid = data.get("userId")
    original_audio_url = data.get("originalAudioUrl")
    job_ref = db.reference(f"elevenlabs_replacement/{request_id}")
    credits_charged = 0
    for key in ("creditsCharged", "creditCost", "cost"):
        val = data.get(key)
        if isinstance(val, (int, float)) and val > 0:
            credits_charged = val
            break

    # --- Same flexible payload shapes voice_replacement.py accepts ---
    mappings = data.get("mappings") or []
    if not mappings and data.get("replacements"):
        mappings = [
            {
                "characterName": r.get("charName"),
                "targetVoiceId": r.get("newVoiceId"),
                "ageGroup": r.get("ageGroup"),
            }
            for r in data.get("replacements", [])
            if r.get("charName") and r.get("newVoiceId")
        ]
    if not mappings and data.get("character") and data.get("newVoiceId"):
        mappings = [{
            "characterName": data.get("character"),
            "targetVoiceId": data.get("newVoiceId"),
            "ageGroup": data.get("ageGroup"),
        }]

    char_names = ", ".join(m.get("characterName", "?") for m in mappings) if mappings else "—"
    send_telegram_log(
        f"📬 <b>11Labs Voice Replacement Received</b>\n\n"
        f"🆔 <b>Request:</b> <code>{escapeHtml(request_id)}</code>\n"
        f"📂 <b>Project:</b> {escapeHtml(project_id or '—')}\n"
        f"👤 <b>User:</b> {escapeHtml(uid or '—')}\n"
        f"🎭 <b>Characters:</b> {escapeHtml(char_names)}"
    )

    try:
        missing = [k for k, v in {
            "projectId": project_id, "userId": uid,
            "mappings (or character+newVoiceId)": mappings, "originalAudioUrl": original_audio_url,
        }.items() if not v]
        if missing:
            raise Exception(f"Missing required field(s): {', '.join(missing)}")

        api_key = _get_api_key()
        if not api_key:
            raise Exception("ELEVENLABS_API_KEY is not set on this Space.")

        job_ref.update({"status": "processing"})
        log_info(f"🔁 11Labs voice replacement START: {request_id} (project {project_id})")

        # --- 1. Load project syncData from Firestore ---
        fs_collection = data.get("firestoreCollection") or "projects"
        project_ref_fs = _firestore_user_project_ref(uid, project_id, fs_collection)
        proj_snap = project_ref_fs.get()
        if not proj_snap.exists:
            raise Exception(f"Project {project_id} not found for user {uid} in '{fs_collection}'.")
        proj_data = proj_snap.to_dict() or {}
        sync_data = proj_data.get("syncData", {})
        dialogues = sync_data.get("dialogues") or proj_data.get("dialogues") or []
        timeline = sync_data.get("timeline") or []
        voice_assignments = dict(sync_data.get("voiceAssignments", {}))
        character_settings = dict(sync_data.get("characterSettings", {}))

        if not dialogues or not timeline or len(dialogues) != len(timeline):
            raise Exception("syncData.dialogues / syncData.timeline missing or out of sync — can't splice safely.")

        # --- 2. Build character -> target ElevenLabs voice_id map ---
        # ageGroup was previously accepted from the frontend and silently
        # dropped here — the Age Group picker had zero effect on 11Labs
        # output. Now carried through to synth_elevenlabs_line, which
        # steers delivery via a v3 audio-direction tag + voice_settings
        # (see build_age_delivery_hint / voice_settings_for_age above).
        target_map = {}
        for m in mappings:
            norm = normalize_name(m.get("characterName", ""))
            target_map[norm] = {"voice_id": m.get("targetVoiceId"), "age_group": m.get("ageGroup")}
        if not target_map:
            raise Exception("No valid character mappings in request.")

        # --- 3. Download + decode the ORIGINAL master audio to raw PCM ---
        resp = requests.get(original_audio_url, timeout=60)
        resp.raise_for_status()
        seg = AudioSegment.from_file(io.BytesIO(resp.content), format="mp3")
        seg = seg.set_frame_rate(24000).set_channels(1).set_sample_width(2)
        master_pcm = seg.raw_data

        # --- 4. Which dialogue indices need re-synthesis ---
        resynth_tasks = []  # (idx, text, voice_id, age_group)
        for idx, d in enumerate(dialogues):
            char_name = d.get("character") or "Narrator"
            norm = normalize_name(char_name)
            if norm in target_map:
                text = d.get("line") or d.get("text") or ""
                if text.strip():
                    resynth_tasks.append((idx, text, target_map[norm]["voice_id"], target_map[norm]["age_group"]))

        if not resynth_tasks:
            raise Exception("None of the mapped character names matched any dialogue in this project.")

        log_info(f"🎯 {len(resynth_tasks)} line(s) need re-synthesis out of {len(dialogues)} total.")

        # --- 5. Re-synthesize just those lines, in parallel ---
        new_pcm_by_idx = {}
        failure_reasons = []
        max_workers = min(len(resynth_tasks), 3)  # same ELEVENLABS_CONCURRENCY ceiling as 11.py's default
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(synth_elevenlabs_line, text, voice_id, api_key, age_group): idx
                for idx, text, voice_id, age_group in resynth_tasks
            }
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    pcm, fail_reason = future.result()
                except Exception as e:
                    pcm, fail_reason = None, str(e)[:200]
                if pcm:
                    new_pcm_by_idx[idx] = pcm
                else:
                    failure_reasons.append(fail_reason or "unknown")
                    log_error(f"[11Labs-Replace] Dialogue {idx+1} resynth REJECTED — keeping original audio.", fail_reason)

        # --- 6. Rebuild the master track in order ---
        master_stream = io.BytesIO()
        new_timeline = []
        cursor = 0.0
        for idx in range(len(dialogues)):
            if idx in new_pcm_by_idx:
                seg_pcm = new_pcm_by_idx[idx]
            else:
                t = timeline[idx]
                offset = int(round(t.get("startTime", 0) * BYTES_PER_SEC))
                length = int(round(t.get("duration", 0) * BYTES_PER_SEC))
                seg_pcm = master_pcm[offset:offset + length]

            duration = len(seg_pcm) / BYTES_PER_SEC
            new_timeline.append({"startTime": cursor, "duration": duration})
            master_stream.write(seg_pcm)
            if idx < len(dialogues) - 1:
                master_stream.write(SILENCE_BYTES)
                cursor += duration + SILENCE_GAP
            else:
                cursor += duration

        final_pcm = master_stream.getvalue()
        final_mp3 = pcm_to_mp3(final_pcm, sample_rate=24000, channels=1, bitrate=128)
        log_info(f"11Labs-Replace MP3 re-encode: {len(final_pcm)} bytes PCM -> {len(final_mp3)} bytes MP3")

        # --- 7. Upload new master, update Firestore ---
        token = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
        new_path = f"hq_gen/{uid}/{project_id}_swap11_{token}.mp3"
        new_url = upload_to_r2(new_path, final_mp3, 'audio/mpeg')

        for norm, info in target_map.items():
            for d in dialogues:
                if normalize_name(d.get("character") or "") == norm:
                    voice_assignments[d.get("character")] = info["voice_id"]
                    break

        sync_data["timeline"] = new_timeline
        sync_data["voiceAssignments"] = voice_assignments
        sync_data["dialogues"] = dialogues  # text unchanged, kept for completeness

        project_ref_fs.set({
            "audioUrl": new_url,
            "edited": True,
            "syncData": sync_data,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)

        # --- 8. Delete the OLD R2 file ---
        old_key = r2_key_from_url(original_audio_url)
        if old_key:
            try:
                delete_from_r2(old_key)
                log_info(f"🗑️ Deleted old R2 object: {old_key}")
            except Exception as e:
                log_error(f"Failed to delete old R2 object ({old_key}) — continuing anyway", str(e))
        else:
            log_error(f"Couldn't parse R2 key from originalAudioUrl: {original_audio_url}")

        # --- 9. Mark job completed ---
        rejected = len(resynth_tasks) - len(new_pcm_by_idx)
        job_ref.update({
            "status": "completed",
            "newAudioUrl": new_url,
            "linesReplaced": len(new_pcm_by_idx),
            "linesRequested": len(resynth_tasks),
            "completedAt": datetime.now().isoformat(),
        })
        log_success(f"✅ 11Labs voice replacement DONE: {request_id} ({len(new_pcm_by_idx)}/{len(resynth_tasks)} lines swapped)")
        _cleanup_job_later(request_id)

        send_telegram_log(
            f"✅ <b>11Labs Voice Replacement Completed</b>\n\n"
            f"🆔 <b>Request:</b> <code>{escapeHtml(request_id)}</code>\n"
            f"📂 <b>Project:</b> {escapeHtml(project_id)}\n"
            f"🔁 <b>Lines swapped:</b> {len(new_pcm_by_idx)}/{len(resynth_tasks)}\n"
            f"🔗 <b>New audio:</b> {escapeHtml(new_url)}"
        )

        # Partial refund if some lines silently kept the old voice —
        # same policy as 11.py's own generation path.
        if rejected > 0 and credits_charged > 0:
            partial_refund = round(credits_charged * (rejected / len(resynth_tasks)), 2)
            if partial_refund > 0:
                refund_credits(
                    uid, partial_refund,
                    f"Partial refund: {rejected}/{len(resynth_tasks)} 11Labs replacement line(s) failed",
                    request_id, credits_charged,
                )

    except Exception as e:
        log_error(f"11Labs voice replacement FAILED: {request_id}", str(e))
        job_ref.update({"status": "error", "error": str(e)})
        _cleanup_job_later(request_id)
        send_telegram_log(
            f"🚨 <b>11Labs Voice Replacement FAILED</b>\n\n"
            f"🆔 <b>Request:</b> <code>{escapeHtml(request_id)}</code>\n"
            f"📂 <b>Project:</b> {escapeHtml(project_id or '—')}\n"
            f"👤 <b>User:</b> {escapeHtml(uid or '—')}\n"
            f"❌ <b>Error:</b> <code>{escapeHtml(str(e))}</code>"
        )

        # 🔴 Full refund — a failed swap means the user got no replacement
        # audio for what they were charged.
        if credits_charged > 0:
            refund_credits(uid, credits_charged, f"11Labs voice replacement failed: {clean_error_message(e)}", request_id, credits_charged)
    finally:
        processing_ids.discard(request_id)


# --- 🔊 LISTENER (same event-driven pattern as voice_replacement.py) ---
REQUIRED_FIELDS = ("projectId", "userId", "originalAudioUrl")
WRITE_GRACE_SECONDS = 3


def _looks_incomplete(data):
    if any(not data.get(k) for k in REQUIRED_FIELDS):
        return True
    has_mappings = bool(data.get("mappings"))
    has_replacements = bool(data.get("replacements"))
    has_flat = bool(data.get("character")) and bool(data.get("newVoiceId"))
    return not (has_mappings or has_replacements or has_flat)


def _maybe_start_replacement(rid, data):
    if len(processing_ids) >= MAX_CONCURRENT_REPLACEMENTS:
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
    _check_job_abuse(data.get("userId"), "elevenlabs_replacement")
    threading.Thread(target=process_elevenlabs_replacement, args=(rid, data), daemon=True).start()


def _on_elevenlabs_replacement_event(event):
    """Same bandwidth-safe event handling as voice_replacement.py — only
    ever acts on the data the event itself carries, never re-fetches the
    whole node (that was the old bandwidth bug elsewhere in this repo)."""
    try:
        parts = [p for p in (event.path or "/").split("/") if p]
        data = event.data

        if len(parts) == 0:
            if isinstance(data, dict):
                for rid, job_data in data.items():
                    if len(processing_ids) >= MAX_CONCURRENT_REPLACEMENTS:
                        break
                    _maybe_start_replacement(rid, job_data)
        elif len(parts) == 1:
            _maybe_start_replacement(parts[0], data)
        # len(parts) > 1 -> field-level patch (our own write) -> ignore
    except Exception as e:
        log_error("elevenlabs_replacement listener callback error", str(e))


_listener_registration = [None]


def _attach_elevenlabs_replacement_listener():
    try:
        reg = db.reference('elevenlabs_replacement').listen(_on_elevenlabs_replacement_event)
        _listener_registration[0] = reg
        log_success("👂 Realtime listener attached: elevenlabs_replacement")
    except Exception as e:
        log_error("Failed to attach elevenlabs_replacement listener", str(e))


def start_pending_elevenlabs_replacement_listener():
    """Attaches the realtime listener only — same no-poll, no duplicate
    startup-read policy as voice_replacement.py. Safe to call once,
    guarded by app.py's startup lifespan."""
    _attach_elevenlabs_replacement_listener()
    log_success("11Labs voice-replacement worker ready: realtime listener only")
