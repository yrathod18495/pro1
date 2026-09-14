"""
daily_cost_report.py
---------------------
Sends a daily GCP billing summary to Telegram at 8:00 PM IST.

NOT real-time — Google's BigQuery billing export itself updates with a
~24-48 hour delay, so "today's" number may actually reflect yesterday or
the day before until Google catches up. This is a Google limitation, not
something this script can fix. Still useful as a daily heads-up + running
month-to-date total.

REQUIRES (one-time GCP setup, see chat instructions):
  1. BigQuery Billing Export enabled on your billing account (Standard
     usage cost), pointed at the "billing_export" dataset.
  2. The service account in FIREBASE_SERVICE_ACCOUNT_KEY granted
     "BigQuery Data Viewer" (or better) on that export dataset.
  3. BQ_TABLE below filled in with the exact table name from BigQuery
     console (looks like "gcp_billing_export_v1_01ABCD_23EFGH_456789").
     Nothing else needs to be set — project/dataset/report times are
     already hardcoded below.

Add to requirements.txt: google-cloud-bigquery
"""

import os
import json
import time
import threading
from datetime import datetime, timedelta

try:
    from zoneinfo import ZoneInfo
    IST = ZoneInfo("Asia/Kolkata")
except Exception:
    IST = None  # fallback handled below

from firebase_admin import db
from r2_netlify import send_telegram_log

# --- Hardcoded (known values — no need for env vars for these) ---
BQ_PROJECT = "twelvelabs-copy-88796906-8d524"
BQ_DATASET = "billing_export"

# ⚠️ STILL NEEDS FILLING IN — Google auto-generates this per billing
# account, there's no way to guess it. Find it in:
#   BigQuery console → your project → billing_export dataset → the table
#   inside it (looks like "gcp_billing_export_v1_01ABCD_23EFGH_456789")
# Paste the exact name below between the quotes.
BQ_TABLE = "gcp_billing_export_v1_016BFB_3249F3_3F6AC1"

REPORT_TIMES_IST = [(8, 0), (14, 0), (20, 0)]  # 8 AM, 2 PM, 8 PM IST

# dailySummaries/{date} entries older than this are purged whenever a
# report is sent, so the RTDB node never grows unbounded. Kept small and
# done as a shallow-key scan (see _cleanup_old_daily_summaries) so it adds
# only one small read + a handful of deletes per report, never a full
# download of the node's history.
DAILY_SUMMARIES_RETENTION_DAYS = 15


def _now_ist():
    if IST:
        return datetime.now(IST)
    # crude fallback if zoneinfo unavailable: UTC+5:30
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


def _get_bq_client():
    """Reuses the same service account already used for Firebase — just
    needs BigQuery Data Viewer added to it in IAM (see setup notes)."""
    from google.cloud import bigquery
    from google.oauth2 import service_account

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if not sa_json:
        raise Exception("FIREBASE_SERVICE_ACCOUNT_KEY missing — can't build BigQuery client.")
    info = json.loads(sa_json)
    creds = service_account.Credentials.from_service_account_info(info)
    return bigquery.Client(project=BQ_PROJECT or info.get("project_id"), credentials=creds)


def _query_cost(client, where_clause, params):
    from google.cloud import bigquery

    table_ref = f"`{BQ_PROJECT}.{BQ_DATASET}.{BQ_TABLE}`"
    sql = f"""
        SELECT
          service.description AS service,
          SUM(cost) + IFNULL(SUM(
            (SELECT SUM(c.amount) FROM UNNEST(credits) AS c)
          ), 0) AS net_cost,
          ANY_VALUE(currency) AS currency
        FROM {table_ref}
        WHERE {where_clause}
        GROUP BY service
        HAVING net_cost > 0
        ORDER BY net_cost DESC
    """
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    rows = list(job.result())
    total = sum(r.net_cost for r in rows)
    currency = rows[0].currency if rows else "USD"
    return rows, total, currency


def get_cost_summary():
    """Returns (today_rows, today_total, mtd_total, currency)."""
    from google.cloud import bigquery

    client = _get_bq_client()
    now = _now_ist()
    today_str = now.strftime("%Y-%m-%d")
    month_str = now.strftime("%Y%m")

    today_rows, today_total, currency = _query_cost(
        client,
        "DATE(usage_start_time, 'Asia/Kolkata') = @today",
        [bigquery.ScalarQueryParameter("today", "DATE", today_str)],
    )
    _, mtd_total, _ = _query_cost(
        client,
        "invoice.month = @month",
        [bigquery.ScalarQueryParameter("month", "STRING", month_str)],
    )
    return today_rows, today_total, mtd_total, currency


def _escape_html(text):
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _get_today_user_stats():
    """Reads ONLY today's dailySummaries/{date} node — a single small read
    regardless of how many days of history exist, so this doesn't add any
    meaningful load. Returns (new_signups_today, online_users_today)."""
    try:
        today_str = _now_ist().strftime("%Y-%m-%d")
        data = db.reference(f"dailySummaries/{today_str}").get() or {}
        new_signups = data.get("newUserJoined") or 0
        online_users_map = data.get("onlineUsers") or {}
        online_count = len(online_users_map) if isinstance(online_users_map, dict) else 0
        return new_signups, online_count
    except Exception as e:
        print(f"[COST-REPORT] Failed to read today's user stats: {e}", flush=True)
        return 0, 0


def _cleanup_old_daily_summaries(retention_days=DAILY_SUMMARIES_RETENTION_DAYS):
    """Deletes dailySummaries/{date} entries older than `retention_days`.

    Uses shallow=True so this only downloads the date KEYS (e.g.
    {"2026-08-01": true, ...}), never the nested counts/onlineUsers data
    inside each day — so the read cost stays tiny and constant no matter
    how much data has piled up under old days. Only entries actually past
    the cutoff get an individual delete call; on most runs that's zero
    since this fires 3x/day and a given day only crosses the cutoff once.
    Runs piggybacked on the existing report schedule — no separate cron/
    extra reads beyond this one shallow call.

    Returns the sorted list of date strings that were deleted (for the
    report line), not just a count.
    """
    try:
        keys = db.reference("dailySummaries").get(shallow=True) or {}
        cutoff = _now_ist().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=retention_days)
        deleted_dates = []
        for date_str in keys.keys():
            try:
                day = datetime.strptime(date_str, "%Y-%m-%d")
                if IST:
                    day = day.replace(tzinfo=IST)
                else:
                    day = day.replace(tzinfo=cutoff.tzinfo)
            except Exception:
                continue  # skip anything not shaped like a YYYY-MM-DD key
            if day < cutoff:
                db.reference(f"dailySummaries/{date_str}").delete()
                deleted_dates.append(date_str)
        deleted_dates.sort()
        if deleted_dates:
            print(f"[COST-REPORT] Cleaned up dailySummaries: {', '.join(deleted_dates)}", flush=True)
        return deleted_dates
    except Exception as e:
        print(f"[COST-REPORT] dailySummaries cleanup failed: {e}", flush=True)
        return []


def _format_deleted_dates(deleted_dates):
    """Compact one-line summary of cleaned-up dates so the report doesn't
    balloon if a lot of old history gets purged at once (e.g. first run
    after deploying this feature)."""
    if not deleted_dates:
        return None
    if len(deleted_dates) <= 4:
        return ", ".join(deleted_dates)
    return f"{deleted_dates[0]} → {deleted_dates[-1]} ({len(deleted_dates)} days)"


def send_daily_cost_report():
    deleted_dates = _cleanup_old_daily_summaries()
    try:
        rows, today_total, mtd_total, currency = get_cost_summary()
        new_signups, online_users = _get_today_user_stats()
        lines = [
            "🤯🤯🤯🤯🤯🤯",
            f"💰 <b>Daily Billing Report</b> — {_now_ist().strftime('%I:%M %p')}",
            f"📅 <b>{_now_ist().strftime('%d %b %Y')}</b>\n",
        ]
        if rows:
            for r in rows[:8]:
                lines.append(f"• {_escape_html(r.service)}: {r.net_cost:.2f} {currency}")
        else:
            lines.append("• No data yet for today (billing export lags ~24-48h — this may fill in tomorrow)")

        lines.append(f"\n<b>Today's total:</b> {today_total:.2f} {currency}")
        lines.append(f"<b>Month-to-date total:</b> {mtd_total:.2f} {currency}")
        lines.append(f"\n👥 <b>New signups today:</b> {new_signups}")
        lines.append(f"🟢 <b>Users online today:</b> {online_users}")

        deleted_summary = _format_deleted_dates(deleted_dates)
        if deleted_summary:
            lines.append(f"🧹 <b>Old history purged:</b> {_escape_html(deleted_summary)}")

        lines.append("\n<i>Note: billing figures may be 1-2 days behind — Google's export delay, not a bug here.</i>")
        lines.append("🤯🤯🤯🤯🤯🤯")

        send_telegram_log("\n".join(lines))
        print(f"[COST-REPORT] Sent — today={today_total:.2f} {currency}, mtd={mtd_total:.2f} {currency}, signups={new_signups}, online={online_users}, purged={deleted_dates}", flush=True)
    except Exception as e:
        send_telegram_log(f"⚠️ <b>Daily cost report failed</b>\n<code>{_escape_html(str(e))}</code>")
        print(f"[COST-REPORT-ERROR] {e}", flush=True)


def _seconds_until_next_report():
    now = _now_ist()
    candidates = []
    for h, m in REPORT_TIMES_IST:
        target = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        candidates.append(target)
    next_target = min(candidates)
    return (next_target - now).total_seconds()


def _reporter_loop():
    # Fire one report immediately when the server (re)starts, so a broken
    # dependency (like the missing bigquery package earlier) shows up right
    # away instead of waiting for the next 8/14/20 IST slot. This runs in
    # this background thread, so it never blocks app startup.
    send_daily_cost_report()
    while True:
        wait_s = _seconds_until_next_report()
        time.sleep(wait_s)
        send_daily_cost_report()
        time.sleep(60)  # small buffer so we don't fire twice in the same minute


def start_daily_cost_reporter():
    """Call this once from app.py's lifespan (background thread, non-blocking).
    Fires automatically every day at 8:00 PM IST."""
    if not (BQ_PROJECT and BQ_DATASET and BQ_TABLE) or BQ_TABLE == "PASTE_TABLE_NAME_HERE":
        print(
            "[COST-REPORT] Skipped — BQ_TABLE still says 'PASTE_TABLE_NAME_HERE' in "
            "daily_cost_report.py. Open BigQuery console, find the table inside the "
            "billing_export dataset, and paste its exact name into BQ_TABLE at the top of this file.",
            flush=True,
        )
        return
    threading.Thread(target=_reporter_loop, daemon=True).start()
    times_str = ", ".join(f"{h:02d}:{m:02d}" for h, m in REPORT_TIMES_IST)
    print(f"[COST-REPORT] Daily billing reporter started — fires at {times_str} IST.", flush=True)
