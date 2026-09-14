"""
emotion_engine.py
------------------
THE ONE FILE that does everything "emotion" — separate from app.py and
separate from script_analysis.py. Both of those files only IMPORT from
here; none of the actual emotion logic lives in them anymore. This file
also now holds ALL emotion config (models, batch size, examples) that
used to live in a separate emotion_models.py — that file has been
merged in here so everything emotion-related is in one place.

Pipeline:
  1. annotate_emotions(dialogues, characters) — called from script_analysis.py
     right after /script/analyze, only if the user ticked "Add Emotion".
     Sends the WHOLE scene to the AI in groups of EMOTION_BATCH_SIZE (5-10)
     consecutive lines at once — every line in the group, with its
     character name + that character's gender/age — so the AI reads them
     together as one continuous scene and can tell context (romantic vs
     sarcastic vs neutral, who's talking to whom) instead of guessing one
     line in isolation. It writes each dialogue's emotion into
     d["emotion"] as a FREE-TEXT ENGLISH phrase (not a fixed word list) —
     e.g. "laughing", "crying softly", "shouting angrily", "eating while
     talking", "pleading nervously". One word is fine, a short description
     is also fine.

  2. format_emotion_tag(emotion) — used by app.py to build the actual text
     sent to the Live API for synthesis. Produces the bracket tag exactly
     in the format:  "[ emotion ] dialogue text"
     Note the REQUIRED spaces just inside the brackets on both sides —
     "[emotion]" (no spaces) is NOT the format we want; it must be
     "[ emotion ]" with a space after [ and a space before ].

  3. build_emotion_directive(emotion) — used by app.py to add a plain-
     English instruction line to the Live API system prompt as backup
     reinforcement (on top of the inline bracket tag) so the model is
     told twice, in two different ways, what emotion to perform.
"""

import os
import json
import difflib
import requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- 🎛️ CONFIG (merged from emotion_models.py) ---
# Model names + batching numbers for the emotion-tagging step. Kept as
# module-level constants here so the rest of this file (and anything
# importing from emotion_engine) can use them directly.

# --- 🤖 PRIMARY ENGINE: DeepSeek (OpenRouter) ---
EMOTION_MODEL_PRIMARY = "deepseek/deepseek-v4-flash"

# --- 🛟 EXTRA FALLBACKS ---
# Tried in order, only if both models above fail for a batch (rate-limited /
# down / bad response). gemini-2.5-flash-lite is last since it's the most
# capable/expensive of the group — kept as the final safety net.
EMOTION_MODEL_EXTRA_FALLBACKS = [
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemini-2.5-flash-lite",
]

# Full ordered attempt chain (used by call_emotion_model below)
EMOTION_MODEL_CHAIN = [EMOTION_MODEL_PRIMARY] + EMOTION_MODEL_EXTRA_FALLBACKS

# --- 🎭 EMOTION VOCAB (CLOSED LIST — the voice engine only understands
# these exact single words as emotion tags; anything else, like a free
# phrase or Hindi text, gets ignored by the voice model. Do NOT go back to
# free-text/descriptive phrases here — that was the bug (model was writing
# things like "भारी आवाज़ में" which the voice engine can't interpret). ---
EMOTION_ALLOWED_TAGS = [
    "happy", "sad", "angry", "excited", "surprised", "scared", "anxious",
    "calm", "nervous", "confident", "joyful", "frustrated", "disappointed",
    "confused", "embarrassed", "lonely", "hopeful", "romantic", "serious",
    "playful", "curious", "determined", "grateful", "relieved", "shocked",
    "proud", "guilty", "jealous", "bored", "sleepy", "tired", "energetic",
    "emotional", "crying", "laughing", "blushing", "affectionate",
    "sarcastic", "sympathetic", "worried",
    # --- added: delivery-style tags that were missing (whispering/singing
    # lines were falling back to "neutral" because nothing in the list
    # covered them), plus a couple of tone tags for taunting/gossip lines ---
    "whispering", "singing", "mocking", "teasing", "pleading", "shouting",
]
# Lowercased set for fast membership checks; "neutral" is a special
# sentinel (not a real tag) meaning "no emotion tag needed at all".
_EMOTION_ALLOWED_SET = {e.lower() for e in EMOTION_ALLOWED_TAGS} | {"neutral"}

# How many dialogue lines get sent to the model in ONE request, as one
# continuous scene for context. Kept in the 5-10 range as requested — big
# enough to be efficient and give real scene context, small enough that the
# model doesn't lose track of which line is which.
EMOTION_BATCH_SIZE = 10

# How many emotion-batches run in parallel per project (separate from the
# TTS synth worker pool in app.py).
EMOTION_MAX_WORKERS = 8

# --- 🎨 LOGGING (self-contained, no import from app.py to avoid circularity) ---
class _c:
    OK = '\033[92m'; CYAN = '\033[96m'; WARN = '\033[93m'; FAIL = '\033[91m'; END = '\033[0m'

def log_info(msg):    print(f"{_c.CYAN}[EMOTION] {datetime.now().strftime('%H:%M:%S')} - {msg}{_c.END}", flush=True)
def log_success(msg): print(f"{_c.OK}[EMOTION] {datetime.now().strftime('%H:%M:%S')} - {msg}{_c.END}", flush=True)
def log_error(msg, detail=None):
    print(f"{_c.FAIL}[EMOTION] {datetime.now().strftime('%H:%M:%S')} - 🚨 {msg}{_c.END}", flush=True)
    if detail: print(f"{_c.FAIL}{detail}{_c.END}", flush=True)


# --- 🎭 STEP 1: AI TAGGING (batched, 5-10 lines/group, full scene context) ---
def build_emotion_prompt(batch, char_info):
    """`batch` is a list of {"idx": <int>, "character": ..., "line": ...}.
    `char_info` is {character_name: {"gender": ..., "age": ...}} so the AI
    knows WHO each speaker is, not just their name — this is the "poori
    details" (full details) context that helps it pick a believable
    emotion instead of guessing blind."""
    legend_lines = []
    for name, info in (char_info or {}).items():
        gender = info.get("gender") or "unknown"
        age = info.get("age") or "adult"
        legend_lines.append(f"- {name}: {gender}, {age}")
    legend_block = "\n".join(legend_lines) if legend_lines else "(no character details given)"

    lines_block = "\n".join(
        f'{b["idx"]}. [{b["character"]}] {b["line"]}' for b in batch
    )
    allowed_list = ", ".join(EMOTION_ALLOWED_TAGS)

    return f"""You are an emotion-direction engine for a voice-dubbing pipeline.

CHARACTERS IN THIS SCENE:
{legend_block}

Below are consecutive dialogue lines from the SAME scene, each numbered, each
tagged with who speaks it. Read ALL of them together as one continuous scene
first, so you understand tone, relationships, and what's happening — then go
back and give EACH line its own emotion.

LINES:
{lines_block}

RULES FOR THE EMOTION YOU WRITE, PER LINE — READ CAREFULLY:
- The emotion MUST be EXACTLY ONE WORD, and that word MUST be chosen from
  this exact list — no other word, no phrase, no sentence, no language
  other than English, nothing added or combined:
  {allowed_list}
- Do NOT write descriptive phrases like "in a heavy voice", "shouting
  angrily", "crying softly" — the voice engine does NOT understand phrases,
  only the exact single words above. Pick the closest single word from the
  list instead (e.g. use "angry" not "shouting angrily", use "crying" not
  "crying softly").
- Do NOT write the emotion in Hindi/Urdu/any other language — English word
  from the list only.
- Base your choice on the actual content/context of that line and the lines
  around it in this scene, not a generic guess. Do NOT default to "happy" or
  "neutral" just because it's the safe choice — actively look for signals of
  anger, jealousy, sarcasm/mocking, fear, worry/anxiety, whispering, singing,
  pleading, etc. in the line and pick the word that actually matches.
- IMPORTANT — implied worry: a line does NOT need an emotional-sounding word
  ("darr", "pareshaan", "rona") to be worried/anxious. If the speaker is
  describing a PROBLEM plus a bad CONSEQUENCE that affects them — something
  broken/lost/failed and a plan or need now at risk because of it — that is
  worry, even if every sentence is stated as plain fact. Only use "neutral"
  for lines with genuinely no stakes or feeling attached (simple scene-
  setting, routine factual exchange, small talk with no consequence).
  Example: "गाड़ी का लकड़ी वाला जोड़ टूट गया है। कल अनाज मंडी जाना है। अगर गाड़ी
  नहीं बनी तो पूरा अनाज घर में पड़ा रहेगा।" has no emotional words at all, but
  describes a breakdown threatening tomorrow's work — this is "worried" or
  "anxious", NOT "neutral".
- Use "whispering" when a character is speaking quietly/secretively (e.g.
  "chup ke se bola", speaking close to someone's ear, secrets).
  Use "singing" when the line is a song/hummed line rather than spoken.
  Use "mocking" or "sarcastic" for taunting/backbiting (chugli) lines.
  Use "jealous" for envy/possessiveness, "angry" for rage/shouting confrontation.
- If a line is genuinely flat/factual with no emotional color, write
  "neutral" (this is the only word allowed that is NOT in the list above).
- Every single line number in LINES must get exactly one entry in the output.
  Do not skip any line.
- For each entry, also repeat that line's exact dialogue text (verbatim, as
  given above) in a "line" field — this is used to double-check the idx
  actually lines up with the right dialogue, so copy it exactly, don't
  paraphrase or translate it.

Return JSON ONLY — no markdown fences, no commentary, exactly this shape:
{{"emotions": [{{"idx": <int>, "line": "<exact dialogue text for this idx>", "emotion": "<ONE word from the list, or neutral>"}}]}}
"""

# Minimum similarity (0-1) between the model's echoed "line" and a
# dialogue's actual text before we trust that pairing. Forgiving of minor
# wording/matra noise but low enough to reject a genuinely different line.
LINE_MATCH_MIN_RATIO = 0.55

def _text_similarity(a, b):
    a = (a or "").strip().lower()
    b = (b or "").strip().lower()
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()

def _normalize_emotion(raw):
    """Forces whatever the model returned into the closed vocabulary.
    The prompt already restricts the model to EMOTION_ALLOWED_TAGS, but
    this is belt-and-suspenders: if it still slips through a phrase, a
    Hindi word, or a near-miss spelling, snap it to the nearest allowed
    word so the voice engine always gets something it understands.
    Falls back to "neutral" (no tag) if nothing is close enough."""
    e = (raw or "").strip().lower()
    if not e:
        return "neutral"
    if e in _EMOTION_ALLOWED_SET:
        return e

    # phrase salvage: check each word in the phrase against the vocab,
    # both for a direct hit and a fuzzy near-miss (handles "shouting
    # angrily" -> "angry", "crying softly" -> "crying", etc.)
    best_word, best_score = None, 0.0
    for token in e.replace(",", " ").split():
        if token in _EMOTION_ALLOWED_SET:
            return token if token != "neutral" else "neutral"
        close = difflib.get_close_matches(token, EMOTION_ALLOWED_TAGS, n=1, cutoff=0.75)
        if close:
            score = difflib.SequenceMatcher(None, token, close[0]).ratio()
            if score > best_score:
                best_word, best_score = close[0], score
    if best_word:
        return best_word

    # last resort: fuzzy match the whole string against the allowed list
    close = difflib.get_close_matches(e, EMOTION_ALLOWED_TAGS, n=1, cutoff=0.6)
    return close[0] if close else "neutral"

def call_emotion_model(prompt):
    """Tries each model in EMOTION_MODEL_CHAIN in order (OpenRouter) until
    one returns a parseable response. Raises if all fail."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY missing")

    last_err = None
    for model_name in EMOTION_MODEL_CHAIN:
        try:
            resp = requests.post(
                url="https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                data=json.dumps({
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                }),
                timeout=45,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw
            parsed = json.loads(raw)
            return parsed, model_name
        except Exception as e:
            last_err = e
            log_error(f"emotion-tag {model_name} failed", str(e))
            continue
    raise RuntimeError(f"All emotion models failed: {last_err}")

def annotate_emotions(dialogues, characters=None, on_batch_done=None):
    """Batches `dialogues` into groups of EMOTION_BATCH_SIZE (5-10) and
    fires ALL batches CONCURRENTLY (ThreadPoolExecutor) so we're never idle
    waiting on one batch before starting the next. Mutates each dialogue
    dict with d["emotion"] as a free-text English phrase, defaulting to
    "neutral" if a batch fails or a line's index is missing from the
    model's response — a failure here should never block generation.

    `characters` (optional) is the analysis["characters"] list — used to
    build a name -> {gender, age} legend so the AI has full context on
    every speaker in the batch, not just bare names.

    `on_batch_done` (optional) — called with the list of local indices
    (positions within THIS `dialogues` list, matching each batch item's
    "idx") right after that batch's result has been written in, whether
    the batch succeeded or failed. This lets a caller (e.g. app.py) start
    synthesizing lines the moment they're tagged instead of waiting for
    every batch across the whole script to finish. Always called exactly
    once per batch, success or failure, so a caller relying on it to know
    "this line is final" is guaranteed to eventually hear about every
    line — it never gets stuck waiting forever on one bad batch."""
    if not dialogues:
        return dialogues

    char_info = {}
    for c in (characters or []):
        nm = c.get("name")
        if nm:
            char_info[nm] = {"gender": c.get("gender"), "age": c.get("age") or c.get("ageGroup")}

    for d in dialogues:
        d["emotion"] = "neutral"  # safe default, overwritten below on success

    batches = []
    for i in range(0, len(dialogues), EMOTION_BATCH_SIZE):
        chunk = dialogues[i:i + EMOTION_BATCH_SIZE]
        batch = [
            {"idx": i + j, "character": d.get("character") or "Narrator", "line": d.get("line") or d.get("text") or ""}
            for j, d in enumerate(chunk)
        ]
        batches.append(batch)

    def _run_batch(batch):
        prompt = build_emotion_prompt(batch, char_info)
        parsed, model_used = call_emotion_model(prompt)
        return parsed, model_used

    workers = min(len(batches), EMOTION_MAX_WORKERS) if batches else 1
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_run_batch, b): b for b in batches}
        for future in as_completed(futures):
            batch = futures[future]
            batch_indices = [b["idx"] for b in batch]
            try:
                parsed, model_used = future.result()
                tagged = 0
                matched_by_fallback = 0
                for item in parsed.get("emotions", []):
                    idx = item.get("idx")
                    returned_line = str(item.get("line") or "").strip()
                    emotion = _normalize_emotion(item.get("emotion"))

                    target_idx = None

                    # 1) Trust idx only if it's in range AND the echoed
                    #    line text actually matches that dialogue's real
                    #    text (guards against idx drift/mislabeling).
                    if idx is not None and 0 <= idx < len(dialogues):
                        real_line = dialogues[idx].get("line") or dialogues[idx].get("text") or ""
                        if not returned_line or _text_similarity(returned_line, real_line) >= LINE_MATCH_MIN_RATIO:
                            target_idx = idx

                    # 2) idx missing / out of range / text didn't match ->
                    #    search this batch's own lines by content and use
                    #    whichever one the returned text actually matches.
                    if target_idx is None and returned_line:
                        best_idx, best_sim = None, 0.0
                        for b in batch:
                            sim = _text_similarity(returned_line, b["line"])
                            if sim > best_sim:
                                best_sim, best_idx = sim, b["idx"]
                        if best_idx is not None and best_sim >= LINE_MATCH_MIN_RATIO:
                            target_idx = best_idx
                            matched_by_fallback += 1

                    if target_idx is not None:
                        dialogues[target_idx]["emotion"] = emotion
                        tagged += 1

                extra = f", {matched_by_fallback} by content-match fallback" if matched_by_fallback else ""
                log_success(f"Emotion batch ({len(batch)} lines, {tagged} tagged{extra}) via {model_used}")
            except Exception as e:
                log_error(f"Emotion batch failed, defaulting to neutral for {len(batch)} lines", str(e))
            finally:
                # Fires on success AND failure — a caller advancing on this
                # signal must never be left waiting on a batch that errored.
                if on_batch_done:
                    try:
                        on_batch_done(batch_indices)
                    except Exception as cb_err:
                        log_error("on_batch_done callback raised", str(cb_err))

    return dialogues


# --- 🏷️ STEP 2: INLINE TAG FORMAT — "[ emotion ] dialogue text" ---
# Spaces just inside both brackets are REQUIRED by design (not cosmetic) —
# this is the exact format the Live API prompt (app.py) tells the model to
# expect and silently strip before voicing. Keep this in sync with the
# EMOTION TAGS section of LIVE_BASE_INSTRUCTION in app.py if you change it.
def format_emotion_tag(emotion):
    """Returns "[ emotion ] " (with trailing space, ready to prefix onto the
    dialogue text) or "" if there's no meaningful emotion to tag (empty /
    "neutral")."""
    e = (emotion or "").strip()
    if not e or e.lower() == "neutral":
        return ""
    return f"[ {e} ] "


# --- 🎤 STEP 3: SYSTEM-PROMPT REINFORCEMENT (belt-and-suspenders on top of the inline tag) ---
def build_emotion_directive(emotion):
    """Turns a per-dialogue emotion (free-text, set by annotate_emotions
    above, only when the user ticked "Add Emotion") into an extra
    instruction block for the Live API voice actor's system instruction.
    Returns "" if no emotion was tagged (feature off, or tag missing/
    neutral) — neutral lines don't need an override on top of the base
    delivery."""
    e = (emotion or "").strip()
    if not e or e.lower() == "neutral":
        return ""
    return (
        f"\n\nEMOTION FOR THIS LINE: Perform this line's delivery as: {e}. "
        f"Let this come through clearly in your tone, pacing, breath, and energy — "
        f"don't just read the words flatly."
    )
