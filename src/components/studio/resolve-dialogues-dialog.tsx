'use client';

import { useState, useEffect, useMemo } from 'react';
import { useStudio } from '@/context/studio-provider';
import { useAuth } from '@/context/auth-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { isDialogueTooShort, MIN_DIALOGUE_WORDS } from '@/lib/dialogue-validation';
import { EmotionCapsules } from './emotion-capsules';
import { expandDialogueWithAiAction } from '@/app/studio/ai-fix-actions';
import { reportClientError } from '@/lib/report-client-error';
import { AlertTriangle, Sparkles, Loader2, ArrowRight } from 'lucide-react';

interface ResolveDialoguesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onGenerateAnyway: () => void;
    onAllResolved: () => void;
}

/**
 * Pre-generate validation gate for the Studio's Generate button
 * (generation-settings.tsx). Too-short dialogue lines (see
 * lib/dialogue-validation.ts) tend to come out broken/unnatural from the
 * TTS engine, so this walks the user through fixing each one — manually,
 * or via a paid AI-Fix (Gemini 2.5 Flash Lite) — one at a time, with an
 * emotion capsule editor alongside, before letting generation proceed.
 * "Generate Anyway" is always available as an explicit override.
 */
export function ResolveDialoguesDialog({ open, onOpenChange, onGenerateAnyway, onAllResolved }: ResolveDialoguesDialogProps) {
    const { generatedLines, updateGeneratedLine } = useStudio();
    const { activeUid, activeUser, user, setUser } = useAuth();
    const { toast } = useToast();

    // Captured once when the dialog opens, so the progress count ("2 of 5")
    // stays stable as issues get resolved instead of shrinking under the user.
    const [trackedIds, setTrackedIds] = useState<string[]>([]);
    const [text, setText] = useState('');
    const [emotion, setEmotion] = useState('Neutral');
    const [isAiFixing, setIsAiFixing] = useState(false);

    const remainingIssues = useMemo(
        () => generatedLines.filter((l) => trackedIds.includes(l.id) && isDialogueTooShort(l.dialogue)),
        [generatedLines, trackedIds]
    );
    const resolvedCount = trackedIds.length - remainingIssues.length;
    const current = remainingIssues[0];

    useEffect(() => {
        if (!open) return;
        const ids = generatedLines.filter((l) => isDialogueTooShort(l.dialogue)).map((l) => l.id);
        setTrackedIds(ids);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (current) {
            setText(current.dialogue);
            setEmotion(current.emotion || 'Neutral');
        }
    }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (open && trackedIds.length > 0 && remainingIssues.length === 0) {
            onOpenChange(false);
            onAllResolved();
        }
    }, [open, trackedIds.length, remainingIssues.length]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!current) return null;

    const handleSaveAndNext = () => {
        if (isDialogueTooShort(text)) {
            toast({ variant: 'destructive', title: 'Still Too Short', description: `Needs at least ${MIN_DIALOGUE_WORDS} words.` });
            return;
        }
        updateGeneratedLine(current.id, { dialogue: text, emotion });
        // Advancing happens on its own — `current` re-derives from
        // remainingIssues once this line drops out of it.
    };

    const handleAiFix = async () => {
        if (!activeUid) return;
        setIsAiFixing(true);
        try {
            const fullScript = generatedLines.map((l) => `${l.characterName}: ${l.dialogue}`).join('\n');
            const result = await expandDialogueWithAiAction(activeUid, current.dialogue, current.characterName, fullScript);
            if (!result.success || !result.expandedText) throw new Error(result.error);
            setText(result.expandedText);
            if (result.newCredits !== undefined) setUser({ ...user, credits: result.newCredits } as any);
            toast({ title: 'AI-Fix Applied', description: 'Review the line below, then Save & Next.' });
        } catch (e: any) {
            reportClientError('src/components/studio/resolve-dialogues-dialog.tsx:handleAiFix', e);
            toast({ variant: 'destructive', title: 'AI-Fix Failed', description: e.message || 'Could not expand this line.' });
        } finally {
            setIsAiFixing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Fix Dialogues Before Generating
                    </DialogTitle>
                    <DialogDescription>
                        These lines are too short for the AI voice to perform naturally. Fix each one, or generate anyway.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                            {trackedIds.map((id) => {
                                const stillIssue = remainingIssues.some((l) => l.id === id);
                                const isCurrent = current.id === id;
                                return (
                                    <div
                                        key={id}
                                        className={cn(
                                            "h-2.5 w-2.5 rounded-full",
                                            stillIssue ? "bg-destructive" : "bg-green-500",
                                            isCurrent && stillIssue && "ring-2 ring-destructive/30"
                                        )}
                                    />
                                );
                            })}
                        </div>
                        <Badge variant="outline" className="text-[10px] font-bold">{resolvedCount} / {trackedIds.length} Resolved</Badge>
                    </div>

                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-none text-[9px] font-black uppercase">{current.characterName}</Badge>
                            <Badge variant="outline" className="text-[9px] font-bold text-destructive border-destructive/30">Too Short</Badge>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Increase this line's length</Label>
                            <Textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                className="min-h-[90px] rounded-xl"
                                placeholder="Add a few more words for natural delivery..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Emotion</Label>
                            <EmotionCapsules value={emotion} onChange={setEmotion} />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <Button variant="outline" className="flex-1" onClick={handleAiFix} disabled={isAiFixing}>
                                {isAiFixing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                AI-Fix
                            </Button>
                            <Button className="flex-1" onClick={handleSaveAndNext} disabled={isAiFixing}>
                                Save &amp; Next <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-col gap-2 items-stretch">
                    <p className="text-[11px] text-muted-foreground text-center">
                        Warning: generating without fixing these lines may cause the AI voice to sound broken or unnatural on the flagged dialogue.
                    </p>
                    <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { onOpenChange(false); onGenerateAnyway(); }}>
                        Generate Anyway
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
