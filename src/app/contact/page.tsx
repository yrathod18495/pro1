'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Send, Sparkles, ShieldCheck, Clock, MessageSquare, ArrowRight, Loader2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, getDisplayUrl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// WhatsApp Icon as an inline SVG component
const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={cn("h-8 w-8 text-green-500", className)}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    </svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={cn("h-8 w-8 text-blue-500", className)} viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23l7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3L3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.57c-.28 1.1-.86 1.33-1.78.82l-4.76-3.52l-2.4 2.3c-.27.27-.5.4-.85.4z"></path></svg>
);

export default function ContactPage() {
    const { database } = initializeFirebase();
    const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!database) {
            setIsLoading(false);
            return;
        };
        const whatsappLinkRef = ref(database, 'settings/app/whatsappSupportLink');
        const unsubscribe = onRtdbValue(whatsappLinkRef, (snapshot) => {
            const link = snapshot.val();
            if (link) {
                setWhatsappLink(link);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [database]);

    return (
        <div className="relative min-h-screen bg-background">
            
            {/* Animated Aurora Background */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
                <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] animate-aurora" />
                <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[100px] animate-aurora" style={{ animationDelay: '5s' }} />
            </div>

            <main className="container relative z-10 mx-auto max-w-5xl py-12 md:py-20 px-4">
                <div className="text-center mb-16 space-y-4 animate-in fade-in slide-in-from-top-4 duration-1000">
                    <Badge variant="outline" className="h-8 px-4 rounded-full border-primary/20 bg-primary/5 text-primary font-black uppercase tracking-[0.2em] text-[10px]">
                        <Sparkles className="mr-2 h-3.5 w-3.5" /> Human-First Support Hub
                    </Badge>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">
                        Get in <span className="text-primary">Touch</span>
                    </h1>
                    <p className="max-w-2xl mx-auto text-muted-foreground text-lg font-medium opacity-80">
                        We're here to help. Choose the best way to reach our technical team.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {/* Email Card */}
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card/80 backdrop-blur-sm overflow-hidden flex flex-col group transition-all duration-500 hover:-translate-y-2">
                        <CardHeader className="bg-primary/5 border-b p-10 text-center flex flex-col items-center">
                            <div className="p-5 bg-white dark:bg-zinc-900 rounded-3xl shadow-xl mb-6 group-hover:scale-110 transition-transform duration-500">
                                <Mail className="h-10 w-10 text-primary" />
                            </div>
                            <CardTitle className="text-2xl font-black uppercase tracking-tight">Email Us</CardTitle>
                            <CardDescription className="font-bold text-[10px] uppercase tracking-widest mt-1 opacity-60">Professional Inquiries</CardDescription>
                        </CardHeader>
                        <CardContent className="p-10 flex-grow flex flex-col justify-between text-center space-y-6">
                            <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                                For general inquiries, partnerships, or detailed feedback, please send us an email.
                            </p>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase text-primary/60">
                                    <Clock className="h-3 w-3" /> Response within 24 hours
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="p-8 pt-0">
                            <Button asChild className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs btn-shine shadow-xl shadow-primary/20">
                                <Link href="mailto:12labofficial@gmail.com">Send an Email</Link>
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* WhatsApp Card (Dynamic) */}
                    {isLoading ? (
                        <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
                            <CardHeader className="p-10 flex flex-col items-center gap-4">
                                <Skeleton className="h-20 w-20 rounded-3xl" />
                                <Skeleton className="h-6 w-32" />
                            </CardHeader>
                            <CardContent className="p-10 space-y-4">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-5/6 mx-auto" />
                                <Skeleton className="h-14 w-full rounded-2xl mt-4" />
                            </CardContent>
                        </Card>
                    ) : whatsappLink ? (
                        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card/80 backdrop-blur-sm overflow-hidden flex flex-col group transition-all duration-500 hover:-translate-y-2">
                            <CardHeader className="bg-green-500/5 border-b p-10 text-center flex flex-col items-center">
                                <div className="p-5 bg-white dark:bg-zinc-900 rounded-3xl shadow-xl mb-6 group-hover:scale-110 transition-transform duration-500">
                                    <WhatsAppIcon />
                                </div>
                                <CardTitle className="text-2xl font-black uppercase tracking-tight">WhatsApp</CardTitle>
                                <CardDescription className="font-bold text-[10px] uppercase tracking-widest mt-1 text-green-600/70">Instant Support</CardDescription>
                            </CardHeader>
                            <CardContent className="p-10 flex-grow flex flex-col justify-between text-center space-y-6">
                                <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                                    Get instant support and join our WhatsApp group for quick updates and creator discussions.
                                </p>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase text-green-600/60">
                                        <Zap className="h-3 w-3 fill-current" /> High Priority Support
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-8 pt-0">
                                <Button asChild className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-green-600 hover:bg-green-700 shadow-xl shadow-green-500/20">
                                    <Link href={whatsappLink} target="_blank" prefetch={false}>Join Group Chat</Link>
                                </Button>
                            </CardFooter>
                        </Card>
                    ) : null}

                    {/* Telegram Card */}
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card/80 backdrop-blur-sm overflow-hidden flex flex-col group transition-all duration-500 hover:-translate-y-2">
                        <CardHeader className="bg-blue-500/5 border-b p-10 text-center flex flex-col items-center">
                            <div className="p-5 bg-white dark:bg-zinc-900 rounded-3xl shadow-xl mb-6 group-hover:scale-110 transition-transform duration-500">
                                <TelegramIcon />
                            </div>
                            <CardTitle className="text-2xl font-black uppercase tracking-tight">Telegram</CardTitle>
                            <CardDescription className="font-bold text-[10px] uppercase tracking-widest mt-1 text-blue-500/70">Global Community</CardDescription>
                        </CardHeader>
                        <CardContent className="p-10 flex-grow flex flex-col justify-between text-center space-y-6">
                            <p className="text-muted-foreground text-sm font-medium leading-relaxed">
                                Join our official Telegram community to connect with other creators and get live status updates.
                            </p>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase text-blue-500/60">
                                    <MessageSquare className="h-3 w-3" /> Real-time Announcements
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="p-8 pt-0">
                            <Button asChild className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs bg-blue-500 hover:bg-blue-600 shadow-xl shadow-blue-500/20">
                                <Link href="https://t.me/twelvelab" target="_blank" prefetch={false}>Join Community</Link>
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* Bottom Trust Section */}
                <div className="mt-24 text-center space-y-8">
                    <Separator className="max-w-xs mx-auto opacity-10" />
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-3xl border border-primary/5">
                            <ShieldCheck className="h-6 w-6 text-primary" />
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                Authorized Support Hub
                            </p>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                            12Labs technical team • Built for Indian Creators
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
