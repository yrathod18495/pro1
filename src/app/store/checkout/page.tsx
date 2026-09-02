
'use client';

import { useCart } from '@/context/cart-provider';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Lock, ShoppingCart, Package, Gem, CheckCircle, Coins, AlertTriangle, Sparkles, ShieldCheck, Info, Check, Trash2, XCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { createOrderForCart, processFreeOrder, processCreditOrder } from './actions';
import type { UserProfile, Product, CartItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn, getDisplayUrl } from '@/lib/utils';
import { VerifiedBadge } from '@/components/verified-badge';
import { initializeFirebase } from '@/firebase';
import { ref, get } from 'firebase/database';
import { reportClientError } from '@/lib/report-client-error';

declare const Razorpay: any;

export default function CheckoutPage() {
    const { cartItems, cartTotal, clearCart, itemCount, removeFromCart } = useCart();
    const { user, setUser } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const { database } = initializeFirebase();

    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingCredits, setIsProcessingCredits] = useState(false);
    
    const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({});
    const [isCheckingAvailability, setIsCheckingAvailability] = useState(true);

    const GST_RATE = 0.18;
    const PLATFORM_FEE_RATE = 0.02;

    const gstAmount = cartTotal * GST_RATE;
    const platformFee = cartTotal * PLATFORM_FEE_RATE;
    const grandTotal = cartTotal + gstAmount + platformFee;

    const totalCreditCost = Math.round(cartTotal * 100);
    
    const allPartners = useMemo(() => cartItems.length > 0 && cartItems.every(item => item.sellerIsVerified), [cartItems]);
    const canAffordCredits = (user?.credits || 0) >= totalCreditCost;

    useEffect(() => {
        if (!database || cartItems.length === 0) {
            setIsCheckingAvailability(false);
            return;
        }

        const checkAvailability = async () => {
            setIsCheckingAvailability(true);
            const newMap: Record<string, boolean> = {};
            
            try {
                const results = await Promise.all(
                    cartItems.map(async (item) => {
                        const productRef = ref(database, `storeProducts/${item.id}`);
                        const snapshot = await get(productRef);
                        return { id: item.id, exists: snapshot.exists() };
                    })
                );
                
                results.forEach(res => {
                    newMap[res.id] = res.exists;
                });
                setAvailabilityMap(newMap);
            } catch (e) {
                console.error("Availability check failed:", e);
            } finally {
                setIsCheckingAvailability(false);
            }
        };

        checkAvailability();
    }, [cartItems, database]);

    const hasSoldOutItems = useMemo(() => {
        if (isCheckingAvailability) return false;
        return cartItems.some(item => availabilityMap[item.id] === false);
    }, [cartItems, availabilityMap, isCheckingAvailability]);

    const getCleanUserProfile = (): UserProfile | null => {
        if (!user) return null;
        return {
            uid: user.uid,
            email: user.email || '',
            name: user.name || '',
            role: user.role,
            isSeller: user.isSeller,
            credits: user.credits,
            status: user.status,
            suspensionEndDate: user.suspensionEndDate,
            createdAt: user.createdAt,
            followingCount: user.followingCount,
        };
    };

    const handlePayment = async () => {
        if (hasSoldOutItems) {
            toast({ variant: 'destructive', title: 'Invalid Cart', description: 'Please remove sold-out items from your cart to proceed.' });
            return;
        }

        if (!user) {
            toast({ variant: 'destructive', title: 'Please log in to proceed.' });
            return;
        }
        
        const cleanUser = getCleanUserProfile();
        if (!cleanUser) return;

        setIsLoading(true);

        const itemsForAction = cartItems.map(item => ({
            id: item.id,
            title: item.title,
            price: item.price,
            quantity: item.quantity,
            sellerId: item.sellerId,
            isOneTimePurchase: item.isOneTimePurchase,
        }));

        try {
            if (cartTotal === 0) {
                const result = await processFreeOrder(itemsForAction, cleanUser);
                if (result.success) {
                    toast({ title: "Order Successful!", description: "Your free products are now in your history." });
                    clearCart();
                    router.push('/history?tab=purchases');
                } else {
                    throw new Error(result.error);
                }
            } else {
                const result = await createOrderForCart(itemsForAction, cleanUser);

                if (!result.success) {
                    throw new Error(result.error || 'Failed to create order.');
                }
                
                const order = result.order;

                const options = {
                    key: order.key_id,
                    amount: order.amount,
                    currency: order.currency,
                    name: '12Labs Store',
                    image: 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png',
                    description: `Order with ${itemCount} items.`,
                    order_id: order.id,
                    handler: function () {
                        toast({
                            title: 'Payment Successful!',
                            description: 'Your order has been placed and will be processed.',
                        });
                        clearCart();
                        router.push('/history?tab=purchases'); 
                    },
                    prefill: {
                        name: user.name,
                        email: user.email,
                    },
                    theme: { color: '#6366f1' },
                    config: {
                      display: {
                        blocks: {
                          other: {
                            name: "Payment Options",
                            instruments: [
                              {
                                method: "upi",
                                flows: ["qr", "intent", "collect"]
                              },
                              { method: "card" },
                              { method: "netbanking" }
                            ]
                          }
                        },
                        sequence: ["block.other"],
                        preferences: {
                          show_default_blocks: false
                        }
                      }
                    }
                };

                const rzp = new Razorpay(options);
                rzp.on('payment.failed', function (response: any){
                    console.error('Razorpay payment failed:', response.error);
                    toast({
                        variant: 'destructive',
                        title: 'Payment Failed',
                        description: response.error.description || 'Your payment could not be processed.',
                    });
                });
                rzp.open();
            }
        } catch (error: any) {
            reportClientError('src/app/store/checkout/page.tsx:204', error);
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handlePayWithCredits = async () => {
        if (hasSoldOutItems) {
            toast({ variant: 'destructive', title: 'Invalid Cart', description: 'Please remove sold-out items from your cart to proceed.' });
            return;
        }

        const cleanUser = getCleanUserProfile();
        if (!user || !cleanUser) return;
        
        setIsProcessingCredits(true);
        try {
            const result = await processCreditOrder(
                cartItems.map(item => ({
                    id: item.id,
                    title: item.title,
                    price: item.price,
                    quantity: item.quantity,
                    sellerId: item.sellerId,
                    isOneTimePurchase: item.isOneTimePurchase,
                })),
                cleanUser
            );

            if (result.success) {
                toast({ title: "Purchase Complete!", description: "Credits deducted and assets unlocked." });
                if (result.newBalance !== undefined) {
                    setUser(prev => prev ? { ...prev, credits: result.newBalance! } : null);
                }
                clearCart();
                router.push('/history?tab=purchases');
            } else {
                throw new Error(result.error);
            }
        } catch (e: any) {
            reportClientError('src/app/store/checkout/page.tsx:244', e);
            toast({ variant: 'destructive', title: 'Credit Purchase Failed', description: e.message });
        } finally {
            setIsProcessingCredits(false);
        }
    };
    
    if (itemCount === 0 && !isLoading) {
        return (
            <div className="container mx-auto text-center py-20 flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]">
                <ShoppingCart className="h-20 w-20 text-muted-foreground mb-6" />
                <h1 className="text-3xl font-bold">Your Cart is Empty</h1>
                <p className="text-muted-foreground mt-2 mb-8 max-w-sm">Looks like you haven't added anything to your cart yet.</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Button asChild size="lg">
                        <Link href="/store" prefetch={false}>Continue Shopping</Link>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto max-w-4xl py-10 px-4">
            <h1 className="text-4xl font-black uppercase tracking-tight mb-8">Order Architecture</h1>
            
            <div className="grid grid-cols-1 gap-8 items-start">
                <div className="space-y-6">
                    <Card className="rounded-[2.5rem] shadow-xl border-none bg-card overflow-hidden">
                        <CardHeader className="bg-primary/5 border-b pb-6">
                            <CardTitle className="text-lg font-black uppercase tracking-tight">Cart Registry</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-8">
                            {cartItems.map(item => {
                                const isSoldOut = availabilityMap[item.id] === false;
                                return (
                                    <div key={item.id} className={cn("space-y-3 p-4 rounded-3xl transition-all", isSoldOut ? "bg-destructive/5 ring-1 ring-destructive/20" : "")}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-4">
                                                <div className={cn("relative h-14 w-20 overflow-hidden rounded-xl bg-muted flex-shrink-0 shadow-sm", isSoldOut && "grayscale opacity-50")}>
                                                    {item.previewImage ? (
                                                        <Image src={getDisplayUrl(item.previewImage)} alt={item.title} fill className="object-cover" unoptimized />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center">
                                                            <Package className="h-6 w-6 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className={cn("font-black text-sm leading-tight uppercase truncate max-w-[150px]", isSoldOut && "text-muted-foreground")}>{item.title}</p>
                                                        {isSoldOut && (
                                                            <Badge variant="destructive" className="h-5 px-2 text-[9px] font-black uppercase tracking-widest animate-pulse">
                                                                <XCircle className="h-3 w-3 mr-1" /> SOLD OUT
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {item.sellerIsVerified ? (
                                                            <Badge className="bg-primary/10 text-primary border-none h-4 px-1.5 text-[8px] uppercase flex items-center gap-1 font-black">
                                                                <VerifiedBadge className="h-3 w-3" /> Partner Seller
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="h-4 px-1.5 text-[8px] uppercase font-bold opacity-40">Regular Seller</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <p className={cn("font-black text-sm", isSoldOut && "line-through text-muted-foreground")}>₹{item.price}</p>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-destructive" onClick={() => removeFromCart(item.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        {item.isOneTimePurchase && !isSoldOut && (
                                            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-amber-700 dark:text-amber-400 flex gap-3 shadow-inner">
                                                <Gem className="h-5 w-5 shrink-0 mt-0.5 fill-current" />
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest">Exclusive Asset</p>
                                                    <p className="text-[9px] font-bold leading-tight opacity-70 uppercase tracking-wide">One-time purchase item. Sold exclusively to you.</p>
                                                </div>
                                            </div>
                                        )}
                                        {isSoldOut && (
                                            <div className="rounded-2xl bg-destructive/5 p-4 text-destructive flex gap-3">
                                                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                                                <p className="text-[10px] font-black uppercase tracking-widest leading-tight">This asset is no longer available in the marketplace. Please remove it to proceed with checkout.</p>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                            
                            <div className="pt-4 space-y-4">
                                <div className="flex items-center gap-2 text-green-600 bg-green-500/5 p-3 rounded-2xl border border-green-500/10 shadow-sm">
                                    <ShieldCheck className="h-4 w-4 shrink-0" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Tax & Platform fees included</p>
                                </div>
                                
                                <div className="flex justify-between items-center bg-primary/5 p-6 rounded-[2rem] border border-primary/10 shadow-inner">
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Payable</p>
                                        <p className="text-[9px] font-bold opacity-40 uppercase">Encrypted Transaction</p>
                                    </div>
                                    <p className="text-3xl font-black text-primary tracking-tighter">₹{grandTotal.toFixed(0)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-8">
                    {hasSoldOutItems && (
                        <div className="p-6 rounded-[2.5rem] bg-destructive/10 border-2 border-dashed border-destructive/20 flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-500">
                            <AlertTriangle className="h-10 w-10 text-destructive animate-pulse" />
                            <div className="space-y-1">
                                <p className="text-lg font-black uppercase text-destructive tracking-tight">Checkout Blocked</p>
                                <p className="text-sm font-medium text-destructive/80 leading-relaxed">
                                    Some items in your cart are no longer available. Please remove all <b>Sold Out</b> items to resume your purchase.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Method 1: Cash/UPI */}
                    <Card className="rounded-[2.5rem] shadow-2xl overflow-hidden border-none bg-card relative">
                        <CardHeader className="bg-primary/5 border-b pb-6">
                            <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                <CheckCircle className="h-6 w-6 text-green-600" />
                                Direct Deployment
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-8 px-8 pb-8">
                            <Button className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine uppercase transition-all active:scale-95" onClick={handlePayment} disabled={isLoading || isProcessingCredits || isCheckingAvailability || hasSoldOutItems}>
                                {isLoading ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : <Lock className="mr-3 h-6 w-6" />}
                                {cartTotal === 0 ? 'ACTIVATE NOW' : `PROCEED TO PAY ₹${grandTotal.toFixed(0)}`}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* OR Separator */}
                    {allPartners && cartTotal > 0 && !hasSoldOutItems && (
                        <div className="relative py-4 flex items-center justify-center">
                            <div className="absolute inset-x-0 h-px bg-primary/10" />
                            <div className="relative z-10 bg-background px-6">
                                <div className="h-10 w-10 rounded-full border-2 border-primary/20 bg-primary/5 flex items-center justify-center text-[10px] font-black text-primary uppercase shadow-md">
                                    OR
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Method 2: Credits (ONLY for partners) */}
                    {allPartners && cartTotal > 0 && (
                        <Card className="rounded-[2.5rem] shadow-2xl overflow-hidden border-none bg-card animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <CardHeader className="bg-primary/10 border-b pb-6">
                                <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                                    <Coins className="h-6 w-6 text-primary" />
                                    Credit Redemption
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-8 px-8 pb-8 space-y-6 text-center">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-60">Required Credits</p>
                                    <p className="text-4xl font-black text-primary tracking-tighter">{totalCreditCost.toLocaleString()} Credits</p>
                                </div>
                                
                                {!canAffordCredits ? (
                                    <div className="space-y-4">
                                        <div className="bg-amber-100 dark:bg-amber-900/30 p-4 rounded-2xl border border-amber-200 flex items-center gap-4 text-left shadow-inner">
                                            <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">Insufficient Credits</p>
                                                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Balance: {user?.credits?.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-[11px] tracking-widest border-primary/20 hover:bg-primary/5 transition-all" asChild>
                                            <Link href="/buy-credits">Buy Credits</Link>
                                        </Button>
                                    </div>
                                ) : (
                                    <Button 
                                        onClick={handlePayWithCredits} 
                                        disabled={isProcessingCredits || isLoading || isCheckingAvailability || hasSoldOutItems}
                                        variant="secondary" 
                                        className="w-full h-16 text-lg font-black rounded-2xl border-2 border-primary/20 shadow-xl transition-all active:scale-95 group"
                                    >
                                        {isProcessingCredits ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : <Sparkles className="mr-3 h-6 w-6 text-primary group-hover:rotate-12 transition-transform" />}
                                        REDEEM CREDITS
                                    </Button>
                                )}
                                
                                <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-40 px-6 leading-tight">
                                    Credits are accepted for Verified Partners to ensure instant deployment.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
