'use client';

import React from 'react';
import { BrainCircuit, Sparkles, Film, Zap, ShieldCheck, HeartHandshake } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const whyChooseUsItems = [
  {
    icon: BrainCircuit,
    badge: "70+ Languages",
    title: "State-of-the-Art Neural AI",
    description: "Next-gen acoustic synthesis with automated verification delivering ultra-realistic voice emotion across 70+ global languages.",
    color: "from-blue-500/20 via-indigo-500/10 to-transparent",
    iconColor: "text-blue-500",
  },
  {
    icon: Sparkles,
    badge: "Creator Craft",
    title: "Creator-First Workflows",
    description: "Intuitive multi-character script analysis, automatic voice assignment, and timeline sync built specifically for fast-paced video editing.",
    color: "from-purple-500/20 via-pink-500/10 to-transparent",
    iconColor: "text-purple-500",
  },
  {
    icon: Film,
    badge: "Indian Accents & Dialects",
    title: "Tailored for Indian Content",
    description: "Authentic Hindi, Hinglish, and regional voice profiles with natural vocal pacing, emotion, and dramatic pauses.",
    color: "from-emerald-500/20 via-teal-500/10 to-transparent",
    iconColor: "text-emerald-500",
  },
];

export function WhyChooseUsSection() {
  return (
    <section className="w-full py-20 md:py-32 bg-background relative overflow-hidden">
      {/* Background Subtle Ambient Light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-indigo-500/5 blur-[120px] pointer-events-none -z-10" />

      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4"
          >
            <Zap className="w-3.5 h-3.5" /> Why Creators Choose Us
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.05 }}
            className="text-3xl sm:text-5xl font-black tracking-tight text-foreground font-headline"
          >
            Built for Speed. <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">
              Engineered for Expression.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
            className="mt-4 text-base sm:text-lg text-muted-foreground font-medium"
          >
            Everything you need to turn raw script ideas into studio-grade audio in seconds.
          </motion.p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {whyChooseUsItems.map((item, index) => {
            const IconComponent = item.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', stiffness: 300, damping: 22, delay: index * 0.08 }}
                whileHover={{ y: -6, scale: 1.02 }}
                className="group relative rounded-3xl p-8 bg-card/80 dark:bg-zinc-900/60 border border-border/80 dark:border-white/10 shadow-sm hover:shadow-2xl hover:border-primary/40 transition-all duration-300 backdrop-blur-xl flex flex-col justify-between overflow-hidden"
              >
                {/* Card Glow Highlight */}
                <div className={cn("absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl pointer-events-none", item.color)} />

                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="p-3.5 rounded-2xl bg-secondary dark:bg-white/5 border border-border/50 group-hover:border-primary/30 transition-colors">
                      <IconComponent className={cn("w-7 h-7 transition-transform duration-300 group-hover:scale-110", item.iconColor)} />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground px-2.5 py-1 rounded-full bg-secondary/80 border border-border/40">
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                    {item.description}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-border/40 flex items-center gap-2 text-xs font-semibold text-primary/80 group-hover:text-primary transition-colors">
                  <span>Explore capabilities</span>
                  <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
