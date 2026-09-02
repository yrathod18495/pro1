'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { CheckCircle, Sparkles, Coins, ShieldCheck, MoveRight, Youtube, Zap } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { plans, type Plan } from '@/lib/plans';
import { motion } from 'framer-motion';

export function PricingSection() {
  const displayPlans = plans.filter((p) => !p.isTest);

  return (
    <section id="pricing" className="w-full py-20 md:py-32 bg-background relative overflow-hidden border-t border-border/50">
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
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
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
                whileHover={{ y: -8 }}
                className="h-full"
              >
                <Card
                  className={cn(
                    "flex flex-col h-full transition-all duration-500 rounded-[2.5rem] overflow-hidden group border-border/50 hover:border-primary/50 shadow-sm hover:shadow-2xl relative",
                    plan.isAutopay && "bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-indigo-950/20 dark:via-background dark:to-purple-950/20 border-indigo-200/50"
                  )}
                >
                  {plan.profitAmount && (
                    <Badge className="absolute top-4 right-4 bg-green-600 text-white font-black uppercase text-[10px] h-6 px-3 shadow-lg border-none rounded-full">
                      ₹{plan.profitAmount} PROFIT
                    </Badge>
                  )}

                  <CardHeader className="items-center text-center p-8 pb-4 relative z-10">
                    <div
                      className={cn(
                        "p-4 rounded-3xl mb-4 transition-transform duration-500 group-hover:scale-110 shadow-sm w-fit mx-auto",
                        plan.isAutopay ? "bg-primary/5 text-indigo-600 dark:text-indigo-400" : "bg-primary/10 text-primary"
                      )}
                    >
                      <plan.icon className="h-8 w-8" />
                    </div>

                    <CardTitle
                      className={cn(
                        "text-3xl font-black tracking-tight uppercase",
                        plan.isAutopay ? "text-indigo-600 dark:text-indigo-400" : "text-primary"
                      )}
                    >
                      {plan.name}
                    </CardTitle>

                    <div className="flex flex-col items-center mt-3">
                      <span
                        className={cn(
                          "text-6xl font-black tracking-tighter",
                          plan.isAutopay ? "text-indigo-600 dark:text-indigo-400" : "text-primary"
                        )}
                      >
                        ₹{finalPrice.toFixed(0)}
                        {plan.isAutopay && <span className="text-xl font-bold">/mo</span>}
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

                    <div className="pt-8 flex flex-col items-center gap-2">
                      <div
                        className={cn(
                          "flex items-center justify-center gap-2 font-black text-2xl",
                          plan.isAutopay ? "text-indigo-600 dark:text-indigo-400" : "text-primary"
                        )}
                      >
                        <div className="flex items-center justify-center h-6 w-6">
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

                  <CardContent className="flex-grow p-8 pt-4 relative z-10">
                    <ul className="space-y-4">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle
                            className={cn(
                              "h-5 w-5 flex-shrink-0 mt-0.5",
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

                  <CardFooter className="p-8 pt-0 relative z-10">
                    <Button
                      asChild
                      className={cn(
                        "w-full h-16 text-xl font-black rounded-2xl shadow-xl transition-all duration-300 active:scale-95 btn-shine uppercase",
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
