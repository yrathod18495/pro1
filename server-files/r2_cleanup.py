"""Safe retention cleanup for generated Public API artifacts.

Run this as a daily cron on the Python host:
    API_ARTIFACT_RETENTION_DAYS=7 python r2_cleanup.py

Only the api/ prefix is touched. The application never deletes user uploads,
secure assets, or web-app projects. Use DRY_RUN=1 for the first run.
"""

import os
from datetime import datetime, timedelta, timezone

import boto3


def cleanup_api_objects() -> int:
    account_id = os.environ["R2_ACCOUNT_ID"]
    access_key = os.environ["R2_ACCESS_KEY_ID"]
    secret_key = os.environ["R2_SECRET_ACCESS_KEY"]
    bucket = os.environ.get("R2_BUCKET", "12labs")
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    retention_days = max(int(os.environ.get("API_ARTIFACT_RETENTION_DAYS", "7")), 1)
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    dry_run = os.environ.get("DRY_RUN", "").lower() in {"1", "true", "yes"}

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name="auto",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )
    paginator = client.get_paginator("list_objects_v2")
    keys = []
    for page in paginator.paginate(Bucket=bucket, Prefix="api/"):
        for item in page.get("Contents", []):
            if item.get("LastModified") and item["LastModified"] < cutoff:
                keys.append(item["Key"])

    if dry_run or not keys:
        print(f"R2 cleanup: {len(keys)} expired api/ object(s) found; dry_run={dry_run}")
        return len(keys)

    deleted = 0
    for start in range(0, len(keys), 1000):
        batch = keys[start:start + 1000]
        client.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
        )
        deleted += len(batch)
    print(f"R2 cleanup: deleted {deleted} expired api/ object(s)")
    return deleted


if __name__ == "__main__":
    cleanup_api_objects()
