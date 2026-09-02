'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Store, ArrowRight, Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScrollAnimation } from '@/hooks/use-scroll-animation';

export function SellerCtaSection() {
    const { ref, isVisible } = useScrollAnimation();

    return (
        <section className="w-full py-16 md:py-24 bg-muted/40 border-y overflow-hidden relative">
             <div className="absolute -bottom-12 -right-12 select-none pointer-events-none opacity-[0.08] dark:opacity-[0.12] rotate-[15deg]">
                <span className="text-[20rem] leading-none">🏪</span>
            </div>
            
            <div className="container px-4 md:px-6">
                <div 
                    ref={ref}
                    className={cn(
                        "scroll-animate flex flex-col md:flex-row items-center gap-12 text-center md:text-left",
                        { 'is-visible': isVisible }
                    )}
                >
                    <div className="flex-1 space-y-6 relative z-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-widest">
                            <Sparkles className="h-3.5 w-3.5" />
                            Marketplace Growth
                        </div>
                        <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">
                            Turn Your Art Into <br/>
                            <span className="text-primary italic">Income</span>
                        </h2>
                        <p className="text-muted-foreground text-lg md:text-xl font-medium leading-relaxed max-w-xl mx-auto md:mx-0">
                            The 12Labs store is growing fast. We need talented creators to list characters, backgrounds, and scripts. Join the elite seller circle today.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 justify-center md:justify-start">
                            <Button asChild size="lg" className="h-16 px-10 rounded-full shadow-2xl shadow-primary/30 text-lg font-black uppercase tracking-widest gap-3 btn-shine">
                                <Link href="/seller" prefetch={false}>
                                    Access Seller Hub <ArrowRight className="h-5 w-5" />
                                </Link>
                            </Button>
                            <div className="flex items-center gap-2 text-sm font-black text-primary uppercase tracking-widest">
                                <TrendingUp className="h-5 w-5" />
                                <span>90% Seller Margin</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 relative z-10 hidden md:block">
                        <div className="relative w-full aspect-square max-w-md mx-auto">
                            <div className="absolute inset-0 bg-primary/10 rounded-[3rem] rotate-6 scale-95" />
                            <div className="absolute inset-0 bg-background border-2 border-primary/20 rounded-[3rem] shadow-2xl flex flex-col items-center justify-center p-12 overflow-hidden">
                                <Store className="h-32 w-32 text-primary mb-6 animate-bounce-slow" />
                                <div className="space-y-2 text-center">
                                    <p className="text-2xl font-black tracking-tight uppercase">Seller Studio</p>
                                    <p className="text-muted-foreground font-bold text-sm">Dashboard & Analytics</p>
                                </div>
                                
                                <div className="absolute top-10 left-10 p-2 bg-green-100 text-green-800 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg -rotate-12">New Sales</div>
                                <div className="absolute bottom-20 right-5 p-2 bg-blue-100 text-blue-800 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg rotate-12">Verified</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}