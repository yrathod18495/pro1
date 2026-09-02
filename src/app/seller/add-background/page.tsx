'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, IndianRupee, Upload, Camera, ImageIcon, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { addBackgroundAction } from './actions';
import { cn, getDisplayUrl, escapeHtml, compressImage } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Label } from '@/components/ui/label';
import LockedToolPage from '@/components/locked-tool-page';
import { useRouter } from 'next/navigation';
import { uploadFileDirectly as uploadFileViaClient } from '@/lib/gcs-client';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Badge } from '@/components/ui/badge';
import { sendToTelegram } from '@/lib/telegram-logger';
import { Progress } from '@/components/ui/progress';
import { reportClientError } from '@/lib/report-client-error';

const formSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }),
  description: z.string().min(20, { message: "Description must be at least 20 characters." }),
  price: z.coerce.number().min(0, { message: "Price must be a valid number." }),
});

interface FileWithPreview extends File {
  preview: string;
}

async function addWatermark(canvas: HTMLCanvasElement, logoUrl: string): Promise<void> {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    const fontSize = Math.max(24, Math.round(canvas.height * 0.08));
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 8);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'; 
    ctx.fillText('12Labs AI', 0, 0);
    ctx.restore();
    return new Promise((resolve) => {
        const logo = document.createElement('img');
        logo.crossOrigin = 'anonymous';
        logo.src = logoUrl;
        logo.onload = () => {
            const h = canvas.height * 0.35; const w = (logo.width / logo.height) * h;
            const padding = Math.max(10, canvas.width * 0.02);
            ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(logo, canvas.width - w - padding, padding, w, h); ctx.restore();
            resolve();
        };
        logo.onerror = () => resolve();
    });
}

/**
 * 🛰️ SECURE DIRECT UPLOADER HELPER (v6.2 - PROGRESS ENABLED)
 * ---------------------------------------
 */
async function uploadFileDirectly(
    file: File | Blob, 
    bucketType: 'public' | 'private', 
    folder: string, 
    userId: string, 
    userEmail: string,
    onProgress?: (percent: number) => void
): Promise<string> {
    return uploadFileViaClient({
        file,
        bucketType,
        folder,
        userId,
        userEmail,
        onProgress
    });
}

export default function AddBackgroundPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { database } = initializeFirebase();
  const router = useRouter();
  
  const [thumbnailFile, setThumbnailFile] = useState<FileWithPreview | null>(null);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [isCropping, setIsCropping] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement | null>(null);
  
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
    defaultValues: { title: "", description: "", price: 49 },
  });

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
      const initialFile = new File([blob], `bg_preview_${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // 🚀 NEURAL COMPRESSION NODE
      const optimizedFile = await compressImage(initialFile);
      const fileWithPreview = Object.assign(optimizedFile, { preview: URL.createObjectURL(optimizedFile) });
      
      setThumbnailFile(fileWithPreview); setIsCropping(false);
    }, 'image/webp', 0.85);
  };

  const { getRootProps: getThumbProps, getInputProps: getThumbInput } = useDropzone({ onDrop: (f) => { setImgSrc(URL.createObjectURL(f[0])); setIsCropping(true); }, accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }, maxFiles: 1 });
  const { getRootProps: getAssetProps, getInputProps: getAssetInput } = useDropzone({ onDrop: (f) => setAssetFile(f[0]), maxFiles: 1 });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !thumbnailFile || !assetFile) { toast({ variant: 'destructive', title: 'Files Missing' }); return; };
    setIsSubmitting(true);
    setSubmittingStatus('Initializing Sync...');
    setUploadProgress(0);
    try {
        setSubmittingStatus('Syncing optimized thumbnail...');
        setUploadProgress(0);
        const thumbUrl = await uploadFileDirectly(thumbnailFile, 'public', 'store/backgrounds/thumbs', user.uid, user.email || 'N/A', setUploadProgress);

        // 🛡️ UNTOUCHED ASSET (No compression for the high-res master)
        setSubmittingStatus('Syncing RAW master background...');
        setUploadProgress(0);
        const assetUrl = await uploadFileDirectly(assetFile, 'private', 'store/backgrounds/masters', user.uid, user.email || 'N/A', setUploadProgress);

        const res = await addBackgroundAction({ ...values, thumbnailUrl: thumbUrl, masterAssetUrl: assetUrl, assetFileName: assetFile.name }, user.uid, user.name!);
        if (res.success) router.push('/seller/products'); else throw new Error(res.message);
    } catch (e: any) {
            reportClientError('src/app/seller/add-background/page.tsx:163', e); toast({ variant: 'destructive', title: "Upload Failed", description: e.message }); }
    finally { setIsSubmitting(false); setSubmittingStatus(''); setUploadProgress(0); }
  }

  if (user && !user.isSeller && user.role !== 'admin') return <LockedToolPage toolName="Background Upload" message="Sellers only." />;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3"><ImageIcon className="h-7 w-7 text-blue-600" />List HD Background</h1>
        <Badge variant="outline" className="w-fit h-5 px-2 text-[8px] font-black uppercase border-blue-500/20 text-blue-600">WebP Optimized Hub</Badge>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="rounded-[1.5rem] border-primary/10 overflow-hidden shadow-xl">
                <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">1. THUMBNAIL (SHOP PREVIEW)</CardTitle></CardHeader>
                <CardContent className="pt-4">{!thumbnailFile ? (<div {...getThumbProps()} className="border-2 border-dashed rounded-[1rem] p-8 text-center cursor-pointer transition-all hover:bg-primary/5 group bg-muted/10"><input {...getThumbInput()} /><Camera className="mx-auto h-10 w-10 text-muted-foreground/30 group-hover:text-primary transition-colors" /><p className="mt-2 text-base font-black text-muted-foreground uppercase">SELECT PREVIEW IMAGE</p></div>) : (<div className="relative aspect-video rounded-[1rem] overflow-hidden border-2 group bg-muted/20"><img src={thumbnailFile.preview} alt="T" className="w-full h-full object-contain" /><Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setThumbnailFile(null)}><Trash2 className="h-4 w-4" /></Button></div>)}</CardContent>
            </Card>
            <Card className="rounded-[1.5rem] border-primary/10 overflow-hidden shadow-xl">
                <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">2. RAW MASTER BACKGROUND ASSET</CardTitle></CardHeader>
                <CardContent className="pt-4">{!assetFile ? (<div {...getAssetProps()} className="border-2 border-dashed rounded-[1rem] p-8 text-center cursor-pointer transition-all hover:bg-blue-500/5 group bg-muted/10"><input {...getAssetInput()} /><Upload className="mx-auto h-10 w-10 text-muted-foreground/30 group-hover:text-blue-600 transition-colors" /><p className="mt-2 text-base font-black text-muted-foreground uppercase">UPLOAD HIGH-RES UNTOUCHED FILE</p></div>) : (<div className="flex items-center gap-4 p-4 rounded-xl bg-blue-500/5 border-2 border-blue-500/20"><Upload className="h-5 w-5 text-blue-600" /><div className="flex-1 min-w-0"><p className="font-black text-sm truncate uppercase">{assetFile.name}</p><p className="text-[9px] font-bold opacity-60">{(assetFile.size / (1024 * 1024)).toFixed(2)} MB</p></div><Button type="button" variant="ghost" size="icon" onClick={() => setAssetFile(null)} className="h-8 w-8 text-destructive"><X className="h-4 w-4" /></Button></div>)}</CardContent>
            </Card>
            <Card className="rounded-[1.5rem] border-primary/10 shadow-xl">
                <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">3. PRICING & IDENTITY</CardTitle></CardHeader>
                <CardContent className="space-y-4 pt-6"><FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] tracking-widest text-muted-foreground px-1">Title *</FormLabel><FormControl><Input placeholder="Name" {...field} className="rounded-xl h-11 bg-muted/10" /></FormControl><FormMessage /></FormItem> )}/><FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] tracking-widest text-muted-foreground px-1">Description *</FormLabel><FormControl><Textarea placeholder="Details..." {...field} className="min-h-[100px] rounded-xl bg-muted/10"/></FormControl><FormMessage /></FormItem> )}/><FormField control={form.control} name="price" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] tracking-widest text-muted-foreground px-1">Price (INR)</FormLabel><FormControl><div className="relative"><IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" /><Input type="number" {...field} className="h-11 pl-10 text-lg font-black rounded-xl border-primary/20" /></div></FormControl><FormMessage /></FormItem> )}/></CardContent>
                <CardFooter className="bg-primary/5 p-6 border-t flex flex-col gap-4">
                  {isSubmitting && submittingStatus && (
                      <div className="w-full space-y-3">
                        <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/10 w-full animate-pulse">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <p className="text-[10px] font-black uppercase text-primary tracking-widest">{submittingStatus}</p>
                        </div>
                        {uploadProgress > 0 && (
                            <div className="px-1 space-y-1.5 animate-in fade-in">
                                <div className="flex justify-between text-[8px] font-black uppercase text-primary/60">
                                    <span>Cloud Transfer Progress</span>
                                    <span>{Math.round(uploadProgress)}%</span>
                                </div>
                                <Progress value={uploadProgress} className="h-1" />
                            </div>
                        )}
                      </div>
                  )}
                  <Button type="submit" disabled={isSubmitting} className="w-full h-14 text-base font-black rounded-xl btn-shine shadow-xl shadow-primary/30 uppercase">{isSubmitting ? 'SYNCHRONIZING...' : 'DEPLOY BACKGROUND'}</Button>
                </CardFooter>
            </Card>
        </form>
      </Form>
      <Dialog open={isCropping} onOpenChange={setIsCropping}>
        <DialogContent className="max-w-2xl rounded-[1.5rem] p-6 border-none shadow-3xl bg-background"><DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tight">Image Calibration</DialogTitle></DialogHeader>{imgSrc && (<div className="flex justify-center bg-muted/50 p-4 rounded-[1rem] border-2 border-dashed mt-2 overflow-hidden shadow-inner"><ReactCrop crop={crop} onChange={setCrop} onComplete={setCompletedCrop} aspect={16 / 9}><img ref={imgRef} src={imgSrc} onLoad={(e) => { const { width, height } = e.currentTarget; const initialCrop = centerCrop(makeAspectCrop({ unit: '%', width: 100 }, 16 / 9, width, height), width, height); setCrop(initialCrop); setCompletedCrop({ unit: 'px', x: (initialCrop.x * width) / 100, y: (initialCrop.y * height) / 100, width: (initialCrop.width * width) / 100, height: (initialCrop.height * height) / 100 }); }} className="max-h-[50vh] rounded-lg" /></ReactCrop></div>)}<DialogFooter className="mt-6"><Button onClick={handleConfirmCrop} className="w-full h-12 rounded-xl font-black uppercase shadow-xl shadow-primary/20">Finalize Frame</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
