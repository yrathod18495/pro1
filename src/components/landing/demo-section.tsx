'use client';

import { useScrollAnimation } from '@/hooks/use-scroll-animation';
import { cn, getDisplayUrl } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Music, Play, MonitorPlay } from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Skeleton } from '@/components/ui/skeleton';

interface AudioDemo {
    title: string;
    url: string;
}

const defaultAudioDemos = [
    {
        title: "Clear Narration",
        url: "https://drive.google.com/uc?export=download&id=1OM0rSyPrJJxamJxM0eemb0b1L9lBSs4V"
    },
    {
        title: "Emotional Dialogue",
        url: "https://res.cloudinary.com/dyrmg8qso/video/upload/v1775789665/Qwerty/kcfl8qmccgkjam9rpiy9.mp3"
    },
    {
        title: "Conversational Style",
        url: "https://res.cloudinary.com/dyrmg8qso/video/upload/v1775790191/Qwerty/vqnridzx7k8g4oewmjsx.mp3"
    }
];

function AudioDemoCard({ demo, index }: { demo: AudioDemo, index: number }) {
    const { ref, isVisible } = useScrollAnimation();
    
    return (
        <div 
            ref={ref} 
            className={cn("scroll-animate w-full", { 'is-visible': isVisible })} 
            style={{ transitionDelay: `${index * 100}ms` }}
        >
            <Card className="group relative overflow-hidden rounded-[2.5rem] border-primary/5 bg-card hover:border-primary/20 transition-all duration-500 hover:shadow-2xl hover:-translate-y-1">
                <div className="absolute -bottom-6 -right-6 select-none pointer-events-none opacity-[0.05] dark:opacity-[0.08] group-hover:opacity-[0.15] transition-all duration-700 rotate-12 group-hover:rotate-0 scale-100 group-hover:scale-125">
                    <span className="text-9xl leading-none">🎙️</span>
                </div>
                
                <CardContent className="p-6 sm:p-8 relative z-10">
                    <div className="flex flex-col gap-5">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-inner">
                                <Music className="h-6 w-6" />
                            </div>
                            <h4 className="text-lg font-black tracking-tight truncate uppercase">{demo.title}</h4>
                        </div>
                        <div className="pt-2 px-1">
                            <audio
                                src={demo.url}
                                controls
                                controlsList="nodownload"
                                className="w-full h-10 filter brightness-100"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function parseYouTubeUrl(url: string) {
    if (!url) return null;
    
    let videoId = '';
    let isVertical = false;

    if (url.includes('/shorts/')) {
        const parts = url.split('/shorts/');
        videoId = parts[1]?.split(/[?&]/)[0];
        isVertical = true;
    } 
    else if (url.includes('watch?v=')) {
        const parts = url.split('watch?v=');
        videoId = parts[1]?.split(/[?&]/)[0];
    }
    else if (url.includes('youtu.be/')) {
        const parts = url.split('youtu.be/');
        videoId = parts[1]?.split(/[?&]/)[0];
    }

    if (!videoId) return null;

    return {
        videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        maxThumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        isVertical
    };
}

export function DemoSection() {
    const { database } = initializeFirebase();
    const { ref: videoAnimRef, isVisible: videoIsVisible } = useScrollAnimation();
    
    const [loadVideo, setLoadVideo] = useState(false);
    const [rawVideoUrl, setRawVideoUrl] = useState<string>('https://www.youtube.com/watch?v=ScMzIvxBSi4');
    
    const [audioDemos, setAudioDemos] = useState<AudioDemo[]>(defaultAudioDemos);
    const [isLoadingDemos, setIsLoadingDemos] = useState(true);
    
    useEffect(() => {
        if (!database) return;

        const videoLinkRef = ref(database, 'settings/app/demoVideoUrl');
        onRtdbValue(videoLinkRef, (snapshot) => {
            const url = snapshot.val();
            if (url && url.trim() !== '') setRawVideoUrl(url);
        });

        const audioDemosRef = ref(database, 'settings/landingPage/audioDemos');
        onRtdbValue(audioDemosRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const fetchedDemos: AudioDemo[] = [];
                
                if (data.demo1?.title && data.demo1?.fileId) fetchedDemos.push({ title: data.demo1.title, url: getDisplayUrl(data.demo1.fileId) });
                if (data.demo2?.title && data.demo2?.fileId) fetchedDemos.push({ title: data.demo2.title, url: getDisplayUrl(data.demo2.fileId) });
                if (data.demo3?.title && data.demo3?.fileId) fetchedDemos.push({ title: data.demo3.title, url: getDisplayUrl(data.demo3.fileId) });
                
                if (fetchedDemos.length > 0) setAudioDemos(fetchedDemos);
            }
            setIsLoadingDemos(false);
        });
    }, [database]);

    const videoConfig = useMemo(() => parseYouTubeUrl(rawVideoUrl), [rawVideoUrl]);

    return (
        <section id="demo" className="w-full py-24 md:py-32 overflow-hidden relative bg-muted/5">
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20 dark:opacity-40">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[120px] rounded-full" />
            </div>

            <div className="container relative z-10 px-4 md:px-6 text-center">
                <div className="space-y-6 mb-20 animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-primary font-black uppercase text-[10px] tracking-[0.3em] shadow-sm">
                        <MonitorPlay className="h-3.5 w-3.5" /> PRODUCTION GRADE OUTPUT
                    </div>
                    <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-none">Studio <span className="text-primary italic">Showcase</span></h2>
                </div>

                <div ref={videoAnimRef} className={cn("scroll-animate flex justify-center mb-32 transition-all duration-1000", videoIsVisible ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-12")}>
                    
                    {videoConfig?.isVertical ? (
                        <div className="relative mx-auto border-gray-900 bg-gray-900 border-[14px] rounded-[3.5rem] h-[640px] w-[300px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5),0_30px_60px_-30px_rgba(0,0,0,0.3)] ring-1 ring-white/10">
                            <div className="w-[140px] h-[22px] bg-gray-900 top-0 rounded-b-[1.2rem] left-1/2 -translate-x-1/2 absolute z-20"></div>
                            <div className="rounded-[2.5rem] overflow-hidden w-full h-full bg-black relative group shadow-inner cursor-pointer" onClick={() => setLoadVideo(true)}>
                                {loadVideo ? (
                                    <iframe
                                        src={videoConfig.embedUrl}
                                        className="w-full h-full border-none"
                                        allow="autoplay; encrypted-media; picture-in-picture"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="absolute inset-0">
                                        <div className="absolute inset-0 bg-black/30 z-10 group-hover:bg-black/10 transition-all duration-500" />
                                        <img 
                                            src={videoConfig.maxThumbnailUrl || videoConfig.thumbnailUrl} 
                                            alt="Video preview" 
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                                            onError={(e) => {
                                                if (videoConfig.thumbnailUrl) {
                                                    (e.target as HTMLImageElement).src = videoConfig.thumbnailUrl;
                                                }
                                            }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                            <div className="p-6 bg-white/10 backdrop-blur-2xl rounded-full border border-white/30 shadow-[0_0_50px_rgba(255,255,255,0.2)] scale-100 group-hover:scale-110 transition-transform duration-500 group-hover:bg-white/20">
                                                <Play className="h-10 w-10 text-white fill-current" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="w-full max-w-5xl mx-auto rounded-[2.5rem] overflow-hidden border border-white/10 bg-zinc-950 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)] relative group cursor-pointer" onClick={() => setLoadVideo(true)}>
                            <div className="relative aspect-video w-full rounded-[2.5rem] overflow-hidden bg-black">
                                {loadVideo ? (
                                    <iframe
                                        src={videoConfig?.embedUrl || ''}
                                        className="w-full h-full border-none"
                                        allow="autoplay; encrypted-media; picture-in-picture"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="absolute inset-0">
                                        <div className="absolute inset-0 bg-black/40 z-10 group-hover:bg-black/20 transition-all duration-700" />
                                        <img 
                                            src={videoConfig?.maxThumbnailUrl || videoConfig?.thumbnailUrl || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&q=80"} 
                                            alt="Wide preview" 
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                                            onError={(e) => {
                                                if (videoConfig?.thumbnailUrl) {
                                                    (e.target as HTMLImageElement).src = videoConfig.thumbnailUrl;
                                                }
                                            }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-primary/30 rounded-full blur-2xl animate-pulse scale-150" />
                                                <div className="relative p-6 sm:p-8 bg-black/60 backdrop-blur-2xl rounded-full border border-white/30 shadow-3xl scale-100 group-hover:scale-110 transition-all duration-500 group-hover:bg-black/80">
                                                    <Play className="h-12 w-12 sm:h-14 sm:w-14 text-white fill-current ml-1 drop-shadow-2xl" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                <div className="mt-24 space-y-16 animate-in fade-in duration-1000">
                    <div className="space-y-4 max-w-2xl mx-auto">
                        <h3 className="text-4xl font-black tracking-tighter sm:text-5xl uppercase leading-none">Neural <span className="text-primary italic">Acoustics</span></h3>
                        <p className="text-muted-foreground md:text-xl font-medium opacity-60">High-fidelity voice profiles calibrated for diverse content verticals.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-2">
                        {isLoadingDemos ? (
                            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-[2.5rem]" />)
                        ) : (
                            audioDemos.map((demo, index) => (
                                <AudioDemoCard key={index} demo={demo} index={index} />
                            ))
                        )}
                    </div>
                </div>

                <div className="mt-32 pt-16 border-t border-primary/5 flex flex-wrap justify-center gap-10 opacity-30 grayscale hover:opacity-100 transition-all duration-700">
                    <div className="flex items-center gap-3 font-black uppercase tracking-[0.3em] text-[10px]">CINEMATIC HDR</div>
                    <div className="flex items-center gap-3 font-black uppercase tracking-[0.3em] text-[10px]">NEURAL DUBBING</div>
                    <div className="flex items-center gap-3 font-black uppercase tracking-[0.3em] text-[10px]">ULTRA-LOW LATENCY</div>
                </div>
            </div>
        </section>
    );
}