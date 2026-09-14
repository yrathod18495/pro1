'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, IndianRupee, Sparkles, Camera, Upload, Database, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/auth-provider';
import { addScriptAction } from './actions';
import { useRouter } from 'next/navigation';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import React, { useCallback } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getDisplayUrl, cn, compressImage } from '@/lib/utils';
import { uploadFileDirectly as uploadFileViaClient } from '@/lib/gcs-client';
import { sendToTelegram } from '@/lib/telegram-logger';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { reportClientError } from '@/lib/report-client-error';

const formSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }),
  description: z.string().min(20, { message: "Description must be at least 20 characters." }).max(1000, "Description cannot be more than 1000 characters."),
  thumbnail: z.any().refine(files => files?.length === 1, 'Thumbnail image is required.'),
  price: z.coerce.number().min(1, { message: "Price must be at least ₹1." }),
  scriptContent: z.string().min(100, { message: "Script content must be at least 100 characters." }),
});

async function addWatermark(canvas: HTMLCanvasElement, logoUrl: string): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    const fontSize = Math.max(24, Math.round(canvas.height * 0.08));
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'; 
    ctx.fillText('12Labs AI', 0, 0);
    ctx.restore();
    return new Promise((resolve) => {
        const logo = document.createElement('img'); logo.crossOrigin = 'anonymous'; logo.src = logoUrl;
        logo.onload = () => {
            const h = canvas.height * 0.35; const w = (logo.width / logo.height) * h;
            const padding = Math.max(10, canvas.width * 0.02);
            ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(logo, canvas.width - w - padding, padding, w, h);
            ctx.restore(); resolve();
        };
        logo.onerror = () => resolve();
    });
}

async function uploadFileDirectly(
    file: File | Blob, 
    fileName: string,
    bucketType: 'public' | 'private', 
    folder: string, 
    userId: string, 
    userEmail: string,
    onProgress?: (percent: number) => void
): Promise<string> {
    return uploadFileViaClient({
        file,
        fileName,
        bucketType,
        folder,
        userId,
        userEmail,
        onProgress
    });
}

export default function AddScriptPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { database } = initializeFirebase();
  const [watermarkLogoUrl, setWatermarkLogoUrl] = useState('https://res.cloudinary.com/dde5hm8ng/image/upload/v1779863372/24299-removebg-preview_lhjpvs.png');

  useEffect(() => {
    if (!database) return;
    const logoRef = ref(database, 'settings/landingPage/watermarkLogoUrl');
    onRtdbValue(logoRef, (snapshot) => {
        const url = snapshot.val(); if (url) setWatermarkLogoUrl(getDisplayUrl(url));
    });
  }, [database]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "", price: 49, scriptContent: "" },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => { setImgSrc(reader.result?.toString() || ''); setIsCropping(true); };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmCrop = async () => {
    const image = imgRef.current; if (!image || !completedCrop) return;
    const canvas = document.createElement('canvas'); const scaleX = image.naturalWidth / image.width; const scaleY = image.naturalHeight / image.height;
    canvas.width = completedCrop.width * scaleX; canvas.height = completedCrop.height * scaleY;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, completedCrop.x * scaleX, completedCrop.y * scaleY, completedCrop.width * scaleX, completedCrop.height * scaleY, 0, 0, canvas.width, canvas.height);
    await addWatermark(canvas, watermarkLogoUrl);
    canvas.toBlob(async (blob) => {
        if (!blob) return;
        const initialFile = new File([blob], `script_thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const f = await compressImage(initialFile);
        const dataTransfer = new DataTransfer(); dataTransfer.items.add(f);
        form.setValue('thumbnail', dataTransfer.files, { shouldValidate: true });
        setImagePreview(URL.createObjectURL(f)); setIsCropping(false);
    }, 'image/webp', 0.90);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !user.name || !values.thumbnail?.[0]) return;
    setIsSubmitting(true);
    setSubmittingStatus('Initializing Direct Sync...');
    setUploadProgress(0);
    try {
        setSubmittingStatus('Syncing thumbnail...');
        const thumbUrl = await uploadFileDirectly(values.thumbnail[0], values.thumbnail[0].name, 'public', 'store/scripts/thumbs', user.uid, user.email || 'N/A', setUploadProgress);

        setSubmittingStatus('Generating public preview node...');
        const totalChars = values.scriptContent.length;
        const previewCharCount = Math.floor(totalChars * 0.30);
        let cutOffIndex = values.scriptContent.lastIndexOf(' ', previewCharCount);
        if (cutOffIndex === -1 || cutOffIndex < 100) cutOffIndex = previewCharCount;
        const previewText = values.scriptContent.substring(0, cutOffIndex) + (totalChars > cutOffIndex ? "\n\n[LOCKED_LINE]" : "");
        
        setSubmittingStatus('Deploying public preview node...');
        setUploadProgress(0);
        const previewBlob = new Blob([previewText], { type: 'text/plain' });
        const previewUrl = await uploadFileDirectly(previewBlob, 'preview.txt', 'public', 'store/scripts/previews', user.uid, user.email || 'N/A', setUploadProgress);

        setSubmittingStatus('Syncing master manuscript...');
        setUploadProgress(0);
        const sanitizedTitle = values.title.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').trim();
        const scriptFileName = `${sanitizedTitle || 'script'}.txt`;
        const scriptBlob = new Blob([values.scriptContent], { type: 'text/plain' });
        const scriptUrl = await uploadFileDirectly(scriptBlob, scriptFileName, 'private', 'store/scripts/masters', user.uid, user.email || 'N/A', setUploadProgress);

        const res = await addScriptAction({ 
            ...values, 
            thumbnailUrl: thumbUrl, 
            scriptFileUrl: scriptUrl,
            scriptPreviewUrl: previewUrl,
            // Primary preview source: rides free with the product doc/RTDB
            // node (no separate file fetch needed on the store page).
            scriptPreview: previewText.split('\n'),
        }, user.uid, user.name);

        if (res.success) router.push('/seller/products'); else throw new Error(res.message);
    } catch (e: any) {
            reportClientError('src/app/seller/add-script/page.tsx:174', e); toast({ variant: 'destructive', title: "Upload Failed", description: e.message }); }
    finally { setIsSubmitting(false); setSubmittingStatus(''); setUploadProgress(0); }
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3"><FileText className="h-8 w-8 text-primary" /> List Script Item</h1>
        <Badge variant="outline" className="w-fit h-5 px-2 text-[8px] font-black uppercase border-primary/20 text-primary">GCS PROTOCOL ACTIVE</Badge>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 animate-in fade-in duration-700">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                <Card className="rounded-[2rem] border-primary/10 overflow-hidden shadow-xl">
                    <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">1. Basic Info</CardTitle></CardHeader>
                    <CardContent className="space-y-6 pt-8"><FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[10px] text-muted-foreground ml-1">Title *</FormLabel><FormControl><Input placeholder="Script name" {...field} className="h-12 rounded-xl bg-muted/20 border-primary/5 font-bold" /></FormControl><FormMessage /></FormItem> )}/><FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[10px] text-muted-foreground ml-1">Description *</FormLabel><FormControl><Textarea placeholder="Genre, plot, etc." {...field} className="min-h-[120px] rounded-xl bg-muted/20 border-primary/5"/></FormControl><FormMessage /></FormItem> )}/></CardContent>
                </Card>
                <Card className="rounded-[2rem] border-primary/10 overflow-hidden shadow-xl">
                    <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">2. Content Node</CardTitle></CardHeader>
                    <CardContent className="pt-8"><FormField control={form.control} name="scriptContent" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[10px] text-muted-foreground ml-1">Full Script Text *</FormLabel><FormControl><Textarea className="min-h-[400px] font-mono text-sm rounded-xl bg-muted/10 p-6 leading-relaxed border-primary/10 shadow-inner" placeholder="SPEAKER: Content..." {...field} /></FormControl><FormMessage /></FormItem> )}/></CardContent>
                </Card>
            </div>
            <div className="space-y-8">
                <Card className="rounded-[2rem] border-primary/10 overflow-hidden shadow-xl">
                    <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">3. Marketplace Thumbnail</CardTitle></CardHeader>
                    <CardContent className="pt-8 flex flex-col items-center"><div className="relative w-full aspect-video rounded-[1.5rem] bg-muted/30 border-4 border-dashed flex flex-col items-center justify-center overflow-hidden transition-all hover:bg-muted/5 group border-primary/10">{imagePreview ? (<><img src={imagePreview} className="object-cover w-full h-full" alt="P" /><div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Button type="button" variant="secondary" size="sm" className="rounded-xl font-bold" onClick={() => setImagePreview(null)}>Replace</Button></div></>) : (<><Camera className="h-10 w-10 text-muted-foreground/30 mb-2" /><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Upload Preview</p></>)}<input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageChange} /></div></CardContent>
                </Card>
                <Card className="rounded-[2rem] border-primary/10 overflow-hidden shadow-xl bg-gradient-to-br from-background to-primary/5">
                    <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">4. Pricing</CardTitle></CardHeader>
                    <CardContent className="space-y-6 pt-8"><FormField control={form.control} name="price" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-muted-foreground ml-1 text-[10px]">Price (INR)</FormLabel><FormControl><div className="relative"><IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" /><Input type="number" {...field} className="h-14 pl-10 text-2xl font-black rounded-2xl border-primary/20 bg-background shadow-inner" /></div></FormControl><FormMessage /></FormItem> )}/></CardContent>
                    <CardFooter className="bg-primary/5 p-8 border-t border-primary/10 flex flex-col gap-4">
                        {isSubmitting && submittingStatus && (
                            <div className="w-full space-y-3">
                                <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-xl w-full animate-pulse">
                                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                    <span className="text-[10px] font-black uppercase text-primary">{submittingStatus}</span>
                                </div>
                                {uploadProgress > 0 && (
                                    <div className="px-1 space-y-1.5 animate-in fade-in">
                                        <div className="flex justify-between text-[8px] font-black uppercase text-primary/60">
                                            <span>Sync Progress</span>
                                            <span>{Math.round(uploadProgress)}%</span>
                                        </div>
                                        <Progress value={uploadProgress} className="h-1" />
                                    </div>
                                )}
                            </div>
                        )}
                        <Button type="submit" disabled={isSubmitting} className="w-full h-16 text-lg font-black rounded-2xl btn-shine shadow-2xl shadow-primary/30 uppercase">{isSubmitting ? 'SYNCHRONIZING...' : <><Sparkles className="mr-3 h-6 w-6 fill-current" /> SUBMIT FOR REVIEW</>}</Button>
                    </CardFooter>
                </Card>
            </div>
          </div>
        </form>
      </Form>
      <Dialog open={isCropping} onOpenChange={setIsCropping}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] p-8 border-none shadow-3xl bg-background"><DialogHeader><DialogTitle className="text-2xl font-black uppercase tracking-tight">HD Image Studio</DialogTitle></DialogHeader>{imgSrc && (<div className="flex justify-center bg-muted/50 p-6 rounded-[2rem] border-2 border-dashed mt-4 overflow-hidden shadow-inner"><ReactCrop crop={crop} onChange={setCrop} onComplete={setCompletedCrop} aspect={16/9}><img ref={imgRef} src={imgSrc} onLoad={(e) => { const { width, height } = e.currentTarget; const initialCrop = centerCrop(makeAspectCrop({ unit: '%', width: 100 }, 16 / 9, width, height), width, height); setCrop(initialCrop); setCompletedCrop({ unit: 'px', x: (initialCrop.x * width) / 100, y: (initialCrop.y * height) / 100, width: (initialCrop.width * width) / 100, height: (initialCrop.height * height) / 100 }); }} className="max-h-[50vh] rounded-xl" /></ReactCrop></div>)}<DialogFooter className="mt-8"><Button onClick={handleConfirmCrop} className="w-full h-14 rounded-2xl font-black uppercase shadow-xl shadow-primary/20">Calibrate Frame</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
