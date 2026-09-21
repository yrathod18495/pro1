'use client';

import { initializeFirebase } from '@/firebase';
import { Loader2, Clock, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { getDisplayUrl } from '@/lib/utils';

interface MaintenanceStatus {
    enabled: boolean;
    message: string;
    endTime: string;
}

function CountdownTimer({ endTime }: { endTime: string }) {
    const calculateTimeLeft = () => {
        const difference = +new Date(endTime) - +new Date();
        let timeLeft = {
            Days: 0,
            Hours: 0,
            Minutes: 0,
            Seconds: 0,
        };

        if (difference > 0) {
            timeLeft = {
                Days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                Hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                Minutes: Math.floor((difference / 1000 / 60) % 60),
                Seconds: Math.floor((difference / 1000) % 60),
            };
        }
        return timeLeft;
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);
        return () => clearInterval(timer);
    }, [endTime]);

    const isTimeUp = Object.values(timeLeft).every(val => val <= 0);

    if (isTimeUp) return <p className="text-lg font-black text-primary animate-pulse uppercase tracking-widest py-2">System Coming Online...</p>;

    return (
        <div className="flex justify-center gap-2 py-1">
            {Object.entries(timeLeft).map(([unit, value]) => (
                <div key={unit} className="flex flex-col items-center">
                    <div className="bg-primary/5 w-11 h-11 rounded-xl flex items-center justify-center border border-primary/10 shadow-sm">
                        <span className="text-lg font-black text-primary tracking-tighter">{String(value).padStart(2, '0')}</span>
                    </div>
                    <span className="text-[6px] font-black uppercase text-muted-foreground mt-1 tracking-widest">{unit}</span>
                </div>
            ))}
        </div>
    );
}

export default function MaintenancePage() {
    const { database } = initializeFirebase();
    const router = useRouter();
    const [status, setStatus] = useState<MaintenanceStatus | null>(null);
    const [logoUrl, setLogoUrl] = useState('https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!database) return;

        // Fetch maintenance status
        const maintenanceRef = ref(database, 'settings/maintenance');
        const unsubStatus = onRtdbValue(maintenanceRef, (snapshot) => {
            const data = snapshot.val();
            setStatus(data);
            setIsLoading(false);
            if (data && !data.enabled) {
                router.push('/');
            }
        });

        // Fetch master logo
        const logoRef = ref(database, 'settings/landingPage/masterLogoUrl');
        const unsubLogo = onRtdbValue(logoRef, (snapshot) => {
            const url = snapshot.val();
            if (url) setLogoUrl(getDisplayUrl(url));
        });

        return () => {
            unsubStatus();
            unsubLogo();
        };
    }, [database, router]);

    if (isLoading) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden bg-background">
            {/* Animated Aurora Background */}
            <div className="absolute inset-0 z-0 opacity-30">
                <div className="absolute -top-1/4 -left-1/4 w-full h-full rounded-full bg-primary/10 blur-[100px] animate-aurora" />
                <div className="absolute -bottom-1/4 -right-1/4 w-full h-full rounded-full bg-blue-500/10 blur-[100px] animate-aurora" style={{ animationDelay: '5s' }} />
            </div>

            <div className="relative z-10 w-full max-w-lg text-center space-y-3 animate-in fade-in zoom-in-95 duration-1000">
                {/* Single Boundary Logo Section */}
                <div className="mx-auto w-fit relative mb-2">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-background rounded-[1.5rem] border-2 border-primary/5 shadow-xl flex items-center justify-center overflow-hidden p-3 relative z-10">
                        <img src={logoUrl} alt="12Labs" className="w-full h-full object-contain animate-pulse" />
                    </div>
                    <div className="absolute -top-1.5 -right-1.5 p-1.5 bg-primary text-white rounded-lg shadow-lg z-20">
                        <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </div>
                    {/* Shadow Glow */}
                    <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full -z-10 scale-110" />
                </div>

                <div className="space-y-1">
                    <Badge variant="outline" className="h-5 px-3 rounded-full border-primary/20 bg-primary/5 text-primary font-black uppercase tracking-[0.2em] text-[7px]">
                        <Sparkles className="mr-1.5 h-2.5 w-2.5" /> MAINTENANCE MODE ACTIVE
                    </Badge>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase leading-tight">
                        Under <span className="text-primary italic">Maintenance</span>
                    </h1>
                </div>

                <Card className="rounded-[2.2rem] border-primary/5 shadow-2xl bg-card/80 backdrop-blur-xl overflow-hidden border">
                    <CardHeader className="bg-primary/5 p-5 pb-3">
                        <CardDescription className="text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                            {status?.message || "We are currently performing scheduled maintenance to improve your experience."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 space-y-3">
                        {status?.endTime && (
                            <div className="space-y-1.5">
                                <div className="space-y-0.5">
                                    <p className="text-[6px] font-black uppercase tracking-[0.4em] text-muted-foreground opacity-50">Estimated Time Remaining</p>
                                    <CountdownTimer endTime={status.endTime} />
                                </div>
                                <p className="text-[7px] font-black uppercase tracking-[0.3em] text-primary/40 pt-1">
                                    12Labs AI Studio • Maintenance Mode
                                </p>
                            </div>
                        )}
                        
                        <div className="pt-3 border-t border-dashed border-primary/10">
                            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
                                Your data and credits are completely safe. <br/> We will be back soon with improved features.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <div className="pt-1 opacity-20">
                    <p className="text-[6px] font-black uppercase tracking-[0.5em] text-muted-foreground">Authorized System Access Restricted</p>
                </div>
            </div>
        </div>
    );
}