'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Volume2, Play, Pause, Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn, getDisplayUrl } from '@/lib/utils';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';

interface StudioDemoCardProps {
  title?: string;
  badgeText?: string;
  subtitle?: string;
}

interface AudioDemoItem {
  id: string;
  title: string;
  url: string;
  tag?: string;
}

const DEFAULT_DEMOS: AudioDemoItem[] = [
  {
    id: 'demo1',
    title: 'Clear Narration',
    tag: 'Hindi / English Voice',
    url: 'https://storage.12labs.in/hq_gen/ZXAjUAxPv2SA5e1e0N7avpEptCx2/PRO_1785243711529_KZUT6L_m9mw6uwv.mp3',
  },
  {
    id: 'demo2',
    title: 'Character Dialogue',
    tag: 'Multi-Role Scene',
    url: 'https://storage.12labs.in/hq_gen/ZXAjUAxPv2SA5e1e0N7avpEptCx2/PRO_1785243711529_KZUT6L_m9mw6uwv.mp3',
  },
  {
    id: 'demo3',
    title: 'Emotional Voiceover',
    tag: 'High Fidelity Output',
    url: 'https://storage.12labs.in/hq_gen/ZXAjUAxPv2SA5e1e0N7avpEptCx2/PRO_1785243711529_KZUT6L_m9mw6uwv.mp3',
  },
];

export function StudioDemoCard({
  title = "STUDIO ENGINE READY",
  badgeText = "INSTANT VOICE SYNTHESIS",
  subtitle = "Analyze script to activate neural voices"
}: StudioDemoCardProps) {
  const { database } = initializeFirebase();
  const [demos, setDemos] = useState<AudioDemoItem[]>(DEFAULT_DEMOS);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!database) return;

    const audioDemosRef = ref(database, 'settings/landingPage/audioDemos');
    const unsubscribe = onRtdbValue(audioDemosRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loaded: AudioDemoItem[] = [];

        if (data.demo1?.title) {
          loaded.push({
            id: 'demo1',
            title: data.demo1.title,
            tag: 'Narration Demo',
            url: data.demo1.fileId ? getDisplayUrl(data.demo1.fileId) : (data.demo1.url ? getDisplayUrl(data.demo1.url) : DEFAULT_DEMOS[0].url),
          });
        }
        if (data.demo2?.title) {
          loaded.push({
            id: 'demo2',
            title: data.demo2.title,
            tag: 'Dialogue Demo',
            url: data.demo2.fileId ? getDisplayUrl(data.demo2.fileId) : (data.demo2.url ? getDisplayUrl(data.demo2.url) : DEFAULT_DEMOS[1].url),
          });
        }
        if (data.demo3?.title) {
          loaded.push({
            id: 'demo3',
            title: data.demo3.title,
            tag: 'Emotional Demo',
            url: data.demo3.fileId ? getDisplayUrl(data.demo3.fileId) : (data.demo3.url ? getDisplayUrl(data.demo3.url) : DEFAULT_DEMOS[2].url),
          });
        }

        if (loaded.length > 0) {
          setDemos(loaded);
        }
      }
    });

    return () => unsubscribe();
  }, [database]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleTogglePlay = (demo: AudioDemoItem) => {
    if (activePlayingId === demo.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setActivePlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const newAudio = new Audio(demo.url);
    audioRef.current = newAudio;
    newAudio.onended = () => setActivePlayingId(null);
    newAudio.onerror = () => setActivePlayingId(null);

    newAudio.play().then(() => {
      setActivePlayingId(demo.id);
    }).catch(() => {
      setActivePlayingId(null);
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[440px] border-2 border-dashed border-border/80 rounded-[2.5rem] bg-card/90 dark:bg-white/[0.02] backdrop-blur-3xl shadow-sm p-6 sm:p-8 relative overflow-hidden group">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-primary/[0.01] -z-10" />

      <div className="space-y-6 text-center animate-in zoom-in-95 duration-700 w-full max-w-md">
        <div className="relative mx-auto w-fit">
          <div className={cn(
            "absolute inset-0 bg-primary/20 rounded-full blur-2xl transition-all duration-1000",
            activePlayingId ? "scale-150 opacity-100" : "scale-100 opacity-0"
          )} />
          <div className="p-4 bg-primary/10 rounded-3xl relative z-10">
            <Sparkles className="h-8 w-8 text-primary animate-pulse" />
          </div>
        </div>

        <div className="space-y-2 flex flex-col items-center">
          {badgeText && (
            <Badge className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white font-black uppercase text-[10px] h-6 px-4 rounded-full shadow-lg border-none mb-1 tracking-widest">
              {badgeText}
            </Badge>
          )}
          <p className="text-xl sm:text-2xl font-black tracking-tight uppercase text-foreground">{title}</p>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            {subtitle}
          </p>
        </div>

        <Separator className="max-w-[160px] mx-auto bg-border" />

        {/* 🎙️ ALL 3 NEURAL DEMOS PLAYER */}
        <div className="space-y-3 pt-1 w-full">
          <div className="flex items-center justify-center gap-2">
            <Radio className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              STUDIO DEMOS (3 VOICE PROFILES)
            </span>
          </div>

          <div className="flex flex-col gap-2.5 w-full">
            {demos.map((demo, idx) => {
              const isPlayingThis = activePlayingId === demo.id;
              return (
                <div
                  key={demo.id}
                  onClick={() => handleTogglePlay(demo)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 cursor-pointer text-left",
                    isPlayingThis
                      ? "bg-primary/20 border-primary/40 shadow-md ring-2 ring-primary/20"
                      : "bg-muted/50 dark:bg-white/5 border-border/60 dark:border-white/5 hover:border-primary/40 hover:bg-muted/80"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-9 w-9 shrink-0 rounded-full transition-all duration-300",
                        isPlayingThis
                          ? "bg-primary text-white shadow-md scale-105"
                          : "bg-primary/10 text-primary hover:bg-primary/20"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePlay(demo);
                      }}
                    >
                      {isPlayingThis ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 fill-current ml-0.5" />
                      )}
                    </Button>
                    <div className="truncate">
                      <p className="text-xs font-black uppercase tracking-wide truncate text-foreground">
                        Demo {idx + 1}: {demo.title}
                      </p>
                      {demo.tag && (
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground truncate">
                          {demo.tag}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isPlayingThis ? (
                      <Badge className="bg-primary text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full animate-pulse">
                        PLAYING
                      </Badge>
                    ) : (
                      <Volume2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
