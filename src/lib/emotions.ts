// Fixed, curated emotion list for dialogue lines — kept as a closed list
// (not free text) so every value here is one the TTS pipeline (script
// analysis's own [Emotion] bracket parsing, and the HQ/11Labs job payload's
// per-dialogue `emotion` field) already knows how to handle, instead of a
// user typing something the synthesis engine silently ignores. Shown as
// tappable chips ("capsules"), not a dropdown, in both the normal per-line
// editor and the Resolve wizard.
export const EMOTIONS = [
    'Neutral',
    'Happy',
    'Sad',
    'Angry',
    'Excited',
    'Calm',
    'Fearful',
    'Serious',
    'Whisper',
    'Sarcastic',
    'Romantic',
    'Surprised',
] as const;

export type Emotion = typeof EMOTIONS[number];
