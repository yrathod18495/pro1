'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { User } from '@/lib/types';
import { ArrowRight, Gift, Rocket, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export function FinalCtaSection({ user }: { user: User | null }) {
  return (
    <section className="relative w-full py-24 md:py-36 overflow-hidden">
      {/* Background Accent Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18)_0%,rgba(147,51,234,0.12)_50%,transparent_75%)] blur-[100px] pointer-events-none -z-10" />

      <div className="container px-4 md:px-6 text-center mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="max-w-3xl mx-auto p-8 sm:p-14 rounded-3xl bg-card/80 dark:bg-zinc-900/80 border border-primary/20 dark:border-white/10 shadow-2xl backdrop-blur-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

          <div className="flex justify-center mb-6">
            <motion.div
              whileHover={{ rotate: 12, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary"
            >
              <Rocket className="h-10 w-10 text-primary" />
            </motion.div>
          </div>

          <div className="space-y-4">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground font-headline">
              Ready to Accelerate Your Content?
            </h2>
            <p className="text-base sm:text-xl text-muted-foreground font-medium max-w-xl mx-auto leading-relaxed">
              Join thousands of Indian creators using 12Labs to produce high-impact voiceovers and scripts in seconds.
            </p>
          </div>

          <div className="flex flex-col items-center gap-5 pt-8">
            <Button
              asChild
              size="lg"
              className="h-16 px-10 text-lg font-bold rounded-full shadow-xl shadow-blue-500/25 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition-all duration-200 border-none group active:scale-95 w-full sm:w-auto"
            >
              <Link href={user ? "/studio" : "/login"} prefetch={false} className="flex items-center justify-center gap-3">
                <span>{user ? "Go to Voice Studio" : "Create Free Account"}</span>
                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </Button>

            {!user && (
              <div className="flex items-center gap-2 text-primary font-bold text-sm bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
                <Gift className="h-4 w-4 text-amber-500" />
                <span>Get 2,000 Free Credits Instantly</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
