'use client';

import Link from 'next/link';
import { IndianFlagIcon } from '@/components/icons';
import { cn, getDisplayUrl } from '@/lib/utils';
import Image from 'next/image';
import React, { useState, useEffect, useMemo } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useAuth } from '@/context/auth-provider';

const mainTools = [
    { title: 'AI Voice Studio', link: '/studio' },
    { title: 'Digital Store', link: '/store' },
    { title: 'AI Script Studio', link: '/script-generator' },
    { title: 'YouTube SEO Kit', link: '/seo-kit' },
];

const otherToolsBase = [
    { title: 'YouTube Transcript', link: '/youtube-transcript' },
    { title: 'Voice Cloning', link: '/voice-cloning' },
    { title: 'Seller Hub', link: '/seller' },
]

export function Footer() {
    const { user } = useAuth();
    const { database } = initializeFirebase();
    const [logoUrl, setLogoUrl] = useState('https://drive.google.com/uc?export=view&id=1L4bdnz6omnNmW-DtduORKYdpBfeMhW3r');
    const [developerApiLocked, setDeveloperApiLocked] = useState(false);

    useEffect(() => {
        if (!database) return;
        const logoRef = ref(database, 'settings/landingPage/masterLogoUrl');
        const unsubscribe = onRtdbValue(logoRef, (snapshot) => {
            const url = snapshot.val();
            if (url) setLogoUrl(getDisplayUrl(url));
        });
        return () => unsubscribe();
    }, [database]);

    useEffect(() => {
        if (!database) return;
        const lockRef = ref(database, 'toolSettings/developer-api/locked');
        const unsubscribe = onRtdbValue(lockRef, (snapshot) => {
            setDeveloperApiLocked(snapshot.val() === true);
        });
        return () => unsubscribe();
    }, [database]);

    const otherTools = useMemo(() => {
        const isAdmin = user?.role === 'admin';
        let tools = [...otherToolsBase];
        if (!isAdmin && !user?.isSeller) {
            tools = tools.filter(t => t.title !== 'Seller Hub');
        }
        // Regular users follow the admin lock. Avuna/admin keeps the API
        // console and documentation visible for maintenance and testing even
        // while the public API is disabled.
        if (isAdmin || !developerApiLocked) {
            tools.push({ title: 'Developer Platform', link: '/developer' });
            tools.push({ title: 'API Documentation', link: '/api-docs' });
        }
        return tools;
    }, [user, developerApiLocked]);

    return (
        <footer className="relative bg-secondary border-t overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute inset-0 pointer-events-none select-none overflow-hidden opacity-50">
                {/* Floating Emojis */}
                <span className="absolute text-8xl top-10 left-10 rotate-12">🎙️</span>
                <span className="absolute text-6xl bottom-20 left-[20%] -rotate-12">📝</span>
                <span className="absolute text-9xl top-20 left-[45%] rotate-6">🛍️</span>
                <span className="absolute text-5xl top-40 right-[30%] -rotate-6">🚀</span>
                <span className="absolute text-7xl bottom-10 right-20 rotate-12">🎬</span>
                <span className="absolute text-6xl top-[60%] left-[10%] rotate-45">🎨</span>
                <span className="absolute text-8xl bottom-[40%] right-[15%] -rotate-12">📢</span>
                
                {/* Master Logo Watermark */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] opacity-20">
                    <img 
                        src={logoUrl} 
                        alt="Background Logo" 
                        className="w-full h-full object-contain"
                    />
                </div>
            </div>

            <div className="container relative z-10 px-4 md:px-6 py-12">
                <div className="grid gap-12 grid-cols-2 md:grid-cols-4">
                    <div className="space-y-4 col-span-2 md:col-span-1">
                        <Link href="/" className="flex items-baseline space-x-1" prefetch={false}>
                            <span className="font-bold sm:inline-block font-headline text-3xl text-logo-blue">12</span>
                            <span className="font-bold sm:inline-block font-headline text-3xl text-black dark:text-white">Labs</span>
                        </Link>
                        <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                            Empowering Indian creators with next-generation AI tools. 
                            Build your audience with the speed of light.
                        </p>
                        <div className="flex items-center text-sm font-bold text-muted-foreground pt-2">
                            PROUDLY BUILT IN INDIA 
                            <IndianFlagIcon className="h-6 w-auto ml-2 grayscale hover:grayscale-0 transition-all cursor-help" />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-bold text-foreground tracking-widest uppercase text-xs">Main Tools</h4>
                        <ul className="space-y-2">
                            {mainTools.map(tool => (
                                <li key={tool.title}>
                                    <Link href={tool.link} className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium" prefetch={false}>
                                        {tool.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                     <div className="space-y-4">
                        <h4 className="font-bold text-foreground tracking-widest uppercase text-xs">More Tools</h4>
                        <ul className="space-y-2">
                            {otherTools.map(tool => (
                                <li key={tool.title}>
                                    <Link href={tool.link} className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium" prefetch={false}>
                                        {tool.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                     <div className="space-y-4">
                        <h4 className="font-bold text-foreground tracking-widest uppercase text-xs">Company</h4>
                        <ul className="space-y-2">
                            <li><Link href="/docs" className="text-sm text-indigo-400 hover:text-primary font-black transition-colors" prefetch={false}>Ecosystem & Docs 🎙️</Link></li>
                            <li><Link href="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium" prefetch={false}>Contact & Support</Link></li>
                            <li><Link href="https://t.me/twelvelab" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium" target="_blank" prefetch={false}>Telegram Community</Link></li>
                            <li><Link href="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium" prefetch={false}>Terms of Service</Link></li>
                            <li><Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium" prefetch={false}>Privacy Policy</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="mt-12 border-t border-border/50 pt-8 flex flex-col gap-6 text-[10px] text-muted-foreground font-medium">
                    <p className="leading-relaxed opacity-60">
                        &copy; 2026 12Labs. All Rights Reserved. 12Labs operates as a child company of Green Group Manufacturing. Green Group Manufacturing is the parent company of 12Labs. All intellectual property, including designs, content, branding, and source code, is protected by applicable laws. Unauthorized use, copying, or reproduction may result in legal action.
                    </p>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-border/5">
                        <p>Proudly Built for the Indian Creative Economy</p>
                        <div className="flex items-center gap-6">
                            <span>Made with ❤️ by 12Labs Neural Team</span>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}