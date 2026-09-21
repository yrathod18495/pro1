// A dialogue line under this many words lacks enough phonetic context for
// the TTS engines here to produce a natural, non-broken performance — see
// script-guidelines-dialog.tsx's own note on very short (1-2 word) lines.
// This is the single validation rule the pre-generate "Resolve" flow checks
// (studio/generation-settings.tsx) — deliberately just the one rule, kept
// simple rather than growing into a general script linter.
export const MIN_DIALOGUE_WORDS = 3;

export function isDialogueTooShort(text: string): boolean {
    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    return words.length < MIN_DIALOGUE_WORDS;
}
