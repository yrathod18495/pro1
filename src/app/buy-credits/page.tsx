'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { CheckCircle, Gem, Loader2, CreditCard, Tag, Coins, Briefcase, Rocket, Sparkles, MoveRight, TestTube, ShieldCheck, Trophy, Ticket, Clock, PartyPopper, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn, getDisplayUrl } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { handlePurchaseAction, cancelSubscriptionAction } from './actions';
import { applyPromoCode } from './promo-actions';
import { Input } from '@/components/ui/input';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { plans, type Plan } from '@/lib/plans';
import { useRouter } from 'next/navigation';
import { reportClientError } from '@/lib/report-client-error';

const INR_TO_USD_RATE = 85;

export default function BuyCreditsPage() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const [promoCode, setPromoCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ type: 'percentage' | 'fixed', value: number } | null>(null);
  const [bonusCreditPercentage, setBonusCreditPercentage] = useState<number | null>(null);
  const [isApplyingCode, setIsApplyingCode] = useState(false);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [creditPromoToConfirm, setCreditPromoToConfirm] = useState<{ code: string; value: number; } | null>(null);
  const [showTestPlan, setShowTestPlan] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isCancellingSub, setIsCancellingSub] = useState(false);
  
  const handleCancelSubscription = async () => {
    if (!user || !user.subscription) return;
    setIsCancellingSub(true);
    try {
        const result = await cancelSubscriptionAction(user.uid);
        if (result.success) {
            toast({ 
                title: 'Subscription Cancelled', 
                description: 'Your subscription has been successfully cancelled. No further charges will occur.' 
            });
            setUser(prev => {
                if (!prev || !prev.subscription) return prev;
                return {
                    ...prev,
                    subscription: {
                        ...prev.subscription,
                        status: 'cancelled'
                    }
                };
            });
            setIsCancelDialogOpen(false);
        } else {
            toast({ 
                variant: 'destructive', 
                title: 'Cancellation Failed', 
                description: result.error || 'An error occurred during cancellation.' 
            });
        }
    } catch (err: any) {
            reportClientError('src/app/buy-credits/page.tsx:80', err);
        toast({ 
            variant: 'destructive', 
            title: 'Cancellation Error', 
            description: err.message || 'An error occurred.' 
        });
    } finally {
        setIsCancellingSub(false);
    }
  };
  
  const [isCheckingCreatorPlan, setIsCheckingCreatorPlan] = useState(true);
  const [isCreatorPlanHidden, setIsCreatorPlanHidden] = useState(false);

  const { database } = initializeFirebase();
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!database) {
        setIsCheckingCreatorPlan(false);
        return;
    }
    const creatorPlanRef = ref(database, 'toolSettings/creator-plan');
    const creatorUnsubscribe = onRtdbValue(creatorPlanRef, (snapshot) => {
        const setting = snapshot.val();
        setIsCreatorPlanHidden(setting?.locked === true);
        setIsCheckingCreatorPlan(false);
    });

    return () => {
        creatorUnsubscribe();
    };
  }, [database]);

  // Auto-apply promo codes from URL (e.g., ?code=EXTRA10 or ?promo=EXTRA10)
  useEffect(() => {
    if (typeof window !== 'undefined' && user) {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code') || params.get('promo');
        if (code) {
            const upperCode = code.toUpperCase();
            setPromoCode(upperCode);

            const autoApply = async () => {
                setIsApplyingCode(true);
                try {
                    const result = await applyPromoCode(upperCode, user.uid, user.email || '');
                    if (result.success) {
                        if (result.type === 'discount' && result.value) {
                            setAppliedDiscount({ type: result.discountType || 'percentage', value: result.value });
                            setAppliedCode(upperCode);
                            setBonusCreditPercentage(null);
                            toast({ title: 'Discount Applied!', description: result.message });
                        } else if (result.type === 'credit_bonus' && result.value) {
                            setBonusCreditPercentage(result.value);
                            setAppliedCode(upperCode);
                            setAppliedDiscount(null);
                            toast({ title: 'Bonus Credits Applied!', description: result.message });
                        } else if (result.type === 'credit' && result.value) {
                            setCreditPromoToConfirm({ code: upperCode, value: result.value });
                        }
                    } else {
                        toast({ variant: 'destructive', title: 'Promo Code Error', description: result.message });
                    }
                } catch (e) {
                    console.error("Auto promo application failed:", e);
                } finally {
                    setIsApplyingCode(false);
                }
            };

            const timer = setTimeout(autoApply, 800);
            return () => clearTimeout(timer);
        }
    }
  }, [user, toast]);

  const handleApplyPromo = async () => {
    if (!promoCode || !user) {
        toast({ variant: 'destructive', title: 'Session Required', description: 'Please sign in to use promo codes.' });
        return;
    }

    if (promoCode.toLowerCase() === 'yxsh') {
        setShowTestPlan(true);
        setAppliedCode('YXSH');
        toast({ title: 'Test Plan Revealed', description: 'The ₹1 plan is now available for you.' });
        setPromoCode('');
        return;
    }

    setIsApplyingCode(true);
    try {
        const result = await applyPromoCode(promoCode, user.uid, user.email || '');

        if (result.success) {
            if (result.type === 'discount' && result.value) {
                setAppliedDiscount({ type: result.discountType || 'percentage', value: result.value });
                setAppliedCode(promoCode.toUpperCase());
                setBonusCreditPercentage(null);
                toast({ title: 'Discount Applied!', description: result.message });
            } else if (result.type === 'credit_bonus' && result.value) {
                setBonusCreditPercentage(result.value);
                setAppliedCode(promoCode.toUpperCase());
                setAppliedDiscount(null);
                toast({ title: 'Bonus Credits Applied!', description: result.message });
            } else if (result.type === 'credit' && result.value) {
                setCreditPromoToConfirm({ code: promoCode.toUpperCase(), value: result.value });
            }
        } else {
            toast({ variant: 'destructive', title: 'Invalid Code', description: result.message });
            handleRemovePromo();
        }
    } catch (e) {
            reportClientError('src/app/buy-credits/page.tsx:196', e);
        toast({ variant: 'destructive', title: 'Sync Error', description: 'Could not verify promo code.' });
    } finally {
        setIsApplyingCode(false);
    }
  };
  
  const handleConfirmCreditRedeem = async () => {
    if (!creditPromoToConfirm || !user) return;
    
    setIsApplyingCode(true);
    const codeToRedeem = creditPromoToConfirm.code;
    setCreditPromoToConfirm(null);
    
    try {
        const result = await applyPromoCode(codeToRedeem, user.uid, user.email || '', true);

        if (result.success && result.type === 'credit' && result.value) {
            toast({ title: 'Credits Redeemed!', description: result.message });
            setUser(prev => prev ? { ...prev, credits: prev.credits + result.value! } : null);
            setPromoCode('');
            setAppliedDiscount(null);
            setAppliedCode(null);
            setBonusCreditPercentage(null);
        } else {
            toast({ variant: 'destructive', title: 'Redemption Failed', description: result.message });
        }
    } finally {
        setIsApplyingCode(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode('');
    setAppliedDiscount(null);
    setAppliedCode(null);
    setBonusCreditPercentage(null);
    setShowTestPlan(false);
  }

  const handlePurchase = async (plan: Plan) => {
    // 1. Session Check
    if (!user || !user.uid || !user.email) {
        toast({ variant: 'destructive', title: 'Session Required', description: 'Please sign in to proceed with payment.' });
        router.push('/login');
        return;
    }

    // 2. Razorpay SDK Availability Check (CRITICAL)
    if (typeof window === 'undefined' || !(window as any).Razorpay) {
        toast({ variant: 'destructive', title: 'Payment Node Syncing', description: 'The payment module is still loading. Please try again in 3 seconds.' });
        return;
    }

    setLoadingPlan(plan.id);
    
    try {
        const result = await handlePurchaseAction(
            plan.id,
            { uid: user.uid, name: user.name, email: user.email }, 
            currency,
            appliedCode || undefined
        );

        if (!result.success) throw new Error(result.error);
        
        // Handle Free Activation (100% discount codes)
        if (result.free_purchase) {
            toast({ title: 'Pack Activated!', description: `${plan.credits.toLocaleString()} credits added to your vault.` });
            const updatedProfile = { ...user, credits: user.credits + (plan.credits + (bonusCreditPercentage ? Math.floor(plan.credits * (bonusCreditPercentage/100)) : 0)) };
            setUser(updatedProfile as any);
            setLoadingPlan(null);
            handleRemovePromo();
            return;
        }

        const order = result.order;
        if (!order || !order.key_id) throw new Error('Payment configuration sync failed.');
        
        const options: any = {
            key: order.key_id,
            name: '12Labs AI Studio',
            image: 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png',
            description: `${plan.name} - ${plan.credits.toLocaleString()} Credits`,
            handler: function (response: any) {
                toast({ 
                    title: 'Payment Secured!', 
                    description: 'Your credits are being synchronized. This might take a few moments.' 
                });
                setLoadingPlan(null);
            },
            prefill: { name: user.name, email: user.email },
            theme: { color: '#2563eb' },
            modal: {
                ondismiss: function() {
                    setLoadingPlan(null);
                }
            },
            config: {
              display: {
                blocks: {
                  other: {
                    name: "Payment Options",
                    instruments: [
                        { method: "upi", flows: ["qr", "intent", "collect"] }, 
                        { method: "card" }, 
                        { method: "netbanking" }
                    ]
                  }
                },
                sequence: ["block.other"],
                preferences: { show_default_blocks: false }
              }
            }
        };

        if (order.type === 'subscription') {
            options.subscription_id = order.id;
        } else {
            options.order_id = order.id;
            options.amount = order.amount;
            options.currency = order.currency;
        }

        const rzp = new (window as any).Razorpay(options);
        rzp.open();

    } catch (error: any) {
            reportClientError('src/app/buy-credits/page.tsx:323', error);
        toast({ variant: 'destructive', title: 'Checkout Failed', description: error.message || 'An unknown error occurred during dispatch.' });
        setLoadingPlan(null);
    }
  };

  const standardPacks = plans.filter(p => !p.isAutopay && (!p.isTest || showTestPlan));
  const consistencyJourney = plans.filter(p => p.isAutopay && (!p.isTest || showTestPlan));
  const showCreatorPlan = !isCheckingCreatorPlan && (isAdmin || !isCreatorPlanHidden);

  const renderPlanCard = (plan: Plan) => {
    const priceInSelectedCurrency = currency === 'INR' ? plan.priceInRupees : plan.priceInUSD;
    let finalPrice = priceInSelectedCurrency;
    
    // Consistent Creator plan is FIXED: promo codes do NOT apply to it.
    if (!plan.isAutopay && appliedDiscount) {
      if (appliedDiscount.type === 'percentage') finalPrice *= (1 - appliedDiscount.value / 100);
      else finalPrice -= (currency === 'INR' ? appliedDiscount.value : appliedDiscount.value / INR_TO_USD_RATE);
    }
    finalPrice = Math.max(0, finalPrice);

    const bonusCredits = (!plan.isAutopay && bonusCreditPercentage) 
      ? Math.floor(plan.credits * (bonusCreditPercentage / 100)) + (appliedCode === 'EXTRA10' ? 2000 : 0)
      : 0;
    const totalCreditsWithBonus = plan.credits + bonusCredits;
    const currencySymbol = currency === 'INR' ? '₹' : '$';

    return (
      <Card key={plan.id} className={cn(
        "flex flex-col min-w-[300px] md:min-w-[350px] transition-all duration-500 rounded-[2.5rem] overflow-hidden group border-border/50 hover:border-primary/50 shadow-sm hover:shadow-2xl",
        plan.isAutopay && "bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-indigo-950/20 dark:via-background dark:to-purple-950/20 border-indigo-200/50",
        plan.isTest && "border-primary bg-primary/5 shadow-primary/5"
      )}>
        <CardHeader className="items-center text-center p-8 pb-4 relative">
          {plan.profitAmount && currency === 'INR' && !appliedDiscount && (
              <Badge className="absolute top-4 right-4 bg-green-600 text-white font-black uppercase text-[10px] h-6 px-3 shadow-lg animate-pulse border-none">
                  ₹{plan.profitAmount} PROFIT
              </Badge>
          )}
          <div className={cn("p-4 rounded-3xl mb-4 transition-transform duration-500 group-hover:scale-110 shadow-sm", plan.isAutopay ? "bg-primary/5" : "bg-primary/10 text-primary")}>
            <plan.icon className={cn("h-8 w-8")} />
          </div>
          <CardTitle className={cn(
            "text-3xl font-black tracking-tight uppercase",
            plan.isAutopay && "text-indigo-600 dark:text-indigo-400"
          )}>{plan.name}</CardTitle>
          
          <div className="flex flex-col items-center mt-3">
            {currency === 'USD' && plan.originalPriceInUSD && !appliedDiscount && (
              <span className="text-sm font-bold line-through text-muted-foreground/60 decoration-red-500 decoration-2 mb-0.5">
                ${plan.originalPriceInUSD}
              </span>
            )}
            {currency === 'INR' && plan.originalPriceInRupees && !appliedDiscount && (
              <span className="text-sm font-bold line-through text-muted-foreground/60 decoration-red-500 decoration-2 mb-0.5">
                ₹{plan.originalPriceInRupees}
              </span>
            )}
            <span className={cn("text-6xl font-black tracking-tighter", plan.isAutopay ? "text-indigo-600" : "text-primary")}>
                {currencySymbol}{finalPrice.toFixed(0)}
                {plan.isAutopay && <span className="text-xl font-bold">/mo</span>}
            </span>
          </div>

          <div className="mt-3">
              {currency === 'INR' && !plan.isTest && (
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[9px] font-black uppercase tracking-widest px-3 h-6 rounded-full flex items-center gap-1.5 shadow-sm">
                      <ShieldCheck className="h-3 w-3" /> ALL-INCLUSIVE PRICE
                  </Badge>
              )}
          </div>

          <div className="pt-8 flex flex-col items-center gap-2">
              {bonusCreditPercentage && !plan.isAutopay ? (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 py-1.5 px-4 font-black">
                      {totalCreditsWithBonus.toLocaleString()} CREDITS (+{bonusCreditPercentage}%)
                  </Badge>
              ) : (
                  <>
                    <div className={cn("flex items-center justify-center gap-2 font-black text-2xl", plan.isAutopay ? "text-indigo-600" : "text-primary")}>
                        <div className="flex items-center justify-center h-6 w-6">
                            <Coins className="h-full w-full" />
                        </div>
                        <span className="tracking-tight">
                            {plan.id === 'starter' ? '10,000 + 1,000 Bonus' : `${plan.credits.toLocaleString()} Credits`}
                        </span>
                    </div>
                    {plan.weeklyCredits && (
                        <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-bold border-none px-3">
                            {plan.weeklyCredits.toLocaleString()} Credits Weekly
                        </Badge>
                    )}
                  </>
              )}
          </div>
        </CardHeader>
        <CardContent className="flex-grow p-8 pt-4">
            <ul className="space-y-4">
                {plan.features.map((feature: string, i: number) => {
                    return (
                        <li key={i} className="flex items-start gap-3">
                            <CheckCircle className={cn("h-5 w-5 flex-shrink-0 mt-0.5", plan.isAutopay ? "text-indigo-500" : "text-green-500")} />
                            <span className={cn(
                                "text-muted-foreground font-semibold text-sm leading-snug", 
                                (feature.includes('Full commercial') || feature.includes('Voice editing')) && "font-black text-indigo-600 dark:text-indigo-400",
                                plan.isAutopay && "text-foreground/80"
                            )}>{feature}</span>
                        </li>
                    );
                })}
            </ul>
        </CardContent>
        <CardFooter className="p-8 pt-0">
          <Button 
            className={cn(
              "w-full h-16 text-xl font-black rounded-2xl shadow-xl transition-all duration-300 active:scale-95 btn-shine",
              plan.isAutopay ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-primary shadow-primary/20"
            )} 
            onClick={() => handlePurchase(plan)}
            disabled={loadingPlan === plan.id || isCheckingCreatorPlan}
          >
            {loadingPlan === plan.id ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : plan.isAutopay ? 'START JOURNEY' : 'GET CREDITS NOW'}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <>
      <div className="container mx-auto max-w-7xl py-12 px-4 animate-in fade-in duration-700">
        <div className="text-center mb-12 space-y-3">
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none font-headline">Vault Upgrades</h1>
          </div>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] opacity-60">High-reliability automated delivery</p>
          
          {user && (
            <div className="pt-2 flex justify-center">
              <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-sm">
                <Coins className="h-5 w-5 text-amber-500 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Current Credit Balance:</span>
                <span className="text-sm font-black tracking-tight text-primary">{(user.credits || 0).toLocaleString()} Credits</span>
              </div>
            </div>
          )}
        </div>

        {user?.subscription && user.subscription.status === 'active' && (
            <div className="max-w-xl mx-auto mb-10">
                <Card className="rounded-[2.5rem] border-indigo-200/50 bg-gradient-to-br from-indigo-50/40 via-white to-purple-50/40 dark:from-indigo-950/20 dark:via-background dark:to-purple-950/20 shadow-md border overflow-hidden p-6 relative">
                    <div className="absolute top-4 right-4">
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-black text-[9px] tracking-wider uppercase px-2.5 py-1 rounded-full">ACTIVE PLAN</Badge>
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400">
                            <Sparkles className="h-6 w-6 animate-pulse" />
                        </div>
                        <div className="flex-1 space-y-1">
                            <h3 className="font-headline text-lg font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">
                                {user.subscription.planId === 'test_sub' ? 'Test Sub (Weekly)' : 'Consistent Creator'}
                            </h3>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none">
                                Automatic Weekly Grant Node
                            </p>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-muted/50 pt-4">
                        <div>
                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block mb-0.5">DAYS REMAINING</span>
                            <span className="text-xl font-black text-foreground">
                                {(() => {
                                    const startDateStr = user.subscription.startDate;
                                    if (!startDateStr) return "30 Days";
                                    const startDate = new Date(startDateStr);
                                    const msPassed = Date.now() - startDate.getTime();
                                    const daysPassed = Math.floor(msPassed / (1000 * 60 * 60 * 24));
                                    const daysLeft = Math.max(0, 30 - daysPassed);
                                    return `${daysLeft} Days left`;
                                })()}
                            </span>
                        </div>
                        <div>
                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block mb-0.5">NEXT WEEKLY GRANT</span>
                            <span className="text-sm font-bold text-foreground">
                                {(() => {
                                    const nextDateStr = user.subscription.nextWeeklyGrantDate;
                                    if (!nextDateStr) return "N/A";
                                    try {
                                        return new Date(nextDateStr).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                        });
                                    } catch (e) {
            reportClientError('src/app/buy-credits/page.tsx:517', e);
                                        return "N/A";
                                    }
                                })()}
                            </span>
                        </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-muted/50 flex items-center justify-between">
                        <div className="space-y-1">
                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block">PLAN PROGRESS</span>
                            <span className="text-xs font-bold text-foreground">
                                {(plans.find(p => p.id === user.subscription?.planId)?.grantIntervalDays ?? 7) === 1 ? "Day" : "Week"} {user.subscription.weeklyGrantCount || 0} of {plans.find(p => p.id === user.subscription?.planId)?.maxGrants ?? 4} Completed
                            </span>
                        </div>
                        <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 font-black text-[9px] tracking-wider uppercase px-2.5 py-1 rounded-full">
                            {Math.max(0, (plans.find(p => p.id === user.subscription?.planId)?.maxGrants ?? 4) - (user.subscription.weeklyGrantCount || 0))} Grants Remaining
                        </Badge>
                    </div>
                    <div className="mt-6 flex justify-end gap-3 border-t border-muted/50 pt-4">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl border-primary/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-[10px] font-black uppercase tracking-wider px-5 py-2"
                            onClick={() => setIsCancelDialogOpen(true)}
                        >
                            How to Cancel?
                        </Button>
                    </div>
                </Card>
            </div>
        )}

        {user?.subscription && user.subscription.status === 'cancelled' && (
            <div className="max-w-xl mx-auto mb-10">
                <Card className="rounded-[2.5rem] border-muted bg-muted/10 shadow-sm border overflow-hidden p-6 relative">
                    <div className="absolute top-4 right-4">
                        <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 font-black text-[9px] tracking-wider uppercase px-2.5 py-1 rounded-full">CANCELLED</Badge>
                    </div>
                    <div className="flex items-start gap-4 opacity-70">
                        <div className="p-3 bg-muted rounded-2xl text-muted-foreground">
                            <Clock className="h-6 w-6" />
                        </div>
                        <div className="flex-1 space-y-1">
                            <h3 className="font-headline text-lg font-black text-muted-foreground uppercase tracking-tight">
                                {user.subscription.planId === 'test_sub' ? 'Test Sub (Weekly)' : 'Consistent Creator'}
                            </h3>
                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none">
                                Deactivated - No further payments
                            </p>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-muted/50 pt-4">
                        <div>
                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block mb-0.5">CYCLE DAYS REMAINING</span>
                            <span className="text-xl font-black text-muted-foreground">
                                {(() => {
                                    const startDateStr = user.subscription.startDate;
                                    if (!startDateStr) return "30 Days";
                                    const startDate = new Date(startDateStr);
                                    const msPassed = Date.now() - startDate.getTime();
                                    const daysPassed = Math.floor(msPassed / (1000 * 60 * 60 * 24));
                                    const daysLeft = Math.max(0, 30 - daysPassed);
                                    return `${daysLeft} Days left`;
                                })()}
                            </span>
                        </div>
                        <div>
                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block mb-0.5">NEXT WEEKLY GRANT</span>
                            <span className="text-sm font-bold text-muted-foreground">
                                {(() => {
                                    const nextDateStr = user.subscription.nextWeeklyGrantDate;
                                    if (!nextDateStr) return "N/A";
                                    try {
                                        return new Date(nextDateStr).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                        });
                                    } catch (e) {
            reportClientError('src/app/buy-credits/page.tsx:595', e);
                                        return "N/A";
                                    }
                                })()}
                            </span>
                        </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-muted/50 flex items-center justify-between">
                        <div className="space-y-1">
                            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block">PLAN PROGRESS</span>
                            <span className="text-xs font-bold text-muted-foreground">
                                {(plans.find(p => p.id === user.subscription?.planId)?.grantIntervalDays ?? 7) === 1 ? "Day" : "Week"} {user.subscription.weeklyGrantCount || 0} of {plans.find(p => p.id === user.subscription?.planId)?.maxGrants ?? 4} Completed
                            </span>
                        </div>
                        <Badge className="bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20 font-black text-[9px] tracking-wider uppercase px-2.5 py-1 rounded-full">
                            {Math.max(0, (plans.find(p => p.id === user.subscription?.planId)?.maxGrants ?? 4) - (user.subscription.weeklyGrantCount || 0))} Grants Remaining
                        </Badge>
                    </div>
                    <div className="mt-6 text-xs text-muted-foreground leading-relaxed font-semibold bg-muted/20 p-4 rounded-2xl border border-muted-foreground/5">
                        Your auto-billing has been cancelled. No further monthly charges will occur. However, since this cycle is already pre-paid, you will still receive all your remaining weekly credit grants until the current 28-day cycle completes!
                    </div>
                </Card>
            </div>
        )}
        
          <div className="mb-10 flex justify-center">
              <Tabs value={currency} onValueChange={(value) => setCurrency(value as 'INR' | 'USD')} className="w-auto">
                  <TabsList className="rounded-xl h-11 bg-muted/30 border border-primary/5">
                      <TabsTrigger value="INR" className="rounded-lg font-black uppercase text-[10px] tracking-widest px-8 data-[state=active]:bg-background">Indian Rupee (₹)</TabsTrigger>
                      <TabsTrigger value="USD" className="rounded-lg font-black uppercase text-[10px] tracking-widest px-8 data-[state=active]:bg-background">US Dollar ($)</TabsTrigger>
                  </TabsList>
              </Tabs>
          </div>

          <div className="mb-12 max-w-lg mx-auto space-y-6">
              <Card className="rounded-[2.5rem] border-primary/10 bg-muted/20 shadow-sm overflow-hidden">
                  <CardHeader className="p-5 pb-2">
                      <CardTitle className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60 px-1"><Tag className="h-3 w-3" /> Promo Code</CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 pt-0">
                      {appliedCode ? (
                          <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/30 rounded-2xl border border-green-200 animate-in zoom-in-95">
                             <div>
                               <p className="text-[10px] font-black uppercase text-green-800 dark:text-green-300">Promo Code: <span className="font-bold">{appliedCode}</span></p>
                               <p className="text-sm font-black text-green-600 dark:text-green-200">
                                {showTestPlan ? "Test Plan Unlocked!" : appliedDiscount?.type === 'percentage' ? `${appliedDiscount.value}% OFF ACTIVATED!` : appliedDiscount ? `₹${appliedDiscount?.value} DISCOUNT!` : `${bonusCreditPercentage}% BONUS GRANTED!`}
                               </p>
                             </div>
                             <Button variant="ghost" size="sm" className="h-9 rounded-xl text-[10px] font-black uppercase hover:bg-red-50 hover:text-red-600" onClick={handleRemovePromo}>Detach</Button>
                          </div>
                      ) : (
                          <div className="flex items-center gap-2">
                              <Input placeholder="Enter code..." value={promoCode} onChange={e => setPromoCode(e.target.value)} disabled={isApplyingCode} className="rounded-xl h-12 bg-background border-primary/5 font-black uppercase text-center tracking-widest" />
                              <Button onClick={handleApplyPromo} disabled={isApplyingCode || !promoCode} className="h-12 rounded-xl px-10 font-black uppercase text-xs tracking-tighter">
                                  {isApplyingCode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                  Verify
                              </Button>
                          </div>
                      )}
                  </CardContent>
              </Card>
          </div>

        <section className="mb-20">
            <div className="flex items-center justify-between mb-10 px-2">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black uppercase tracking-tight">Credit Packages</h2>
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] flex items-center gap-2">
                        <MoveRight className="h-3 w-3 text-primary" /> Swipe to explore more
                    </p>
                </div>
            </div>
            <ScrollArea ref={scrollAreaRef} className="w-full pb-6">
                <div className="flex gap-8 pt-2 pr-6">
                    {standardPacks.map(renderPlanCard)}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </section>

        {showCreatorPlan && (
            <section className="mb-20">
                <div className="text-center space-y-4 mb-14">
                    <h2 className="text-4xl font-black uppercase tracking-tight text-indigo-600 dark:text-indigo-400 leading-tight">
                        YouTube <br className="sm:hidden" /> Consistency Journey
                    </h2>
                    <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] max-w-xl mx-auto opacity-60">
                        Maximize your success habit with weekly credit node grants.
                    </p>
                </div>
                <div className="flex flex-wrap gap-10 justify-center items-stretch px-4">
                    {consistencyJourney.map(renderPlanCard)}
                </div>
            </section>
        )}

        <div className="mt-20 flex flex-wrap justify-center gap-12 opacity-30 grayscale hover:opacity-100 transition-all duration-700">
            <div className="flex items-center gap-3 font-black uppercase tracking-widest text-[10px]">SECURE PAYMENT GATEWAY</div>
            <div className="flex items-center gap-3 font-black uppercase tracking-widest text-[10px]">INSTANT HUB SYNC</div>
            <div className="flex items-center gap-3 font-black uppercase tracking-widest text-[10px]">ALL TAXES INCLUDED</div>
        </div>

        <div className="text-center mt-16 text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] opacity-50 leading-relaxed max-w-xl mx-auto space-y-4">
          <p>All payments are processed through our end-to-end encrypted node.</p>
          <div className="p-4 bg-muted/20 border border-primary/5 rounded-2xl text-[9px] text-left leading-relaxed space-y-2 text-muted-foreground font-semibold">
            <p className="font-black text-foreground uppercase tracking-wider text-[10px]">⚖️ PRE-CHECKOUT POLICIES & TERMS</p>
            <p>&bull; <strong>Instant Cancellation & Deactivation:</strong> Automatic weekly consistency plans can be cancelled instantly at any time. No lock-in period applies. Future automated billing cycles will be stopped immediately when you revoke the payment mandate.</p>
            <p>&bull; <strong>Remaining Week Grants:</strong> Since each billing cycle is pre-paid, cancelling your automatic mandate will NOT stop your scheduled weekly credit grants for the current cycle. You will continue to receive all remaining weekly installments until the cycle is complete.</p>
            <p>&bull; <strong>Non-Refundable Policy:</strong> All credit purchases, subscriptions, and automatically granted weekly credits are 100% final, non-refundable, and non-transferable under any circumstances.</p>
            <p>&bull; <strong>Anti-Abuse Verification:</strong> Free promotional trial credits are strictly limited to one (1) grant per unique device. Attempting to create duplicate accounts on the same device footprint will result in automated credit restriction.</p>
            <p className="text-center pt-2">By purchasing, you agree to our <Link href="/privacy" prefetch={false} className="text-primary underline">Privacy Policy & Subscription Terms</Link>.</p>
          </div>
          <p className='mt-2'>Custom integration? <Link href="/contact" prefetch={false} className="text-primary underline underline-offset-4">Talk to Engineering</Link>.</p>
        </div>
      </div>

      <AlertDialog open={!!creditPromoToConfirm} onOpenChange={() => setCreditPromoToConfirm(null)}>
        <AlertDialogContent className="rounded-[2.5rem] p-10 border-primary/20 shadow-3xl">
            <AlertDialogHeader>
                <AlertDialogTitle className="text-3xl font-black uppercase tracking-tight">Sync Credits?</AlertDialogTitle>
                <AlertDialogDescription className="text-xl font-medium mt-2 leading-relaxed text-foreground">
                    This code will inject <span className="text-primary font-black underline decoration-2">{creditPromoToConfirm?.value?.toLocaleString()} credits</span> into your production vault instantly.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-10 gap-4">
                <AlertDialogCancel className="rounded-xl h-14 font-bold border-2 px-10 uppercase text-xs tracking-widest">Abort</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmCreditRedeem} disabled={isApplyingCode} className="rounded-xl h-14 font-black px-12 shadow-xl shadow-primary/30 uppercase text-xs tracking-widest">
                    {isApplyingCode ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                    Confirm Injection
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent className="rounded-[2.5rem] p-8 border-primary/20 shadow-3xl max-w-2xl">
            <AlertDialogHeader>
                <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight text-indigo-600 dark:text-indigo-400">Manage Your Automatic Plan</AlertDialogTitle>
                <div className="text-sm font-medium mt-2 leading-relaxed text-foreground space-y-4">
                    <p className="font-bold text-foreground">
                        Your automatic weekly consistency plan is powered securely via UPI AutoPay. You have 100% direct control over your payments and can pause or cancel them instantly inside your payment app!
                    </p>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-xs space-y-2 text-foreground/90">
                        <p className="font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" /> UPI AutoPay Cancellation Instructions
                        </p>
                        <p>
                            To prevent future automated weekly charges, you can revoke or pause the automatic mandate directly inside your UPI payment application at any time:
                        </p>
                        <ul className="list-disc pl-5 space-y-1 font-semibold text-muted-foreground">
                            <li><strong>Google Pay / GPay:</strong> Open GPay &rarr; Tap Profile Picture &rarr; Autopay / Mandates &rarr; Select 'TwelveLabs' &rarr; Click 'Cancel Mandate'.</li>
                            <li><strong>PhonePe:</strong> Open PhonePe &rarr; Tap Profile &rarr; UPI Autopay / Automatic Payments &rarr; Select 'TwelveLabs' &rarr; Tap 'Remove Autopay'.</li>
                            <li><strong>Paytm:</strong> Open Paytm &rarr; Search 'UPI Automatic Payments' &rarr; Select 'TwelveLabs' &rarr; Tap 'Cancel/Pause Automatic Payment'.</li>
                            <li><strong>Direct Link:</strong> You will also find an official confirmation email from our secure payment processor with a direct, instant link to pause or revoke the mandate.</li>
                        </ul>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        *Note: Since each billing cycle is pre-paid, cancelling the mandate stops all future cycles. However, you will still receive all remaining weekly credit grants scheduled for your current cycle!
                    </p>
                </div>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-8">
                <AlertDialogCancel className="rounded-xl h-12 font-black px-8 uppercase text-xs tracking-widest w-full sm:w-auto">
                    Keep Plan
                </AlertDialogCancel>
                <AlertDialogAction
                    onClick={handleCancelSubscription}
                    disabled={isCancellingSub}
                    className="rounded-xl h-12 font-black px-8 bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-xl uppercase text-xs tracking-widest w-full sm:w-auto"
                >
                    {isCancellingSub ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Cancel Plan
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
