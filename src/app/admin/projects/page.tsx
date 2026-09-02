
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { Product, StoreProduct } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Package, History, CheckCircle, XCircle, AlertTriangle, Eye, ShoppingCart, Link as LinkIcon, Edit, Video, Lock, FileText, Clock, User, Plus, X, ShoppingBag } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import NextImage from 'next/image';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { approveProduct, rejectProduct, getProductsByStatus, getCompleteProduct } from './actions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, getDisplayUrl } from '@/lib/utils';
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

const productTypes = [ "PC Character", "Green Screen Character", "Premium Background", "Hand Written Script", "Real Voice", "AutoDraft Character", "YouTube Thumbnail", "YouTube Story" ] as const;

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
            <div className="flex flex-col sm:flex-row sm:items-center gap-y-2 gap-x-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors text-sm">
                <a href={getDisplayUrl(file.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 flex-grow min-w-0" download={file.fileName}>
                    <LinkIcon className="h-5 w-5 text-primary flex-shrink-0" />
                    <p className="font-medium break-all">{file.fileName}</p>
                </a>
                {fileType !== 'other' && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setIsDialogOpen(true)} className="flex-shrink-0 self-end sm:self-center text-xs">
                        <Eye className="h-4 w-4 mr-1.5" /> Preview
                    </Button>
                )}
            </div>
            {fileType !== 'other' && (
                 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                        <DialogHeader><DialogTitle>Preview: {file.fileName}</DialogTitle></DialogHeader>
                        <div className="h-full flex-grow flex items-center justify-center p-4"><PreviewComponent /></div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

function ApprovalDialog({ product: initialProduct, productId, onApprove, trigger, onOpenChange, open }: { product?: Product, productId?: string, onApprove: (product: Product, updateData: z.infer<typeof approvalFormSchema>) => void, trigger: React.ReactNode, open: boolean, onOpenChange: (open: boolean) => void }) {
    const [product, setProduct] = useState<Product | undefined>(initialProduct);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const [api, setApi] = useState<CarouselApi>();
    
    const [adminPreviews, setAdminPreviews] = useState<any[]>([]);

    useEffect(() => {
        const fetchProduct = async () => {
            if (open && productId && !initialProduct) {
                setIsLoading(true);
                const result = await getCompleteProduct(productId);
                if (result.success && result.product) {
                    const fetchedProduct = result.product;
                    if (fetchedProduct.scriptPreview && !Array.isArray(fetchedProduct.scriptPreview)) {
                        fetchedProduct.scriptPreview = Object.values(fetchedProduct.scriptPreview);
                    }
                    setProduct(fetchedProduct);
                    setAdminPreviews(fetchedProduct.previews || []);
                } else {
                    toast({ variant: 'destructive', title: 'Error Loading', description: result.message });
                    onOpenChange(false);
                }
                setIsLoading(false);
            } else if (open && initialProduct) {
                const p = { ...initialProduct };
                if (p.scriptPreview && !Array.isArray(p.scriptPreview)) p.scriptPreview = Object.values(p.scriptPreview);
                setProduct(p);
                setAdminPreviews(p.previews || []);
            }
        };
        fetchProduct();
    }, [open, productId, initialProduct, onOpenChange, toast]);

    const form = useForm<z.infer<typeof approvalFormSchema>>({
        resolver: zodResolver(approvalFormSchema),
        defaultValues: { title: '', description: '', price: 0, productType: undefined, isOneTimePurchase: false },
    });

    useEffect(() => {
        if (product) {
            form.reset({ title: product.title, description: product.description, price: product.price, productType: product.productType as any, isOneTimePurchase: product.isOneTimePurchase || false });
        }
    }, [product, form]);

    const onSubmit = (data: z.infer<typeof approvalFormSchema>) => {
        if (product) { 
            const finalProduct = { ...product, previews: adminPreviews };
            onApprove(finalProduct, data); 
            onOpenChange(false); 
        }
    };

    const updatePreviewUrl = (index: number, url: string) => {
        setAdminPreviews(prev => prev.map((p, i) => i === index ? { ...p, url } : p));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2rem]">
                 <DialogHeader className="p-6 pb-2 border-b">
                    <DialogTitle className="truncate">Review & Approve: {product?.title || 'Loading...'}</DialogTitle>
                    <DialogDescription>Verify content and parameters.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1">
                {isLoading || !product ? (
                    <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : (
                    <div className="p-6 space-y-8">
                        <div className="space-y-4">
                            {product.productType === 'Hand Written Script' ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary"><FileText className="h-3 w-3" /> Script Inspection</div>
                                    <div className="border-2 border-primary/10 rounded-2xl p-6 bg-muted/20 font-mono text-sm leading-relaxed max-h-[400px] overflow-y-auto">
                                        {product.scriptPreview?.map((line, index) => (
                                            line === '[LOCKED_LINE]' ? <Badge key={index} variant="outline" className="h-5 px-1.5 text-[8px] uppercase gap-1 mb-2"><Lock className="h-2 w-2" /> Encrypted</Badge> : <p key={index} className="my-1 whitespace-pre-wrap break-words">{line}</p>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                     <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary"><Package className="h-3 w-3" /> Media Inspection</div>
                                    {adminPreviews.length > 0 && (
                                        <Carousel setApi={setApi} className="w-full">
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

                             <div className="bg-muted/10 p-6 rounded-[2rem] border-2 border-primary/5 space-y-4">
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
                                {product.downloadableFiles?.map((file, i) => <DownloadableFilePreviewAdmin key={i} file={file} />)}
                            </div>
                        </div>
                        <Separator />
                        <div className="space-y-6 bg-muted/10 p-6 rounded-[2rem] border-2 border-primary/5">
                             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary"><Edit className="h-3 w-3" /> Marketplace Parameters</div>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel className="font-bold text-xs uppercase">Title</FormLabel><FormControl><Input {...field} className="rounded-xl" /></FormControl><FormMessage /></FormItem> )}/>
                                        <FormField control={form.control} name="price" render={({ field }) => ( <FormItem><FormLabel className="font-bold text-xs uppercase">Price (INR)</FormLabel><FormControl><Input type="number" {...field} className="rounded-xl font-bold" /></FormControl><FormMessage /></FormItem> )}/>
                                    </div>
                                    <FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel className="font-bold text-xs uppercase">Description</FormLabel><FormControl><Textarea className="min-h-[100px] rounded-xl bg-background" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField control={form.control} name="productType" render={({ field }) => ( <FormItem><FormLabel className="font-bold text-xs uppercase">Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{productTypes.map(type => ( <SelectItem key={type} value={type} className="rounded-lg">{type}</SelectItem> ))}</SelectContent></Select><FormMessage /></FormItem> )}/>
                                        <FormField control={form.control} name="isOneTimePurchase" render={({ field }) => ( <FormItem className="flex items-center space-x-3 space-y-0 rounded-xl border p-4 bg-background h-11"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="font-bold text-xs cursor-pointer">Exclusive Item</FormLabel></FormItem>)}/>
                                    </div>
                                    <Button type="submit" className="w-full h-14 text-lg font-black rounded-2xl shadow-xl shadow-primary/20 btn-shine uppercase">COMMIT TO MARKETPLACE</Button>
                                </form>
                            </Form>
                        </div>
                    </div>
                )}
                </ScrollArea>
                <DialogFooter className="p-4 bg-muted/20 border-t"><DialogClose asChild><Button variant="outline" className="h-10 rounded-xl font-bold">Abort Review</Button></DialogClose></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RejectDialog({ product, onReject }: { product: Product, onReject: (product: Product, reason: string) => Promise<void> }) {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [open, setOpen] = useState(false);

    const handleRejectSubmit = async () => {
        if (!reason.trim()) return;
        setIsSubmitting(true);
        await onReject(product, reason);
        setIsSubmitting(false); 
        setOpen(false); 
        setReason('');
    };

    return (
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="destructive" size="sm" className="h-8 rounded-full px-4"><XCircle className="mr-2 h-4 w-4" /> Reject</Button></DialogTrigger>
            <DialogContent className="rounded-[2.5rem]">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Reject Protocol</DialogTitle>
                    <DialogDescription>Please provide a clear reason for rejecting this product.</DialogDescription>
                </DialogHeader>
                <div className="py-6"><Textarea placeholder="Explain to the seller why this product was rejected..." value={reason} onChange={(e) => setReason(e.target.value)} disabled={isSubmitting} className="min-h-[120px] rounded-2xl bg-muted/30 p-5 leading-relaxed" /></div>
                <DialogFooter className="gap-2 flex-col sm:flex-row">
                    <Button variant="destructive" onClick={handleRejectSubmit} disabled={!reason.trim() || isSubmitting} className="rounded-xl font-black px-8">
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirm Rejection
                    </Button>
                    <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl font-bold">Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ApprovedProductCard({ product, onAdminAction }: { product: StoreProduct | Product, onAdminAction: () => void }) {
    const [isApproving, setIsApproving] = useState(false);
    const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
    const { toast } = useToast();
    
    const handleApproveAction = async (originalProduct: Product, updateData: z.infer<typeof approvalFormSchema>) => {
        setIsApproving(true);
        const result = await approveProduct(originalProduct.id, originalProduct, updateData);
        if (result.success) { toast({ title: 'Approved!' }); onAdminAction(); }
        else toast({ variant: 'destructive', title: 'Failed', description: result.message });
        setIsApproving(false);
    };

    const isSold = product.status === 'sold';

    return (
        <Card className={cn("rounded-3xl border-none shadow-sm bg-card/50 overflow-hidden transition-all", isSold && "bg-muted/20 opacity-80")}>
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="relative aspect-video w-full md:w-32 md:h-20 bg-muted rounded-2xl overflow-hidden flex-shrink-0 border">
                    {product.previewImage || (product as any).previews?.[0]?.url ? (
                        <NextImage src={getDisplayUrl(product.previewImage || (product as any).previews?.[0]?.url)} alt="P" fill className="object-cover" unoptimized />
                    ) : <Package className="h-8 w-8 text-muted-foreground m-auto" />}
                    {isSold && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Badge variant="destructive" className="h-5 px-1.5 text-[8px] font-black uppercase">SOLD</Badge>
                        </div>
                    )}
                </div>
                <div className="flex-grow min-w-0">
                    <h3 className="font-bold truncate text-base">{product.title}</h3>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2"><User className="h-3 w-3" /> {product.sellerName}</div>
                    {product.createdAt && <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-2 flex items-center gap-1.5"><Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(product.createdAt), { addSuffix: true })}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <ApprovalDialog productId={product.id} onApprove={handleApproveAction} trigger={<Button variant="secondary" size="sm" className="h-9 rounded-full px-5 font-bold" disabled={isApproving}>{isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Eye className="mr-2 h-4 w-4" /> View</Button>} open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen} />
                </div>
            </CardContent>
        </Card>
    );
}

function ProductCard({ product, onApprove, onReject }: { product: Product, onApprove?: (product: Product, updateData: z.infer<typeof approvalFormSchema>) => void, onReject?: (product: Product, reason: string) => Promise<void> }) {
    const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
    const sellerName = product.sellerName || product.sellerId;
    const previewImage = product.previews?.[0]?.url;
    
    return (
        <Card className="rounded-[2.5rem] overflow-hidden border-primary/5 bg-card/40 backdrop-blur-sm shadow-xl">
            <CardContent className="p-5 flex flex-col md:flex-row items-center gap-5">
                 <div className="relative aspect-video w-full md:w-40 md:h-24 bg-muted rounded-3xl overflow-hidden flex-shrink-0 border-2 border-background shadow-lg">
                    {previewImage ? <NextImage src={getDisplayUrl(previewImage)} alt="P" fill className="object-cover" unoptimized /> : <Package className="h-8 w-8 text-muted-foreground m-auto" />}
                </div>
                <div className="flex-grow w-full min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-black text-lg truncate tracking-tight">{product.title}</h3>
                        {product.status === 'pending_update' && <Badge className="bg-blue-500 text-white text-[9px] font-black h-4 px-1.5">UPDATE</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium"><User className="h-3 w-3" /> {sellerName}</p>
                    {product.createdAt && <p className="text-[10px] text-muted-foreground font-black uppercase mt-2.5 flex items-center gap-2 opacity-60"><Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(product.createdAt), { addSuffix: true })}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                     {(product.status === 'pending' || product.status === 'pending_update' || product.status === 'approved' || product.status === 'sold') && onApprove && onReject && (
                        <>
                            <ApprovalDialog product={product} onApprove={onApprove} trigger={<Button variant="default" size="sm" className="h-9 rounded-full px-5 font-black uppercase text-[10px] tracking-widest">Inspect</Button>} open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen} />
                            <RejectDialog product={product} onReject={onReject} />
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default function AdminProductsPage() {
    const { toast } = useToast();
    const { database } = initializeFirebase();
    const [activeTab, setActiveTab] = useState('pending');
    
    const [pendingProducts, setPendingProducts] = useState<Product[]>([]);
    const [isPendingLoading, setIsPendingLoading] = useState(true);
    
    const [approvedProducts, setApprovedProducts] = useState<StoreProduct[]>([]);
    const [isApprovedLoading, setIsApprovedLoading] = useState(true);
    
    const [rejectedProducts, setRejectedProducts] = useState<Product[]>([]);
    const [isRejectedLoading, setIsRejectedLoading] = useState(true);

    const [soldProducts, setSoldProducts] = useState<Product[]>([]);
    const [isSoldLoading, setIsSoldLoading] = useState(true);

    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (activeTab !== 'pending' || !database) return;
        setIsPendingLoading(true);
        const unsubscribe = onRtdbValue(ref(database, 'pendingProducts'), (snapshot) => {
            const productsArray: Product[] = snapshot.exists() ? Object.values(snapshot.val()) : [];
            productsArray.forEach(p => {
                if (p.previews && !Array.isArray(p.previews)) p.previews = Object.values(p.previews);
                if (p.downloadableFiles && !Array.isArray(p.downloadableFiles)) p.downloadableFiles = Object.values(p.downloadableFiles);
                if (p.scriptPreview && !Array.isArray(p.scriptPreview)) p.scriptPreview = Object.values(p.scriptPreview);
            });
            setPendingProducts(productsArray.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setIsPendingLoading(false);
        });
        return () => unsubscribe();
    }, [database, activeTab, refreshKey]);
    
    useEffect(() => {
        if (activeTab !== 'approved' || !database) return;
        setIsApprovedLoading(true);
        const unsubscribe = onRtdbValue(ref(database, 'storeProducts'), (snapshot) => {
            const productsArray: StoreProduct[] = snapshot.exists() ? Object.values(snapshot.val()) : [];
            setApprovedProducts(productsArray.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setIsApprovedLoading(false);
        });
        return () => unsubscribe();
    }, [database, activeTab, refreshKey]);

    useEffect(() => {
        if (activeTab !== 'rejected') return;
        const fetch = async () => {
            setIsRejectedLoading(true);
            const result = await getProductsByStatus('rejected');
            if (result.success && result.products) setRejectedProducts(result.products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setIsRejectedLoading(false);
        };
        fetch();
    }, [activeTab, refreshKey]);

    useEffect(() => {
        if (activeTab !== 'sold') return;
        const fetch = async () => {
            setIsSoldLoading(true);
            const result = await getProductsByStatus('sold');
            if (result.success && result.products) setSoldProducts(result.products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setIsSoldLoading(false);
        };
        fetch();
    }, [activeTab, refreshKey]);

    const handleApproveAction = async (product: Product, updateData: z.infer<typeof approvalFormSchema>) => {
        const result = await approveProduct(product.id, product, updateData);
        if (result.success) { toast({ title: 'Approved!' }); setRefreshKey(k => k + 1); }
        else toast({ variant: 'destructive', title: 'Failed', description: result.message });
    };

    const handleRejectAction = async (product: Product, reason: string) => {
        const result = await rejectProduct(product.id, product, reason);
        if (result.success) { toast({ title: 'Rejected' }); setRefreshKey(k => k + 1); }
        else toast({ variant: 'destructive', title: 'Failed', description: result.message });
    };

    return (
        <div className="space-y-8 pb-20">
            <h1 className="text-3xl font-black uppercase flex items-center gap-3"><History /> Moderator Hub</h1>
            <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 bg-muted/50 rounded-2xl h-12">
                    <TabsTrigger value="pending" className="rounded-xl font-bold">Pending ({isPendingLoading ? '...' : pendingProducts.length})</TabsTrigger>
                    <TabsTrigger value="approved" className="rounded-xl font-bold">Active</TabsTrigger>
                    <TabsTrigger value="sold" className="rounded-xl font-bold">Sold Out</TabsTrigger>
                    <TabsTrigger value="rejected" className="rounded-xl font-bold">Rejected</TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="mt-8 space-y-6">
                    {isPendingLoading ? <Skeleton className="h-28 w-full rounded-[2rem]" /> : pendingProducts.length > 0 ? pendingProducts.map(p => <ProductCard key={p.id} product={p} onApprove={handleApproveAction} onReject={handleRejectAction} />) : <div className="text-center py-24 border-4 border-dashed rounded-[3rem] opacity-20"><ShoppingCart className="mx-auto h-20 w-20" /><h3 className="mt-6 text-2xl font-black uppercase">Queue Clear</h3></div>}
                </TabsContent>

                <TabsContent value="approved" className="mt-8 space-y-6">
                     {isApprovedLoading ? <Skeleton className="h-28 w-full rounded-[2rem]" /> : approvedProducts.length > 0 ? approvedProducts.map(p => <ApprovedProductCard key={p.id} product={p} onAdminAction={() => setRefreshKey(k => k + 1)} />) : <div className="text-center py-24 border-4 border-dashed rounded-[3rem] opacity-20"><Package className="mx-auto h-12 w-12" /><h3 className="mt-6 text-2xl font-black uppercase">Zero Inventory</h3></div>}
                </TabsContent>

                <TabsContent value="sold" className="mt-8 space-y-6">
                     {isSoldLoading ? <Skeleton className="h-28 w-full rounded-[2rem]" /> : soldProducts.length > 0 ? soldProducts.map(p => <ApprovedProductCard key={p.id} product={p} onAdminAction={() => setRefreshKey(k => k + 1)} />) : <div className="text-center py-24 border-4 border-dashed rounded-[3rem] opacity-20"><ShoppingBag className="mx-auto h-12 w-12" /><h3 className="mt-6 text-2xl font-black uppercase">No Sold Assets</h3></div>}
                </TabsContent>

                 <TabsContent value="rejected" className="mt-8 space-y-6">
                     {isRejectedLoading ? <Skeleton className="h-28 w-full rounded-[2rem]" /> : rejectedProducts.length > 0 ? rejectedProducts.map(p => <ProductCard key={p.id} product={p} onApprove={handleApproveAction} onReject={handleRejectAction} />) : <div className="text-center py-24 border-4 border-dashed rounded-[3rem] opacity-20"><XCircle className="mx-auto h-12 w-12" /><h3 className="mt-6 text-2xl font-black uppercase">No Rejections</h3></div>}
                </TabsContent>
            </Tabs>
        </div>
    );
}
