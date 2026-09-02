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
from studio import start_pending_voice_listener
from thumbnail_generation import start_pending_thumbnail_listener
from r2_netlify import upload_to_r2, delete_from_r2, random_object_key  # kept importable from app.py too, in case anything reaches for it here
from api import router as public_api_router  # 🌐 direct HTTP API (voice/music/script) — see api.py


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
    start_pending_thumbnail_listener()
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860, access_log=False)
