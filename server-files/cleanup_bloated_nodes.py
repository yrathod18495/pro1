"""
cleanup_bloated_nodes.py
-------------------------
ONE-TIME script. Run this ONCE on the server (same env where firebase_admin
is already configured) to purge already-accumulated finished/stuck jobs from
the two RTDB nodes that were never being cleaned up:

  - pending_script_analysis/{userId}/{jobId}   (stores full script text!)
  - voice_replacement/{requestId}

This is what ran up the ~11GB/day download bill: these nodes only grew,
never shrank, and were fully re-downloaded every 5 seconds by the backend's
poll safety-net loops. The code fix (already applied in script_analysis.py
and voice_replacement.py) stops NEW jobs from piling up, but the OLD data
already sitting there needs to be purged once, manually.

Usage:
    python3 cleanup_bloated_nodes.py            # dry run — just prints counts/sizes
    python3 cleanup_bloated_nodes.py --apply     # actually deletes

Keeps: jobs with status "pending" or "processing" (still in-flight) — leave
those alone in case they're actively being worked on. Also keeps anything
newer than a small safety window (KEEP_NEWER_THAN_MINUTES) even if it's
already terminal, in case a client is mid-way reading the final result.
"""

import sys
import json
from datetime import datetime, timedelta

import firebase_admin
from firebase_admin import credentials, db

# --- adjust these two if your app.py sets them up differently ---
SERVICE_ACCOUNT_PATH = "service_account.json"   # path to your firebase service account json
DATABASE_URL = "https://twelvelabs-copy-88796906-8d524-default-rtdb.asia-southeast1.firebasedatabase.app"

KEEP_NEWER_THAN_MINUTES = 10  # safety buffer, don't touch very recent terminal jobs

APPLY = "--apply" in sys.argv


def _init():
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})


def _is_recent(job_data, minutes=KEEP_NEWER_THAN_MINUTES):
    ts = job_data.get("timestamp") or job_data.get("completedAt")
    if not ts:
        return False
    try:
        if isinstance(ts, (int, float)):
            ts_dt = datetime.fromtimestamp(ts / 1000 if ts > 1e12 else ts)
        else:
            ts_dt = datetime.fromisoformat(str(ts))
        return datetime.now() - ts_dt < timedelta(minutes=minutes)
    except Exception:
        return False


def clean_pending_script_analysis():
    print("\n=== pending_script_analysis ===")
    ref = db.reference("pending_script_analysis")
    snapshot = ref.get() or {}
    total_jobs = 0
    to_delete = []
    for user_id, jobs in snapshot.items():
        if not isinstance(jobs, dict):
            continue
        for job_id, job_data in jobs.items():
            total_jobs += 1
            if not isinstance(job_data, dict):
                continue
            status = job_data.get("status")
            if status in ("pending", "processing"):
                continue
            if _is_recent(job_data):
                continue
            to_delete.append((user_id, job_id, len(json.dumps(job_data))))

    print(f"Total jobs found: {total_jobs}")
    print(f"Finished jobs eligible for deletion: {len(to_delete)}")
    approx_bytes = sum(size for _, _, size in to_delete)
    print(f"Approx bytes being freed: {approx_bytes / (1024*1024):.2f} MB")

    if APPLY:
        for user_id, job_id, _ in to_delete:
            db.reference(f"pending_script_analysis/{user_id}/{job_id}").delete()
        print(f"Deleted {len(to_delete)} finished jobs.")
    else:
        print("(dry run — pass --apply to actually delete)")


def clean_voice_replacement():
    print("\n=== voice_replacement ===")
    ref = db.reference("voice_replacement")
    snapshot = ref.get() or {}
    total_jobs = 0
    to_delete = []
    for request_id, job_data in snapshot.items():
        total_jobs += 1
        if not isinstance(job_data, dict):
            continue
        status = job_data.get("status")
        if status in ("pending", "processing"):
            continue
        if _is_recent(job_data):
            continue
        to_delete.append((request_id, len(json.dumps(job_data))))

    print(f"Total jobs found: {total_jobs}")
    print(f"Finished jobs eligible for deletion: {len(to_delete)}")
    approx_bytes = sum(size for _, size in to_delete)
    print(f"Approx bytes being freed: {approx_bytes / (1024*1024):.2f} MB")

    if APPLY:
        for request_id, _ in to_delete:
            db.reference(f"voice_replacement/{request_id}").delete()
        print(f"Deleted {len(to_delete)} finished jobs.")
    else:
        print("(dry run — pass --apply to actually delete)")


if __name__ == "__main__":
    _init()
    clean_pending_script_analysis()
    clean_voice_replacement()
    if not APPLY:
        print("\nThis was a DRY RUN. Re-run with --apply to actually delete the data.")
