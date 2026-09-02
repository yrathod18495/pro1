"""
r2_netlify.py
---------------------
Shared Cloudflare R2 (S3-compatible) client/upload helper AND the Netlify
relay used for Telegram production logs, combined into one file so
app.py / studio.py (and anything else you point at it) import both from a
single place instead of two.

Usage:
    from r2_netlify import upload_to_r2, random_object_key, send_telegram_log
"""

import os
import secrets
import traceback
import threading

import requests
import boto3
from botocore.client import Config as BotoConfig


def log_success(msg):
    print(f"[R2-NETLIFY-SUCCESS] {msg}", flush=True)

def log_error(msg, detail=None):
    print(f"[R2-NETLIFY-ERROR] 🚨 {msg}", flush=True)
    if detail:
        print(detail, flush=True)


# ============================================================
# ☁️ CLOUDFLARE R2 — single shared client, built once at import time
# ============================================================
r2_client = None
try:
    r2_account_id = os.environ.get("R2_ACCOUNT_ID")
    r2_access_key = os.environ.get("R2_ACCESS_KEY_ID")
    r2_secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    if r2_account_id and r2_access_key and r2_secret_key:
        r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )
        log_success("Cloudflare R2: ONLINE | Storage bridge connected (shared client)")
    else:
        log_error("R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY missing (r2_netlify.py).")
except Exception:
    log_error("R2 Initialization Failed", traceback.format_exc())


def upload_to_r2(file_path, data_bytes, content_type):
    """Uploads bytes to the shared R2 bucket at `file_path` and returns the
    public URL. `file_path` should already include any folder prefix, e.g.
    'hq_gen/<uid>/<n>.mp3' or 'temp/music/<token>.wav'."""
    if r2_client is None:
        raise Exception("R2 client not initialized — check R2_* env vars.")
    r2_bucket = os.environ.get("R2_BUCKET")
    r2_public_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    r2_client.put_object(Bucket=r2_bucket, Key=file_path, Body=data_bytes, ContentType=content_type)
    return f"{r2_public_url}/{file_path}"


def delete_from_r2(key):
    """Deletes an object (by key, e.g. 'hq_gen/<uid>/<n>.mp3') from the
    shared R2 bucket. Uses the SAME client/bucket as upload_to_r2."""
    if r2_client is None:
        raise Exception("R2 client not initialized — check R2_* env vars.")
    if not key or not isinstance(key, str):
        raise Exception(f"delete_from_r2: expected a non-empty string key, got {key!r}")
    r2_bucket = os.environ.get("R2_BUCKET")
    r2_client.delete_object(Bucket=r2_bucket, Key=key)


def random_object_key(folder, extension):
    """Builds a random '<folder>/<64-char-hex-token>.<extension>' key."""
    token = secrets.token_hex(32)
    return f"{folder}/{token}.{extension}"


# ============================================================
# 📡 NETLIFY RELAY — Telegram production logs
# ============================================================
NETLIFY_RELAY = "https://creative-bombolone-fe8bba.netlify.app/.netlify/functions/send-log"
relay_session = requests.Session()

def send_telegram_log(message):
    """Sends production reports via Netlify Relay in a background thread —
    fire-and-forget, never blocks the caller on network latency."""
    def _dispatch():
        try:
            r = relay_session.post(NETLIFY_RELAY, json={"message": message}, timeout=10)
            if r.status_code != 200:
                print(f"[Relay Error] HTTP {r.status_code}: {r.text}", flush=True)
        except Exception as e:
            print(f"[Relay Connection Fault] {e}", flush=True)
    threading.Thread(target=_dispatch, daemon=True).start()
