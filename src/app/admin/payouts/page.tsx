
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IndianRupee, Landmark, Loader2, Banknote } from 'lucide-react';
import { getAffiliateData, recordAffiliatePayout } from './actions';
import type { AffiliateCode, AffiliateTransaction, AffiliateWithdrawal } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

function ManagePayoutsDialog({
    code,
    earningsData,
    open,
    onOpenChange,
    onUpdate
}: {
    code: AffiliateCode,
    earningsData: { totalEarnings: number; totalWithdrawn: number; transactions: AffiliateTransaction[]; withdrawals: AffiliateWithdrawal[] } | undefined,
    open: boolean,
    onOpenChange: (open: boolean) => void,
    onUpdate: () => void
}) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [payoutAmount, setPayoutAmount] = useState('');
    const [isPayingOut, setIsPayingOut] = useState(false);
    
    const withdrawable = (earningsData?.totalEarnings || 0) - (earningsData?.totalWithdrawn || 0);

    const handleRecordPayout = async () => {
        if (!user?.email) return;
        const payoutAmountNumber = parseFloat(payoutAmount);
        if (isNaN(payoutAmountNumber) || payoutAmountNumber <= 0) {
            toast({ variant: 'destructive', title: 'Invalid Payout Amount' });
            return;
        }
        setIsPayingOut(true);
        const idToken = await user.getIdToken();
        const result = await recordAffiliatePayout(idToken, {
            code: code.id,
            amount: payoutAmountNumber,
            adminEmail: user.email,
            youtuberTelegramId: code.youtuberTelegramId,
        });

        if (result.success) {
            toast({ title: 'Payout Recorded!', description: result.message });
            onUpdate();
            setPayoutAmount('');
            onOpenChange(false);
        } else {
            toast({ variant: 'destructive', title: 'Payout Failed', description: result.message });
        }
        setIsPayingOut(false);
    };
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Manage Payouts for: {code.code}</DialogTitle>
                    <DialogDescription>Record payments made to this affiliate and view their history.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                    <div className="space-y-4">
                         <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Record a Payout</CardTitle>
                            </CardHeader>
                             <CardContent className="space-y-2">
                                <div className="p-3 rounded-md bg-muted flex justify-between items-center">
                                    <span className="text-sm font-medium">Withdrawable Balance:</span>
                                    <span className="text-lg font-bold">₹{withdrawable.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input type="number" placeholder="Enter payout amount" value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} />
                                    <Button onClick={handleRecordPayout} disabled={isPayingOut || !payoutAmount}>
                                        {isPayingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pay'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle className="text-lg">Withdrawal History</CardTitle></CardHeader>
                            <CardContent>
                                <ScrollArea className="h-40">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Admin</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {earningsData?.withdrawals && earningsData.withdrawals.length > 0 ? (
                                                earningsData.withdrawals.map(wd => (
                                                    <TableRow key={wd.id}>
                                                        <TableCell className="text-xs">{wd.adminEmail}</TableCell>
                                                        <TableCell className="text-right text-xs font-mono text-red-600 font-semibold">- ₹{wd.amount.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow><TableCell colSpan={2} className="text-center h-24">No withdrawals yet.</TableCell></TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                    <Card>
                        <CardHeader><CardTitle className="text-lg">Commission Transaction History</CardTitle></CardHeader>
                        <CardContent>
                            <ScrollArea className="h-96">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Buyer</TableHead>
                                            <TableHead className="text-right">Sale</TableHead>
                                            <TableHead className="text-right">Earned</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {earningsData?.transactions && earningsData.transactions.length > 0 ? (
                                            earningsData.transactions.map(tx => (
                                                <TableRow key={tx.id}>
                                                    <TableCell className="text-xs">{tx.buyerEmail}</TableCell>
                                                    <TableCell className="text-right text-xs font-mono">₹{tx.purchaseAmount.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right text-xs font-mono text-green-600 font-semibold">₹{tx.commissionEarned.toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={3} className="text-center h-24">No transactions yet.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}


export default function AdminPayoutsPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const [affiliateData, setAffiliateData] = useState<{ codes: AffiliateCode[], earnings: Record<string, any> } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [managingCode, setManagingCode] = useState<AffiliateCode | null>(null);

    const fetchAffiliateData = useCallback(async () => {
        setIsLoading(true);
        if (!user) { setIsLoading(false); return; }
        const idToken = await user.getIdToken();
        const result = await getAffiliateData(idToken);
        if (result.success && result.data) {
            setAffiliateData(result.data);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsLoading(false);
    }, [toast, user]);

    useEffect(() => {
        fetchAffiliateData();
    }, [fetchAffiliateData]);

    const totalWithdrawable = affiliateData?.codes.reduce((acc, code) => {
        const earnings = affiliateData.earnings[code.id];
        if (earnings) {
            acc += (earnings.totalEarnings || 0) - (earnings.totalWithdrawn || 0);
        }
        return acc;
    }, 0) || 0;

    return (
        <>
            <div className="space-y-8">
                <h1 className="text-3xl font-bold flex items-center gap-3"><Landmark /> Affiliate Payouts</h1>
                
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Overall Payout Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-primary">
                            {isLoading ? <Skeleton className="h-10 w-40" /> : `₹${totalWithdrawable.toFixed(2)}`}
                        </div>
                        <p className="text-sm text-muted-foreground">Total amount pending for payout across all affiliates.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Affiliate Earnings</CardTitle>
                        <CardDescription>View earnings and process payouts for your creators.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Affiliate Code</TableHead>
                                        <TableHead>Creator Email</TableHead>
                                        <TableHead className="text-right">Total Earnings</TableHead>
                                        <TableHead className="text-right">Total Withdrawn</TableHead>
                                        <TableHead className="text-right">Withdrawable</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                                        ))
                                    ) : affiliateData?.codes && affiliateData.codes.length > 0 ? (
                                        affiliateData.codes.map((code) => {
                                            const earnings = affiliateData.earnings[code.id];
                                            const totalEarnings = earnings?.totalEarnings || 0;
                                            const totalWithdrawn = earnings?.totalWithdrawn || 0;
                                            const withdrawable = totalEarnings - totalWithdrawn;
                                            return (
                                                <TableRow key={code.id}>
                                                    <TableCell className="font-mono font-medium">{code.code}</TableCell>
                                                    <TableCell>{code.affiliateEmail}</TableCell>
                                                    <TableCell className="text-right">₹{totalEarnings.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right">₹{totalWithdrawn.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right font-bold">₹{withdrawable.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="outline" size="sm" onClick={() => setManagingCode(code)}>Manage Payouts</Button>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    ) : (
                                        <TableRow><TableCell colSpan={6} className="h-24 text-center">No affiliate codes found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
            {managingCode && (
                <ManagePayoutsDialog
                    code={managingCode}
                    earningsData={affiliateData?.earnings[managingCode.id]}
                    open={!!managingCode}
                    onOpenChange={(isOpen) => !isOpen && setManagingCode(null)}
                    onUpdate={fetchAffiliateData}
                />
            )}
        </>
    )
}
