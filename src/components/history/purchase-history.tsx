
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, getDoc } from 'firebase/firestore';
import type { Order, DownloadableFile, Product, StoreProduct } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { 
    Package, 
    History, 
    Download, 
    Loader2, 
    Link as LinkIcon, 
    FileText, 
    Check, 
    ChevronRight, 
    Printer, 
    FileDown, 
    ShieldCheck as ShieldIcon, 
    X, 
    Eye,
    Clock 
} from 'lucide-react';
import { getSecureDownloadUrls, getProductDetails } from '@/app/store/[productId]/actions';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import Link from 'next/link';
import { Separator } from '../ui/separator';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, getDisplayUrl, formatSafeDate } from '@/lib/utils';
import { downloadScriptAsPdf, downloadScriptAsDocx, downloadScriptAsTxt } from '@/lib/export-script-pdf';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { reportClientError } from '@/lib/report-client-error';

function PurchaseCard({ order }: { order: Order }) {
    const { activeUid } = useAuth();
    const { toast } = useToast();

    const [product, setProduct] = useState<StoreProduct | null>(null);
    const [isLoadingProduct, setIsLoadingProduct] = useState(true);
    const [downloadableFiles, setDownloadableFiles] = useState<DownloadableFile[] | null>(null);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);

    // Script Reader State
    const [fullScript, setFullScript] = useState<string | null>(null);
    const [isLoadingScript, setIsLoadingScript] = useState(false);
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
    
    // Export States
    const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
    const [isDownloadingTxt, setIsDownloadingTxt] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);

    useEffect(() => {
        const fetchProduct = async () => {
            setIsLoadingProduct(true);
            try {
                if (order.productSnapshot) {
                    let previews = order.productSnapshot.previews || [];
                    if (previews && !Array.isArray(previews)) {
                        previews = Object.values(previews);
                    }
                    const previewImage = previews.find((p: any) => p.type === 'image')?.url || order.productSnapshot.previewImage || '';
                    setProduct({ 
                        id: order.productId, 
                        ...order.productSnapshot,
                        previews: previews,
                        previewImage: previewImage
                    } as StoreProduct);
                } else {
                    const { product: fetchedProduct } = await getProductDetails(order.productId, activeUid);
                    if (fetchedProduct) {
                        setProduct(fetchedProduct);
                    }
                }
            } catch (e) {
                console.error("Purchase detail fetch failed:", e);
            } finally {
                setIsLoadingProduct(false);
            }
        };
        fetchProduct();
    }, [order.productId, activeUid]);

    const handleFetchScriptContent = async () => {
        if (fullScript) return fullScript;
        if (!activeUid) return null;

        setIsLoadingScript(true);
        try {
            // SECURE: Retrieve directly from Firestore string field via Server Action
            const result = await getSecureDownloadUrls(order.productId, activeUid);
            if (result.success) {
                if (result.fullScriptContent) {
                    setFullScript(result.fullScriptContent);
                    return result.fullScriptContent;
                }
                
                // Fallback for GCS-based script nodes (resolved via scriptPreviewUrl or downloadableFiles)
                if (result.files && result.files.length > 0) {
                    const scriptFile = result.files.find(f => f.fileName.toLowerCase().endsWith('.txt'));
                    if (scriptFile) {
                        let fetchUrl = getDisplayUrl(scriptFile.url);
                        if (fetchUrl.includes('storage.12labs.in') || fetchUrl.startsWith('pub://')) {
                            const rawPath = fetchUrl.replace(/^https?:\/\/storage\.12labs\.in\//, '').replace(/^pub:\/\//, '');
                            fetchUrl = `/api/download?url=${encodeURIComponent(rawPath)}`;
                        }

                        const res = await fetch(fetchUrl, { cache: 'no-store' });
                        if (res.ok) {
                            const text = await res.text();
                            setFullScript(text);
                            return text;
                        }
                    }
                }
            }
            return null;
        } catch (e) {
            console.error("Failed to fetch script content:", e);
            return null;
        } finally {
            setIsLoadingScript(false);
        }
    };

    const handleReadScript = async () => {
        const content = await handleFetchScriptContent();
        if (content) {
            setIsScriptModalOpen(true);
        } else {
            toast({ variant: 'destructive', title: 'Reader Unavailable', description: 'Could not access the full script node.' });
        }
    };

    const handleDownloadDocx = async () => {
        const content = await handleFetchScriptContent();
        if (!content) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch script content.' });
            return;
        }
        setIsDownloadingDocx(true);
        try {
            toast({ title: 'Generating DOCX...' });
            const title = product?.title || '12Labs Script';
            await downloadScriptAsDocx(title, content);
            toast({ title: 'DOCX Downloaded' });
        } catch (error) {
            reportClientError('src/components/history/purchase-history.tsx:162', error);
            toast({ variant: 'destructive', title: 'DOCX generation failed' });
        } finally {
            setIsDownloadingDocx(false);
        }
    };

    const handleDownloadTxt = async () => {
        const content = await handleFetchScriptContent();
        if (!content) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch script content.' });
            return;
        }
        setIsDownloadingTxt(true);
        try {
            const title = product?.title || '12Labs Script';
            downloadScriptAsTxt(title, content);
            toast({ title: 'TXT Downloaded' });
        } finally {
            setIsDownloadingTxt(false);
        }
    };

    const handlePrint = async () => {
        const content = await handleFetchScriptContent();
        if (!content) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch script content.' });
            return;
        }
        
        setIsPrinting(true);
        let percent = 0;
        const { update, dismiss } = toast({
            title: 'Generating PDF…',
            description: (
                <div className="w-full pt-1 space-y-1.5">
                    <Progress value={percent} className="h-2" />
                    <p className="text-[10px] font-bold text-muted-foreground">{percent}% complete</p>
                </div>
            ),
            duration: 999999,
        });
        try {
            const title = product?.title || '12Labs Script';
            await downloadScriptAsPdf(title, content, undefined, (pct) => {
                percent = pct;
                update({
                    id: '',
                    title: 'Generating PDF…',
                    description: (
                        <div className="w-full pt-1 space-y-1.5">
                            <Progress value={pct} className="h-2" />
                            <p className="text-[10px] font-bold text-muted-foreground">{pct}% complete</p>
                        </div>
                    ),
                    duration: 999999,
                } as any);
            });
            dismiss();
            toast({ title: 'PDF Downloaded' });
        } catch (error) {
            dismiss();
            console.error("PDF generation failed:", error);
            toast({ variant: 'destructive', title: 'PDF generation failed' });
        } finally {
            setIsPrinting(false);
        }
    };

    const handleToggleFiles = async (open: boolean) => {
        if (!open) return;
        if (downloadableFiles || fullScript) return;
        if (!activeUid) return;

        setIsLoadingFiles(true);
        const result = await getSecureDownloadUrls(order.productId, activeUid);
        if (result.success) {
            if (result.files) setDownloadableFiles(result.files);
            if (result.fullScriptContent) setFullScript(result.fullScriptContent);
        } else {
            toast({ variant: 'destructive', title: 'Access Denied', description: result.message });
        }
        setIsLoadingFiles(false);
    };

    if (isLoadingProduct) return <Skeleton className="h-48 w-full rounded-2xl" />;
    if (!product) { 
        return (
            <Card className="overflow-hidden rounded-[2rem] border-destructive/20 shadow-lg bg-card transition-all opacity-80">
                <CardContent className="p-0">
                    <div className="flex flex-col">
                        <div className="relative h-48 w-full bg-muted flex flex-col items-center justify-center text-muted-foreground">
                            <Package className="h-10 w-10 mb-2 opacity-50" />
                            <p className="text-sm font-bold">Product Removed</p>
                        </div>
                        <div className="p-5 flex flex-col gap-4">
                            <div>
                                <h3 className="font-bold text-lg line-clamp-2 text-foreground">
                                    {order.productTitle || 'Unknown Product'}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-1">This asset has been removed by the seller.</p>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-4 border-t border-border/50">
                                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                    {order.paymentMethod === 'free' ? 'Free' : (order.paymentMethod === 'credits' ? `💎 ${order.amount / 100}` : `₹${order.amount / 100}`)}
                                </Badge>
                                <div className="text-xs text-muted-foreground flex items-center">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        ); 
    }

    const isScript = product.productType === 'Hand Written Script' || product.productType === 'YouTube Story';
    const previewImage = product.previews?.find(p => p.type === 'image')?.url;

    return (
        <>
            <Card className="overflow-hidden rounded-[2rem] border-primary/10 shadow-lg bg-card transition-all hover:shadow-xl group">
                <CardContent className="p-0">
                    <div className="flex flex-col">
                        <Link href={`/store/${product.id}`} className="relative h-48 w-full bg-muted overflow-hidden">
                            {previewImage ? (
                                <Image 
                                    src={getDisplayUrl(previewImage)} 
                                    alt={product.title} 
                                    fill 
                                    className="object-cover transition-transform duration-500 group-hover:scale-105" 
                                    unoptimized
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Package className="h-12 w-12 text-muted-foreground/30" />
                                </div>
                            )}
                            <div className="absolute top-4 right-4">
                                <Badge variant="secondary" className="bg-background/80 backdrop-blur-md font-bold border-none shadow-sm">
                                    {product.productType}
                                </Badge>
                            </div>
                        </Link>
                        
                        <div className="p-6 space-y-4">
                            <div>
                                <Link href={`/store/${product.id}`} className="hover:text-primary transition-colors">
                                    <h3 className="font-black text-xl leading-tight line-clamp-2">{product.title}</h3>
                                </Link>
                                <p className="text-sm text-muted-foreground font-medium mt-1">by {product.sellerName}</p>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                    Purchased on {formatSafeDate(order.createdAt, 'MMM d, yyyy')}
                                </div>
                                <div className="flex gap-2">
                                    <Popover onOpenChange={(open) => {
                                        if (open) {
                                            handleToggleFiles(true);
                                            if (isScript) handleFetchScriptContent();
                                        }
                                    }}>
                                        <PopoverTrigger asChild>
                                            <Button 
                                                size="sm" 
                                                className="h-9 px-6 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest gap-2 shadow-xl shadow-primary/20 btn-shine"
                                            >
                                                {isLoadingFiles ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                                GET ASSETS
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80 rounded-[1.5rem] p-4 shadow-3xl border-primary/10" align="end">
                                            <div className="space-y-4">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-primary px-1">Authorized Access</p>
                                                
                                                {isScript && (
                                                    <div className="space-y-3">
                                                        <Button 
                                                            variant="secondary" 
                                                            className="w-full justify-start gap-3 h-11 rounded-xl font-bold text-xs bg-primary/5 text-primary border-primary/10"
                                                            onClick={handleReadScript}
                                                            disabled={isLoadingScript}
                                                        >
                                                            {isLoadingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                                            Read Online
                                                        </Button>
                                                        
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <Button variant="outline" size="sm" className="h-10 rounded-xl text-[10px] font-black" onClick={handleDownloadDocx} disabled={isLoadingScript || isDownloadingDocx}>.DOCX</Button>
                                                            <Button variant="outline" size="sm" className="h-10 rounded-xl text-[10px] font-black" onClick={handleDownloadTxt} disabled={isLoadingScript || isDownloadingTxt}>.TXT</Button>
                                                            <Button variant="outline" size="sm" className="h-10 rounded-xl text-[10px] font-black" onClick={handlePrint} disabled={isLoadingScript || isPrinting}>PDF</Button>
                                                        </div>
                                                        <Separator className="opacity-50" />
                                                    </div>
                                                )}

                                                <div className="space-y-2">
                                                    {isLoadingFiles ? (
                                                        <div className="py-4 flex flex-col items-center gap-2">
                                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                            <span className="text-[10px] font-bold uppercase opacity-50">Syncing...</span>
                                                        </div>
                                                    ) : (
                                                        downloadableFiles?.map((file, i) => (
                                                            <Button 
                                                                key={i} 
                                                                asChild 
                                                                variant="ghost" 
                                                                className="w-full justify-start gap-3 h-11 rounded-xl font-bold text-xs hover:bg-primary/5 transition-all"
                                                            >
                                                                <a href={file.url} download={file.fileName} target="_blank" rel="noopener noreferrer">
                                                                    <Download className="h-4 w-4" />
                                                                    {file.fileName.length > 20 ? file.fileName.slice(0, 17) + '...' : file.fileName}
                                                                </a>
                                                            </Button>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isScriptModalOpen} onOpenChange={setIsScriptModalOpen}>
                <DialogContent className="max-w-4xl w-[95vw] sm:w-full h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2rem] sm:rounded-[3rem] border-none shadow-3xl">
                    <DialogHeader className="p-6 sm:p-8 pb-4 border-b shrink-0 bg-muted/20 relative">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <FileText className="h-6 w-6 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1 pr-8">
                                <DialogTitle className="text-xl sm:text-2xl font-black truncate">{product.title}</DialogTitle>
                                <DialogDescription className="font-bold text-[10px] uppercase tracking-widest">Authorized Reader Mode</DialogDescription>
                            </div>
                        </div>
                        <DialogClose className="absolute right-4 top-4 rounded-full p-2 hover:bg-muted transition-all">
                            <X className="h-5 w-5" />
                        </DialogClose>
                    </DialogHeader>
                    
                    <ScrollArea className="flex-1 bg-background">
                        <div className="p-6 sm:p-12">
                            <div className="max-w-2xl mx-auto">
                                <pre className="text-base sm:text-lg leading-relaxed font-medium whitespace-pre-wrap font-sans text-foreground/90">
                                    {fullScript || 'Syncing full manuscript node...'}
                                </pre>
                            </div>
                        </div>
                    </ScrollArea>

                    <DialogFooter className="p-4 sm:p-8 bg-muted/10 border-t shrink-0 flex flex-col sm:flex-row items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase px-2 flex-1">
                            <ShieldIcon className="h-4 w-4 text-green-600" /> End-to-End Encryption Active
                        </div>
                        <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                            <Button variant="outline" size="sm" className="h-11 rounded-xl font-bold gap-2" onClick={handleDownloadTxt} disabled={isDownloadingTxt}>
                                {isDownloadingTxt ? <Loader2 className="h-4 w-4 animate-spin"/> : <FileDown className="h-4 w-4" />}
                                .TXT
                            </Button>
                            <Button variant="outline" size="sm" className="h-11 rounded-xl font-bold gap-2" onClick={handleDownloadDocx} disabled={isDownloadingDocx}>
                                {isDownloadingDocx ? <Loader2 className="h-4 w-4 animate-spin"/> : <FileDown className="h-4 w-4" />}
                                .DOCX
                            </Button>
                            <Button variant="outline" size="sm" className="h-11 rounded-xl font-bold gap-2" onClick={handlePrint} disabled={isPrinting}>
                                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin"/> : <FileText className="h-4 w-4" />}
                                PDF
                            </Button>
                        </div>
                        <Button variant="secondary" onClick={() => setIsScriptModalOpen(false)} className="w-full sm:w-auto rounded-xl font-black h-11 px-8">Close Reader</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export function PurchaseHistory() {
  const { activeUid, loading: authLoading } = useAuth();
  const { firestore } = initializeFirebase();

  const ordersQuery = useMemoFirebase(() => {
    if (!activeUid || !firestore) return null;
    return query(collection(firestore, 'storeHistory'), where('userId', '==', activeUid));
  }, [firestore, activeUid]);

  const { data: orders, isLoading } = useCollection<Order>(ordersQuery);

  if (authLoading || isLoading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-[2rem]" />)}
    </div>
  );

  if (!orders || orders.length === 0) {
      return (
          <div className="text-center py-24 border-4 border-dashed rounded-[3rem] opacity-30">
              <History className="mx-auto h-16 w-16 text-muted-foreground mb-6" />
              <h3 className="text-xl font-black uppercase tracking-widest">No Purchases</h3>
              <p className="text-sm font-bold text-muted-foreground mt-2">Explore the Digital Store to find assets.</p>
              <Button asChild className="mt-8 rounded-xl font-bold px-8">
                  <Link href="/store">Visit Store</Link>
              </Button>
          </div>
      );
  }

  const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-12">
        {sortedOrders.map(order => (
            <PurchaseCard key={order.id} order={order} />
        ))}
    </div>
  );
}
