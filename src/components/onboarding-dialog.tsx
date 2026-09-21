'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Calendar, ShieldCheck, Rocket, ArrowRight, Check } from 'lucide-react';
import { completeUserOnboardingAction } from '@/app/actions';
import Link from 'next/link';
import { reportClientError } from '@/lib/report-client-error';

/**
 * 🚀 USER ONBOARDING HUB
 * ---------------------------------------
 * Triggered post-login for users missing Name, Age, or Terms verification.
 */
export function OnboardingDialog() {
    const { user, loading: authLoading, setUser } = useAuth();
    const { toast } = useToast();
    
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Form State
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    useEffect(() => {
        if (!authLoading && user) {
            // Respect session dismissal if user clicked X
            if (sessionStorage.getItem('onboarding_dismissed') === 'true') {
                return;
            }
            // Check if user needs onboarding
            const needsOnboarding = !user.termsAcceptedAt || !user.age || !user.name;
            if (needsOnboarding) {
                setName(user.name || '');
                setAge(user.age ? String(user.age) : '');
                setOpen(true);
            }
        }
    }, [user, authLoading]);

    const handleClose = (isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) {
            sessionStorage.setItem('onboarding_dismissed', 'true');
        }
    };

    const handleComplete = async () => {
        const finalName = name.trim() || user?.name || 'Creator';
        const finalAge = String(age).trim() || '18';

        if (!acceptedTerms) {
            // Auto-check terms if user clicks proceed, or prompt explicitly
            setAcceptedTerms(true);
            toast({ title: "Agreement Accepted", description: "Master Agreement accepted. Proceeding..." });
        }

        if (!user) return;

        setIsSubmitting(true);
        try {
            const result = await completeUserOnboardingAction(user.uid, finalName, finalAge);
            if (result.success) {
                toast({ title: "Identity Verified!", description: "Welcome to 12Labs Studio Hub." });
                // Update local context to hide dialog
                setUser(prev => prev ? { 
                    ...prev, 
                    name: finalName, 
                    age: finalAge, 
                    termsAcceptedAt: new Date().toISOString() 
                } : null);
                setOpen(false);
            } else throw new Error(result.error);
        } catch (e: any) {
            reportClientError('src/components/onboarding-dialog.tsx:79', e);
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message || 'Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!open) return null;

    const canSubmit = (name.trim().length > 0 || (user?.name && user.name.length > 0));

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
            {/* Backdrop Overlay */}
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300 z-10"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            />
            
            {/* Modal Box */}
            <div 
                className="relative max-w-md w-[92vw] max-h-[92vh] overflow-y-auto rounded-[2rem] border border-primary/10 shadow-3xl bg-background text-foreground z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
                id="onboarding-custom-modal"
            >
                {/* Header */}
                <div className="p-6 pb-5 border-b bg-primary/5 sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary text-white rounded-2xl shadow-lg shrink-0">
                            <Rocket className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-foreground">Setup Your Hub</h2>
                            <p className="font-bold text-[10px] uppercase opacity-60 tracking-widest mt-1 text-muted-foreground">
                                Complete your identity node to proceed
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-primary" /> Display Identity
                            </Label>
                            <Input 
                                placeholder="Your full name" 
                                value={name} 
                                onChange={e => setName(e.target.value)} 
                                className="h-12 rounded-xl bg-muted/20 border-primary/10 font-bold text-sm focus-visible:ring-primary focus-visible:ring-offset-0"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-primary" /> Your Age <span className="opacity-50 text-[9px] font-normal">(Optional)</span>
                            </Label>
                            <Input 
                                type="text"
                                inputMode="numeric"
                                placeholder="e.g. 24" 
                                value={age} 
                                onChange={e => setAge(e.target.value)} 
                                className="h-12 rounded-xl bg-muted/20 border-primary/10 font-bold text-sm focus-visible:ring-primary focus-visible:ring-offset-0"
                            />
                        </div>
                    </div>

                    <div className="space-y-3 pt-1">
                        {/* Interactive Clickable Terms Card */}
                        <div 
                            onClick={() => setAcceptedTerms(!acceptedTerms)}
                            className={`flex items-start space-x-3 p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer select-none ${
                                acceptedTerms 
                                    ? 'bg-primary/10 border-primary/40 shadow-sm' 
                                    : 'bg-muted/10 border-primary/20 hover:border-primary/40 active:scale-[0.99]'
                            }`}
                        >
                            <div 
                                className={`mt-0.5 border h-5 w-5 rounded-lg flex items-center justify-center transition-all duration-200 shrink-0 ${
                                    acceptedTerms 
                                        ? 'bg-primary border-primary text-primary-foreground' 
                                        : 'border-primary/40 bg-transparent'
                                }`}
                            >
                                {acceptedTerms && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                            </div>
                            <div className="grid gap-1 leading-none">
                                <Label 
                                    className="text-[11px] font-black uppercase tracking-widest text-foreground cursor-pointer flex items-center gap-1.5"
                                >
                                    Agree to Master Agreement {acceptedTerms && <Check className="h-3.5 w-3.5 text-primary" />}
                                </Label>
                                <p className="text-[9.5px] text-muted-foreground font-semibold leading-relaxed tracking-wider">
                                    I agree to the{' '}
                                    <Link 
                                        href="/terms" 
                                        onClick={(e) => e.stopPropagation()} 
                                        className="text-primary hover:underline font-bold" 
                                        target="_blank"
                                    >
                                        Terms of Service
                                    </Link>{' '}
                                    and{' '}
                                    <Link 
                                        href="/privacy" 
                                        onClick={(e) => e.stopPropagation()} 
                                        className="text-primary hover:underline font-bold" 
                                        target="_blank"
                                    >
                                        Privacy Policy
                                    </Link>{' '}
                                    for 12Labs.
                                </p>
                            </div>
                        </div>

                        {!acceptedTerms && (
                            <p className="text-[10px] text-amber-500/90 font-bold text-center animate-pulse uppercase tracking-wider">
                                👆 Tap box above to accept terms
                            </p>
                        )}

                        <div className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 pt-1">
                            <ShieldCheck className="h-3.5 w-3.5 text-primary/60" />
                            <span>Authorized Secure Dispatch</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-muted/10 sticky bottom-0 z-10 backdrop-blur-md">
                    <Button 
                        onClick={handleComplete} 
                        disabled={isSubmitting || !canSubmit} 
                        className={`w-full h-14 sm:h-16 text-base sm:text-lg font-black rounded-2xl shadow-xl transition-all uppercase tracking-tighter gap-3 ${
                            acceptedTerms ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/25' : 'bg-primary/80 hover:bg-primary text-primary-foreground'
                        }`}
                    >
                        {isSubmitting ? (
                            <><Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> SYNCING IDENTITY...</>
                        ) : (
                            <>PROCEED TO STUDIO <ArrowRight className="h-5 w-5" /></>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
