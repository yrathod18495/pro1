'use client';

import { cn } from '@/lib/utils';
import { EMOTIONS } from '@/lib/emotions';

/**
 * Tappable "capsule" (pill) row for picking a dialogue line's emotion —
 * shared by the normal per-line editor (generated-lines.tsx) and the
 * pre-generate Resolve wizard (resolve-dialogues-dialog.tsx). Deliberately
 * just a flat wrap of buttons, not a dropdown/combobox — the whole point
 * (per how this was asked for) is the simplest possible interface for this.
 */
export function EmotionCapsules({ value, onChange }: { value: string; onChange: (emotion: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {EMOTIONS.map((emotion) => (
                <button
                    key={emotion}
                    type="button"
                    onClick={() => onChange(emotion)}
                    className={cn(
                        "h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-wide transition-all border",
                        value === emotion
                            ? "bg-primary text-white border-primary shadow-sm"
                            : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                    )}
                >
                    {emotion}
                </button>
            ))}
        </div>
    );
}
