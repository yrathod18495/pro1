'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { CheckCircle, Sparkles, Coins, ShieldCheck, MoveRight, Youtube, Zap, CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { plans, type Plan } from '@/lib/plans';
import { motion } from 'framer-motion';

export function PricingSection() {
  const displayPlans = plans.filter((p) => !p.isTest);

  return (
    <section id="pricing" className="w-full py-16 md:py-24 bg-background relative overflow-hidden border-t border-border/50">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-indigo-500/10 blur-[100px] pointer-events-none -z-10" />

      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest"
          >
            <Coins className="w-3.5 h-3.5" /> Transparent Credit Pricing
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.05 }}
            className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-foreground font-headline"
          >
            Choose Your <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Credit Pack</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
            className="max-w-[650px] mx-auto text-muted-foreground text-base sm:text-lg font-medium"
          >
            Fuel your creative AI studio with instant credits. No hidden fees, automated delivery.
          </motion.p>

          {/* Credit validity. Stated plainly and up front rather than
              buried in terms — the only condition is a full year of
              total inactivity, which almost nobody will hit. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.18 }}
            className="inline-flex items-start gap-2.5 max-w-[620px] mx-auto text-left px-4 py-2.5 rounded-2xl bg-primary/5 border border-primary/15"
          >
            <CalendarCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-muted-foreground font-medium leading-relaxed">
              <span className="text-foreground font-semibold">Your credits do not expire.</span>{' '}
              They stay in your account for as long as you keep using 12Labs. Credits may
              only be expired if an account stays completely inactive for a full year.
            </p>
          </motion.div>
        </div>

        {/* Pricing cards — a horizontal snap rail, not a vertical grid.
            Stacked full-height cards were the single longest stretch of
            the landing page; side-scrolling keeps every plan one swipe
            apart instead of three screens apart. The negative margin lets
            cards run to the screen edge so it reads as scrollable. */}
        <div className="relative -mx-4 md:mx-0">
          <div className={cn(
            "flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth items-stretch",
            "px-4 md:px-0 pb-4",
            // Hide the scrollbar chrome; the peeking next card is the affordance.
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            // Centre the rail on wide screens where all plans fit anyway.
            "lg:justify-center"
          )}>
          {displayPlans.map((plan, index) => {
            const finalPrice = plan.priceInRupees;
            const isFeatured = plan.isAutopay || plan.id === 'creator' || plan.profitAmount;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', stiffness: 300, damping: 22, delay: index * 0.08 }}
                whileHover={{ y: -6 }}
                className="snap-center shrink-0 w-[85vw] sm:w-[340px] lg:w-[330px]"
              >
                <Card
                  className={cn(
                    "flex flex-col h-full transition-all duration-500 rounded-3xl overflow-hidden group border-border/50 hover:border-primary/50 shadow-sm hover:shadow-2xl relative",
                    plan.isAutopay && "bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-indigo-950/20 dark:via-background dark:to-purple-950/20 border-indigo-200/50"
                  )}
                >
                  {plan.profitAmount && (
                    <Badge className="absolute top-4 right-4 bg-green-600 text-white font-black uppercase text-[10px] h-6 px-3 shadow-lg border-none rounded-full">
                      ₹{plan.profitAmount} PROFIT
                    </Badge>
                  )}

                  <CardHeader className="items-center text-center p-6 pb-3 relative z-10">
                    <div
                      className={cn(
                        "p-3 rounded-2xl mb-3 transition-transform duration-500 group-hover:scale-110 shadow-sm w-fit mx-auto",
                        plan.isAutopay ? "bg-primary/5 text-indigo-600 dark:text-indigo-400" : "bg-primary/10 text-primary"
                      )}
                    >
                      <plan.icon className="h-6 w-6" />
                    </div>

                    <CardTitle
                      className={cn(
                        "text-2xl font-black tracking-tight uppercase",
                        plan.isAutopay ? "text-indigo-600 dark:text-indigo-400" : "text-primary"
                      )}
                    >
                      {plan.name}
                    </CardTitle>

                    <div className="flex flex-col items-center mt-3">
                      <span
                        className={cn(
                          "text-4xl font-black tracking-tighter",
                          plan.isAutopay ? "text-indigo-600 dark:text-indigo-400" : "text-primary"
                        )}
                      >
                        ₹{finalPrice.toFixed(0)}
                        {plan.isAutopay && <span className="text-base font-bold">/mo</span>}
                      </span>
                    </div>

                    <div className="mt-3">
                      <Badge
                        variant="outline"
                        className="bg-primary/5 text-primary border-primary/20 text-[9px] font-black uppercase tracking-widest px-3 h-6 rounded-full inline-flex items-center gap-1.5 mx-auto shadow-sm"
                      >
                        <ShieldCheck className="h-3 w-3" /> ALL-INCLUSIVE PRICE
                      </Badge>
                    </div>

                    <div className="pt-5 flex flex-col items-center gap-2">
                      <div
                        className={cn(
                          "flex items-center justify-center gap-2 font-black text-lg",
                          plan.isAutopay ? "text-indigo-600 dark:text-indigo-400" : "text-primary"
                        )}
                      >
                        <div className="flex items-center justify-center h-5 w-5">
                          <Coins className="h-full w-full" />
                        </div>
                        <span className="tracking-tight">
                          {plan.id === 'starter'
                            ? '10,000 + 1,000 Bonus'
                            : `${plan.credits.toLocaleString()} Credits`}
                        </span>
                      </div>
                      {plan.weeklyCredits && (
                        <Badge
                          variant="secondary"
                          className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-bold border-none px-3 py-1 text-xs mt-0.5"
                        >
                          {plan.weeklyCredits.toLocaleString()} Credits Weekly
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="flex-grow p-6 pt-3 relative z-10">
                    <ul className="space-y-2.5">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle
                            className={cn(
                              "h-4 w-4 flex-shrink-0 mt-0.5",
                              plan.isAutopay ? "text-indigo-500" : "text-green-500"
                            )}
                          />
                          <span
                            className={cn(
                              "text-muted-foreground font-semibold text-sm leading-snug",
                              (feature.includes('Full commercial') ||
                                feature.includes('Voice editing') ||
                                feature.includes('Bonus')) &&
                                "font-black text-indigo-600 dark:text-indigo-400",
                              plan.isAutopay && "text-foreground/80"
                            )}
                          >
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="p-6 pt-0 relative z-10">
                    <Button
                      asChild
                      className={cn(
                        "w-full h-12 text-base font-black rounded-xl shadow-xl transition-all duration-300 active:scale-95 btn-shine uppercase",
                        plan.isAutopay
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20"
                          : "bg-primary hover:bg-primary/90 text-white shadow-primary/20"
                      )}
                    >
                      <Link href="/buy-credits" prefetch={false}>
                        {plan.isAutopay ? 'Start Membership' : 'Get Credits'}
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
          </div>

          {/* Swipe hint — only where the rail actually overflows. */}
          <p className="lg:hidden text-center text-[11px] font-semibold text-muted-foreground/70 tracking-wide mt-1">
            Swipe to compare plans
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex items-center justify-center gap-2 mt-12 text-xs font-extrabold text-primary tracking-widest uppercase"
        >
          <Sparkles className="h-4 w-4 text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
          <span>Get 2,000 Free Credits Instantly On Signup</span>
        </motion.div>
      </div>
    </section>
  );
}
