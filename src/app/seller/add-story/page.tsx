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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Youtube, X, Loader2, Trash2, Sparkles, IndianRupee, Link2, Plus, Clock, Camera, MonitorPlay, Layers, UserCircle, MessageSquare, Volume2, Music, Download, Globe } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { addStoryAction } from './actions';
import { cn, getDisplayUrl, compressImage } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';
import { useRouter } from 'next/navigation';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { uploadFileDirectly as uploadFileViaClient } from '@/lib/gcs-client';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { reportClientError } from '@/lib/report-client-error';

const languages = ["Hindi", "English", "Hinglish", "Bengali", "Marathi", "Telugu", "Tamil", "Gujarati", "Punjabi", "Kannada", "Malayalam", "Bhojpuri"];
const qualityOptions = ["Ultra HD (4K)", "Full HD (1080p)", "Standard HD (720p)", "High Compression (SD)"];
const resolutionOptions = ["Vertical (9:16) - For Shorts/Reels", "Horizontal (16:9) - Standard", "Square (1:1)"];
const frameOptions = ["10-20 Scenes", "20-40 Scenes", "40-60 Scenes", "60+ Scenes"];
const audienceOptions = ["General", "Children", "Teenagers", "Young Adults", "Adults"];
const toneOptions = ["Serious", "Humorous", "Dramatic", "Light-hearted", "Suspenseful", "Inspiring", "Casual"];
const statusOptions = ["Included", "Not Included"];
const minuteOptions = Array.from({ length: 61 }, (_, i) => String(i));
const secondOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const formSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }),
  description: z.string().min(20, { message: "Description must be at least 20 characters." }),
  price: z.coerce.number().min(1, { message: "Price must be at least ₹1." }),
  driveLink: z.string().url({ message: "Please enter a valid Google Drive URL." }),
  minutes: z.string().min(1),
  seconds: z.string().min(1),
  isAiGenerated: z.enum(["yes", "no"]),
  language: z.string().min(1),
  quality: z.string().min(1),
  resolution: z.string().min(1),
  sizeValue: z.string().min(1),
  sizeUnit: z.enum(["MB", "GB"]),
  frameCount: z.string().min(1),
  targetAudience: z.string().min(1),
  emotionalTone: z.string().min(1),
  soundFx: z.string().min(1),
  bgm: z.string().min(1),
});

interface FileWithPreview extends File { preview: string; }

async function addWatermark(canvas: HTMLCanvasElement, logoUrl: string): Promise<void> {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.save();
    const fontSize = Math.max(24, Math.round(canvas.height * 0.08));
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(-Math.PI / 8);
    ctx.font = `bold ${fontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fillText('12Labs Story', 0, 0);
    ctx.restore();
    return new Promise((resolve) => {
        const logo = document.createElement('img'); logo.crossOrigin = 'anonymous'; logo.src = logoUrl;
        logo.onload = () => {
            const h = canvas.height * 0.35; const w = (logo.width / logo.height) * h;
            const padding = Math.max(10, canvas.width * 0.02);
            ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(logo, canvas.width - w - padding, padding, w, h); ctx.restore(); resolve();
        };
        logo.onerror = () => resolve();
    });
}

async function uploadFileDirectly(file: File | Blob, fileName: string, bucketType: 'public' | 'private', folder: string, userId: string, onProgress?: (percent: number) => void): Promise<string> {
    return uploadFileViaClient({
        file,
        fileName,
        bucketType,
        folder,
        userId,
        onProgress
    });
}

export default function AddStoryPage() {
  const { toast } = useToast(); const { user } = useAuth(); const { database } = initializeFirebase(); const router = useRouter();
  const [thumbnailFile, setThumbnailFile] = useState<FileWithPreview | null>(null);
  const [additionalPreviews, setAdditionalPreviews] = useState<FileWithPreview[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [isCropping, setIsCropping] = useState(false);
  const [activeCropTarget, setActiveCropTarget] = useState<'thumbnail' | 'additional'>('thumbnail');
  const [imgSrc, setImgSrc] = useState(''); const [crop, setCrop] = useState<Crop>(); const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [watermarkLogoUrl, setWatermarkLogoUrl] = useState('https://res.cloudinary.com/dde5hm8ng/image/upload/v1779863372/24299-removebg-preview_lhjpvs.png');

  useEffect(() => {
    if (!database) return;
    const logoRef = ref(database, 'settings/landingPage/watermarkLogoUrl');
    onRtdbValue(logoRef, (snapshot) => { const url = snapshot.val(); if (url) setWatermarkLogoUrl(getDisplayUrl(url)); });
  }, [database]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
        title: "", description: "", price: 49, driveLink: "", minutes: "5", seconds: "00", 
        language: "Hindi", quality: "Full HD (1080p)", resolution: "Vertical (9:16) - For Shorts/Reels",
        sizeValue: "", sizeUnit: "MB", frameCount: "20-40 Scenes", targetAudience: "General", emotionalTone: "Serious",
        soundFx: "Included", bgm: "Included", isAiGenerated: "yes"
    },
  });

  const { getRootProps: getThumbProps, getInputProps: getThumbInput } = useDropzone({ onDrop: (f) => { setImgSrc(URL.createObjectURL(f[0])); setActiveCropTarget('thumbnail'); setIsCropping(true); }, accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }, maxFiles: 1 });
  const { getRootProps: getAddProps, getInputProps: getAddInput } = useDropzone({ onDrop: (f) => { setImgSrc(URL.createObjectURL(f[0])); setActiveCropTarget('additional'); setIsCropping(true); }, accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }, maxFiles: 1, disabled: additionalPreviews.length >= 10 });

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
      const initialFile = new File([blob], `preview_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const optimized = await compressImage(initialFile);
      const fileWithPreview = Object.assign(optimized, { preview: URL.createObjectURL(optimized) });
      if (activeCropTarget === 'thumbnail') setThumbnailFile(fileWithPreview);
      else setAdditionalPreviews(prev => [...prev, fileWithPreview]);
      setIsCropping(false);
    }, 'image/webp', 0.85);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!thumbnailFile || !user) return;
    setIsSubmitting(true); setSubmittingStatus('Initializing Sync...'); setUploadProgress(0);
    try {
        const allFiles = [thumbnailFile, ...additionalPreviews]; const imageUrls: string[] = [];
        for (let i = 0; i < allFiles.length; i++) {
            setSubmittingStatus(`Syncing preview ${i + 1}/${allFiles.length}...`);
            const url = await uploadFileDirectly(allFiles[i], allFiles[i].name, 'public', 'store/stories/previews', user.uid, setUploadProgress);
            imageUrls.push(url);
        }
        const duration = `${values.minutes}:${values.seconds} Min`; const videoSize = `${values.sizeValue} ${values.sizeUnit}`;
        const res = await addStoryAction({ 
            ...values, duration, videoSize, isAiGenerated: values.isAiGenerated === 'yes', 
            previews: imageUrls.map(url => ({ type: 'image' as const, url })) 
        } as any, user.uid, user.name || 'Seller');
        if (res.success) router.push('/seller/products'); else throw new Error(res.message);
    } catch (e: any) {
            reportClientError('src/app/seller/add-story/page.tsx:162', e); toast({ variant: 'destructive', title: 'Failed', description: e.message }); }
    finally { setIsSubmitting(false); setSubmittingStatus(''); setUploadProgress(0); }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3"><Youtube className="h-7 w-7 text-red-600" />List Readymade Video</h1>
          <Badge variant="outline" className="w-fit h-5 px-2 text-[8px] font-black uppercase border-red-500/20 text-red-600">WebP Optimized Hub</Badge>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="rounded-[1.5rem] border-primary/10 overflow-hidden shadow-xl">
                    <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">1. Main Thumbnail</CardTitle></CardHeader>
                    <CardContent className="pt-4">{!thumbnailFile ? (<div {...getThumbProps()} className="border-2 border-dashed rounded-[1rem] p-6 text-center cursor-pointer transition-all hover:bg-primary/5 group bg-muted/10"><input {...getThumbInput()} /><Camera className="mx-auto h-10 w-10 text-muted-foreground/30 group-hover:text-primary transition-colors" /><p className="mt-2 text-base font-black text-muted-foreground uppercase tracking-tight">SELECT IMAGE</p></div>) : (<div className="relative aspect-video rounded-[1rem] overflow-hidden border-2 border-primary/10 group shadow-md bg-muted/20"><img src={thumbnailFile.preview} alt="T" className="w-full h-full object-contain" /><div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><Button type="button" variant="destructive" size="icon" className="rounded-xl font-bold" onClick={() => setThumbnailFile(null)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Replace</Button></div></div>)}</CardContent>
                </Card>
                <Card className="rounded-[1.5rem] border-primary/10 overflow-hidden shadow-xl">
                    <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">2. Previews</CardTitle></CardHeader>
                    <CardContent className="pt-4"><ScrollArea className="w-full"><div className="flex gap-3 pb-2">{additionalPreviews.map((p, i) => (<div key={i} className="relative aspect-video w-32 rounded-xl overflow-hidden border-2 border-primary/10 group shrink-0"><img src={p.preview} alt="P" className="w-full h-full object-cover" /><button type="button" onClick={() => setAdditionalPreviews(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-2.5 w-2.5"/></button></div>))}{additionalPreviews.length < 10 && (<div {...getAddProps()} className="aspect-video w-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-primary/5 bg-muted/10 shrink-0"><input {...getAddInput()} /><Plus className="h-5 w-5 text-primary" /></div>)}</div><ScrollBar orientation="horizontal" /></ScrollArea></CardContent>
                </Card>
            </div>
            <Card className="rounded-[1.5rem] border-primary/10 shadow-xl">
              <CardHeader className="bg-primary/5 border-b py-3"><CardTitle className="text-sm font-black uppercase tracking-widest">3. Details</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-6"><FormField control={form.control} name="title" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground px-1">Title *</FormLabel><FormControl><Input placeholder="Title" {...field} className="h-11 rounded-xl bg-muted/10 border-primary/5 font-bold" /></FormControl><FormMessage /></FormItem> )}/><FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground px-1">Description *</FormLabel><FormControl><Textarea placeholder="Story plot..." {...field} className="min-h-[100px] rounded-xl bg-muted/10 border-primary/5"/></FormControl><FormMessage /></FormItem> )}/><FormField control={form.control} name="driveLink" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground px-1 flex items-center gap-1.5"><Link2 className="h-2.5 w-2.5" /> G-Drive Source Link *</FormLabel><FormControl><Input placeholder="https://drive.google.com/..." {...field} className="h-11 rounded-xl bg-muted/10 border-primary/5 font-mono text-[11px] text-primary" /></FormControl><FormMessage /></FormItem> )}/></CardContent>
            </Card>
            <Card className="rounded-[2.5rem] border-primary/10 shadow-xl overflow-hidden">
              <CardHeader className="bg-primary/5 border-b py-4"><CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-3"><MonitorPlay className="h-5 w-5 text-primary" />Buyer Specs Hub</CardTitle></CardHeader>
              <CardContent className="p-8"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <FormField control={form.control} name="language" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground"><Globe className="h-3 w-3 inline mr-1" /> Language</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{languages.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  <FormField control={form.control} name="quality" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground"><Sparkles className="h-3 w-3 inline mr-1" /> Quality</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{qualityOptions.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  <FormField control={form.control} name="resolution" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground"><MonitorPlay className="h-3 w-3 inline mr-1" /> Resolution</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{resolutionOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  <div className="space-y-2"><Label className="font-black uppercase text-[9px] text-muted-foreground"><Download className="h-3 w-3 inline mr-1" /> File Size *</Label><div className="flex gap-2"><FormField control={form.control} name="sizeValue" render={({ field }) => (<FormControl><Input placeholder="500" {...field} className="h-10 rounded-xl bg-muted/10 font-bold" /></FormControl>)} /><FormField control={form.control} name="sizeUnit" render={({ field }) => (<Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 w-20 rounded-xl bg-muted/10 font-black"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl"><SelectItem value="MB">MB</SelectItem><SelectItem value="GB">GB</SelectItem></SelectContent></Select>)} /></div></div>
                  <FormField control={form.control} name="frameCount" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground"><Layers className="h-3 w-3 inline mr-1" /> Density</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{frameOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  <FormField control={form.control} name="targetAudience" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground"><UserCircle className="h-3 w-3 inline mr-1" /> Audience</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{audienceOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  <div className="space-y-2"><Label className="font-black text-[9px] uppercase"><Clock className="h-2.5 w-2.5 inline mr-1" /> Duration</Label><div className="flex items-center gap-2"><FormField control={form.control} name="minutes" render={({ field }) => (<Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl"><ScrollArea className="h-60">{minuteOptions.map(m => <SelectItem key={m} value={m}>{m}m</SelectItem>)}</ScrollArea></SelectContent></Select>)} /><span className="font-black">:</span><FormField control={form.control} name="seconds" render={({ field }) => (<Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl"><ScrollArea className="h-60">{secondOptions.map(s => <SelectItem key={s} value={s}>{s}s</SelectItem>)}</ScrollArea></SelectContent></Select>)} /></div></div>
                  <FormField control={form.control} name="price" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px]">Price (INR)</FormLabel><FormControl><div className="relative"><IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary" /><Input type="number" {...field} className="h-10 pl-9 font-black rounded-xl border-primary/20 bg-muted/5" /></div></FormControl><FormMessage /></FormItem> )}/>
                  <FormField control={form.control} name="isAiGenerated" render={({ field }) => ( <FormItem className="space-y-2"><FormLabel className="font-black text-[9px] uppercase"><MessageSquare className="h-3 w-3 inline mr-1" /> AI Audio</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-2"><FormItem className="flex items-center space-x-0 space-y-0"><FormControl><RadioGroupItem value="yes" id="ai-yes" className="sr-only" /></FormControl><Label htmlFor="ai-yes" className={cn("flex flex-1 items-center justify-center h-9 rounded-xl border cursor-pointer font-black text-[9px] uppercase", field.value === "yes" ? "border-primary bg-primary/5 text-primary" : "opacity-50")}>Yes</Label></FormItem><FormItem className="flex items-center space-x-0 space-y-0"><FormControl><RadioGroupItem value="no" id="ai-no" className="sr-only" /></FormControl><Label htmlFor="ai-no" className={cn("flex flex-1 items-center justify-center h-9 rounded-xl border cursor-pointer font-black text-[9px] uppercase", field.value === "no" ? "border-primary bg-primary/5 text-primary" : "opacity-50")}>No</Label></FormItem></RadioGroup></FormControl></FormItem> )} />
                  <FormField control={form.control} name="soundFx" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><Volume2 className="h-3 w-3" /> Sound FX</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  <FormField control={form.control} name="bgm" render={({ field }) => ( <FormItem><FormLabel className="font-black uppercase text-[9px] text-muted-foreground tracking-widest flex items-center gap-2"><Music className="h-3 w-3" /> BGM</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl">{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                </div></CardContent>
              <CardFooter className="bg-primary/5 p-8 border-t flex flex-col gap-4">
                {isSubmitting && (<div className="w-full space-y-3"><div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/10 rounded-xl w-full animate-pulse"><Loader2 className="h-3 h-3 animate-spin text-primary" /><span className="text-[10px] font-black uppercase text-primary">Syncing with hub...</span></div></div>)}
                <Button type="submit" disabled={isSubmitting} className="w-full h-16 text-lg font-black rounded-2xl btn-shine shadow-xl shadow-primary/30 uppercase">PUBLISH TO HUB</Button>
              </CardFooter>
            </Card>
        </form>
      </Form>
      <Dialog open={isCropping} onOpenChange={setIsCropping}>
        <DialogContent className="max-w-2xl rounded-[1.5rem] p-6 bg-background"><DialogHeader><DialogTitle className="font-black uppercase">Image Calibration</DialogTitle></DialogHeader>{imgSrc && (<div className="flex justify-center bg-muted/50 p-4 rounded-[1rem] border-2 border-dashed mt-2 overflow-hidden"><ReactCrop crop={crop} onChange={setCrop} onComplete={setCompletedCrop} aspect={16/9}><img ref={imgRef} src={imgSrc} onLoad={(e) => { const { width, height } = e.currentTarget; const initialCrop = centerCrop(makeAspectCrop({ unit: '%', width: 100 }, 16 / 9, width, height), width, height); setCrop(initialCrop); setCompletedCrop({ unit: 'px', x: (initialCrop.x * width) / 100, y: (initialCrop.y * height) / 100, width: (initialCrop.width * width) / 100, height: (initialCrop.height * height) / 100 }); }} className="max-h-[50vh] rounded-xl" /></ReactCrop></div>)}<DialogFooter className="mt-6"><Button onClick={handleConfirmCrop} className="w-full h-12 rounded-xl font-black uppercase">Finalize Frame</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}