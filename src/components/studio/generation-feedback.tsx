'use client';

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Loader2, Heart, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';
import { submitGenerationFeedbackAction } from '@/app/studio/feedback-actions';

type Rating = 'like' | 'dislike';

/**
 * Post-generation feedback.
 *
 * Flow: pick a rating -> an optional reason box opens -> send (or skip).
 * A rating is submitted the moment it's picked, so a user who taps 👍 and
 * walks away is still counted; the reason, if they type one, is sent as a
 * second message. Nothing is stored anywhere — see feedback-actions.ts.
 */
export function GenerationFeedback({
  projectName,
  engine,
  mode,
  className,
}: {
  projectName?: string;
  engine?: string;
  mode?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const [rating, setRating] = useState<Rating | null>(null);
  const [reason, setReason] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [done, setDone] = useState(false);

  const send = async (r: Rating, withReason: string) => {
    await submitGenerationFeedbackAction({
      rating: r,
      reason: withReason,
      projectName,
      userEmail: user?.email || undefined,
      engine,
      mode,
    });
  };

  const pick = async (r: Rating) => {
    setRating(r);
    // Fire immediately — a bare rating with no reason is still worth
    // having, and most people never type anything.
    void send(r, '');
  };

  const submitReason = async () => {
    if (!rating || !reason.trim()) return;
    setIsSending(true);
    await send(rating, reason.trim());
    setIsSending(false);
    setDone(true);
  };

  // ---------- Final acknowledgement ----------
  if (done) {
    return (
      <div className={cn('rounded-2xl border border-border/60 bg-muted/30 p-5 text-center space-y-1.5', className)}>
        <Check className="h-5 w-5 text-green-600 mx-auto" />
        <p className="text-sm font-bold">Thank you — that's been passed on.</p>
        <p className="text-xs text-muted-foreground">
          {rating === 'like'
            ? "We're really glad this worked for you."
            : "We read every one of these, and we'll work on it."}
        </p>
      </div>
    );
  }

  // ---------- After picking a rating ----------
  if (rating) {
    const isLike = rating === 'like';
    return (
      <div
        className={cn(
          'rounded-2xl border p-5 space-y-3',
          isLike ? 'border-green-500/30 bg-green-500/[0.05]' : 'border-amber-500/30 bg-amber-500/[0.05]',
          className
        )}
      >
        <div className="flex items-start gap-2.5">
          {isLike ? (
            <Heart className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          ) : (
            <ThumbsDown className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <p className="text-sm font-bold">
              {isLike ? 'Thank you — that means a lot.' : "Sorry this one missed the mark."}
            </p>
            <p className="text-xs text-muted-foreground">
              {isLike
                ? "We're glad you liked it. If anything stood out, tell us — it helps us keep it that way."
                : 'Tell us what went wrong and we\'ll look into it.'}
            </p>
          </div>
        </div>

        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            isLike
              ? 'What worked well? (optional)'
              : 'What was wrong — voice, pacing, pronunciation, something else? (optional)'
          }
          rows={3}
          className="text-sm"
        />

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setDone(true)} disabled={isSending}>
            Skip
          </Button>
          <Button size="sm" onClick={submitReason} disabled={!reason.trim() || isSending}>
            {isSending ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Sending…</> : 'Send'}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Initial ask ----------
  return (
    <div className={cn('rounded-2xl border border-border/60 bg-muted/20 p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">How was this generation?</p>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => pick('like')}
            className="h-9 w-9 rounded-xl hover:border-green-500/50 hover:text-green-600"
            aria-label="Like this generation"
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => pick('dislike')}
            className="h-9 w-9 rounded-xl hover:border-amber-500/50 hover:text-amber-600"
            aria-label="Dislike this generation"
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
