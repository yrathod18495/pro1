# --- 🎙️ GEMINI LIVE PREBUILT VOICE CATALOG ---
# Ground-truth gender/style per prebuilt voice name, straight from the
# official list. Used to inject an explicit "you MUST sound
# male/female" line into the Live API persona instruction, so the model
# doesn't drift into the wrong-gender delivery for a given voice
# (this was happening especially on "old"/"kid" age-mode lines, where the
# age persona text alone left gender ambiguous).
#
# Keys are lowercased voice names — always look up with .lower().

VOICE_INFO = {
    "zephyr":       {"gender": "female", "style": "Bright"},
    "puck":         {"gender": "male",   "style": "Upbeat"},
    "charon":       {"gender": "male",   "style": "Informative"},
    "kore":         {"gender": "female", "style": "Firm"},
    "fenrir":       {"gender": "male",   "style": "Excitable"},
    "leda":         {"gender": "female", "style": "Youthful"},
    "orus":         {"gender": "male",   "style": "Firm"},
    "aoede":        {"gender": "female", "style": "Breezy"},
    "callirrhoe":   {"gender": "female", "style": "Easy-going"},
    "autonoe":      {"gender": "female", "style": "Bright"},
    "enceladus":    {"gender": "male",   "style": "Breathy"},
    "iapetus":      {"gender": "male",   "style": "Clear"},
    "umbriel":      {"gender": "male",   "style": "Easy-going"},
    "algieba":      {"gender": "female", "style": "Smooth"},
    "despina":      {"gender": "female", "style": "Smooth"},
    "erinome":      {"gender": "female", "style": "Clear"},
    "algenib":      {"gender": "male",   "style": "Gravelly"},
    "rasalgethi":   {"gender": "male",   "style": "Informative"},
    "laomedeia":    {"gender": "female", "style": "Upbeat"},
    "achernar":     {"gender": "female", "style": "Soft"},
    "alnilam":      {"gender": "male",   "style": "Firm"},
    "schedar":      {"gender": "male",   "style": "Even"},
    "gacrux":       {"gender": "female", "style": "Mature"},
    "pulcherrima":  {"gender": "female", "style": "Forward"},
    "achird":       {"gender": "male",   "style": "Friendly"},
    "zubenelgenubi":{"gender": "male",   "style": "Casual"},
    "vindemiatrix": {"gender": "female", "style": "Gentle"},
    "sadachbia":    {"gender": "male",   "style": "Lively"},
    "sadaltager":   {"gender": "male",   "style": "Knowledgeable"},
    "sulafat":      {"gender": "female", "style": "Warm"},
}


def get_voice_gender(voice_id):
    """Returns 'male' or 'female' for a given prebuilt voice name.
    Defaults to 'female' (matches the old Kore default) if unknown."""
    info = VOICE_INFO.get(str(voice_id or "").strip().lower())
    return info["gender"] if info else "female"


def get_voice_style(voice_id):
    """Returns the catalog style word for a voice, or '' if unknown."""
    info = VOICE_INFO.get(str(voice_id or "").strip().lower())
    return info["style"] if info else ""


# Exact-case voice_id list, exported so api.py's /voice/names endpoint and
# name-validation error responses use this catalog directly instead of
# falling back to its own hardcoded copy (see the ⚠️ ACTION NEEDED note in
# public-api/api.py). Keep this in sync with VOICE_INFO above.
ALL_VOICE_NAMES = [
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
    "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
    "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
    "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird",
    "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
]
