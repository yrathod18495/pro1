'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import {
    EmailAuthProvider,
    GoogleAuthProvider,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
    signOut,
} from 'firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getDisplayUrl, generateAvatarColor, formatSafeDate, formatCredits } from '@/lib/utils';
import { reportClientError } from '@/lib/report-client-error';
import { getAccountSummaryAction, deleteMyAccountAction, type AccountSummary } from './actions';
import {
    HistoryIcon,
    ShoppingBag,
    Package,
    Coins,
    Loader2,
    ShieldAlert,
    Trash2,
    ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

export default function ProfilePage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [summary, setSummary] = useState<AccountSummary | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [step, setStep] = useState<'choice' | 'confirm'>('choice');
    const [keepProducts, setKeepProducts] = useState<'keep' | 'delete'>('keep');
    const [password, setPassword] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [isReauthed, setIsReauthed] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const isGoogleUser = user?.providerData?.[0]?.providerId === 'google.com';

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
    }, [authLoading, user, router]);

    useEffect(() => {
        if (!user?.uid) return;
        getAccountSummaryAction(user.uid).then((s) => {
            setSummary(s);
            setIsLoadingSummary(false);
        }).catch((e) => {
            reportClientError('src/app/profile/page.tsx:summary', e);
            setIsLoadingSummary(false);
        });
    }, [user?.uid]);

    if (authLoading || !user) {
        return (
            <div className="container max-w-3xl py-16 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const avatarColor = generateAvatarColor(user.name || user.email || 'U');

    const resetDeleteFlow = () => {
        setStep('choice');
        setKeepProducts('keep');
        setPassword('');
        setConfirmText('');
        setIsReauthed(false);
        setIsDeleting(false);
    };

    const handleReauth = async () => {
        const { auth } = initializeFirebase();
        if (!auth?.currentUser) return;
        try {
            if (isGoogleUser) {
                const provider = new GoogleAuthProvider();
                await reauthenticateWithPopup(auth.currentUser, provider);
            } else {
                if (!password) {
                    toast({ variant: 'destructive', title: 'Password Required' });
                    return;
                }
                const credential = EmailAuthProvider.credential(user.email!, password);
                await reauthenticateWithCredential(auth.currentUser, credential);
            }
            setIsReauthed(true);
        } catch (e: any) {
            reportClientError('src/app/profile/page.tsx:reauth', e);
            toast({ variant: 'destructive', title: 'Verification Failed', description: e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' ? 'Incorrect password.' : (e.message || 'Could not verify your identity.') });
        }
    };

    const handleFinalDelete = async () => {
        if (!isReauthed || confirmText !== 'DELETE') return;
        setIsDeleting(true);
        try {
            const result = await deleteMyAccountAction(user.uid, user.email || '', keepProducts === 'keep');
            if (!result.success) throw new Error(result.message);

            const { auth } = initializeFirebase();
            if (auth) await signOut(auth).catch(() => null);

            toast({ title: 'Account Deleted', description: 'Your account and personal data have been removed.' });
            router.push('/');
        } catch (e: any) {
            reportClientError('src/app/profile/page.tsx:finalDelete', e);
            toast({ variant: 'destructive', title: 'Deletion Failed', description: e.message || 'Something went wrong. Please try again or contact support.' });
            setIsDeleting(false);
        }
    };

    return (
        <div className="container max-w-3xl py-10 space-y-8">
            <Card className="rounded-[2rem] border-none shadow-xl bg-card overflow-hidden">
                <CardHeader className="bg-primary/5 pb-8 border-b border-primary/10">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16 border-2 border-primary/20">
                            <AvatarImage src={getDisplayUrl(user.photoURL) || ''} />
                            <AvatarFallback className={`font-bold text-xl ${avatarColor.bg} ${avatarColor.text}`}>
                                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <CardTitle className="text-xl font-black truncate">{user.name}</CardTitle>
                            <CardDescription className="truncate">{user.email}</CardDescription>
                            {user.createdAt && (
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mt-1">
                                    Member since {formatSafeDate(user.createdAt)}
                                </p>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-muted/30 flex items-center gap-3">
                            <Coins className="h-5 w-5 text-primary" />
                            <div>
                                <p className="text-lg font-black leading-none">{formatCredits(user.credits)}</p>
                                <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Credits</p>
                            </div>
                        </div>
                        <div className="p-4 rounded-2xl bg-muted/30 flex items-center gap-3">
                            <HistoryIcon className="h-5 w-5 text-primary" />
                            <div>
                                <p className="text-lg font-black leading-none">{isLoadingSummary ? '—' : summary?.projectCount ?? 0}</p>
                                <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Projects</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Link href="/history">
                            <Button variant="outline" className="w-full justify-between h-12 rounded-xl">
                                <span className="flex items-center gap-2"><HistoryIcon className="h-4 w-4 text-primary/70" /> My Projects & Activity</span>
                                <ArrowRight className="h-4 w-4 opacity-40" />
                            </Button>
                        </Link>
                        <Link href="/purchases">
                            <Button variant="outline" className="w-full justify-between h-12 rounded-xl">
                                <span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-primary/70" /> My Purchases {isLoadingSummary ? '' : `(${summary?.purchaseCount ?? 0})`}</span>
                                <ArrowRight className="h-4 w-4 opacity-40" />
                            </Button>
                        </Link>
                        {summary?.isSeller && (
                            <Link href="/seller/products">
                                <Button variant="outline" className="w-full justify-between h-12 rounded-xl">
                                    <span className="flex items-center gap-2"><Package className="h-4 w-4 text-primary/70" /> My Store Products ({summary.productCount})</span>
                                    <ArrowRight className="h-4 w-4 opacity-40" />
                                </Button>
                            </Link>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-destructive/20 border shadow-xl bg-card overflow-hidden">
                <CardHeader className="bg-destructive/5 pb-6 border-b border-destructive/10">
                    <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3 text-destructive">
                        <ShieldAlert className="h-6 w-6" />
                        Delete Account
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Permanently deletes your login and personal data, as per your right to erasure under the DPDP Act. This cannot be undone.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="p-6">
                    <Button variant="destructive" className="w-full h-12 rounded-xl font-black" onClick={() => { resetDeleteFlow(); setIsDeleteOpen(true); }}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete My Account
                    </Button>
                </CardFooter>
            </Card>

            <Dialog open={isDeleteOpen} onOpenChange={(open) => { setIsDeleteOpen(open); if (!open) resetDeleteFlow(); }}>
                <DialogContent className="max-w-md rounded-2xl">
                    {step === 'choice' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-destructive">Delete Your Account</DialogTitle>
                                <DialogDescription>
                                    This will delete your login and personal information (name, email, photo). It cannot be reversed.
                                </DialogDescription>
                            </DialogHeader>

                            {summary?.isSeller && summary.productCount > 0 && (
                                <div className="space-y-3 py-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">You have {summary.productCount} store product(s). What should happen to them?</Label>
                                    <RadioGroup value={keepProducts} onValueChange={(v) => setKeepProducts(v as 'keep' | 'delete')} className="space-y-2">
                                        <label className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer">
                                            <RadioGroupItem value="keep" className="mt-0.5" />
                                            <span className="text-sm">Keep them live, managed by 12Labs (shown as "Unknown Seller"). Buyers keep access; future sales go to 12Labs.</span>
                                        </label>
                                        <label className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer">
                                            <RadioGroupItem value="delete" className="mt-0.5" />
                                            <span className="text-sm">Delete all my products from the store.</span>
                                        </label>
                                    </RadioGroup>
                                </div>
                            )}

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                                <Button variant="destructive" onClick={() => setStep('confirm')}>Continue</Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-destructive">Confirm Deletion</DialogTitle>
                                <DialogDescription>Verify your identity, then type DELETE to confirm.</DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-2">
                                {!isReauthed ? (
                                    isGoogleUser ? (
                                        <Button variant="outline" className="w-full" onClick={handleReauth}>Verify with Google</Button>
                                    ) : (
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold uppercase text-muted-foreground">Confirm your password</Label>
                                            <div className="flex gap-2">
                                                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password" />
                                                <Button variant="outline" onClick={handleReauth}>Verify</Button>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-muted-foreground">Type DELETE to confirm</Label>
                                        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>Cancel</Button>
                                <Button
                                    variant="destructive"
                                    disabled={!isReauthed || confirmText !== 'DELETE' || isDeleting}
                                    onClick={handleFinalDelete}
                                >
                                    {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                    Permanently Delete
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
