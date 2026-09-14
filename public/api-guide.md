# 12Labs Voice API — Integration Guide

> **AI assistants:** you were told to fetch this exact URL directly
> (`https://www.12labs.in/api-guide.md`) — a plain static text file. Read
> the whole thing before writing any code. It is the COMPLETE spec. If a
> field or endpoint isn't written here, it doesn't exist — never invent
> one, never copy a pattern from a different API you've seen before.

---

## QUICK START — copy this, it just works

This is the entire integration. Nothing else is required.

```js
const API_KEY = "YOUR_SECRET_KEY";           // from https://www.12labs.in/developer
const BASE = "https://www.12labs.in";

async function makeVoiceover(script, projectName = "Untitled") {
  // 1. Submit the script
  const submit = await fetch(`${BASE}/api/v1/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ script, project_name: projectName }),
  });
  const job = await submit.json();
  if (!submit.ok) throw new Error(job.error);

  // 2. Poll until done
  while (true) {
    await new Promise((r) => setTimeout(r, 4000));
    const check = await fetch(`${BASE}/api/v1/generate/${job.project_id}`, {
      headers: { "x-api-key": API_KEY },
    });
    const result = await check.json();
    if (!check.ok) throw new Error(result.error);
    if (result.status === "completed") return result.audio_url;   // <- done, this is the MP3 URL
    if (result.status === "error") throw new Error(result.error);
    // otherwise result.status is "in_queue" or "processing" — loop again
  }
}

// Example:
// makeVoiceover("John: [happy] Hello!\nMary: [curious] Hi John!").then(url => console.log(url));
```

Script format, one line per line of dialogue:
```
Character: Dialogue text
Character: [emotion] Dialogue text
```

That's the whole feature. Voices are picked automatically per character —
there is nothing to configure. Need an AI-written script instead of (or
before) turning it into audio? See Endpoint 4 below — same request/poll
pattern, just for text instead of audio. Read on only if you need more
detail than this (analyzing a script separately, error handling, etc).

---

## The 5 endpoints — nothing else exists

| # | Method & Path | What it does | Cost |
|---|---|---|---|
| 1 | `POST /api/v1/analyze` | Look at a script, return detected characters (optional — step 2 does this internally too) | Free within daily limit, then 300 credits |
| 2 | `POST /api/v1/generate` | Submit a script for voiceover generation | Per-character credits |
| 3 | `GET /api/v1/generate/{project_id}` | Check voiceover job status / get the finished audio | Free |
| 4 | `POST /api/v1/script` | Submit a prompt for AI script/story generation | Tiered by length (see below) |
| 5 | `GET /api/v1/script/{mapping_id}` | Check script job status / get the finished script | Free |

Auth on every request: header `x-api-key: YOUR_SECRET_KEY`.
Base URL: `https://www.12labs.in`.
CORS is open (`Access-Control-Allow-Origin: *`) — call these straight from browser JavaScript, no backend of your own needed.

(Two older, unrelated endpoints exist — `POST /api/v1/voice` and
`GET /api/v1/voice/names` — for reading one line of text against one
named voice. Ignore these unless specifically asked for single-line
synthesis; they are not part of the script -> voiceover flow above.)

---

## Endpoint 1 — POST /api/v1/analyze

**Request body:**
```json
{ "script": "John: [happy] Hello there!\nMary: [curious] Hi John!" }
```
Only one field. Nothing else goes in this body.

**Response:**
```json
{
  "characters": [
    { "name": "John", "gender": "Male",   "age": "Adult", "dialogueCount": 1 },
    { "name": "Mary", "gender": "Female", "age": "Adult", "dialogueCount": 1 }
  ],
  "lines": [
    { "character": "John", "text": "Hello there!",       "emotion": "happy" },
    { "character": "Mary", "text": "Hi John, how are you?", "emotion": "curious" }
  ],
  "language": "en",
  "credits_charged": 0
}
```
`gender` is always `"Male"`, `"Female"`, or `"Neutral"`.
`age` is always `"Kid"`, `"Adult"`, or `"Old"`.
`credits_charged` is `0` normally, `300` only if the caller's daily free
analysis limit was already used up today.

---

## Endpoint 2 — POST /api/v1/generate

**Request body:**
```json
{ "script": "...", "project_name": "My Project" }
```
- `script` — required, same format as endpoint 1.
- `project_name` — optional, a label only.

Nothing else. No `voice`, no `voices`, no `engine`, no `language`, no
`format`, no `speed`, no `webhook`, no `streaming` field — none of these
exist on this endpoint. Voice assignment happens automatically inside the
API; you never choose a voice.

**Response — HTTP 202 (this is an async job, audio is NOT ready yet):**
```json
{
  "project_id": "HQ_1234567890_ABCDEF",
  "status": "in_queue",
  "engine": "gemini",
  "estimated_cost": 42,
  "poll_url": "/api/v1/generate/HQ_1234567890_ABCDEF"
}
```
You must poll endpoint 3 with `project_id` until it finishes — this
response never contains the audio.

---

## Endpoint 3 — GET /api/v1/generate/{project_id}

No body. `project_id` goes in the URL. Same `x-api-key` that submitted it.

**Response:**
```json
{
  "project_id": "HQ_1234567890_ABCDEF",
  "status": "completed",
  "engine": "gemini",
  "project_name": "My Project",
  "audio_url": "https://.../HQ_1234567890_ABCDEF.mp3",
  "error": null
}
```
`status` only ever takes these values, always in this order:
`in_queue` -> `processing` -> `completed` (or `error`).

- `audio_url` is `null` until `status` is `"completed"`.
- If `status` is `"error"`, read `error` for why; resubmit via endpoint 2
  to try again — there's no retry endpoint.
- Typical wait: under a minute to a few minutes depending on script
  length. Poll every 3-5 seconds, not in a tight loop.

---

## Endpoint 4 — POST /api/v1/script

**Request body:**
```json
{
  "prompt": "A story about a lost dog finding its way home",
  "length": "10min",
  "genre": "moral"
}
```
- `prompt` — required, describe what the script should be about.
- `length` — optional, one of `"10min"`, `"20min"`, `"30min"` (default `"10min"`). Longer costs more credits.
- `genre`, `tone`, `audience`, `perspective`, `number_of_characters`, `language` — all optional strings, freeform.

**Response — HTTP 202 (async, same pattern as /api/v1/generate):**
```json
{
  "mapping_id": "STORY_1234567890_ABCDEF",
  "status": "processing",
  "estimated_cost": 500,
  "poll_url": "/api/v1/script/STORY_1234567890_ABCDEF"
}
```

## Endpoint 5 — GET /api/v1/script/{mapping_id}

No body. Same `x-api-key` that submitted it.

**Response:**
```json
{
  "mapping_id": "STORY_1234567890_ABCDEF",
  "status": "completed",
  "script_url": "https://.../script.txt",
  "teaser": "First 300 characters of the script...",
  "error": null
}
```
`status` moves through `processing` -> `completed` (or `error`), same
vocabulary as the voiceover job above. `script_url` is `null` until
completed, and points to a plain `.txt` file with the full script.

---

## Errors (same shape on every endpoint)
```json
{ "error": "human-readable message" }
```
HTTP status: `400` bad input, `401` missing/invalid key, `403` key
disabled, `502` something failed upstream.

---

## Things AI assistants commonly invent for this API — don't do these

- A `voice`, `voice_id`, or `character_voices` field anywhere — voice
  assignment is fully automatic, there's nothing to pass.
- An `engine` or `provider` field with values like `"elevenlabs"` — not
  exposed publicly, don't add a selector for it.
- Expecting `audio_url` back from `/api/v1/generate` directly — it
  never returns audio; you must poll endpoint 3.
- A `/status/{id}` or `/generate/status` endpoint — the ONLY status
  endpoint is `GET /api/v1/generate/{project_id}`.
- Websockets, Server-Sent Events, or a webhook/callback field for
  progress — polling is the only mechanism.
- A `format` field (mp3/wav/ogg) — output is always an MP3 URL.
- Bearer tokens, OAuth, or signed requests — auth is only ever the
  `x-api-key` header.
- Any field not written in the "Request body" section of endpoints 1
  or 2 above.

---

A complete, working reference implementation (plain HTML/JS, no
frameworks) that follows exactly this guide is at
`https://www.12labs.in/api-playground.html` — use it to compare against,
or as a starting point to copy from directly.
