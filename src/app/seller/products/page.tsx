'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, PlusCircle, History, Hourglass, CheckCircle, XCircle, AlertTriangle, Edit, Loader2, Trash2, ImagePlus, Lock, RefreshCw, Globe, Sparkles, MonitorPlay, Download, Layers, UserCircle, MessageSquare, Clock, Volume2, Music, Save, Cpu, IndianRupee } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase, useMemoFirebase, useCollection } from '@/firebase';
import { ref, onValue, query as rtdbQuery, orderByChild, equalTo } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { collection, query as firestoreQuery, where, orderBy } from 'firebase/firestore';
import type { Product, ProductPreview } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { updateProductAction, deleteProductAction, updateProductMediaAction, getSellerProductsAction } from './actions';
import { useDropzone, FileRejection } from 'react-dropzone';
import { cn, getDisplayUrl } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { reportClientError } from '@/lib/report-client-error';

interface FileWithPreview extends File {
  preview: string;
}

const productTypes = [ "PC Character", "Green Screen Character", "Premium Background", "Hand Written Script", "Real Voice", "AutoDraft Character", "YouTube Thumbnail", "YouTube Story" ] as const;

const languages = ["Hindi", "English", "Hinglish", "Bengali", "Marathi", "Telugu", "Tamil", "Gujarati", "Punjabi", "Kannada", "Malayalam", "Bhojpuri"];
const qualityOptions = ["Ultra HD (4K)", "Full HD (1080p)", "Standard HD (720p)", "High Compression (SD)"];
const resolutionOptions = ["Vertical (9:16) - For Shorts/Reels", "Horizontal (16:9) - Standard", "Square (1:1)"];
const frameOptions = ["10-20 Scenes", "20-40 Scenes", "40-60 Scenes", "60+ Scenes"];
const audienceOptions = ["General", "Children", "Teenagers", "Young Adults", "Adults"];
const toneOptions = ["Serious", "Humorous", "Dramatic", "Light-hearted", "Suspenseful", "Inspiring", "Casual"];
const statusOptions = ["Included", "Not Included"];

const editFormSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }),
  description: z.string().min(20, { message: "Description must be at least 20 characters." }),
  price: z.coerce.number().min(0, { message: "Price must be a valid number." }),
  productType: z.enum(productTypes, { required_error: "You must select a category." }),
  isOneTimePurchase: z.boolean().default(false),
  language: z.string().optional(),
  quality: z.string().optional(),
  sizeValue: z.string().optional(),
  sizeUnit: z.enum(["MB", "GB"]).optional(),
  resolution: z.string().optional(),
  frameCount: z.string().optional(),
  targetAudience: z.string().optional(),
  emotionalTone: z.string().optional(),
  duration: z.string().optional(),
  isAiGenerated: z.boolean().optional(),
  soundFx: z.string().optional(),
  bgm: z.string().optional(),
});

function EditProductDialog({ product, children }: { product: Product, children: React.ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialSizeParts = useMemo(() => {
    if (!product.videoSize) return { value: '', unit: 'MB' as const };
    const parts = product.videoSize.split(' ');
    return {
        value: parts[0] || '',
        unit: (parts[1] === 'GB' ? 'GB' : 'MB') as 'MB' | 'GB'
    };
  }, [product.videoSize]);

  const form = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      title: product.title,
      description: product.description,
      price: product.price,
      productType: product.productType as any,
      isOneTimePurchase: product.isOneTimePurchase || false,
      language: product.language || 'Hindi',
      quality: product.quality || 'Full HD (1080p)',
      sizeValue: initialSizeParts.value,
      sizeUnit: initialSizeParts.unit,
      resolution: product.resolution || 'Vertical (9:16) - For Shorts/Reels',
      frameCount: product.frameCount || '20-40 Scenes',
      targetAudience: product.targetAudience || 'General',
      emotionalTone: product.emotionalTone || 'Serious',
      duration: product.duration || '0:00 Minutes',
      isAiGenerated: !!product.isAiGenerated,
      soundFx: product.soundFx || 'Included',
      bgm: product.bgm || 'Included',
    },
  });

  const selectedType = form.watch('productType');

  async function onSubmit(values: z.infer<typeof editFormSchema>) {
    if (!user) return;
    setIsSubmitting(true);
    
    const finalSize = values.sizeValue ? `${values.sizeValue} ${values.sizeUnit}` : undefined;
    const { sizeValue, sizeUnit, ...submissionData } = values;

    const result = await updateProductAction(product.id, user.uid, { 
        ...submissionData, 
        videoSize: finalSize 
    } as any);
    
    if (result.success) {
      toast({ title: "Success!" });
      setOpen(false);
    } else {
      toast({ variant: 'destructive', title: "Update Failed", description: result.message });
    }
    setIsSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl overflow-hidden rounded-[2.5rem] p-0 border-none shadow-3xl flex flex-col h-[90vh]">
        <DialogHeader className="p-8 pb-4 border-b bg-muted/20 shrink-0">
          <DialogTitle className="text-2xl font-black uppercase">Edit Product: {product.title}</DialogTitle>
          <DialogDescription className="font-bold text-xs uppercase opacity-60">Updating core metadata will trigger a re-approval cycle.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="p-8 space-y-10 pb-12">
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary tracking-widest border-l-4 border-primary/20 pl-3">General Metadata</div>
                        <FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[10px] text-muted-foreground ml-1">Asset Title *</FormLabel><FormControl><Input {...field} className="rounded-xl h-11 bg-muted/10" /></FormControl><FormMessage /></FormItem> )}/>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField control={form.control} name="productType" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[10px] text-muted-foreground ml-1">Category</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="rounded-xl h-11 bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{productTypes.map(type => ( <SelectItem key={type} value={type}>{type}</SelectItem> ))}</SelectContent></Select><FormMessage /></FormItem> )}/>
                            <FormField control={form.control} name="price" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[10px] text-muted-foreground ml-1">Price (INR)</FormLabel><FormControl><Input type="number" {...field} className="h-11 rounded-xl bg-muted/10 font-black" /></FormControl><FormMessage /></FormItem> )}/>
                        </div>
                        <FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[10px] text-muted-foreground ml-1">Marketing Description</FormLabel><FormControl><Textarea {...field} className="min-h-[100px] rounded-xl bg-muted/10"/></FormControl><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="isOneTimePurchase" render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border-2 border-dashed p-4 bg-muted/5 group"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl><div className="space-y-0.5"><FormLabel className="font-black text-xs uppercase cursor-pointer group-hover:text-primary transition-colors">EXCLUSIVE ONE-TIME SALE</FormLabel><p className="text-[9px] font-bold opacity-40 uppercase">Item is removed from hub after first verified purchase.</p></div></FormItem>)}/>
                    </div>

                    {selectedType === 'YouTube Story' && (
                        <div className="space-y-6 animate-in fade-in duration-500">
                             <div className="flex items-center gap-2 text-[10px] font-black uppercase text-red-600 tracking-widest border-l-4 border-red-500/20 pl-3">Asset Specifications</div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                <FormField control={form.control} name="language" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><Globe className="h-3 w-3" /> Language</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{languages.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                                <FormField control={form.control} name="quality" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><Sparkles className="h-3 w-3" /> Quality</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{qualityOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                                <FormField control={form.control} name="resolution" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><MonitorPlay className="h-3 w-3" /> Resolution</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{resolutionOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                                
                                <div className="space-y-2">
                                    <Label className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2">
                                        <Download className="h-3 w-3" /> File Size *
                                    </Label>
                                    <div className="flex gap-2">
                                        <FormField control={form.control} name="sizeValue" render={({ field }) => (
                                            <FormControl>
                                                <Input placeholder="Value" {...field} className="h-10 rounded-xl bg-muted/10 border-primary/5 font-bold" />
                                            </FormControl>
                                        )} />
                                        <FormField control={form.control} name="sizeUnit" render={({ field }) => (
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-10 w-24 rounded-xl bg-muted/10 border-primary/5 font-black">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="rounded-xl">
                                                    <SelectItem value="MB">MB</SelectItem>
                                                    <SelectItem value="GB">GB</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )} />
                                    </div>
                                </div>

                                <FormField control={form.control} name="frameCount" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><Layers className="h-3 w-3" /> Density</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{frameOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                                <FormField control={form.control} name="targetAudience" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><UserCircle className="h-3 w-3" /> Audience</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{audienceOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                                <FormField control={form.control} name="emotionalTone" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><MessageSquare className="h-3 w-3" /> Tone</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{toneOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                                <FormField control={form.control} name="duration" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><Clock className="h-3 w-3" /> Duration Label</FormLabel><FormControl><Input {...field} className="h-10 rounded-xl bg-muted/10 font-bold" placeholder="e.g. 5:30 Minutes" /></FormControl></FormItem> )} />
                                <FormField control={form.control} name="isAiGenerated" render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-6"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl><FormLabel className="font-black uppercase text-[9px] tracking-widest cursor-pointer">AI AUDIO SYNCED</FormLabel></FormItem> )} />
                                <FormField control={form.control} name="soundFx" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><Volume2 className="h-3 w-3" /> Sound FX</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                                <FormField control={form.control} name="bgm" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><Music className="h-3 w-3" /> BGM</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                             </div>
                        </div>
                    )}
                </form>
            </Form>
        </ScrollArea>
        <DialogFooter className="p-8 border-t bg-muted/30 shrink-0">
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl font-bold h-12">Cancel</Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting} className="rounded-[1.5rem] font-black px-12 h-14 shadow-xl shadow-primary/20 btn-shine uppercase tracking-widest text-[11px] ml-2">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} COMMIT CHANGES
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMediaDialog({ product, children }: { product: Product, children: React.ReactNode }) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentPreviews, setCurrentPreviews] = useState<ProductPreview[]>(product.previews || []);
    const [newFiles, setNewFiles] = useState<FileWithPreview[]>([]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const filesWithPreview = acceptedFiles.map(file => Object.assign(file, { preview: URL.createObjectURL(file) }));
        setNewFiles(prev => [...prev, ...filesWithPreview]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }, maxSize: 10 * 1024 * 1024 });

    const handleSave = async () => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            let newImageUrls: string[] = [];
            if (newFiles.length > 0) {
                toast({ title: `Syncing ${newFiles.length} new previews...` });
                for (const file of newFiles) {
                    const fd = new FormData(); fd.append('file', file); fd.append('type', 'photo');
                    const res: any = await (import('@/lib/telegram-actions').then(m => m.uploadToTelegramAction(fd)));
                    if (res.success && res.fileId) newImageUrls.push(getDisplayUrl(res.fileId));
                }
            }
            const finalPreviews: ProductPreview[] = [...currentPreviews, ...newImageUrls.map(url => ({ type: 'image' as const, url }))];
            const result = await updateProductMediaAction(product.id, user.uid, { previews: finalPreviews });
            if(result.success) setOpen(false); else throw new Error(result.message);
        } catch (error: any) {
            reportClientError('src/app/seller/products/page.tsx:242', error); toast({ variant: 'destructive', title: "Update Failed", description: error.message }); }
        finally { setIsSubmitting(false); }
    };

    useEffect(() => { if (open) { setCurrentPreviews(product.previews || []); setNewFiles([]); } }, [open, product.previews]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Manage Media</DialogTitle></DialogHeader><ScrollArea className="h-[60vh] -mx-6 px-6"><div className="py-4 grid grid-cols-2 md:grid-cols-3 gap-4">{currentPreviews.map((preview, index) => (<div key={index} className="relative group aspect-video bg-muted/20"><Image src={getDisplayUrl(preview.url)} alt="P" layout="fill" className="object-contain rounded-md border" /><Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setCurrentPreviews(prev => prev.filter(p => p.url !== preview.url))}><Trash2 className="h-3 w-3"/></Button></div>))}{newFiles.map((file, index) => (<div key={file.name} className="relative group aspect-video bg-muted/20"><Image src={file.preview} alt="P" layout="fill" className="object-contain rounded-md border" /><Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setNewFiles(prev => prev.filter(f => f.name !== file.name))}><Trash2 className="h-3 w-3"/></Button></div>))}<div {...getRootProps()} className={cn("aspect-video flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-colors", isDragActive ? 'border-primary bg-primary/10' : 'hover:bg-muted/50')}><input {...getInputProps()} /><ImagePlus className="h-8 w-8 text-muted-foreground" /><p className="text-xs text-muted-foreground text-center mt-2">Add images</p></div></div></ScrollArea><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button></DialogFooter></DialogContent>
        </Dialog>
    )
}

function ProductStatusCard({ product, onDelete }: { product: Product; onDelete: (productId: string) => void; }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const handleDeleteConfirm = async () => { setIsDeleting(true); await onDelete(product.id); setIsDeleting(false); };
    const getStatusBadge = () => { switch (product.status) { case 'approved': return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="h-3 w-3 mr-1.5" /> Approved</Badge>; case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Hourglass className="h-3 w-3 mr-1.5" /> Pending</Badge>; case 'pending_update': return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Hourglass className="h-3 w-3 mr-1.5" /> Pending Update</Badge>; case 'rejected': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1.5" /> Rejected</Badge>; default: return <Badge variant="secondary">{product.status}</Badge> } }
    const previewImage = product.previews?.find(p => p.type === 'image')?.url;
    return (
        <Card className="overflow-hidden"><CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">{product.productType === 'Hand Written Script' && product.scriptPreview ? (<div className="relative aspect-video w-full md:w-32 md:h-20 bg-muted rounded-md overflow-hidden flex-shrink-0"><ScrollArea className="h-full"><div className="p-2">{product.scriptPreview.map((line, index) => (<p key={index} className="text-[10px] sm:text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono mt-1 mb-1">{line}</p>))}</div></ScrollArea></div>) : (<div className="relative aspect-video w-full md:w-32 md:h-20 bg-muted rounded-md overflow-hidden flex-shrink-0">{previewImage ? (<Image src={getDisplayUrl(previewImage)} alt="P" fill className="object-contain" unoptimized/>) : <Package className="h-8 w-8 text-muted-foreground m-auto" />}</div>)}<div className="flex-grow w-full"><div className="flex justify-between items-start"><h3 className="font-semibold truncate pr-2">{product.title}</h3>{getStatusBadge()}</div><div className="flex items-center gap-2 mt-1"><p className="text-sm font-bold text-primary">₹{product.price}</p><Badge variant="secondary" className="text-[9px] font-black uppercase h-4 px-1">{product.productType}</Badge></div><p className="text-xs text-muted-foreground">Submitted {formatDistanceToNow(new Date(product.createdAt), { addSuffix: true })}</p></div><div className="flex-shrink-0 flex items-center gap-2 self-end md:self-center">{(product.status === 'approved' || product.status === 'rejected') && (<><EditProductDialog product={product}><Button variant="outline" size="sm" className={cn("h-9 px-4 rounded-xl font-bold gap-2", product.status === 'rejected' ? "text-primary border-primary/20 hover:bg-primary/5" : "")}>{product.status === 'rejected' ? <RefreshCw className="h-4 w-4" /> : <Edit className="h-4 w-4" />}{product.status === 'rejected' ? 'Fix & Resubmit' : 'Edit'}</Button></EditProductDialog><EditMediaDialog product={product}><Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" title="Edit Previews"><ImagePlus className="h-4 w-4" /></Button></EditMediaDialog></>)}<AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" size="icon" className="h-9 w-9 rounded-xl"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Product?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">{isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></CardContent>{product.status === 'rejected' && product.rejectionReason && (<div className="p-4 pt-0 text-sm text-destructive border-t bg-destructive/10"><div className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /><div><strong className="font-semibold">Rejection Reason:</strong><p className="italic">"{product.rejectionReason}"</p></div></div></div>)}</Card>
    )
}

export default function SellerProductsPage() {
    const { user } = useAuth();
    const { database, firestore } = initializeFirebase();
    const { toast } = useToast();
    const [pendingProducts, setPendingProducts] = useState<Product[]>([]);
    const [isLoadingRtdb, setIsLoadingRtdb] = useState(true);
    const [serverProducts, setServerProducts] = useState<Product[]>([]);
    const [isServerLoading, setIsServerLoading] = useState(true);

    // Initial server fetch to guarantee data immediately regardless of client permissions / network state
    const loadProductsFromServer = useCallback(async (uid: string) => {
        setIsServerLoading(true);
        try {
            const res = await getSellerProductsAction(uid);
            if (res.success && res.data) {
                setServerProducts(res.data);
            }
        } catch (err) {
            console.error("Server products fetch error:", err);
        } finally {
            setIsServerLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user?.uid) {
            setIsServerLoading(false);
            setIsLoadingRtdb(false);
            return;
        }

        loadProductsFromServer(user.uid);

        if (!database) {
            setIsLoadingRtdb(false);
            return;
        }

        try {
            const pendingRef = rtdbQuery(ref(database, 'pendingProducts'), orderByChild('sellerId'), equalTo(user.uid));
            const unsubscribe = onRtdbValue(pendingRef, (snapshot) => {
                const data = snapshot.val();
                const productsArray: Product[] = data ? Object.values(data) : [];
                setPendingProducts(productsArray);
                setIsLoadingRtdb(false);
            }, (err) => {
                console.warn("RTDB pendingProducts subscription notice:", err);
                setIsLoadingRtdb(false);
            });
            return () => unsubscribe();
        } catch (e) {
            reportClientError('src/app/seller/products/page.tsx:316', e);
            setIsLoadingRtdb(false);
        }
    }, [user, database, loadProductsFromServer]);

    const historicalProductsQuery = useMemoFirebase(() => {
        if (!user?.uid || !firestore) return null;
        return firestoreQuery(collection(firestore, 'products'), where('sellerId', '==', user.uid));
    }, [user?.uid, firestore]);

    const { data: historicalProducts, isLoading: isLoadingFirestore } = useCollection<Product>(historicalProductsQuery);

    const allProducts = useMemo(() => {
        const combinedMap = new Map<string, Product>();
        
        // Base layer: Server-side preloaded products
        serverProducts.forEach(p => combinedMap.set(p.id, p));

        // Realtime layer: Firestore client snapshot
        (historicalProducts || []).forEach(p => combinedMap.set(p.id, p));

        // Realtime layer: RTDB pending submissions
        pendingProducts.forEach(p => combinedMap.set(p.id, p));

        const combined = Array.from(combinedMap.values());
        combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        return combined;
    }, [serverProducts, historicalProducts, pendingProducts]);

    const isLoading = isServerLoading && isLoadingRtdb && isLoadingFirestore && allProducts.length === 0;

    const handleDeleteProduct = async (productId: string) => {
        if (!user?.uid) return;
        const result = await deleteProductAction(productId, user.uid);
        if (result.success) {
            toast({ title: 'Product Deleted' });
            setServerProducts(prev => prev.filter(p => p.id !== productId));
        } else {
            toast({ variant: 'destructive', title: 'Deletion Failed' });
        }
    };

    return (
    <div className="space-y-8">
        <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold flex items-center gap-3"><Package /> My Products</h1>
            <Button asChild variant="default"><Link href="/seller/add"><PlusCircle className="mr-2 h-4 w-4" /> Add New</Link></Button>
        </div>
        <Card>
            <CardHeader>
                <CardTitle>Your Product Submissions</CardTitle>
                <CardDescription>Track the status of your submitted products here.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : allProducts.length > 0 ? (
                    <div className="space-y-4">
                        {allProducts.map(product => <ProductStatusCard key={product.id} product={product} onDelete={handleDeleteProduct} />)}
                    </div>
                ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                        <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium">No products yet.</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Add your first product to start selling.</p>
                        <Button asChild className="mt-6">
                            <Link href="/seller/add"><PlusCircle className="mr-2 h-4 w-4" /> Add Product</Link>
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
