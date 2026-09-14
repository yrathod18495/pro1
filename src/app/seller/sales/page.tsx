
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { IndianRupee, Banknote, Wallet, Edit, Save, Loader2, PackageSearch, AlertTriangle, Clock, ImagePlus, Trash2, ShieldCheck, Check, Upload, TrendingUp, Sparkles, MoveRight, Info, History, CheckCircle, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { savePayoutDetailsAction, getSellerSalesData, type SalesData, requestWithdrawalAction } from './actions';
import { useAuth } from '@/context/auth-provider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import type { Order } from '@/lib/types';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { uploadFileDirectly } from '@/lib/gcs-client';
import { getDisplayUrl, cn } from '@/lib/utils';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { reportClientError } from '@/lib/report-client-error';

function PayoutSettingsCard({
  payoutDetails,
  onSave,
  isSaving
}: {
  payoutDetails: { upiId?: string, accountHolderName?: string, paymentQrUrl?: string };
  onSave: (details: { upiId: string, accountHolderName: string, paymentQrUrl: string }) => Promise<void>;
  isSaving: boolean;
}) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [details, setDetails] = useState({
        upiId: payoutDetails?.upiId || '',
        accountHolderName: payoutDetails?.accountHolderName || '',
        paymentQrUrl: payoutDetails?.paymentQrUrl || '',
    });
    const [confirmUpiId, setConfirmUpiId] = useState(payoutDetails?.upiId || '');
    const [isEditing, setIsEditing] = useState(!payoutDetails?.upiId || !payoutDetails?.accountHolderName || !payoutDetails?.paymentQrUrl);
    const [isUploadingQr, setIsUploadingQr] = useState(false);

    useEffect(() => {
        setDetails({
            upiId: payoutDetails?.upiId || '',
            accountHolderName: payoutDetails?.accountHolderName || '',
            paymentQrUrl: payoutDetails?.paymentQrUrl || '',
        });
        setConfirmUpiId(payoutDetails?.upiId || '');
        setIsEditing(!payoutDetails?.upiId || !payoutDetails?.accountHolderName || !payoutDetails?.paymentQrUrl);
    }, [payoutDetails]);
    
    const upiIdsMatch = details.upiId === confirmUpiId;
    const canSave = details.upiId && details.accountHolderName && details.paymentQrUrl && upiIdsMatch;

    const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsUploadingQr(true);
        try {
            // Use secure client-side signed URL upload
            const cloudUrl = await uploadFileDirectly({
                file,
                bucketType: 'public',
                folder: 'payouts',
                userId: user.uid,
                userEmail: user.email || 'N/A'
            });
            setDetails(prev => ({ ...prev, paymentQrUrl: cloudUrl }));
            toast({ title: 'QR Code Loaded', description: 'Click Commit Details to update.' });
        } catch (err: any) {
            reportClientError('src/app/seller/sales/page.tsx:84', err);
            toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
        } finally {
            setIsUploadingQr(false);
        }
    };

    const handleSave = async () => {
        if (!canSave) return;
        await onSave(details as { upiId: string, accountHolderName: string, paymentQrUrl: string });
        setIsEditing(false);
    };

    return (
         <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b pb-6">
                <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                    Payout Identity
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Verify your credentials to receive earnings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 pt-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Account Holder Name *</Label>
                            <Input 
                                placeholder="e.g., Yash Sharma" 
                                value={details.accountHolderName}
                                onChange={(e) => setDetails(prev => ({ ...prev, accountHolderName: e.target.value }))}
                                readOnly={!isEditing}
                                className="h-11 rounded-xl bg-muted/20 font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">UPI ID *</Label>
                            <Input 
                                placeholder="yourname@bank" 
                                value={details.upiId}
                                onChange={(e) => setDetails(prev => ({ ...prev, upiId: e.target.value }))}
                                readOnly={!isEditing}
                                className="h-11 rounded-xl bg-muted/20 font-mono text-primary font-bold"
                            />
                        </div>
                        {isEditing && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Confirm UPI ID</Label>
                                <Input 
                                    placeholder="Re-enter for verification" 
                                    value={confirmUpiId}
                                    onChange={(e) => setConfirmUpiId(e.target.value)}
                                    className="h-11 rounded-xl bg-muted/20 font-mono"
                                />
                                {!upiIdsMatch && details.upiId && confirmUpiId && (
                                    <p className="text-[10px] font-bold text-destructive uppercase tracking-widest">IDs do not match</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment QR Code *</Label>
                        <div className="relative group">
                            <div className="w-40 h-40 rounded-[2rem] border-4 border-dashed border-primary/20 bg-muted/30 flex items-center justify-center overflow-hidden transition-all group-hover:border-primary/50">
                                {details.paymentQrUrl ? (
                                    <img src={getDisplayUrl(details.paymentQrUrl)} alt="QR" className="w-full h-full object-contain" />
                                ) : (
                                    <ImagePlus className="h-10 w-10 text-muted-foreground/40" />
                                )}
                                {isUploadingQr && (
                                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    </div>
                                )}
                            </div>
                            {isEditing && (
                                <Label htmlFor="qr-upload-sales" className="absolute -bottom-2 -right-2 p-3 bg-primary text-white rounded-xl shadow-xl cursor-pointer hover:scale-110 active:scale-95 transition-all">
                                    <Upload className="h-4 w-4" />
                                    <input id="qr-upload-sales" type="file" className="hidden" accept="image/*" onChange={handleQrUpload} />
                                </Label>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-2xl bg-destructive/5 border border-destructive/10">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                    <p className="text-[10px] font-bold text-destructive uppercase leading-relaxed tracking-wide">
                        verify details carefully. Mobile, Email, and QR are now compulsory for distributions.
                    </p>
                </div>
            </CardContent>
            <CardFooter className="bg-muted/10 p-6 border-t">
                 {isEditing ? (
                    <Button onClick={handleSave} disabled={isSaving || !canSave || isUploadingQr} className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs btn-shine">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Commit Details
                    </Button>
                ) : (
                    <Button variant="outline" onClick={() => setIsEditing(true)} className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs border-primary/20">
                        <Edit className="h-4 w-4 mr-2" />
                        Modify Credentials
                    </Button>
                )}
            </CardFooter>
        </Card>
    )
}

function StatCard({ title, value, icon, isLoading, onClick }: { title: string, value: string | number, icon: React.ReactNode, isLoading: boolean, onClick?: () => void }) {
  const formattedValue = typeof value === 'number' ? `₹${value.toFixed(2)}` : value;
  return (
    <Card 
        className={cn(
            "rounded-[2rem] border-none shadow-lg bg-card/50 backdrop-blur-sm transition-all",
            onClick ? "cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:bg-card active:scale-[0.98]" : ""
        )}
        onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</CardTitle>
        <div className="p-2 bg-primary/10 rounded-lg">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24 mt-1" />
        ) : (
          <div className="text-3xl font-black tracking-tight">{formattedValue}</div>
        )}
      </CardContent>
    </Card>
  );
}

const MINIMUM_WITHDRAWAL = 50;

export default function SellerSalesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const { database } = initializeFirebase();
    const [salesData, setSalesData] = useState<SalesData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const [payoutDetails, setPayoutDetails] = useState<any>({});
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    const [isRequestingWithdrawal, setIsRequestingWithdrawal] = useState(false);
    
    const [withdrawAmount, setWithdrawAmount] = useState<string>('');

    // History Modal states
    const [showSalesHistory, setShowSalesHistory] = useState(false);
    const [showPayoutHistory, setShowPayoutHistory] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const toggleRow = (id: string) => {
        const next = new Set(expandedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedRows(next);
    };

    const fetchSales = async () => {
        if (!user?.uid) {
            setIsLoading(false);
            return;
        };
        setIsLoading(true);
        const result = await getSellerSalesData(user.uid);
        if (result.success && result.data) {
            setSalesData(result.data);
            setWithdrawAmount(result.data.withdrawableAmount.toString());
        } else {
            toast({
                variant: 'destructive',
                title: "Error",
                description: result.message,
            });
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchSales();
    }, [user]);

    useEffect(() => {
      if (user?.uid && database) {
        const payoutDetailsRef = ref(database, `sellerProfiles/${user.uid}/payoutDetails`);
        const unsubscribe = onRtdbValue(payoutDetailsRef, (snapshot) => {
            setPayoutDetails(snapshot.val() || {});
        });
        return () => unsubscribe();
      }
    }, [user, database]);

    const handleSavePayoutDetails = async (details: any) => {
      if (!user) return;
      setIsSavingDetails(true);
      const result = await savePayoutDetailsAction(user.uid, details);
      if (result.success) {
          toast({ title: "Identity Updated", description: result.message });
      } else {
          toast({ variant: 'destructive', title: "Update Failed", description: result.message });
      }
      setIsSavingDetails(false);
    };
    
    const handleRequestWithdrawal = async () => {
        if (!user || !user.name || !salesData) return;

        const amount = parseFloat(withdrawAmount);

        if (isNaN(amount) || amount < MINIMUM_WITHDRAWAL) {
            toast({
                variant: 'destructive',
                title: 'Invalid Amount',
                description: `Minimum withdrawal is ₹${MINIMUM_WITHDRAWAL}.`,
            });
            return;
        }

        if (amount > salesData.withdrawableAmount) {
            toast({
                variant: 'destructive',
                title: 'Insufficient Balance',
                description: `You only have ₹${salesData.withdrawableAmount.toFixed(2)} available.`,
            });
            return;
        }

        if (!payoutDetails?.upiId || !payoutDetails?.accountHolderName || !payoutDetails?.paymentQrUrl) {
            toast({
                variant: 'destructive',
                title: 'Payout Details Required',
                description: 'Please add your Name, UPI ID, and QR Code in the Payout Settings before requesting a withdrawal.',
            });
            return;
        }

        setIsRequestingWithdrawal(true);
        const result = await requestWithdrawalAction({
            sellerId: user.uid,
            sellerName: user.name,
            withdrawableAmount: amount,
            upiId: payoutDetails.upiId,
            accountHolderName: payoutDetails.accountHolderName,
        });

        if (result.success) {
            toast({
                title: 'Request Submitted',
                description: result.message,
            });
            await fetchSales();
        } else {
            toast({
                variant: 'destructive',
                title: 'Request Failed',
                description: result.message,
            });
        }
        setIsRequestingWithdrawal(false);
    };

    const isAmountValid = parseFloat(withdrawAmount) >= MINIMUM_WITHDRAWAL && parseFloat(withdrawAmount) <= (salesData?.withdrawableAmount || 0);
    const receivedAmount = isNaN(parseFloat(withdrawAmount)) ? 0 : parseFloat(withdrawAmount) * 0.88;

  return (
    <div className="space-y-12 pb-20">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-black uppercase tracking-tighter leading-none flex items-center gap-4">
            <IndianRupee className="h-10 w-10 text-primary" />
            Revenue Node
        </h1>
        <p className="text-muted-foreground font-bold text-xs uppercase tracking-[0.2em] opacity-60">Sales, Commissions & Distributions</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-3">
        <StatCard 
            title="Gross Sales Revenue" 
            value={`₹${(salesData?.totalEarnings ?? 0).toFixed(2)}`} 
            icon={<TrendingUp className="text-primary" />} 
            isLoading={isLoading} 
            onClick={() => setShowSalesHistory(true)}
        />
        <StatCard 
            title="Funds Processed" 
            value={salesData?.totalWithdrawn ?? 0} 
            icon={<Check className="text-green-500" />} 
            isLoading={isLoading} 
            onClick={() => setShowPayoutHistory(true)}
        />
        <StatCard 
            title="Current Balance (Gross)" 
            value={`₹${(salesData?.withdrawableAmount ?? 0).toFixed(2)}`} 
            icon={<Wallet className="text-primary" />} 
            isLoading={isLoading} 
        />
      </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PayoutSettingsCard payoutDetails={payoutDetails || {}} onSave={handleSavePayoutDetails} isSaving={isSavingDetails} />
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-card/80 backdrop-blur-sm overflow-hidden flex flex-col">
                <CardHeader className="bg-primary/5 border-b pb-6">
                    <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                        <Banknote className="h-6 w-6 text-primary" />
                        Distribution Engine
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Specify the amount you wish to withdraw.</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow flex flex-col items-center justify-center py-10 space-y-6">
                    <div className="space-y-2 text-center w-full max-w-[240px]">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Withdrawal Amount (INR)</Label>
                        <div className="relative">
                            <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                            <Input 
                                type="number" 
                                value={withdrawAmount} 
                                onChange={(e) => setWithdrawAmount(e.target.value)} 
                                className="h-16 pl-12 text-3xl font-black rounded-2xl bg-muted/20 border-primary/20 text-center"
                                placeholder="0.00"
                            />
                        </div>
                        <div className="flex justify-between items-center px-1">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Balance: ₹{salesData?.withdrawableAmount.toFixed(2) || '0.00'}</p>
                            <button 
                                onClick={() => setWithdrawAmount(salesData?.withdrawableAmount.toString() || '0')}
                                className="text-[9px] font-black text-primary uppercase hover:underline"
                            >
                                Use Max
                            </button>
                        </div>
                    </div>
                    
                    {parseFloat(withdrawAmount) > 0 && (
                        <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 text-center animate-in zoom-in-95 space-y-2">
                            <div>
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Estimated Settlement (after 12% fee)</p>
                                <p className="text-2xl font-black text-primary">₹{receivedAmount.toFixed(2)} <span className="text-xs uppercase font-bold text-muted-foreground/60 tracking-tight">will be received</span></p>
                            </div>
                            <Separator className="bg-primary/10" />
                            <div className="flex items-center justify-center gap-2 text-[9px] font-bold text-muted-foreground/80 uppercase tracking-tighter italic">
                                <Info className="h-2.5 w-2.5" />
                                <span>10% Platform + 2% Payout Handling Fee</span>
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="bg-muted/10 p-8 border-t">
                    {salesData?.hasPendingWithdrawal ? (
                        <div className="w-full flex items-center gap-4 bg-amber-50 p-6 rounded-2xl border border-amber-200 animate-pulse">
                            <Clock className="h-8 w-8 text-amber-600 flex-shrink-0" />
                            <div className="space-y-1">
                                <p className="font-black text-sm text-amber-800 uppercase leading-none">Sync in Progress</p>
                                <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wide">
                                    Requested: ₹{salesData.pendingWithdrawalAmount.toFixed(2)}
                                </p>
                                <p className="text-xs font-black text-amber-700">
                                    Your payment of Rs {(salesData.pendingWithdrawalAmount * 0.88).toFixed(2)} will be processed soon
                                </p>
                            </div>
                        </div>
                    ) : (
                        <Button 
                            className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/20 btn-shine uppercase"
                            onClick={handleRequestWithdrawal}
                            disabled={isLoading || isRequestingWithdrawal || !isAmountValid || !payoutDetails?.upiId || !payoutDetails?.paymentQrUrl}
                        >
                            {isRequestingWithdrawal ? <Loader2 className="mr-3 h-6 w-6 animate-spin" /> : <Sparkles className="mr-3 h-6 w-6 fill-current" />}
                            WITHDRAW
                        </Button>
                    )}
                </CardFooter>
            </Card>
       </div>

       {/* Sales History Modal */}
       <Dialog open={showSalesHistory} onOpenChange={setShowSalesHistory}>
            <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem] sm:rounded-[3rem] border-none shadow-3xl">
                <DialogHeader className="p-8 pb-6 border-b bg-muted/20 shrink-0">
                    <DialogTitle className="text-2xl sm:text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                        <TrendingUp className="text-primary h-7 w-7" />
                        Sales Analysis
                    </DialogTitle>
                    <DialogDescription className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground/60">Comprehensive audit of marketplace distribution nodes.</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/50 h-14 sticky top-0 z-20 shadow-sm">
                                    <TableRow className="border-none">
                                        <TableHead className="pl-8 font-black uppercase text-[10px] tracking-widest">Asset Node</TableHead>
                                        <TableHead className="text-right font-black uppercase text-[10px] tracking-widest pr-8">Sale Revenue</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {salesData?.transactions && salesData.transactions.length > 0 ? (
                                        salesData.transactions.map((tx) => {
                                            const salePrice = tx.amount / 100;
                                            const isExpanded = expandedRows.has(tx.id);
                                            return (
                                            <TableRow key={tx.id} className="min-h-[80px] hover:bg-muted/30 transition-colors border-muted/20">
                                                <TableCell className="pl-8 py-4">
                                                    <div 
                                                        className="flex items-start gap-4 cursor-pointer group/title"
                                                        onClick={() => toggleRow(tx.id)}
                                                    >
                                                        <div className="p-2 bg-primary/10 rounded-lg shrink-0 group-hover/title:bg-primary group-hover/title:text-white transition-colors">
                                                            <Package className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0 flex-col gap-1">
                                                            <div className={cn(
                                                                "font-black text-sm leading-tight transition-all",
                                                                isExpanded ? "whitespace-normal" : "truncate max-w-[200px] sm:max-w-[350px]"
                                                            )}>
                                                                {tx.productTitle || 'Digital Asset'}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[8px] font-bold text-muted-foreground uppercase">
                                                                <Clock className="h-2.5 w-2.5" /> {format(new Date(tx.createdAt), 'PP')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right pr-8 py-4 shrink-0">
                                                    <span className="font-black text-sm sm:text-base text-green-600">+₹{salePrice.toFixed(2)}</span>
                                                </TableCell>
                                            </TableRow>
                                            )
                                        })
                                    ) : (
                                        <TableRow><TableCell colSpan={2} className="h-64 text-center py-20 opacity-20 italic">No sales logged in archive.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </div>
                <DialogFooter className="p-6 sm:p-8 bg-muted/10 border-t shrink-0">
                    <Button variant="outline" onClick={() => setShowSalesHistory(false)} className="w-full sm:w-auto h-14 rounded-2xl font-black px-12 text-sm uppercase tracking-widest border-2 border-primary/20 hover:bg-primary/5 transition-all">Close Archive</Button>
                </DialogFooter>
            </DialogContent>
       </Dialog>

       {/* Payout History Modal */}
       <Dialog open={showPayoutHistory} onOpenChange={setShowPayoutHistory}>
            <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem] sm:rounded-[3rem] border-none shadow-3xl">
                <DialogHeader className="p-8 pb-6 border-b bg-muted/20 shrink-0">
                    <DialogTitle className="text-2xl sm:text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                        <History className="text-green-600 h-7 w-7" />
                        Payout History
                    </DialogTitle>
                    <DialogDescription className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground/60">Audit trail of all processed currency distributions.</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="p-0">
                            <Table>
                                <TableHeader className="bg-muted/50 h-14 sticky top-0 z-20 shadow-sm">
                                    <TableRow className="border-none">
                                        <TableHead className="pl-8 font-black uppercase text-[10px] tracking-widest">Reference</TableHead>
                                        <TableHead className="font-black uppercase text-[10px] tracking-widest">Recipient UPI</TableHead>
                                        <TableHead className="text-right font-black uppercase text-[10px] tracking-widest pr-8">Final Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {salesData?.withdrawalHistory && salesData.withdrawalHistory.filter(w => w.status === 'completed').length > 0 ? (
                                        salesData.withdrawalHistory.filter(w => w.status === 'completed').map((req) => (
                                            <TableRow key={req.id} className="h-20 hover:bg-muted/30 transition-colors border-muted/20">
                                                <TableCell className="pl-8">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <Badge className="bg-green-500 text-white font-black text-[8px] h-4 px-1.5 rounded-md uppercase tracking-widest">PAID</Badge>
                                                            <span className="text-[10px] font-black uppercase text-muted-foreground">{format(new Date(req.createdAt), 'PP')}</span>
                                                        </div>
                                                        <span className="text-[8px] font-mono opacity-30 uppercase mt-1">REF_{req.id.slice(0, 12)}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs font-black font-mono text-primary truncate max-w-[150px] sm:max-w-none">
                                                        {req.upiId}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right pr-8 font-black text-sm sm:text-base">
                                                    ₹{req.withdrawableAmount.toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={3} className="h-64 text-center py-20 opacity-20 italic">No payouts processed in archive.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </div>
                <DialogFooter className="p-6 sm:p-8 bg-muted/10 border-t shrink-0">
                    <Button variant="outline" onClick={() => setShowPayoutHistory(false)} className="w-full sm:w-auto h-14 rounded-2xl font-black px-12 text-sm uppercase tracking-widest border-2 border-primary/20 hover:bg-primary/5 transition-all">Close Archive</Button>
                </DialogFooter>
            </DialogContent>
       </Dialog>

       <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
        <CardHeader className="bg-muted/30 border-b p-8">
            <CardTitle className="text-lg font-black uppercase">Transaction Feed</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-60">Real-time sale intelligence nodes.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
             <Table>
                <TableHeader className="bg-muted/50 h-14">
                    <TableRow className="border-none">
                    <TableHead className="pl-8 font-black uppercase tracking-widest text-[10px]">Asset Node</TableHead>
                    <TableHead className="font-black uppercase tracking-widest text-[10px] hidden sm:table-cell">Cycle Date</TableHead>
                    <TableHead className="text-right font-black uppercase tracking-widest text-[10px] pr-8">Sale Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <TableRow key={i} className="h-20">
                                <TableCell className="pl-8"><Skeleton className="h-5 w-48 rounded-lg" /></TableCell>
                                <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-24 rounded-lg" /></TableCell>
                                <TableCell className="text-right pr-8"><Skeleton className="h-5 w-16 ml-auto rounded-lg" /></TableCell>
                            </TableRow>
                        ))
                    ) : salesData?.transactions && salesData.transactions.length > 0 ? (
                        salesData.transactions.slice(0, 10).map((tx) => {
                            const salePrice = tx.amount / 100;
                            return (
                            <TableRow key={tx.id} className="h-20 hover:bg-muted/50 transition-colors border-muted/10">
                                <TableCell className="pl-8">
                                    <div className="flex flex-col">
                                        <span className="font-black text-sm truncate max-w-[180px] sm:max-w-[300px]">{tx.productTitle || tx.productId}</span>
                                        <span className="sm:hidden text-[8px] font-bold text-muted-foreground uppercase mt-1">{format(new Date(tx.createdAt), 'PP')}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-xs font-bold text-muted-foreground uppercase hidden sm:table-cell">{format(new Date(tx.createdAt), 'PP')}</TableCell>
                                <TableCell className="text-right pr-8 font-black text-green-600">₹{salePrice.toFixed(2)}</TableCell>
                            </TableRow>
                            )
                        })
                    ) : (
                      <TableRow className="border-none">
                        <TableCell colSpan={3} className="h-64 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-20 italic">
                            <PackageSearch className="h-16 w-16" />
                            <p className="text-xl font-bold uppercase tracking-widest">No Cycles Logged</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                </TableBody>
            </Table>
            {salesData?.transactions && salesData.transactions.length > 10 && (
                <div className="p-4 bg-muted/10 border-t text-center">
                    <Button variant="link" onClick={() => setShowSalesHistory(true)} className="text-[10px] font-black uppercase tracking-widest hover:text-primary">Analyze Full Archive <MoveRight className="ml-2 h-3 w-3"/></Button>
                </div>
            )}
        </CardContent>
       </Card>
    </div>
  );
}
