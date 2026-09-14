import os
import json
import threading
import traceback
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
import firebase_admin
from firebase_admin import credentials, db, firestore

from script_analysis import start_pending_script_listener
from store_script_generation import router as store_script_router
from music_generation import start_pending_music_listener
# script_generation's listener is now RE-ENABLED — script generation is
# moving back server-side (direct Gemini keys) instead of the client-side
# browser call. IMPORTANT: the frontend must write its pending job to
# script_projects/{mappingId} (status:"pending") and then listen for the
# result at script_projects/{userId}/userProjects/{mappingId} — NOT the
# `projects` collection the old client-side path used. If the frontend is
# still reading from `projects`, it will look like "generation isn't
# working" even though this listener is running and producing scripts.
from script_generation import start_pending_script_generation_listener
from voice_replacement import start_pending_voice_replacement_listener
from voice_cloning import start_pending_voice_cloning_listener
from studio import start_pending_voice_listener
from thumbnail_generation import start_pending_thumbnail_listener
from daily_cost_report import start_daily_cost_reporter
from r2_netlify import upload_to_r2, delete_from_r2, random_object_key  # kept importable from app.py too, in case anything reaches for it here
from api import router as public_api_router  # 🌐 direct HTTP API (voice/music/script) — see api.py

# 🎙️ 11Labs Studio (server-files/11.py). Plain `import 11` is a
# SyntaxError — module names can't start with a digit — so it's loaded by
# file path instead. This is a pure background worker (submit/listen on
# RTDB, same pattern as studio.py), not an HTTP router, so nothing is
# mounted with app.include_router() for it — only its listener is started
# below, next to start_pending_voice_listener().
import importlib.util as _importlib_util
_eleven_labs_spec = _importlib_util.spec_from_file_location(
    "eleven_labs_studio", os.path.join(os.path.dirname(__file__), "11.py")
)
eleven_labs_studio = _importlib_util.module_from_spec(_eleven_labs_spec)
_eleven_labs_spec.loader.exec_module(eleven_labs_studio)

# 🔁 11Labs Voice Replacement (server-files/11_replace.py). Same digit-
# leading-filename problem as 11.py above, same importlib-by-path fix.
# Separate worker/queue node (elevenlabs_replacement) from Gemini's
# voice_replacement.py, so a burst of one never blocks the other.
_eleven_replace_spec = _importlib_util.spec_from_file_location(
    "eleven_labs_replace", os.path.join(os.path.dirname(__file__), "11_replace.py")
)
eleven_labs_replace = _importlib_util.module_from_spec(_eleven_replace_spec)
_eleven_replace_spec.loader.exec_module(eleven_labs_replace)


# --- 🎨 NEURAL COLOR ENGINE ---
class bcolors:
    OKGREEN = '\033[92m'
    OKCYAN = '\033[96m'
    OKBLUE = '\033[94m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

def log_success(msg):
    print(f"{bcolors.OKGREEN}[HQ-SUCCESS] {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)

def log_error(msg, detail=None):
    print(f"{bcolors.FAIL}[HQ-ERROR]   {datetime.now().strftime('%H:%M:%S')} - 🚨 {msg}{bcolors.ENDC}", flush=True)
    if detail: print(f"{bcolors.FAIL}{detail}{bcolors.ENDC}", flush=True)

def log_info(msg):
    print(f"{bcolors.OKCYAN}[HQ-NODE]    {datetime.now().strftime('%H:%M:%S')} - {msg}{bcolors.ENDC}", flush=True)


# ============================================================
# 🔥 FIREBASE INIT — process-wide default app. Every other module
# (studio.py, music_generation.py, script_generation.py, ...) just does
# `from firebase_admin import db, firestore` and reuses this same app;
# they don't need to (and shouldn't) call initialize_app() again.
# ============================================================
firestore_db = None
try:
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if sa_json:
        service_account_info = json.loads(sa_json)
        # 🔎 DIAGNOSTIC: confirm which GCP project this service account actually
        # belongs to. If this printed project_id is NOT the same project where
        # Firestore's "(default)" database was created (check Firebase console
        # → Project Settings → your project), that mismatch is the root cause
        # of "Invalid database id (default)" — the SDK is querying a project
        # that has no Firestore database at all.
        log_info(f"🔎 Service account project_id = {service_account_info.get('project_id')}")
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred, {
            'databaseURL': "https://twelvelabs-copy-88796906-8d524-default-rtdb.asia-southeast1.firebasedatabase.app"
        })
        firestore_db = firestore.client()
        log_success("HQ Cluster v11.0: ONLINE | Live API Voice-Consistency Engine Active")
    else:
        log_error("FIREBASE_SERVICE_ACCOUNT_KEY missing.")
except Exception:
    log_error("Initialization Failed", traceback.format_exc())


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=start_pending_voice_listener, daemon=True).start()
    start_pending_script_listener()
    start_pending_music_listener()
    start_pending_script_generation_listener()
    start_pending_voice_replacement_listener()
    start_pending_voice_cloning_listener()
    start_pending_thumbnail_listener()
    start_daily_cost_reporter()
    eleven_labs_studio.start_11labs_listener()  # 🎙️ 11Labs Studio — its own 11_projects node + periodic 11_voice_catalog refresh
    eleven_labs_replace.start_pending_elevenlabs_replacement_listener()  # 🔁 11Labs Voice Replacement — elevenlabs_replacement node
    yield

app = FastAPI(lifespan=lifespan)
app.include_router(store_script_router)
app.include_router(public_api_router)  # 🌐 /api/v1/voice, /api/v1/music, /api/v1/script

@app.get("/")
async def health(key: str = Query(default="")):
    expected = os.environ.get("HQ_ACCESS_KEY")
    if not expected or key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"message": "hello yash how are you i am your pet"}


# ============================================================
# 🧹 ONE-TIME CLEANUP — purges already-accumulated finished jobs from
# pending_script_analysis and voice_replacement (the two RTDB nodes that
# were never being cleaned up, and got fully re-downloaded every 5s by the
# poll safety-nets — this is what ran up the runaway bandwidth bill).
#
# Same HQ_ACCESS_KEY gate as the health route above — no new secret needed.
# Visit once from a browser or curl:
#   Dry run (just counts, deletes nothing):
#     https://<your-space>.hf.space/admin/cleanup-old-jobs?key=YOUR_KEY
#   Actually delete:
#     https://<your-space>.hf.space/admin/cleanup-old-jobs?key=YOUR_KEY&apply=true
#
# Safe to leave in place afterwards — it only ever touches jobs that are
# already in a terminal state (status ok/error/completed) and at least
# CLEANUP_KEEP_NEWER_THAN_MINUTES old, so it can't step on anything active.
# Remove this block once you've confirmed usage has dropped, if you'd
# rather not keep an admin route around.
# ============================================================
import time as _cleanup_time

CLEANUP_KEEP_NEWER_THAN_MINUTES = 10

def _cleanup_is_recent(job_data, minutes=CLEANUP_KEEP_NEWER_THAN_MINUTES):
    ts = job_data.get("timestamp") or job_data.get("completedAt")
    if not ts:
        return False
    try:
        if isinstance(ts, (int, float)):
            ts_seconds = ts / 1000 if ts > 1e12 else ts
            age_seconds = _cleanup_time.time() - ts_seconds
        else:
            ts_dt = datetime.fromisoformat(str(ts))
            age_seconds = (datetime.now() - ts_dt).total_seconds()
        return age_seconds < minutes * 60
    except Exception:
        return False

def _cleanup_scan(path, terminal_statuses, apply):
    """path is either a top-level node with {userId: {jobId: data}} shape
    (pending_script_analysis) or a flat {jobId: data} shape
    (voice_replacement) — detected by whether values are themselves dicts
    of dicts."""
    ref = db.reference(path)
    snapshot = ref.get() or {}
    total = 0
    eligible = []

    def _consider(full_path, data):
        nonlocal total
        total += 1
        if not isinstance(data, dict):
            return
        if data.get("status") not in terminal_statuses:
            return
        if _cleanup_is_recent(data):
            return
        eligible.append((full_path, len(json.dumps(data))))

    is_nested = all(
        isinstance(v, dict) and any(isinstance(vv, dict) for vv in v.values())
        for v in snapshot.values()
    ) if snapshot else False

    if is_nested:
        for user_id, jobs in snapshot.items():
            if not isinstance(jobs, dict):
                continue
            for job_id, data in jobs.items():
                _consider(f"{path}/{user_id}/{job_id}", data)
    else:
        for job_id, data in snapshot.items():
            _consider(f"{path}/{job_id}", data)

    freed_bytes = sum(size for _, size in eligible)
    if apply:
        for full_path, _ in eligible:
            db.reference(full_path).delete()

    return {
        "node": path,
        "total_entries": total,
        "eligible_for_deletion": len(eligible),
        "approx_mb_freed": round(freed_bytes / (1024 * 1024), 2),
        "deleted": apply,
    }

@app.get("/admin/cleanup-old-jobs")
async def cleanup_old_jobs(key: str = Query(default=""), apply: bool = Query(default=False)):
    expected = os.environ.get("HQ_ACCESS_KEY")
    if not expected or key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

    results = [
        _cleanup_scan("pending_script_analysis", {"ok", "error"}, apply),
        _cleanup_scan("voice_replacement", {"completed", "error"}, apply),
        _cleanup_scan("voice_cloning", {"completed", "error"}, apply),
    ]
    return {
        "mode": "APPLIED — data deleted" if apply else "DRY RUN — nothing deleted, add &apply=true",
        "results": results,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860, access_log=False)
