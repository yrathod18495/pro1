'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Store, IndianRupee, Search, Users, Banknote, TrendingUp, User, Mail, Phone, Info, CheckCircle, XCircle, Loader2, AlertTriangle, ShieldCheck, Copy, Check, Download, Trash2, Settings, Package, Eye, FileText, Lock, Plus, X, ArrowUpRight, ShoppingCart, Link as LinkIcon, Edit } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSellersList, type SellerSummary, getSellerProducts, deleteProductAdminAction } from './actions';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, generateAvatarColor, getDisplayUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { processWithdrawal, rejectWithdrawal } from '@/app/admin/withdrawals/actions';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { approveProduct, rejectProduct, getCompleteProduct } from '../projects/actions';
import { formatDistanceToNow } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import NextImage from 'next/image';
import type { Product, StoreProduct } from '@/lib/types';
import { reportClientError } from '@/lib/report-client-error';

// Category types list matches exact system config
const productTypes = [ "PC Character", "Green Screen Character", "Premium Background", "Hand Written Script", "Real Voice", "AutoDraft Character", "YouTube Thumbnail", "YouTube Story" ] as const;

// Schema for updating/approving products
const approvalFormSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }),
  description: z.string().min(20, { message: "Description must be at least 20 characters." }),
  price: z.coerce.number().min(0, { message: "Price must be a valid number." }),
  productType: z.enum(productTypes, { required_error: "You must select a product type." }),
  isOneTimePurchase: z.boolean().default(false),
});

function DownloadableFilePreviewAdmin({ file }: { file: { fileName: string, url: string } }) {
    const [fileType, setFileType] = useState<'image' | 'video' | 'audio' | 'other'>('other');
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    useEffect(() => {
        const extension = file.fileName.split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) setFileType('image');
        else if (['mp4', 'webm', 'mov'].includes(extension)) setFileType('video');
        else if (['mp3', 'wav', 'ogg'].includes(extension)) setFileType('audio');
        else setFileType('other');
    }, [file.fileName]);

    const PreviewComponent = () => {
        const displayUrl = getDisplayUrl(file.url);
        switch(fileType) {
            case 'image': return <div className="relative w-full h-full min-h-[300px]"><NextImage src={displayUrl} alt={file.fileName} fill className="object-contain" unoptimized /></div>;
            case 'video': return <video src={displayUrl} controls className="w-full h-full object-contain" />;
            case 'audio': return <audio src={displayUrl} controls className="w-full" />;
            default: return null;
        }
    };
    
    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-y-2 gap-x-4 p-3 border rounded-xl hover:bg-muted/50 transition-colors text-sm bg-background">
                <a href={getDisplayUrl(file.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 flex-grow min-w-0" download={file.fileName}>
                    <LinkIcon className="h-5 w-5 text-primary flex-shrink-0" />
                    <p className="font-medium break-all">{file.fileName}</p>
                </a>
                {fileType !== 'other' && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsDialogOpen(true)} className="flex-shrink-0 self-end sm:self-center text-xs h-8">
                        <Eye className="h-4 w-4 mr-1.5" /> Preview
                    </Button>
                )}
            </div>
            {fileType !== 'other' && (
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-3xl h-[80vh] flex flex-col rounded-[2.5rem]">
                        <DialogHeader><DialogTitle>Preview: {file.fileName}</DialogTitle></DialogHeader>
                        <div className="h-full flex-grow flex items-center justify-center p-4"><PreviewComponent /></div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

function ProductInspectionDialog({ 
    product: initialProduct, 
    open, 
    onOpenChange, 
    onActionComplete 
}: { 
    product: Product | null, 
    open: boolean, 
    onOpenChange: (open: boolean) => void,
    onActionComplete: () => void
}) {
    const [product, setProduct] = useState<Product | null>(initialProduct);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectField, setShowRejectField] = useState(false);
    const { toast } = useToast();
    const [api, setApi] = useState<CarouselApi>();
    const [adminPreviews, setAdminPreviews] = useState<any[]>([]);

    useEffect(() => {
        const fetchProductDetails = async () => {
            if (open && initialProduct) {
                setIsLoading(true);
                const result = await getCompleteProduct(initialProduct.id);
                if (result.success && result.product) {
                    const fetchedProduct = result.product;
                    if (fetchedProduct.scriptPreview && !Array.isArray(fetchedProduct.scriptPreview)) {
                        fetchedProduct.scriptPreview = Object.values(fetchedProduct.scriptPreview);
                    }
                    setProduct(fetchedProduct);
                    setAdminPreviews(fetchedProduct.previews || []);
                } else {
                    const p = { ...initialProduct };
                    if (p.scriptPreview && !Array.isArray(p.scriptPreview)) p.scriptPreview = Object.values(p.scriptPreview);
                    setProduct(p);
                    setAdminPreviews(p.previews || []);
                }
                setIsLoading(false);
                setShowRejectField(false);
                setRejectionReason('');
            }
        };
        fetchProductDetails();
    }, [open, initialProduct]);

    const form = useForm<z.infer<typeof approvalFormSchema>>({
        resolver: zodResolver(approvalFormSchema),
        defaultValues: { title: '', description: '', price: 0, productType: undefined, isOneTimePurchase: false },
    });

    useEffect(() => {
        if (product) {
            form.reset({ 
                title: product.title, 
                description: product.description, 
                price: product.price, 
                productType: product.productType as any, 
                isOneTimePurchase: product.isOneTimePurchase || false 
            });
        }
    }, [product, form]);

    if (!product) return null;

    const onSubmit = async (data: z.infer<typeof approvalFormSchema>) => {
        setIsSubmitting(true);
        const finalProduct = { ...product, previews: adminPreviews };
        const result = await approveProduct(product.id, finalProduct, data);
        if (result.success) {
            toast({ title: 'Product updated and is live!' });
            onActionComplete();
            onOpenChange(false);
        } else {
            toast({ variant: 'destructive', title: 'Action Failed', description: result.message });
        }
        setIsSubmitting(false);
    };

    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            toast({ variant: 'destructive', title: 'Reason Required', description: 'Please provide a justification.' });
            return;
        }
        setIsRejecting(true);
        const result = await rejectProduct(product.id, product, rejectionReason);
        if (result.success) {
            toast({ title: 'Product De-listed / Rejected successfully' });
            onActionComplete();
            onOpenChange(false);
        } else {
            toast({ variant: 'destructive', title: 'Rejection Failed', description: result.message });
        }
        setIsRejecting(false);
    };

    const updatePreviewUrl = (index: number, url: string) => {
        setAdminPreviews(prev => prev.map((p, i) => i === index ? { ...p, url } : p));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2.5rem]">
                <DialogHeader className="p-6 pb-2 border-b bg-muted/20 shrink-0">
                    <DialogTitle className="truncate text-xl font-black uppercase tracking-tight flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" /> Inspecting Product
                    </DialogTitle>
                    <DialogDescription className="text-xs uppercase font-bold tracking-wider">
                        Seller ID: {product.sellerId} • Status: {product.status}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1">
                    {isLoading ? (
                        <div className="flex h-96 items-center justify-center flex-col gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Fetching complete specs...</p>
                        </div>
                    ) : (
                        <div className="p-6 space-y-8">
                            {product.productType === 'Hand Written Script' ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary"><FileText className="h-3.5 w-3.5" /> Script Body</div>
                                    <div className="border-2 border-primary/10 rounded-2xl p-6 bg-muted/20 font-mono text-sm leading-relaxed max-h-[300px] overflow-y-auto">
                                        {product.scriptPreview?.map((line, index) => (
                                            line === '[LOCKED_LINE]' ? <Badge key={index} variant="outline" className="h-5 px-1.5 text-[8px] uppercase gap-1 mb-2"><Lock className="h-2 w-2" /> Encrypted</Badge> : <p key={index} className="my-1 whitespace-pre-wrap break-words">{line}</p>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary"><Package className="h-3.5 w-3.5" /> Media Previews</div>
                                    {adminPreviews.length > 0 && (
                                        <Carousel setApi={setApi} className="w-full max-w-2xl mx-auto">
                                            <CarouselContent>
                                                {adminPreviews.map((preview, index) => (
                                                    <CarouselItem key={index}>
                                                        <div className="aspect-video w-full bg-muted rounded-2xl overflow-hidden relative border shadow-inner">
                                                            {preview.type === 'image' ? <img src={getDisplayUrl(preview.url)} alt="P" className="w-full h-full object-contain" /> : <video src={getDisplayUrl(preview.url)} controls className="w-full h-full object-contain" />}
                                                        </div>
                                                    </CarouselItem>
                                                ))}
                                            </CarouselContent>
                                            {adminPreviews.length > 1 && <><CarouselPrevious className="left-2" /><CarouselNext className="right-2" /></>}
                                        </Carousel>
                                    )}
                                </div>
                            )}

                            <div className="bg-muted/10 p-5 rounded-2xl border-2 border-primary/5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary px-1">Admin Preview Node Control</p>
                                    <Button size="sm" variant="ghost" className="h-6 text-[8px] font-black" onClick={() => setAdminPreviews([...adminPreviews, { type: 'image', url: '' }])}><Plus className="h-2 w-2 mr-1"/> ADD SLOT</Button>
                                </div>
                                <div className="space-y-3">
                                    {adminPreviews.map((p, i) => (
                                        <div key={i} className="flex gap-2">
                                            <div className="p-2 bg-background border rounded-lg text-[10px] font-black shrink-0">{i === 0 ? 'M' : i}</div>
                                            <Input value={p.url} onChange={(e) => updatePreviewUrl(i, e.target.value)} className="h-9 text-[10px] font-mono rounded-xl flex-grow bg-background" placeholder="Paste URL or ID" />
                                            <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => setAdminPreviews(prev => prev.filter((_, idx) => idx !== i))}><X className="h-4 w-4" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Downloadable Assets / Master Links</p>
                                {product.downloadableFiles && product.downloadableFiles.length > 0 ? (
                                    product.downloadableFiles.map((file, i) => <DownloadableFilePreviewAdmin key={i} file={file} />)
                                ) : (
                                    <p className="text-xs italic text-muted-foreground bg-muted/20 p-4 rounded-xl text-center">No master downloadable files uploaded.</p>
                                )}
                            </div>

                            <Separator />

                            <div className="space-y-6 bg-muted/10 p-6 rounded-[2rem] border-2 border-primary/5">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary"><Edit className="h-3 w-3" /> Marketplace Parameters</div>
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel className="font-bold text-xs uppercase">Title</FormLabel><FormControl><Input {...field} className="rounded-xl bg-background" /></FormControl><FormMessage /></FormItem> )}/>
                                            <FormField control={form.control} name="price" render={({ field }) => ( <FormItem><FormLabel className="font-bold text-xs uppercase">Price (INR)</FormLabel><FormControl><Input type="number" {...field} className="rounded-xl bg-background font-bold" /></FormControl><FormMessage /></FormItem> )}/>
                                        </div>
                                        <FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel className="font-bold text-xs uppercase">Description</FormLabel><FormControl><Textarea className="min-h-[100px] rounded-xl bg-background" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField control={form.control} name="productType" render={({ field }) => ( <FormItem><FormLabel className="font-bold text-xs uppercase">Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="rounded-xl bg-background"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{productTypes.map(type => ( <SelectItem key={type} value={type} className="rounded-lg">{type}</SelectItem> ))}</SelectContent></Select><FormMessage /></FormItem> )}/>
                                            <FormField control={form.control} name="isOneTimePurchase" render={({ field }) => ( <FormItem className="flex items-center space-x-3 space-y-0 rounded-xl border p-4 bg-background h-11"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-bold text-xs cursor-pointer">Exclusive Item</FormLabel></FormItem>)}/>
                                        </div>

                                        {showRejectField && (
                                            <div className="pt-4 border-t border-dashed space-y-4">
                                                <p className="text-[10px] font-black uppercase text-rose-500 tracking-wider">Specify Rejection / De-list Reason</p>
                                                <Textarea 
                                                    placeholder="Explain why this product is rejected..." 
                                                    value={rejectionReason}
                                                    onChange={(e) => setRejectionReason(e.target.value)}
                                                    className="bg-rose-500/5 border-rose-500/20 text-sm p-4 rounded-xl min-h-[100px]"
                                                />
                                                <div className="flex gap-2">
                                                    <Button 
                                                        type="button" 
                                                        variant="destructive" 
                                                        className="flex-grow rounded-xl font-black h-12" 
                                                        onClick={handleReject}
                                                        disabled={isRejecting || !rejectionReason.trim()}
                                                    >
                                                        {isRejecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                                                        CONFIRM REJECTION
                                                    </Button>
                                                    <Button 
                                                        type="button" 
                                                        variant="ghost" 
                                                        className="rounded-xl font-bold h-12" 
                                                        onClick={() => setShowRejectField(false)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                                            {!showRejectField && (
                                                <Button 
                                                    type="button" 
                                                    variant="destructive" 
                                                    className="rounded-2xl font-black h-14 flex-1 text-sm uppercase"
                                                    onClick={() => setShowRejectField(true)}
                                                >
                                                    <XCircle className="mr-2 h-4 w-4" /> 
                                                    {product.status === 'approved' ? 'De-list / Reject' : 'Reject Draft'}
                                                </Button>
                                            )}
                                            <Button 
                                                type="submit" 
                                                disabled={isSubmitting || showRejectField}
                                                className="flex-[2] h-14 text-sm font-black rounded-2xl shadow-xl shadow-primary/20 btn-shine uppercase"
                                            >
                                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                                {product.status === 'approved' ? 'Update Details' : 'Approve & Put Live'}
                                            </Button>
                                        </div>
                                    </form>
                                </Form>
                            </div>
                        </div>
                    )}
                </ScrollArea>
                <DialogFooter className="p-4 bg-muted/20 border-t shrink-0">
                    <DialogClose asChild>
                        <Button variant="outline" className="h-10 rounded-xl font-bold">Close Inspector</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SellerDetailDialog({ 
    seller, 
    open, 
    onOpenChange, 
    onActionComplete 
}: { 
    seller: SellerSummary | null, 
    open: boolean, 
    onOpenChange: (open: boolean) => void,
    onActionComplete: () => void
}) {
    const { user: adminUser } = useAuth();
    const { toast } = useToast();
    const [isActing, setIsActing] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<'payouts' | 'products'>('payouts');

    // Products list states
    const [products, setProducts] = useState<Product[]>([]);
    const [isProductsLoading, setIsProductsLoading] = useState(false);
    const [refreshProductsKey, setRefreshProductsKey] = useState(0);
    const [prodSearch, setProdSearch] = useState('');
    const [prodStatus, setProdStatus] = useState<string>('all');

    // Inspector and delete states
    const [inspectedProduct, setInspectedProduct] = useState<Product | null>(null);
    const [productToDelete, setProductToDelete] = useState<Product | null>(null);
    const [isDeletingProduct, setIsDeletingProduct] = useState(false);

    // Dynamic product loader inside Dialog
    useEffect(() => {
        const fetchSellerProducts = async () => {
            if (!seller?.id || !open) return;
            setIsProductsLoading(true);
            const idToken = await adminUser?.getIdToken();
            if (!idToken) { setIsProductsLoading(false); return; }
            const res = await getSellerProducts(idToken, seller.id);
            if (res.success && res.products) {
                setProducts(res.products);
            } else {
                setProducts([]);
            }
            setIsProductsLoading(false);
        };
        fetchSellerProducts();
    }, [seller?.id, open, refreshProductsKey]);

    if (!seller) return null;

    const avatarColor = generateAvatarColor(seller.id);
    const payout = seller.payoutDetails || {};

    // 12% deduction calculation for the admin
    const payableAmount = seller.pendingWithdrawalAmount * 0.88;

    const handleCopyUpi = () => {
        if (!payout.upiId) return;
        navigator.clipboard.writeText(payout.upiId);
        setIsCopied(true);
        toast({ title: 'UPI ID Copied', description: 'Paste it in your banking app.' });
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleDownloadQR = async () => {
        if (!payout.paymentQrUrl) return;
        try {
            const url = getDisplayUrl(payout.paymentQrUrl);
            const response = await fetch(url);
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `QR_${seller.storeName}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
        } catch (e) {
            reportClientError('src/app/admin/sales/page.tsx:428', e);
            toast({ variant: 'destructive', title: 'Save Failed' });
        }
    };

    const handleMarkAsPaid = async () => {
        if (!adminUser?.email || !seller.pendingRequestId) return;
        setIsActing(true);
        const result = await processWithdrawal({
            requestId: seller.pendingRequestId,
            sellerName: seller.storeName,
            amount: seller.pendingWithdrawalAmount,
            adminEmail: adminUser.email,
            upiId: payout.upiId || 'N/A',
            accountHolderName: payout.accountHolderName || 'N/A'
        });

        if (result.success) {
            toast({ title: 'Payment Marked as Completed' });
            onActionComplete();
            onOpenChange(false);
        } else {
            toast({ variant: 'destructive', title: 'Action Failed', description: result.message });
        }
        setIsActing(false);
    };

    const handleReject = async () => {
        if (!seller.pendingRequestId || rejectionReason.length < 10) {
            toast({ variant: 'destructive', title: 'Reason too short', description: 'Please provide at least 10 characters.' });
            return;
        }
        setIsActing(true);
        const result = await rejectWithdrawal({
            requestId: seller.pendingRequestId,
            sellerName: seller.storeName,
            reason: rejectionReason
        });

        if (result.success) {
            toast({ title: 'Withdrawal Rejected' });
            onActionComplete();
            onOpenChange(false);
        } else {
            toast({ variant: 'destructive', title: 'Action Failed', description: result.message });
        }
        setIsActing(false);
    };

    // Confirm admin level deletion of products
    const handleConfirmDeleteProduct = async () => {
        if (!productToDelete || !adminUser) return;
        setIsDeletingProduct(true);
        const idToken = await adminUser.getIdToken();
        const result = await deleteProductAdminAction(idToken, productToDelete.id);
        if (result.success) {
            toast({ title: 'Product Deleted Permanently' });
            setProductToDelete(null);
            setRefreshProductsKey(k => k + 1);
            onActionComplete(); // refresh main page count metrics
        } else {
            toast({ variant: 'destructive', title: 'Deletion Failed', description: result.message });
        }
        setIsDeletingProduct(false);
    };

    // Filter products on the portfolio view
    const filteredProducts = products.filter(p => {
        const matchesSearch = p.title.toLowerCase().includes(prodSearch.toLowerCase());
        const matchesStatus = prodStatus === 'all' || 
            (prodStatus === 'approved' && p.status === 'approved') ||
            (prodStatus === 'pending' && (p.status === 'pending' || p.status === 'pending_update')) ||
            (prodStatus === 'rejected' && p.status === 'rejected') ||
            (prodStatus === 'sold' && p.status === 'sold');
        return matchesSearch && matchesStatus;
    });

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl rounded-none sm:rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl h-[95vh] sm:h-[85vh] flex flex-col">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{seller.storeName} - Management Hub</DialogTitle>
                        <DialogDescription>View seller details, portfolio lists, and process payout distributions.</DialogDescription>
                    </DialogHeader>
                    
                    {/* Header Banner */}
                    <div className="bg-primary/5 p-8 border-b shrink-0">
                        <div className="flex items-center gap-6">
                            <Avatar className="h-16 w-16 border-4 border-background shadow-xl">
                                <AvatarImage src={getDisplayUrl(seller.profileImageUrl)} />
                                <AvatarFallback className={cn("font-black text-xl", avatarColor.bg, avatarColor.text)}>
                                    {seller.storeName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 space-y-1">
                                <h2 className="text-2xl font-black tracking-tight truncate">{seller.storeName}</h2>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                    <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Verified Seller Hub • ID: {seller.id}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Tab selection */}
                    <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="flex-1 flex flex-col overflow-hidden">
                        <div className="bg-primary/5 px-8 pb-3 border-b shrink-0 flex items-center justify-between">
                            <TabsList className="bg-muted/40 p-1 rounded-xl">
                                <TabsTrigger value="payouts" className="rounded-lg text-xs font-black px-4 py-2 flex items-center gap-1.5">
                                    <Banknote className="h-3.5 w-3.5" /> Financials & Payouts
                                </TabsTrigger>
                                <TabsTrigger value="products" className="rounded-lg text-xs font-black px-4 py-2 flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5" /> Products Portfolio ({products.length})
                                </TabsTrigger>
                            </TabsList>
                        </div>
                        
                        {/* Financials Tab */}
                        <TabsContent value="payouts" className="flex-1 overflow-hidden m-0 p-0">
                            <ScrollArea className="h-full">
                                <div className="p-8 space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Contact Intelligence</p>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-xl border border-primary/5">
                                                    <Mail className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-bold truncate">{seller.secondaryEmail || seller.id}</span>
                                                </div>
                                                <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-xl border border-primary/5">
                                                    <Phone className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-bold">{seller.mobileNumber || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Engagement Metrics</p>
                                            <div className="grid grid-cols-2 gap-2 text-center">
                                                <div className="bg-primary/5 p-3 rounded-xl border border-primary/10">
                                                    <p className="text-[10px] font-black uppercase text-primary/60">Live Items</p>
                                                    <p className="text-xl font-black">{seller.liveProducts}</p>
                                                </div>
                                                <div className="bg-primary/5 p-3 rounded-xl border border-primary/10">
                                                    <p className="text-[10px] font-black uppercase text-primary/60">Total Sales</p>
                                                    <p className="text-xl font-black">{seller.totalSales}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <Separator className="opacity-50" />

                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-black text-lg uppercase tracking-tight">Payout Control</h3>
                                            {seller.hasPendingWithdrawal && (
                                                <Badge className="bg-destructive animate-pulse px-3 h-6 text-[10px] font-black uppercase tracking-widest">
                                                    Request: ₹{seller.pendingWithdrawalAmount.toFixed(2)}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                            <div className="space-y-4">
                                                <div className="p-5 bg-primary/5 rounded-2xl border-2 border-primary/10 relative group">
                                                    <p className="text-[10px] font-black uppercase text-primary/60 tracking-widest mb-3">Target UPI ID</p>
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="min-w-0">
                                                            <p className="text-lg font-black font-mono break-all text-primary leading-tight">{payout.upiId || 'NOT CONFIGURED'}</p>
                                                            <p className="text-[10px] font-bold text-muted-foreground mt-2 uppercase">Account: {payout.accountHolderName || 'N/A'}</p>
                                                        </div>
                                                        {payout.upiId && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                onClick={handleCopyUpi}
                                                                className="h-10 w-10 shrink-0 bg-background shadow-sm rounded-xl hover:bg-primary hover:text-white transition-all active:scale-90"
                                                            >
                                                                {isCopied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                                {seller.hasPendingWithdrawal && (
                                                    <div className="space-y-4 pt-2">
                                                        <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 text-center">
                                                            <p className="text-[10px] font-black text-destructive uppercase tracking-widest">Amount to Transfer (after 12% fee)</p>
                                                            <p className="text-2xl font-black text-destructive">₹{payableAmount.toFixed(2)}</p>
                                                        </div>
                                                        <Input 
                                                            placeholder="Reason if rejecting..." 
                                                            value={rejectionReason}
                                                            onChange={(e) => setRejectionReason(e.target.value)}
                                                            className="rounded-xl bg-muted/20"
                                                        />
                                                        <div className="flex gap-2">
                                                            <Button variant="destructive" className="flex-1 rounded-xl font-black" onClick={handleReject} disabled={isActing}>
                                                                REJECT
                                                            </Button>
                                                            <Button className="flex-1 rounded-xl font-black bg-green-600 hover:bg-green-700" onClick={handleMarkAsPaid} disabled={isActing}>
                                                                {isActing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                                                PAID
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="flex items-center justify-between w-full px-1">
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Payment QR</p>
                                                    {payout.paymentQrUrl && (
                                                        <Button variant="link" onClick={handleDownloadQR} className="h-auto p-0 text-[10px] font-black text-primary uppercase tracking-widest underline">
                                                            <Download className="h-3 w-3 mr-1" /> Save to device
                                                        </Button>
                                                    )}
                                                </div>
                                                {payout.paymentQrUrl ? (
                                                    <div className="relative w-full aspect-square max-w-[200px] border-4 border-white shadow-2xl rounded-2xl overflow-hidden bg-white p-2">
                                                        <img src={getDisplayUrl(payout.paymentQrUrl)} alt="QR" className="w-full h-full object-contain" />
                                                    </div>
                                                ) : (
                                                    <div className="w-full aspect-square max-w-[200px] bg-muted/20 border-2 border-dashed border-primary/10 rounded-2xl flex flex-col items-center justify-center text-center p-4 opacity-30">
                                                        <AlertTriangle className="h-8 w-8 mb-2" />
                                                        <p className="text-[10px] font-bold uppercase">No QR Found</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        {/* Products Portfolio Tab */}
                        <TabsContent value="products" className="flex-1 overflow-hidden m-0 p-0 flex flex-col">
                            {/* Inner Filters */}
                            <div className="p-4 border-b bg-muted/10 shrink-0 flex flex-col sm:flex-row gap-4 items-center justify-between">
                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="Search product title..." 
                                        value={prodSearch}
                                        onChange={(e) => setProdSearch(e.target.value)}
                                        className="pl-9 h-10 rounded-xl bg-background border-primary/10 text-xs"
                                    />
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                                    <span className="text-[10px] font-black text-muted-foreground whitespace-nowrap uppercase tracking-wider">Status:</span>
                                    <Select value={prodStatus} onValueChange={setProdStatus}>
                                        <SelectTrigger className="w-full sm:w-44 h-10 rounded-xl bg-background text-xs font-bold">
                                            <SelectValue placeholder="All Status" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                            <SelectItem value="all" className="text-xs">All ({products.length})</SelectItem>
                                            <SelectItem value="approved" className="text-xs">Approved / Live ({products.filter(p => p.status === 'approved').length})</SelectItem>
                                            <SelectItem value="pending" className="text-xs">Pending Review ({products.filter(p => p.status === 'pending' || p.status === 'pending_update').length})</SelectItem>
                                            <SelectItem value="rejected" className="text-xs">Rejected ({products.filter(p => p.status === 'rejected').length})</SelectItem>
                                            <SelectItem value="sold" className="text-xs">Sold Out ({products.filter(p => p.status === 'sold').length})</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            {/* Inner Products list */}
                            <ScrollArea className="flex-grow">
                                <div className="p-6">
                                    {isProductsLoading ? (
                                        <div className="flex h-64 items-center justify-center flex-col gap-2">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading Portfolio...</p>
                                        </div>
                                    ) : filteredProducts.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {filteredProducts.map(product => {
                                                const isProductSold = product.status === 'sold';
                                                return (
                                                    <Card key={product.id} className={cn("rounded-2xl border border-primary/5 bg-background overflow-hidden relative group shadow-sm transition-all hover:shadow-md", isProductSold && "opacity-80 bg-muted/20")}>
                                                        <div className="p-4 flex gap-4">
                                                            <div className="h-16 w-16 bg-muted rounded-xl shrink-0 overflow-hidden relative border border-primary/5">
                                                                {product.previews && product.previews[0]?.url ? (
                                                                    <img src={getDisplayUrl(product.previews[0].url)} alt={product.title} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-primary/5 text-primary">
                                                                        <Package className="h-6 w-6" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1 flex flex-col justify-between">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <Badge className={cn("text-[8px] px-1.5 h-4 font-black uppercase tracking-widest border-none", 
                                                                            product.status === 'approved' ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20" : 
                                                                            (product.status === 'pending' || product.status === 'pending_update') ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 animate-pulse" : 
                                                                            product.status === 'rejected' ? "bg-rose-500/15 text-rose-600 hover:bg-rose-500/20" : 
                                                                            "bg-neutral-500/15 text-neutral-600 hover:bg-neutral-500/20"
                                                                        )}>
                                                                            {product.status === 'pending_update' ? 'Pending Update' : product.status}
                                                                        </Badge>
                                                                        <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                                                                            {product.createdAt ? formatDistanceToNow(new Date(product.createdAt)) + ' ago' : ''}
                                                                        </span>
                                                                    </div>
                                                                    <h4 className="text-sm font-black tracking-tight text-foreground truncate group-hover:text-primary transition-colors">{product.title}</h4>
                                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">{product.productType}</p>
                                                                </div>
                                                                <div className="flex items-center justify-between pt-2">
                                                                    <span className="text-sm font-black text-primary">₹{product.price.toLocaleString('en-IN')}</span>
                                                                    <div className="flex gap-1.5">
                                                                        <Button 
                                                                            size="icon" 
                                                                            variant="outline" 
                                                                            className="h-8 w-8 rounded-lg bg-background hover:bg-primary/5 hover:text-primary transition-all active:scale-95" 
                                                                            onClick={() => setInspectedProduct(product)}
                                                                            title="Inspect & Edit"
                                                                        >
                                                                            <Settings className="h-4 w-4" />
                                                                        </Button>
                                                                        <Button 
                                                                            size="icon" 
                                                                            variant="outline" 
                                                                            className="h-8 w-8 rounded-lg text-destructive bg-background hover:bg-destructive/5 hover:text-destructive transition-all active:scale-95" 
                                                                            onClick={() => setProductToDelete(product)}
                                                                            title="Delete Product"
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {product.status === 'rejected' && product.rejectionReason && (
                                                            <div className="px-4 pb-3 pt-1 border-t bg-rose-500/5 text-[10px] font-bold text-rose-600 flex gap-1 items-start">
                                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                                <span>Reason: {product.rejectionReason}</span>
                                                            </div>
                                                        )}
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-16 opacity-35 flex flex-col items-center justify-center italic">
                                            <Package className="h-12 w-12 mb-3" />
                                            <p className="text-sm font-black uppercase tracking-widest">No matching products found</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Sub-Dialog: Admin Product Inspector */}
            <ProductInspectionDialog 
                product={inspectedProduct}
                open={!!inspectedProduct}
                onOpenChange={(open) => !open && setInspectedProduct(null)}
                onActionComplete={() => {
                    setRefreshProductsKey(k => k + 1);
                    onActionComplete(); // Refresh main seller counts as well
                }}
            />

            {/* Sub-Dialog: Confirm Deletion */}
            <Dialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
                <DialogContent className="max-w-md rounded-[2rem] p-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-destructive">
                            <AlertTriangle className="h-6 w-6" />
                            <h3 className="text-lg font-black uppercase tracking-tight">Delete Product Permanently?</h3>
                        </div>
                        <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                            Are you sure you want to delete <span className="font-black text-foreground">"{productToDelete?.title}"</span>? 
                            This will permanently remove it from the store catalog, RTDB listings, database, and all purchase search results. 
                            This administrative override cannot be undone.
                        </p>
                    </div>
                    <div className="flex gap-2 justify-end mt-6">
                        <Button 
                            variant="destructive" 
                            onClick={handleConfirmDeleteProduct} 
                            disabled={isDeletingProduct}
                            className="rounded-xl font-black h-11 px-5 text-xs"
                        >
                            {isDeletingProduct ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
                            CONFIRM DELETE
                        </Button>
                        <Button 
                            variant="ghost" 
                            onClick={() => setProductToDelete(null)} 
                            className="rounded-xl font-bold h-11 text-xs"
                        >
                            Cancel
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function AdminSellersPage() {
    const { user } = useAuth();
    const [sellers, setSellers] = useState<SellerSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSeller, setSelectedSeller] = useState<SellerSummary | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            if (!user) { setIsLoading(false); return; }
            const idToken = await user.getIdToken();
            const result = await getSellersList(idToken);
            if (result.success && result.data) {
                setSellers(result.data);
            }
            setIsLoading(false);
        };
        fetchData();
    }, [refreshKey]);

    const filteredSellers = sellers.filter(s => 
        s.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                        <Store className="text-primary h-8 w-8" />
                        Sellers Hub
                    </h1>
                    <p className="text-muted-foreground font-medium text-sm">Oversight of all active marketplace creators.</p>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search stores..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 rounded-xl bg-muted/20 border-primary/10"
                    />
                </div>
            </div>

            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card/50 backdrop-blur-sm overflow-hidden">
                <CardHeader className="bg-primary/5 pb-6 border-b border-primary/10">
                    <CardTitle className="text-lg font-black uppercase">Creator Index</CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Sales metrics, withdrawal history, and current balances.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="h-14">
                                <TableHead className="pl-8 font-black uppercase tracking-widest text-[10px] text-muted-foreground">Store Name</TableHead>
                                <TableHead className="text-center font-black uppercase tracking-widest text-[10px] text-muted-foreground">Total Sales</TableHead>
                                <TableHead className="text-right font-black uppercase tracking-widest text-[10px] text-muted-foreground">Total Sales (Gross)</TableHead>
                                <TableHead className="text-right font-black uppercase tracking-widest text-[10px] text-muted-foreground">Total Withdrawn</TableHead>
                                <TableHead className="text-right pr-8 font-black uppercase tracking-widest text-[10px]">Current Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i} className="h-24">
                                        <TableCell className="pl-8"><Skeleton className="h-6 w-48 rounded-lg" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-12 mx-auto rounded-lg" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-20 ml-auto rounded-lg" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-20 ml-auto rounded-lg" /></TableCell>
                                        <TableCell><Skeleton className="h-6 w-24 ml-auto rounded-lg" /></TableCell>
                                    </TableRow>
                                ))
                            ) : filteredSellers.length > 0 ? (
                                filteredSellers.map(seller => (
                                    <TableRow 
                                        key={seller.id} 
                                        className="h-24 hover:bg-primary/5 transition-colors cursor-pointer"
                                        onClick={() => setSelectedSeller(seller)}
                                    >
                                        <TableCell className="pl-8">
                                            <div className="flex flex-col py-2">
                                                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                                    <span className={cn(
                                                        "font-black text-base leading-tight transition-colors",
                                                        seller.hasPendingWithdrawal ? "text-destructive" : "text-foreground"
                                                    )}>
                                                        {seller.storeName}
                                                    </span>
                                                    <Badge variant="outline" className="shrink-0 h-5 px-1.5 rounded-md border-primary/10 text-[9px] font-black uppercase text-muted-foreground whitespace-nowrap">
                                                        {seller.liveProducts} Active
                                                    </Badge>
                                                </div>
                                                <span className="text-[9px] font-mono text-muted-foreground uppercase opacity-50 mt-1">{seller.id}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="font-bold text-sm">{seller.totalSales} units</span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-muted-foreground">
                                                <span>₹{seller.totalEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-muted-foreground/60">
                                                <Banknote className="h-3 w-3" />
                                                <span>- ₹{seller.totalWithdrawn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right pr-8">
                                            <div className={cn(
                                                "flex flex-col items-end",
                                                seller.hasPendingWithdrawal ? "text-destructive" : "text-primary"
                                            )}>
                                                <div className="flex items-center gap-1.5 text-lg font-black">
                                                    <IndianRupee className="h-4 w-4" />
                                                    {seller.withdrawableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </div>
                                                {seller.hasPendingWithdrawal && (
                                                    <span className="text-[8px] font-black uppercase tracking-widest animate-pulse">Request Waiting: ₹{seller.pendingWithdrawalAmount.toFixed(2)}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-64 text-center py-20 opacity-20 italic">
                                        <Users className="mx-auto h-16 w-16 mb-4" />
                                        <p className="text-xl font-bold uppercase tracking-widest">No sellers found</p>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <SellerDetailDialog 
                seller={selectedSeller} 
                open={!!selectedSeller} 
                onOpenChange={(open) => !open && setSelectedSeller(null)}
                onActionComplete={() => setRefreshKey(k => k + 1)}
            />
        </div>
    );
}
