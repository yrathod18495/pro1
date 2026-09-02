'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStudio } from '@/context/studio-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { voices } from '@/lib/voices';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, generateAvatarColor } from '@/lib/utils';
import { Play, Pause, ChevronsUpDown, Check, Users } from 'lucide-react';
import type { Character } from '@/lib/types';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


function VoicePicker({ 
    character, 
    onVoiceChange, 
    playingVoice, 
    onTogglePlay 
}: { 
    character: Character, 
    onVoiceChange: (voiceId: string) => void, 
    playingVoice: string | null, 
    onTogglePlay: (e: React.MouseEvent, voice: typeof voices[0]) => void 
}) {
    const [open, setOpen] = useState(false);

    const getVoiceName = (voiceId: string) => {
        const voice = voices.find(v => v.id === voiceId);
        if (!voice) return 'Assign a voice...';
        return `${voice.name} (${voice.gender})`;
    };

    const groupedVoices = useMemo(() => {
        return {
            male: voices.filter(v => v.gender === 'Male'),
            female: voices.filter(v => v.gender === 'Female'),
            neutral: voices.filter(v => v.gender !== 'Male' && v.gender !== 'Female')
        };
    }, []);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-11 px-4 rounded-xl border-border dark:border-white/10 shadow-inner bg-background dark:bg-white/5 text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10"
                >
                    <span className="truncate font-bold text-sm">{getVoiceName(character.voice)}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[95vw] sm:w-[600px] p-0 rounded-2xl shadow-2xl border-border dark:border-white/10 overflow-hidden z-[300] bg-popover text-popover-foreground dark:bg-[#0a0a0b]/95 dark:backdrop-blur-3xl" align="start">
                <div className="flex flex-row h-80 sm:h-72 divide-x divide-border dark:divide-white/5 border-border dark:border-white/5">
                    {/* Female Voices Column */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary/60 bg-muted dark:bg-white/5 border-b border-border dark:border-white/5 shrink-0">
                            Female Voices
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {groupedVoices.female.map(voice => (
                                    <VoiceItem 
                                        key={voice.id} 
                                        voice={voice} 
                                        selected={character.voice === voice.id} 
                                        playingVoice={playingVoice} 
                                        onTogglePlay={onTogglePlay} 
                                        onSelect={() => { onVoiceChange(voice.id); setOpen(false); }}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Male Voices Column */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-400/60 bg-muted dark:bg-white/5 border-b border-border dark:border-white/5 shrink-0">
                            Male Voices
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {groupedVoices.male.map(voice => (
                                    <VoiceItem 
                                        key={voice.id} 
                                        voice={voice} 
                                        selected={character.voice === voice.id} 
                                        playingVoice={playingVoice} 
                                        onTogglePlay={onTogglePlay} 
                                        onSelect={() => { onVoiceChange(voice.id); setOpen(false); }}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                {groupedVoices.neutral.length > 0 && (
                    <div className="bg-muted dark:bg-white/5 border-t border-border dark:border-white/5">
                        <p className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-500">Other / Neutral</p>
                        <ScrollArea className="h-20">
                            <div className="p-2 flex flex-wrap gap-2">
                                {groupedVoices.neutral.map(voice => (
                                    <Badge 
                                        key={voice.id} 
                                        variant={character.voice === voice.id ? "default" : "outline"}
                                        className="cursor-pointer font-bold uppercase text-[10px] py-1 px-3"
                                        onClick={() => { onVoiceChange(voice.id); setOpen(false); }}
                                    >
                                        {voice.name}
                                    </Badge>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

function VoiceItem({ voice, selected, playingVoice, onTogglePlay, onSelect }: { voice: typeof voices[0], selected: boolean, playingVoice: string | null, onTogglePlay: any, onSelect: () => void }) {
    const isDisabled = (voice as any).disabled;
    return (
        <div className={cn(
            "flex items-center gap-1 rounded-xl transition-all duration-300 group",
            isDisabled ? "opacity-40 cursor-not-allowed bg-muted dark:bg-white/5" : selected ? "bg-primary/20" : "hover:bg-muted dark:hover:bg-white/5"
        )}>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full text-foreground dark:text-white hover:bg-muted dark:hover:bg-white/10"
                onClick={(e) => {
                    e.stopPropagation();
                    onTogglePlay(e, voice);
                }}
                disabled={!voice.demoUrl}
            >
                {playingVoice === voice.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <div 
                className={cn(
                    "flex-1 text-xs font-bold py-2.5 truncate",
                    isDisabled ? "cursor-not-allowed text-zinc-500" : "cursor-pointer",
                    selected ? "text-primary" : "text-muted-foreground group-hover:text-foreground dark:text-zinc-400 dark:group-hover:text-white"
                )}
                onClick={() => {
                    if (isDisabled) return;
                    onSelect();
                }}
            >
                {voice.name}
            </div>
            {isDisabled && (
                <Badge variant="outline" className="text-[8px] font-black uppercase py-0 px-1 border-destructive/30 text-destructive mr-2 shrink-0">Disabled</Badge>
            )}
            {selected && !isDisabled && (
                <Check className="h-3.5 w-3.5 mr-2 text-primary shrink-0" />
            )}
        </div>
    )
}

const ageColorClasses = {
    Kid: 'bg-green-500/10 text-green-400 border-green-500/20',
    Adult: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Old: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
};

export function CharacterAssignments() {
  const { 
    characters, 
    handleVoiceChange, 
    projectName, 
    setProjectName, 
    handleAgeChange,
    isGenerating,
    hqProject,
    isHqProjectLoading,
    isFinalizing,
    generatedAudio
  } = useStudio();
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;
    const onEnded = () => setPlayingVoiceId(null);
    audio.addEventListener('ended', onEnded);
    return () => {
        audio?.pause();
        audio?.removeEventListener('ended', onEnded);
    }
  }, []);

  const toggleVoicePreview = async (e: React.MouseEvent, voice: typeof voices[0]) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !voice.demoUrl) return;

    if (playingVoiceId === voice.id) {
        audio.pause();
        setPlayingVoiceId(null);
    } else {
        audio.pause(); 
        audio.src = voice.demoUrl;
        try {
            await audio.play();
            setPlayingVoiceId(voice.id);
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error("Audio preview failed:", error);
            }
        }
    }
  };

  // AUTOMATIC HIDE: Hide component during and after submission
  if (characters.length === 0 || isGenerating || isFinalizing || hqProject || generatedAudio) {
    return null;
  }
  
  return (
    <Card id="character-assignments-container" className="border-border/60 shadow-2xl bg-card/90 dark:bg-white/[0.02] backdrop-blur-3xl overflow-hidden rounded-[2rem]">
      <CardHeader className="bg-primary/5 pb-6 border-b border-border/60">
        <div className="flex items-center gap-4">
             <div className="p-3 bg-primary/10 rounded-2xl shadow-inner">
                <Users className="h-6 w-6 text-primary" />
             </div>
             <div>
                <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">Project Cast</CardTitle>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Assign AI Personas</p>
             </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 pt-8">
        <div className="space-y-2">
            <Label htmlFor="project-name-input" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Project Identifier</Label>
            <Input
                id="project-name-input"
                placeholder="e.g., 'Mystery in Delhi'"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                maxLength={60}
                className="h-12 text-lg font-bold border-border/60 focus-visible:ring-primary rounded-xl bg-muted/30 dark:bg-white/5 text-foreground placeholder:text-muted-foreground"
            />
        </div>
        
        <div className="space-y-4">
        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Detected Characters</Label>
        {characters.map((char) => {
            const avatarColor = generateAvatarColor(char.name);
            const selectedVoice = voices.find(v => v.id === char.voice);
            return (
                <div key={char.id} className="rounded-3xl border border-border/60 bg-muted/20 dark:bg-white/[0.02] p-5 space-y-5 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-500 group">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                            <Avatar className="h-12 w-12 border-2 border-border shadow-lg transition-transform group-hover:scale-110">
                                <AvatarFallback className={cn("font-black text-lg", avatarColor.bg, avatarColor.text)}>
                                    {char.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <p className="font-black text-base truncate text-foreground" title={char.name}>{char.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="h-5 px-1.5 text-[8px] font-black uppercase border-border/60 text-muted-foreground">{char.dialogueCount} Lines</Badge>
                                </div>
                            </div>
                        </div>
                        <Select value={char.age} onValueChange={(newAge) => handleAgeChange(char.id, newAge as any)}>
                            <SelectTrigger className={cn("h-8 w-auto px-4 text-[9px] font-black uppercase tracking-widest rounded-full border-none shadow-sm transition-all active:scale-95", ageColorClasses[char.age as keyof typeof ageColorClasses])}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl font-bold border-border dark:border-white/10 bg-popover dark:bg-[#0a0a0b] text-popover-foreground dark:text-white">
                                <SelectItem value="Kid" className="rounded-xl">Kid</SelectItem>
                                <SelectItem value="Adult" className="rounded-xl">Adult</SelectItem>
                                <SelectItem value="Old" className="rounded-xl">Old</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex-grow">
                            <VoicePicker
                                character={char}
                                onVoiceChange={(voiceId) => handleVoiceChange(char.id, voiceId)}
                                playingVoice={playingVoiceId}
                                onTogglePlay={toggleVoicePreview}
                            />
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-12 w-12 flex-shrink-0 rounded-2xl hover:bg-primary/20 text-primary bg-primary/10 transition-all active:scale-90"
                            onClick={(e) => selectedVoice && toggleVoicePreview(e, selectedVoice)}
                            disabled={!selectedVoice?.demoUrl}
                        >
                            {playingVoiceId === selectedVoice?.id ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-current" />}
                        </Button>
                    </div>
                </div>
            );
        })}
        </div>
      </CardContent>
    </Card>
  );
}