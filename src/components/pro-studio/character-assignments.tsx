'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useProStudio } from '@/context/pro-studio-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { proVoices } from '@/lib/pro-voices';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, generateAvatarColor } from '@/lib/utils';
import { Play, Pause, ChevronsUpDown, Check, Users } from 'lucide-react';
import type { Character } from '@/lib/types';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function VoicePicker({ 
    currentVoiceId, 
    onVoiceChange, 
    playingVoice, 
    onTogglePlay 
}: { 
    currentVoiceId: string, 
    onVoiceChange: (voiceId: string) => void, 
    playingVoice: string | null, 
    onTogglePlay: (e: React.MouseEvent, voice: any) => void 
}) {
    const [open, setOpen] = useState(false);

    const getVoiceName = (voiceId: string) => {
        const voice = proVoices.find(v => v.id === voiceId);
        if (!voice) return 'Assign persona...';
        return `${voice.name} (${voice.gender})`;
    };

    const groupedVoices = useMemo(() => {
        return {
            male: proVoices.filter(v => v.gender === 'Male'),
            female: proVoices.filter(v => v.gender === 'Female'),
        };
    }, []);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-11 px-4 rounded-xl border-primary/10 shadow-inner bg-background/50"
                >
                    <span className="truncate font-bold text-sm">{getVoiceName(currentVoiceId)}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[95vw] sm:w-[600px] p-0 rounded-2xl shadow-2xl border-primary/10 overflow-hidden z-[300]" align="start">
                <div className="flex flex-row h-80 sm:h-96 divide-x border-primary/5">
                    {/* Female Voices Column */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary/60 bg-primary/5 border-b shrink-0">
                            Female Personas
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {groupedVoices.female.map(voice => (
                                    <div key={voice.id} className={cn(
                                        "flex items-center gap-1 rounded-xl transition-all duration-300 group",
                                        currentVoiceId === voice.id ? "bg-primary/10" : "hover:bg-muted/50"
                                    )}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 rounded-full"
                                            onClick={(e) => onTogglePlay(e, voice)}
                                        >
                                            {playingVoice === voice.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                        </Button>
                                        <div 
                                            className={cn(
                                                "flex-1 text-xs font-bold cursor-pointer py-2.5 truncate uppercase",
                                                currentVoiceId === voice.id ? "text-primary" : "text-foreground/70"
                                            )}
                                            onClick={() => { onVoiceChange(voice.id); setOpen(false); }}
                                        >
                                            {voice.name}
                                        </div>
                                        {currentVoiceId === voice.id && (
                                            <Check className="h-3.5 w-3.5 mr-2 text-primary shrink-0" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Male Voices Column */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600/60 bg-blue-500/5 border-b shrink-0">
                            Male Personas
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {groupedVoices.male.map(voice => (
                                    <div key={voice.id} className={cn(
                                        "flex items-center gap-1 rounded-xl transition-all duration-300 group",
                                        currentVoiceId === voice.id ? "bg-primary/10" : "hover:bg-muted/50"
                                    )}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 rounded-full"
                                            onClick={(e) => onTogglePlay(e, voice)}
                                        >
                                            {playingVoice === voice.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                        </Button>
                                        <div 
                                            className={cn(
                                                "flex-1 text-xs font-bold cursor-pointer py-2.5 truncate uppercase",
                                                currentVoiceId === voice.id ? "text-primary" : "text-foreground/70"
                                            )}
                                            onClick={() => { onVoiceChange(voice.id); setOpen(false); }}
                                        >
                                            {voice.name}
                                        </div>
                                        {currentVoiceId === voice.id && (
                                            <Check className="h-3.5 w-3.5 mr-2 text-primary shrink-0" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

const ageColorClasses = {
  Kid: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800',
  Adult: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800',
  Old: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-800'
};

export function CharacterAssignments() {
  const { characters, handleVoiceChange, projectName, setProjectName, handleAgeChange } = useProStudio();
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

  const toggleVoicePreview = async (e: React.MouseEvent, voice: any) => {
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
            console.error("Audio preview failed:", error);
        }
    }
  };

  if (characters.length === 0) return null;

  return (
    <Card className="border-none shadow-2xl bg-card overflow-hidden rounded-[2rem]">
      <CardHeader className="bg-primary/5 pb-6 border-b border-primary/10">
        <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" /> Cast Mapping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8 pt-8">
        <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Project Identifier</Label>
            <Input
                placeholder="e.g., 'Pro Script Project'"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="h-12 text-lg font-bold border-primary/10 rounded-xl bg-muted/20"
            />
        </div>
        
        <div className="space-y-4">
        {characters.map((char) => {
            const avatarColor = generateAvatarColor(char.name);
            return (
                <div key={char.id} className="rounded-3xl border bg-background/50 p-5 space-y-4 shadow-sm border-primary/5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                            <Avatar className="h-10 w-10 border-2 shadow-lg">
                                <AvatarFallback className={cn("font-black", avatarColor.bg, avatarColor.text)}>
                                    {char.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <p className="font-black text-sm uppercase truncate">{char.name}</p>
                                <Badge variant="outline" className="h-5 px-1.5 text-[7px] font-black uppercase border-primary/20 text-primary/70">{char.dialogueCount} Lines</Badge>
                            </div>
                        </div>
                        <Select value={char.age} onValueChange={(newAge) => handleAgeChange(char.id, newAge as any)}>
                            <SelectTrigger className={cn("h-8 w-auto px-4 text-[9px] font-black uppercase tracking-widest rounded-full border-none shadow-sm transition-all active:scale-95", ageColorClasses[char.age as keyof typeof ageColorClasses])}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl font-bold border-primary/10">
                                <SelectItem value="Kid" className="rounded-xl">Kid</SelectItem>
                                <SelectItem value="Adult" className="rounded-xl">Adult</SelectItem>
                                <SelectItem value="Old" className="rounded-xl">Old</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <VoicePicker 
                        currentVoiceId={char.voice} 
                        onVoiceChange={(voiceId) => handleVoiceChange(char.id, voiceId)} 
                        playingVoice={playingVoiceId} 
                        onTogglePlay={toggleVoicePreview} 
                    />
                </div>
            );
        })}
        </div>
      </CardContent>
    </Card>
  );
}
