'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Instagram, Youtube, MessageCircle, Send } from 'lucide-react';
import { Reveal } from '@/components/landing/reveal';

const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={cn("h-6 w-6 mr-2", className)}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    </svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
     <svg xmlns="http://www.w3.org/2000/svg" className={cn("h-6 w-6 mr-2", className)} viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23l7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3L3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.57c-.28 1.1-.86 1.33-1.78.82l-4.76-3.52l-2.4 2.3c-.27.27-.5.4-.85.4z"></path></svg>
);


export function CommunityCtaSection() {
    const { database } = initializeFirebase();
    const [whatsappLink, setWhatsAppLink] = useState<string | null>(null);

    useEffect(() => {
        if (!database) return;
        const whatsappLinkRef = ref(database, 'settings/app/whatsappSupportLink');
        const unsubscribe = onRtdbValue(whatsappLinkRef, (snapshot) => {
            setWhatsAppLink(snapshot.val());
        });
        return () => unsubscribe();
    }, [database]);

    return (
        <section className="relative w-full py-14 md:py-20 bg-background overflow-hidden border-y">
            {/* Animated Aurora Background */}
            <div className="absolute inset-0 z-0 opacity-40 dark:opacity-60">
                <div className="absolute -top-1/2 -left-1/4 w-full h-full rounded-full bg-primary/20 blur-3xl anim-amb-bloom-slow" />
                <div className="absolute -bottom-1/2 -right-1/4 w-full h-full rounded-full bg-primary/15 blur-3xl anim-amb-orbit-sm" style={{ animationDelay: '5s' }} />
            </div>

            {/* Background mark. Sits upright — it used to be tilted
                -15deg, which read as a layout mistake rather than as a
                design choice. It now drifts vertically instead. */}
            <div className="absolute -bottom-12 -left-12 select-none pointer-events-none opacity-[0.07] dark:opacity-[0.1] anim-amb-drift-y">
                <span className="text-[20rem] leading-none">📢</span>
            </div>
            
            <div className="container relative z-10 px-4 md:px-6 text-center">
                <Reveal animation="anim-in-scale">
                    <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-6 anim-surface-grow">
                        <Send className="h-8 w-8 text-primary anim-pulse-nudge-up" />
                    </div>
                </Reveal>
                <Reveal animation="anim-in-blur-rise" delay={2}>
                    <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter mb-4 text-foreground">Connect with 12Labs</h2>
                </Reveal>
                <Reveal animation="anim-in-rise" delay={4}>
                    <p className="max-w-2xl mx-auto mb-10 text-muted-foreground text-lg font-medium">
                        Get the latest updates, ask for support, or just say hello. Connect with
                        our team and other creators.
                    </p>
                </Reveal>
                <div className="grid grid-cols-2 sm:flex sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-md sm:max-w-none mx-auto">
                    <Button asChild size="lg" className="h-14 w-full sm:w-auto px-4 sm:px-8 rounded-full shadow-xl shadow-primary/20 anim-surface-lift anim-surface-press anim-surface-focus bg-blue-500 hover:bg-blue-600 text-white">
                        <Link href="https://t.me/twelvelab" target="_blank" prefetch={false}>
                            <Send className="h-6 w-6 mr-2" />
                            Telegram
                        </Link>
                    </Button>
                     {whatsappLink ? (
                        <Button asChild size="lg" className="h-14 w-full sm:w-auto px-4 sm:px-8 rounded-full shadow-xl anim-surface-lift anim-surface-press anim-surface-focus bg-green-500 hover:bg-green-600 text-white border-none">
                            <Link href={whatsappLink} target="_blank" prefetch={false}>
                                <MessageCircle className="h-6 w-6 mr-2" />
                                WhatsApp
                            </Link>
                        </Button>
                    ) : (
                        <Button asChild size="lg" className="h-14 w-full sm:w-auto px-4 sm:px-8 rounded-full shadow-xl anim-surface-lift anim-surface-press anim-surface-focus bg-green-500 hover:bg-green-600 text-white border-none">
                            <Link href="https://chat.whatsapp.com/CbWx44GhFyt49jCiHteGSe" target="_blank" prefetch={false}>
                                <MessageCircle className="h-6 w-6 mr-2" />
                                WhatsApp
                            </Link>
                        </Button>
                    )}
                    <Button asChild size="lg" className="h-14 w-full sm:w-auto px-4 sm:px-8 rounded-full shadow-xl anim-surface-lift anim-surface-press anim-surface-focus bg-pink-600 hover:bg-pink-700 text-white border-none">
                        <Link href="https://www.instagram.com/12labofficial" target="_blank" prefetch={false}>
                            <Instagram className="h-6 w-6 mr-2" />
                            Instagram
                        </Link>
                    </Button>
                    <Button asChild size="lg" className="h-14 w-full sm:w-auto px-4 sm:px-8 rounded-full shadow-xl anim-surface-lift anim-surface-press anim-surface-focus bg-red-600 hover:bg-red-700 text-white border-none">
                        <Link href="https://www.youtube.com/@12labofficial" target="_blank" prefetch={false}>
                            <Youtube className="h-6 w-6 mr-2" />
                            YouTube
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}
