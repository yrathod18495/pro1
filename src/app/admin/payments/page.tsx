
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { History, CheckCircle, Hourglass, Loader2, ExternalLink, XCircle, Check, Trash2, IndianRupee, ChevronsUpDown, ShieldAlert, SquareCheck, Square, DollarSign, Package, Coins, ShoppingBag, Plus, Zap, Sparkles, Tag, Gift } from 'lucide-react';
import { CreditUsageSummary } from '@/components/admin/credit-usage-summary';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-provider';
import { useFirestore } from '@/firebase';
import { collection, query, where, orderBy, getDocs, limit, startAfter, type QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type { PendingPayment, Order } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { manuallyApprovePayment, deletePendingPayment, bulkDeletePayments } from './actions';
import { cn } from '@/lib/utils';

// Unified type for display
type UnifiedTransaction = (PendingPayment & { type: 'credits'; userEmail: string; createdAt: string; bonusCredits?: number }) | (Order & { type: 'asset' });

function TransactionCard({ 
    transaction, 
    onAdminAction,
    isSelected,
    onToggleSelect
}: { 
    transaction: UnifiedTransaction, 
    onAdminAction: () => void,
    isSelected: boolean,
    onToggleSelect: (id: string) => void
}) {
    const [isApproving, setIsApproving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();

    const handleApprove = async () => {
        if (transaction.type !== 'credits' || !user) return;
        setIsApproving(true);
        const idToken = await user.getIdToken();
        const result = await manuallyApprovePayment(idToken, transaction.id);
        if (result.success) {
            toast({ title: 'Success', description: result.message });
            onAdminAction();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsApproving(false);
    };

    const handleDelete = async () => {
       if (transaction.type !== 'credits' || !user) return;
       setIsDeleting(true);
       const idToken = await user.getIdToken();
       const result = await deletePendingPayment(idToken, transaction.id);
       if (result.success) {
           toast({ title: 'Success', description: result.message });
           onAdminAction();
       } else {
           toast({ variant: 'destructive', title: 'Error', description: result.message });
       }
       setIsDeleting(false);
    };

    const getStatusBadge = () => {
        if (transaction.type === 'asset') {
            return (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 px-2 h-6 text-[10px]">
                    <CheckCircle className="h-3 w-3" /> Paid
                </Badge>
            );
        }

        switch (transaction.status) {
            case 'approved':
                return (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 px-2 h-6 text-[10px]">
                        <CheckCircle className="h-3 w-3" /> Approved
                    </Badge>
                );
            case 'pending':
                 return (
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 gap-1 px-2 h-6 text-[10px] animate-pulse">
                        <ShieldAlert className="h-3 w-3" /> Pending
                    </Badge>
                );
            case 'rejected':
                 return (
                    <Badge variant="destructive" className="gap-1 px-2 h-6 text-[10px]">
                        <XCircle className="h-3 w-3" /> Rejected
                    </Badge>
                );
            default:
                return <Badge variant="secondary" className="h-6 text-[10px]">{(transaction as any).status}</Badge>
        }
    }

    const isCredits = transaction.type === 'credits';
    const isAsset = transaction.type === 'asset';
    const isPending = isCredits && transaction.status === 'pending';
    const canSelect = isCredits && transaction.status !== 'approved';
    const currencySymbol = transaction.currency === 'USD' ? '$' : '₹';

    return (
        <Card className={cn(
            "overflow-hidden border shadow-sm flex flex-col h-full bg-card transition-all relative",
            isPending ? "ring-1 ring-amber-500/30 bg-amber-50/20" : "",
            isAsset ? "border-purple-500/20 bg-purple-50/5 ring-1 ring-purple-500/10" : "",
            isSelected ? "ring-2 ring-primary border-primary shadow-md scale-[1.01]" : ""
        )}>
            {/* Selection Checkbox */}
            {canSelect && (
                <div className="absolute top-2 left-2 z-10">
                    <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => onToggleSelect(transaction.id)} 
                        className="bg-background h-5 w-5"
                    />
                </div>
            )}

            {/* Header Info */}
            <div className={cn("p-4 pb-2 flex justify-between items-start gap-2", canSelect && "pl-10")}>
                <div className="min-w-0">
                    <p className="font-bold text-sm truncate leading-tight">{transaction.userEmail.split('@')[0]}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{transaction.userEmail}</p>
                </div>
                {getStatusBadge()}
            </div>

            <Separator className="opacity-50" />

            {/* Price & Entry Type */}
            <div className={cn(
                "p-4 grid grid-cols-2 gap-2",
                isAsset ? "bg-purple-500/5" : isPending ? "bg-amber-100/20" : "bg-muted/10"
            )}>
                <div>
                    <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-1">Received</p>
                    <div className="flex items-center gap-1.5">
                        {isAsset ? <ShoppingBag className="h-4 w-4 text-purple-600" /> : <Coins className="h-4 w-4 text-primary" />}
                        <p className={cn("text-xl font-black tracking-tighter", isAsset ? "text-purple-700" : "")}>
                            {currencySymbol}{(transaction.amount / 100).toFixed(2)}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest mb-1">Entity</p>
                    <div className="flex items-center justify-end gap-1.5">
                        {isCredits ? (
                            <div className="flex flex-col items-end">
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-black text-[10px] gap-1 px-2 h-6">
                                    <Zap className="h-3 w-3" /> {transaction.credits.toLocaleString()}
                                </Badge>
                                {(transaction as any).bonusCredits > 0 && (
                                    <span className="text-[8px] font-black text-green-600 mt-1 flex items-center gap-1">
                                        <Gift className="h-2 w-2" /> BONUS: +{(transaction as any).bonusCredits.toLocaleString()}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300 font-black text-[10px] gap-1 px-2 h-6 shadow-sm">
                                <Sparkles className="h-3 w-3" /> ASSET
                            </Badge>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="px-4 pb-4 flex-grow flex flex-col justify-between">
                <div className="flex flex-col py-3 gap-2">
                    <div className="flex items-center justify-between">
                        <Badge variant="secondary" className={cn(
                            "font-bold text-[9px] px-2 h-5 truncate max-w-[120px]",
                            isAsset && "bg-purple-50 text-purple-700 border-purple-100"
                        )}>
                            {isCredits ? (transaction as any).planName : (transaction as any).productTitle || 'Digital Asset'}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground font-mono whitespace-nowrap ml-2">{format(new Date(transaction.createdAt), 'MMM d, p')}</p>
                    </div>
                    
                    {isCredits && (transaction as any).promoCode && (
                        <div className="flex items-center gap-2 bg-green-50 p-1.5 px-2 rounded-lg border border-green-100 animate-in fade-in">
                            <Tag className="h-3 w-3 text-green-600" />
                            <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">CODE: {(transaction as any).promoCode}</span>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    {transaction.paymentId && (
                         <Button asChild variant="ghost" size="sm" className={cn(
                             "h-7 text-[9px] w-full justify-start px-2 font-mono text-muted-foreground bg-muted/20",
                             isAsset && "bg-purple-50/50 hover:bg-purple-100/50"
                         )}>
                            <a href={`https://dashboard.razorpay.com/app/payments/${transaction.paymentId}`} target="_blank" rel="noopener noreferrer">
                               <ExternalLink className="mr-2 h-3 w-3" />
                               {transaction.paymentId}
                            </a>
                        </Button>
                    )}
                    
                    {isPending && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 text-xs text-destructive hover:bg-destructive/10 border-destructive/20 font-bold" disabled={isDeleting}>
                                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                        Purge
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-[2rem]">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Record?</AlertDialogTitle>
                                        <AlertDialogDescription>Delete this entry for {transaction.userEmail}?</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 rounded-xl">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                     <Button variant="default" size="sm" className="h-9 text-xs bg-green-600 hover:bg-green-700 text-white font-bold" disabled={isApproving}>
                                        {isApproving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5"/>}
                                        Approve
                                     </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-[2rem]">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Approve Payment?</AlertDialogTitle>
                                        <AlertDialogDescription>Add credits to this user and finalize record?</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleApprove} className="bg-green-600 hover:bg-green-700 rounded-xl">Approve</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

export default function PaymentsPage() {
    const { user: currentUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Pagination state
    const [itemsLimit, setItemsLimit] = useState(15);
    const [hasMore, setHasMore] = useState(true);

    // Multi-selection state (Only for Credits)
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    const fetchHistory = useCallback(async (currentLimit: number) => {
        if (!firestore || !currentUser?.role) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setSelectedIds([]);
        
        try {
            const [paymentsSnap, storeSnap] = await Promise.all([
                getDocs(query(collection(firestore, 'pendingPayments'), orderBy('createdAt', 'desc'), limit(currentLimit))),
                getDocs(query(collection(firestore, 'storeHistory'), where('status', '==', 'paid'), orderBy('createdAt', 'desc'), limit(currentLimit)))
            ]);

            const paymentList = paymentsSnap.docs.map(doc => {
                const data = doc.data();
                return { 
                    id: doc.id, 
                    ...data, 
                    userEmail: data.email || data.userEmail || '',
                    createdAt: data.timestamp || data.createdAt || new Date().toISOString(),
                    type: 'credits' as const 
                } as UnifiedTransaction;
            });

            const storeList = storeSnap.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(), 
                type: 'asset' as const 
            } as UnifiedTransaction));

            const combined = [...paymentList, ...storeList].sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            const finalDisplayList = combined.slice(0, currentLimit);
            setTransactions(finalDisplayList);
            setHasMore(combined.length >= currentLimit);

        } catch (error) {
            console.error("Failed to fetch transaction history:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load transaction feed." });
        } finally {
            setIsLoading(false);
        }
    }, [firestore, currentUser?.role, toast]);

    useEffect(() => {
        fetchHistory(itemsLimit);
    }, [fetchHistory, itemsLimit]);

    const handleLoadMore = () => {
        setItemsLimit(prev => prev + 15);
    };

    const handleAdminAction = () => {
        fetchHistory(itemsLimit);
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const selectAllUnapproved = () => {
        const selectableIds = transactions
            .filter(t => t.type === 'credits' && t.status !== 'approved')
            .map(t => t.id);
            
        if (selectedIds.length === selectableIds.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(selectableIds);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0 || !currentUser) return;
        setIsBulkDeleting(true);
        const idToken = await currentUser.getIdToken();
        const result = await bulkDeletePayments(idToken, selectedIds);
        if (result.success) {
            toast({ title: 'Success', description: result.message });
            fetchHistory(itemsLimit);
        } else {
            toast({ variant: 'destructive', title: 'Bulk Delete Failed', description: result.message });
        }
        setIsBulkDeleting(false);
    };

    const selectableCount = transactions.filter(t => t.type === 'credits' && t.status !== 'approved').length;

    return (
        <div className="space-y-10">
            <div className="space-y-1 px-1">
                <h1 className="text-3xl font-black uppercase tracking-tight">System Revenue</h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">Consolidated financial records.</p>
            </div>
            
            <CreditUsageSummary />

            <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
                <CardHeader className="bg-primary/5 border-b border-primary/10 pb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                            <History className="h-5 w-5 text-primary" /> 
                            Transaction Log
                        </CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Unified view of credits and assets.</CardDescription>
                    </div>
                    {transactions.length > 0 && !isLoading && (
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                             <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={selectAllUnapproved}
                                className="text-[10px] font-black uppercase tracking-widest h-9 px-4 rounded-xl flex-1 sm:flex-initial"
                                disabled={selectableCount === 0}
                            >
                                {selectedIds.length === selectableCount && selectableCount > 0 ? (
                                    <><SquareCheck className="mr-2 h-4 w-4" /> Deselect</>
                                ) : (
                                    <><Square className="mr-2 h-4 w-4" /> Select All</>
                                )}
                            </Button>
                            
                            {selectedIds.length > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm" className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg animate-in zoom-in-95 flex-1 sm:flex-initial" disabled={isBulkDeleting}>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Purge ({selectedIds.length})
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="rounded-[2.5rem]">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-xl font-black uppercase">Bulk Delete?</AlertDialogTitle>
                                            <AlertDialogDescription className="text-sm font-medium">
                                                You are about to delete <b>{selectedIds.length}</b> records permanently.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter className="mt-6 gap-3">
                                            <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90 rounded-xl font-black">
                                                Confirm Purge
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    )}
                </CardHeader>
                <CardContent className="pt-8">
                    {isLoading && transactions.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-48 w-full rounded-[2rem]" />
                        ))}
                        </div>
                    ) : transactions && transactions.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {transactions.map(transaction => (
                                    <TransactionCard 
                                        key={transaction.id} 
                                        transaction={transaction} 
                                        onAdminAction={handleAdminAction}
                                        isSelected={selectedIds.includes(transaction.id)}
                                        onToggleSelect={toggleSelect}
                                    />
                                ))}
                            </div>
                            
                            {hasMore && (
                                <div className="flex justify-center mt-12 mb-4">
                                    <Button 
                                        variant="outline" 
                                        onClick={handleLoadMore} 
                                        disabled={isLoading}
                                        className="h-12 px-10 rounded-2xl border-primary/20 hover:bg-primary/5 font-black uppercase tracking-widest text-xs gap-3 shadow-sm"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        ) : (
                                            <Plus className="h-4 w-4 text-primary" />
                                        )}
                                        Load More Entries
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-muted-foreground opacity-20 italic">
                            <History className="h-16 w-16 mb-4" />
                            <p className="text-xl font-bold uppercase tracking-widest">Archive Empty</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
