'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, Play, Pause, Loader2, Library, Sparkles, Clipboard, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface LibraryVoice {
  voice_id: string;
  name: string;
  preview_url?: string | null;
  gender?: string | null;
  accent?: string | null;
  language?: string | null;
  description?: string | null;
  category?: string | null;
  source?: 'account' | 'library';
}

const SEARCH_DEBOUNCE_MS = 400;

// Our Character type uses 'Male'/'Female' and 'Kid'/'Adult'/'Old' — map
// those to what ElevenLabs' shared-voices filters actually expect.
function toElevenLabsGender(g?: string | null): string {
  const v = (g || '').toLowerCase();
  if (v === 'male' || v === 'female') return v;
  return '';
}
function toElevenLabsAge(a?: string | null): string {
  const v = (a || '').toLowerCase();
  if (v === 'kid' || v === 'child' || v === 'young') return 'young';
  if (v === 'old' || v === 'senior' || v === 'elderly') return 'old';
  if (v === 'adult') return 'middle_aged';
  return '';
}

/**
 * 11Labs voice source for the studio.
 *
 * Three ways to land on a voice:
 *   1. The DEFAULT list — quietly auto-filtered by whatever the calling
 *      character-assignment screen already knows: gender, age group, and
 *      the script's language. Script analysis already produces gender/
 *      age per character, so this uses it instead of showing ElevenLabs'
 *      generic "account voices" (which are whatever premade defaults
 *      happen to sit on the account, not chosen for any character).
 *      The visible search box stays empty for this — nothing about the
 *      auto-filter is shown as a "search" the person did.
 *   2. Typing in the search box — a real full-text search across the
 *      whole public library, which REPLACES the auto-filter entirely
 *      (their own typed term takes over completely once they type).
 *   3. Paste a voice ID — for a voice that isn't in any list at all.
 *
 * REQUEST BUDGET — three layers keep this from hammering anything:
 *   • 400ms debounce, so typing a word is one request, not one per key
 *   • an in-memory cache per query, so re-searching a term costs nothing
 *   • the /api/voices route is cached at Vercel's edge per URL, so the
 *     same search from a thousand users is one upstream call
 */
export function ElevenLabsVoiceSource({
  selectedVoiceId,
  onSelect,
  className,
  gender,
  age,
  language,
}: {
  selectedVoiceId?: string | null;
  onSelect: (voiceId: string, displayName: string, previewUrl?: string | null) => void;
  className?: string;
  /** Character's gender ('Male'/'Female') — drives the quiet default filter. */
  gender?: string | null;
  /** Character's age group ('Kid'/'Adult'/'Old') — drives the quiet default filter. */
  age?: string | null;
  /** Script language as an ElevenLabs language code (e.g. 'hi', 'en'). */
  language?: string | null;
}) {
  const [voices, setVoices] = useState<LibraryVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pastedId, setPastedId] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const elGender = toElevenLabsGender(gender);
  const elAge = toElevenLabsAge(age);
  const elLanguage = (language || '').trim().toLowerCase();

  // Query -> results, for this session. Typing "aria", deleting it, then
  // typing it again hits this instead of the network. The auto-filtered
  // default is cached under its own key so switching between two
  // characters with the same gender/age/language doesn't re-fetch either.
  const cache = useRef<Map<string, LibraryVoice[]>>(new Map());

  useEffect(() => {
    const term = query.trim();
    // Cache key includes the auto-filter signals so two different
    // characters (e.g. a female child vs. a male elder) never share a
    // cached result meant for the other.
    const cacheKey = term || `auto:${elGender}|${elAge}|${elLanguage}`;
    let cancelled = false;

    const cached = cache.current.get(cacheKey);
    if (cached) {
      setVoices(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (term) {
          params.set('q', term);
        } else {
          // No visible search yet — quietly filter by what's already
          // known about this character instead of showing generic
          // account defaults.
          if (elGender) params.set('gender', elGender);
          if (elAge) params.set('age', elAge);
          if (elLanguage) params.set('language', elLanguage);
        }
        const url = params.toString() ? `/api/voices?${params}` : '/api/voices';
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || data?.success === false) {
          setError(data?.error || 'Could not load voices.');
          setVoices([]);
        } else {
          const list: LibraryVoice[] = data.voices || [];
          cache.current.set(cacheKey, list);
          setVoices(list);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError('Could not load voices.');
          setVoices([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      // No debounce on the very first (empty) load — only on typing.
    }, term ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, elGender, elAge, elLanguage]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePreview = (v: LibraryVoice) => {
    if (!v.preview_url) return;
    if (playingId === v.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(v.preview_url);
    audioRef.current = audio;
    audio.play().catch(() => {});
    audio.onended = () => setPlayingId(null);
    setPlayingId(v.voice_id);
  };

  const applyPastedId = () => {
    const id = pastedId.trim();
    if (!id) return;
    onSelect(id, `Custom voice (${id.slice(0, 8)}…)`, null);
    setPastedId('');
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyVoiceId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    }).catch(() => {});
  };

  const trimmed = query.trim();

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search voices by name, accent, language…"
          className="pl-8 h-9"
        />
      </div>

      <p className="text-[11px] text-muted-foreground px-0.5 flex items-center gap-1.5">
        {loading && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
        {loading
          ? 'Loading voices…'
          : trimmed
            ? `${voices.length} match${voices.length === 1 ? '' : 'es'} in the 11Labs library`
            : 'Recommended voices for this character.'}
      </p>

      <div className="max-h-64 sm:max-h-72 overflow-y-auto overflow-x-hidden space-y-1.5 -mx-0.5 px-0.5">
        {error && (
          <p className="text-sm text-destructive text-center py-6">{error}</p>
        )}

        {!loading && !error && voices.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            {trimmed
              ? `No voices match "${query}". You can paste a voice ID below instead.`
              : 'No voices available right now.'}
          </p>
        )}

        {voices.map((v) => {
          const isSelected = selectedVoiceId === v.voice_id;
          const isPlaying = playingId === v.voice_id;
          const isCopied = copiedId === v.voice_id;
          return (
            <div
              key={v.voice_id}
              onClick={() => onSelect(v.voice_id, v.name, v.preview_url ?? null)}
              className={cn(
                'flex items-center gap-2 sm:gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors',
                isSelected
                  ? 'border-violet-500 bg-violet-500/10'
                  : 'border-border hover:border-violet-500/40 hover:bg-violet-500/[0.04]'
              )}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePreview(v); }}
                disabled={!v.preview_url}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-500 disabled:opacity-25"
                title={v.preview_url ? 'Preview' : 'No preview available'}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{v.name}</span>
                  {v.source === 'library' && <Library className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1 sm:truncate">
                  {[v.gender, v.accent, v.language, v.description]
                    .filter(Boolean).slice(0, 3).join(' · ')}
                </p>
                {/* 🔴 NEW: every voice's id, visible and copyable — on
                    narrow screens this sits on its own line under the
                    name/description rather than fighting them for width. */}
                <button
                  type="button"
                  onClick={(e) => copyVoiceId(e, v.voice_id)}
                  className="mt-1 flex items-center gap-1 text-[9px] font-mono text-muted-foreground/70 hover:text-violet-500 transition-colors max-w-full"
                  title="Copy voice ID"
                >
                  {isCopied ? <Check className="h-2.5 w-2.5 shrink-0 text-emerald-500" /> : <Clipboard className="h-2.5 w-2.5 shrink-0" />}
                  <span className="truncate">{v.voice_id}</span>
                </button>
              </div>

              {isSelected && <Check className="h-4 w-4 text-violet-500 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Escape hatch: any voice ID, in the library or not. */}
      <div className="pt-2 border-t border-border/60 space-y-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Clipboard className="h-3 w-3" /> Or paste a voice ID
        </label>
        <div className="flex gap-2">
          <Input
            value={pastedId}
            onChange={(e) => setPastedId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPastedId(); } }}
            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            className="h-9 font-mono text-xs min-w-0 flex-1"
          />
          <Button type="button" onClick={applyPastedId} disabled={!pastedId.trim()} className="h-9 shrink-0 px-4">
            Use
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The engine toggle. Sits above character assignments once analysis is
 * done, because that's the first moment the choice actually matters.
 */
export function VoiceEngineToggle({
  engine,
  onChange,
  disabled,
  className,
}: {
  engine: 'gemini' | 'elevenlabs';
  onChange: (e: 'gemini' | 'elevenlabs') => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = [
    { id: 'gemini' as const, label: 'Google', hint: 'Built-in voice set' },
    { id: 'elevenlabs' as const, label: '11 Labs', hint: 'Full voice library' },
  ];

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold tracking-tight">Voice engine</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const active = engine === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                active
                  ? opt.id === 'elevenlabs'
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/40 hover:bg-muted/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{opt.label}</span>
                {active && (
                  <Badge
                    className={cn(
                      'h-5 px-1.5 text-[9px] font-black text-white shrink-0',
                      opt.id === 'elevenlabs'
                        ? 'bg-violet-500 hover:bg-violet-500'
                        : 'bg-primary hover:bg-primary'
                    )}
                  >
                    ON
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{opt.hint}</p>
            </button>
          );
        })}
      </div>

      {/* Each engine keeps its own assignments — see setVoiceEngine. */}
      <p className="text-[11px] text-muted-foreground">
        Each engine keeps its own voice assignments, so you can switch back and forth
        without losing them.
      </p>
    </div>
  );
}
