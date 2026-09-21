
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getWithdrawalRequests, processWithdrawal, rejectWithdrawal, type WithdrawalRequest } from './actions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Banknote, History, CheckCircle, XCircle, Hourglass, Copy, Check, IndianRupee } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-provider';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

function RequestCard({ request, onProcess, onReject }: { request: WithdrawalRequest; onProcess: (req: WithdrawalRequest) => void; onReject: (req: WithdrawalRequest, reason: string) => void; }) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const handleProcess = async () => {
        setIsProcessing(true);
        await onProcess(request);
        setIsProcessing(false);
    };
    
    const handleReject = async () => {
        if (!rejectionReason.trim()) return;
        setIsRejecting(true);
        await onReject(request, rejectionReason);
        setIsRejecting(false);
        setIsRejectDialogOpen(false);
        setRejectionReason('');
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };
    
    const getStatusBadge = () => {
        switch (request.status) {
            case 'completed': return <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle className="mr-1.5 h-3 w-3"/>Completed</Badge>;
            case 'rejected': return <Badge variant="destructive"><XCircle className="mr-1.5 h-3 w-3"/>Rejected</Badge>;
            case 'pending':
            default: return <Badge variant="secondary"><Hourglass className="mr-1.5 h-3 w-3"/>Pending</Badge>;
        }
    };
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                        <p className="font-semibold truncate">{request.sellerName}</p>
                        <p className="text-xs text-muted-foreground">{request.sellerId}</p>
                    </div>
                    {getStatusBadge()}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between items-center bg-muted/50 p-3 rounded-md">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="text-2xl font-bold text-primary">₹{request.withdrawableAmount.toFixed(2)}</span>
                </div>
                 <div className="space-y-1">
                    <p className="font-semibold text-sm">{request.accountHolderName}</p>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{request.upiId}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(request.upiId)}>
                            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">Requested {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</p>
                {request.status === 'rejected' && request.rejectionReason && (
                    <p className="text-xs text-destructive pt-2 border-t border-dashed"><strong>Reason:</strong> {request.rejectionReason}</p>
                )}
            </CardContent>
            {request.status === 'pending' && (
                <CardFooter className="grid grid-cols-2 gap-2">
                    <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="destructive">Reject</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Reject Withdrawal Request?</DialogTitle>
                                <DialogDescription>Please provide a reason for rejecting this withdrawal. This will be logged.</DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Label htmlFor="rejection-reason">Rejection Reason</Label>
                                <Textarea id="rejection-reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="e.g., UPI ID invalid, verification pending..."/>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                                <Button variant="destructive" onClick={handleReject} disabled={isRejecting || !rejectionReason.trim()}>
                                    {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Confirm Reject
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="secondary" disabled={isProcessing}>
                                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Mark as Paid
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirm Payment?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will mark the request of ₹{request.withdrawableAmount.toFixed(2)} for {request.sellerName} as 'completed'. Only do this after you have sent the payment.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleProcess}>Confirm</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardFooter>
            )}
        </Card>
    );
}


export default function AdminWithdrawalsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');

    const fetchRequests = useCallback(async () => {
        setIsLoading(true);
        if (!user) { setIsLoading(false); return; }
        const idToken = await user.getIdToken();
        const result = await getWithdrawalRequests(idToken);
        if (result.success && result.data) {
            setRequests(result.data);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsLoading(false);
    }, [toast, user]);
    
    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const handleProcess = async (req: WithdrawalRequest) => {
        if (!user?.email) return;
        const idToken = await user.getIdToken();
        const result = await processWithdrawal(idToken, { 
            requestId: req.id, 
            sellerName: req.sellerName, 
            amount: req.withdrawableAmount, 
            adminEmail: user.email,
            upiId: req.upiId,
            accountHolderName: req.accountHolderName,
        });
        if (result.success) {
            toast({ title: "Success", description: result.message });
            fetchRequests(); // Refetch data
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };
    
    const handleReject = async (req: WithdrawalRequest, reason: string) => {
        if (!user) return;
        const idToken = await user.getIdToken();
        const result = await rejectWithdrawal(idToken, { requestId: req.id, sellerName: req.sellerName, reason });
        if (result.success) {
            toast({ title: "Request Rejected", description: result.message });
            fetchRequests(); // Refetch data
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };

    const filteredRequests = useMemo(() => {
        return requests.filter(req => req.status === activeTab);
    }, [requests, activeTab]);
    
    const pendingCount = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold flex items-center gap-3"><Banknote /> Seller Withdrawals</h1>
            
            <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="pending">
                        Pending
                        {pendingCount > 0 && <Badge className="ml-2">{pendingCount}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="completed">Completed</TabsTrigger>
                    <TabsTrigger value="rejected">Rejected</TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="mt-6">
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Card key={i} className="space-y-4 p-4"><Skeleton className="h-32 w-full" /></Card>
                            ))}
                        </div>
                    ) : filteredRequests.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredRequests.map(request => (
                                <RequestCard key={request.id} request={request} onProcess={handleProcess} onReject={handleReject} />
                            ))}
                        </div>
                    ) : (
                         <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed rounded-lg">
                           <History className="h-12 w-12 text-muted-foreground mb-4" />
                           <h3 className="text-xl font-semibold">No {activeTab} requests</h3>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
