# Public API

The public API is exposed by the Next.js app at `https://YOUR_VERCEL_DOMAIN/api/v1`.
Every request uses the same header:

```http
x-api-key: YOUR_CUSTOMER_API_KEY
content-type: application/json
```

The customer key only needs to be stored in the backend Firestore `api_keys`
collection. You do **not** need to update Vercel every time you create or
revoke a key. The Firestore key document must contain the Firebase Auth UID as
`userId`; that is the account from which usage credits are deducted.

## Billing

Pricing mirrors the website exactly — the API charges the same rate as the
matching studio on the site, not a separate API-only number.

- Voice: **1 credit per character**, across all submitted lines (spaces and
  punctuation are counted). Failed generation/upload is refunded.
- A request cannot choose or override its own cost.
- Send an `Idempotency-Key` header for retry-safe clients. Repeating the same
  key for the same endpoint and account returns the original result without
  generating or uploading another artifact.

## Operator logging

Public API usage is logged to Telegram from the Vercel side (the same
`sendToTelegram` used by every other product surface), not from the Python
host. The Python host attaches a short-lived `_telemetry` object to a
successful response; `src/lib/hf-proxy.ts` reads it, sends the log, and
strips it before the response reaches the customer — external callers never
see that field.

## Voice

`POST /api/v1/voice`

```json
{
  "name": "Kore",
  "text": "Namaste, aaj hum ek nayi kahani shuru karte hain.",
  "age": "adult"
}
```

Response:

```json
{
  "success": true,
  "request_id": "a1b2c3d4e5f6",
  "audio_url": "https://storage.example/api/voice/a1b2c3d4e5f6.mp3"
}
```

`GET /api/v1/voice/names` returns `{ "available_names": ["Kore", "..."] }`.
Invalid names return HTTP 400 and the complete valid-name list.

`GET /api/v1/voices` is also available as the catalog alias for clients that
need voice IDs, categories, demos, and filters. The legacy `GET /api/voices`
route remains supported.

## R2 retention and operator logs

Public API generation uploads only the final artifact. Intermediate chunks stay
in memory and are never written to R2. To prevent old final artifacts from
accumulating, run `public-api/r2_cleanup.py` daily with
`API_ARTIFACT_RETENTION_DAYS=7`; start with `DRY_RUN=1`. Telegram logs contain
the username, endpoint, request ID, cost, remaining balance, status, and
latency, but intentionally never include the downloadable audio URL.

## cURL

```bash
curl -X POST "https://YOUR_VERCEL_DOMAIN/api/v1/voice" \
  -H "x-api-key: YOUR_CUSTOMER_API_KEY" \
  -H "Idempotency-Key: my-unique-request-id" \
  -H "content-type: application/json" \
  -d '{"name":"Kore","text":"Hello from the public API!"}'
```

## Vercel environment variables

Add these in **Vercel → Project → Settings → Environment Variables**. Do not
use `NEXT_PUBLIC_` for any of them.

```env
# The deployed Python/FastAPI backend containing public-api/api.py
HF_SPACE_URL=https://your-backend-domain.example

# Server-to-server guard used by the Next.js proxy.
# Keep it private and set the matching value in the backend if you enable
# the optional internal-header check there.
HF_INTERNAL_API_KEY=your-long-random-internal-key

# Needed by the existing Firebase server actions. Use one-line minified JSON.
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}

# Existing app variables used by storage and AI features, if enabled:
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=12labs
R2_PUBLIC_URL=https://storage.your-domain.in
HQ_BACKEND_URL=https://your-backend-domain.example
HQ_ACCESS_KEY=your-hq-access-key
HF_TOKEN=your-huggingface-token
```

`HF_INTERNAL_API_KEY` can be any strong random string that you generate. It
must be exactly the same value in Vercel and in the Python/Hugging Face
backend's environment. Customers must never receive this value; they use
their separate Firestore API key in `x-api-key`.

The Python backend additionally needs `FIREBASE_SERVICE_ACCOUNT_KEY`,
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and
`R2_PUBLIC_URL`. Those belong in the Python host's secrets, not in frontend
code. `FIREBASE_SERVICE_ACCOUNT_KEY` must have access to Firestore, Realtime
Database, and the Vertex project.
