# Public API reliability and storage fixes

## What changed

- Added working `/api/keys` GET/POST/DELETE routes backed by Firebase Admin.
- Added `/api/developer/analytics` with 7-day aggregates and admin recent logs.
- Added `/admin/api-logs` for username, endpoint, request ID, cost, balance,
  status, latency, and model visibility.
- Kept `/developer` and `/api-docs` discoverable for everyone, including when
  the developer toggle is off. The toggle now gates access instead of hiding
  the product entry point.
- Added `/api/v1/voices` as the catalog alias. Existing `/api/voices` remains.
- Public API Telegram logs no longer contain R2 audio URLs.
- Public API logs now record the user, request, endpoint, cost, remaining
  credits, latency, and useful endpoint metadata in `apiUsage`.
- Added `Idempotency-Key` forwarding and storage. A client retry with the same
  key does not generate or upload another artifact.
- Public API generation keeps only the final artifact in R2; chunks stay in
  memory.
- Added `public-api/r2_cleanup.py`, which deletes only expired `api/` objects.

## Required deployment steps

1. Deploy the Next.js/Vercel source in this archive.
2. Deploy the updated `public-api/api.py` to the Python/FastAPI host.
3. Run `r2_cleanup.py` daily with the same R2 credentials. Start with
   `DRY_RUN=1`, then use `API_ARTIFACT_RETENTION_DAYS=7`.
4. Ensure Firebase Admin has access to Firestore, Realtime Database, and the
   `users` collection. No client-side credentials are added by this patch.
5. Send a stable `Idempotency-Key` from external clients for retryable POSTs.
