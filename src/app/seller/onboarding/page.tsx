'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { User, Image as ImageIcon, Loader2, Sparkles, Rocket, Camera, Mail, Phone, Info, QrCode, Upload } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import Image from 'next/image';
import { completeOnboardingAction } from './actions';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Badge } from '@/components/ui/badge';
import { cn, getDisplayUrl, compressImage } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { uploadFileDirectly } from '@/lib/gcs-client';
import { initializeFirebase } from '@/firebase';
import { ref, get } from 'firebase/database';
import type { SellerProfile } from '@/lib/types';
import { reportClientError } from '@/lib/report-client-error';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB Raw, will be compressed

const onboardingSchema = z.object({
  storeName: z.string().min(3, { message: "Store name must be at least 3 characters." }),
  description: z.string().min(20, { message: "Description must be at least 20 characters." }),
  profileImage: z.any().optional(),
  mobileNumber: z.string().min(10, { message: "Please enter a valid mobile number (min 10 digits)." }),
  secondaryEmail: z.string().email({ message: "Please enter a valid secondary email address." }),
  upiId: z.string().regex(/^[\w.-]+@[\w.-]+$/, "Invalid UPI ID format."),
  accountHolderName: z.string().min(2, "Name is required."),
  qrCodeImage: z.any().optional(),
});

export default function SellerOnboardingPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { database } = initializeFirebase();
  const router = useRouter();
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingProfile, setExistingProfile] = useState<SellerProfile | null>(null);

  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const form = useForm<z.infer<typeof onboardingSchema>>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      storeName: "",
      description: "",
      mobileNumber: "",
      secondaryEmail: "",
      upiId: "",
      accountHolderName: "",
    },
  });

  // Pre-fill form if legacy profile exists
  useEffect(() => {
    if (user && database) {
      const profileRef = ref(database, `sellerProfiles/${user.uid}`);
      get(profileRef).then((snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val() as SellerProfile;
          setExistingProfile(data);
          form.reset({
            storeName: data.storeName || "",
            description: data.description || "",
            mobileNumber: data.mobileNumber || "",
            secondaryEmail: data.secondaryEmail || "",
            upiId: data.payoutDetails?.upiId || "",
            accountHolderName: data.payoutDetails?.accountHolderName || "",
          });
          if (data.profileImageUrl) setImagePreview(getDisplayUrl(data.profileImageUrl));
          if (data.payoutDetails?.paymentQrUrl) setQrPreview(getDisplayUrl(data.payoutDetails.paymentQrUrl));
        }
      });
    }
  }, [user, database, form]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast({ variant: 'destructive', title: 'File too large', description: 'Raw image must be less than 10MB.' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setImgSrc(reader.result?.toString() || '');
        setIsCropping(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQrChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        toast({ title: 'Optimizing QR Code...' });
        const compressed = await compressImage(file, 800, 0.70); // QR doesn't need 1280px
        if (qrPreview && !qrPreview.startsWith('http') && !qrPreview.startsWith('/api')) {
            URL.revokeObjectURL(qrPreview);
        }
        setQrPreview(URL.createObjectURL(compressed));
        const dt = new DataTransfer();
        dt.items.add(compressed);
        form.setValue('qrCodeImage', dt.files, { shouldValidate: true });
    }
  };

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
      width,
      height
    );
    setCrop(initialCrop);
    setCompletedCrop({
        unit: 'px',
        x: (initialCrop.x * width) / 100,
        y: (initialCrop.y * height) / 100,
        width: (initialCrop.width * width) / 100,
        height: (initialCrop.height * height) / 100,
    });
  }

  async function handleConfirmCrop() {
    const image = imgRef.current
    if (!image || !completedCrop) return;

    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const croppedFile = new File([blob], 'profile.webp', { type: 'image/webp' });
        
        // Final optimization check
        const optimized = await compressImage(croppedFile, 640, 0.85); // Profiles are small
        
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(optimized);
        form.setValue('profileImage', dataTransfer.files, { shouldValidate: true });
        
        if (imagePreview && !imagePreview.startsWith('http') && !imagePreview.startsWith('/api')) {
            URL.revokeObjectURL(imagePreview);
        }
        setImagePreview(URL.createObjectURL(optimized));
        setIsCropping(false);
      },
      'image/webp',
      0.85
    );
  }

  async function onSubmit(values: z.infer<typeof onboardingSchema>) {
    if (!user) return;
    
    const profileFile = values.profileImage?.[0];
    const qrFile = values.qrCodeImage?.[0];

    if (!profileFile && !existingProfile?.profileImageUrl) {
        toast({ variant: 'destructive', title: 'Photo Missing', description: 'Please upload a profile photo.' });
        return;
    }
    if (!qrFile && !existingProfile?.payoutDetails?.paymentQrUrl) {
        toast({ variant: 'destructive', title: 'QR Missing', description: 'Please upload your payment QR code.' });
        return;
    }

    setIsSubmitting(true);
    try {
        let finalProfileUrl = existingProfile?.profileImageUrl || '';
        if (profileFile) {
            finalProfileUrl = await uploadFileDirectly({
                file: profileFile,
                bucketType: 'public',
                folder: 'profiles',
                userId: user.uid,
                userEmail: user.email || 'N/A'
            });
        }

        let finalQrUrl = existingProfile?.payoutDetails?.paymentQrUrl || '';
        if (qrFile) {
            finalQrUrl = await uploadFileDirectly({
                file: qrFile,
                bucketType: 'public',
                folder: 'payouts',
                userId: user.uid,
                userEmail: user.email || 'N/A'
            });
        }

        const result = await completeOnboardingAction({
            userId: user.uid,
            storeName: values.storeName,
            description: values.description,
            profileImageUrl: finalProfileUrl,
            mobileNumber: values.mobileNumber,
            secondaryEmail: values.secondaryEmail,
            payoutDetails: {
                upiId: values.upiId,
                accountHolderName: values.accountHolderName,
                paymentQrUrl: finalQrUrl,
            }
        });

        if (result.success) {
            toast({ title: "Profile Initialized!", description: "Verification check started." });
            router.push('/seller');
        } else throw new Error(result.error);
    } catch (error: any) {
            reportClientError('src/app/seller/onboarding/page.tsx:252', error);
        toast({ variant: 'destructive', title: 'Initialization Error', description: error.message });
        setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px] animate-aurora" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[30%] h-[30%] rounded-full bg-purple-500/10 blur-[100px] animate-aurora" style={{ animationDelay: '5s' }} />
      </div>

      <div className="container relative z-10 mx-auto max-w-2xl py-12 px-4">
        <div className="flex flex-col items-center text-center mb-12 space-y-4">
            <div className="p-4 bg-primary/10 rounded-3xl shadow-inner">
                <Rocket className="h-12 w-12 text-primary animate-bounce-slow" />
            </div>
            <div className="space-y-2">
                <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase leading-none">Initialize <br className="sm:hidden" /> <span className="text-primary">Seller Node</span></h1>
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] opacity-60">Identity & Payout Verification</p>
            </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 animate-in fade-in duration-700">
              <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-sm overflow-hidden rounded-[2.5rem]">
                  <CardHeader className="bg-primary/5 pb-8 border-b border-primary/10 text-center">
                      <div className="flex flex-col items-center gap-6">
                        <div className="relative group">
                            <div className={cn(
                                "w-32 h-32 rounded-full bg-muted flex items-center justify-center border-4 border-background shadow-2xl overflow-hidden transition-all duration-500 group-hover:scale-105",
                                imagePreview ? "border-primary/20" : "border-dashed"
                            )}>
                                {imagePreview ? (
                                    <Image src={imagePreview} alt="Preview" width={128} height={128} className="object-cover h-full w-full" unoptimized />
                                ) : (
                                    <User className="h-14 w-14 text-muted-foreground/30" />
                                )}
                            </div>
                            <Label htmlFor="profileImage-upload" className="absolute bottom-0 right-0 p-2.5 bg-primary text-white rounded-full shadow-xl cursor-pointer hover:scale-110 active:scale-95 transition-all">
                                <Camera className="h-5 w-5" />
                                <input id="profileImage-upload" type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                            </Label>
                        </div>
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-black uppercase tracking-tight">Store Identity</CardTitle>
                            <CardDescription className="font-bold text-[10px] uppercase tracking-widest">Public facing profile details</CardDescription>
                            <p className="text-[9px] font-bold text-primary uppercase">WebP Optimization node active</p>
                        </div>
                      </div>
                  </CardHeader>
                  <CardContent className="space-y-10 pt-10">
                      <div className="space-y-6">
                        <FormField
                            control={form.control}
                            name="storeName"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="font-black uppercase text-[10px] text-muted-foreground tracking-widest px-1">Store Name *</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., 'Alpha Renders'" className="h-12 text-lg font-bold rounded-2xl border-primary/10 bg-muted/20" {...field} />
                                </FormControl>
                                <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel className="font-black uppercase text-[10px] text-muted-foreground tracking-widest px-1">About Your Work *</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Describe the digital assets you create..." className="min-h-[140px] text-base font-medium rounded-2xl border-primary/10 bg-muted/20 p-5 leading-relaxed" {...field} />
                                </FormControl>
                                <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />
                      </div>

                      <Separator className="opacity-50" />

                      <div className="space-y-6">
                        <div className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-[0.2em] px-1">
                            <Phone className="h-3 w-3" /> Contact Intelligence (Internal Only)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="mobileNumber"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel className="font-black uppercase text-[10px] text-muted-foreground tracking-widest px-1">Mobile Number *</FormLabel>
                                    <FormControl>
                                        <Input placeholder="+91 00000 00000" className="h-11 font-bold rounded-xl border-primary/10 bg-muted/20" {...field} />
                                    </FormControl>
                                    <FormMessage className="text-[10px] font-bold" />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="secondaryEmail"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel className="font-black uppercase text-[10px] text-muted-foreground tracking-widest px-1">Secondary Email *</FormLabel>
                                    <FormControl>
                                        <Input placeholder="name@example.com" type="email" className="h-11 font-bold rounded-xl border-primary/10 bg-muted/20" {...field} />
                                    </FormControl>
                                    <FormMessage className="text-[10px] font-bold" />
                                    </FormItem>
                                )}
                            />
                        </div>
                      </div>

                      <Separator className="opacity-50" />

                      <div className="space-y-6">
                        <div className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-[0.2em] px-1">
                            <QrCode className="h-3 w-3" /> Payout Credentials (Mandatory)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="accountHolderName"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel className="font-black uppercase text-[10px] text-muted-foreground tracking-widest px-1">Account Holder Name *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Your Full Name" className="h-11 font-bold rounded-xl border-primary/10 bg-muted/20" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="upiId"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel className="font-black uppercase text-[10px] text-muted-foreground tracking-widest px-1">UPI ID *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="yourname@bank" className="h-11 font-bold rounded-xl border-primary/10 bg-muted/20 font-mono text-primary" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="flex flex-col items-center gap-4">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Payment QR Code *</Label>
                                <div className="relative group">
                                    <div className={cn(
                                        "w-36 h-36 rounded-[1.5rem] border-4 border-dashed bg-muted/20 flex items-center justify-center overflow-hidden transition-all",
                                        qrPreview ? "border-primary/20" : "border-primary/10"
                                    )}>
                                        {qrPreview ? (
                                            <img src={qrPreview} alt="QR" className="w-full h-full object-contain" />
                                        ) : (
                                            <QrCode className="h-10 w-10 text-muted-foreground/30" />
                                        )}
                                    </div>
                                    <Label htmlFor="qr-upload" className="absolute -bottom-2 -right-2 p-3 bg-primary text-white rounded-xl shadow-xl cursor-pointer hover:scale-110 active:scale-95 transition-all">
                                        <Upload className="h-4 w-4" />
                                        <input id="qr-upload" type="file" className="hidden" accept="image/*" onChange={handleQrChange} />
                                    </Label>
                                </div>
                            </div>
                        </div>
                      </div>
                  </CardContent>
                  <CardFooter className="p-8 border-t bg-muted/10">
                      <Button type="submit" size="lg" className="w-full h-16 text-xl font-black rounded-2xl shadow-2xl shadow-primary/30 btn-shine transition-all active:scale-95" disabled={isSubmitting}>
                          {isSubmitting ? (
                              <><Loader2 className="mr-3 h-6 w-6 animate-spin" /> INITIALIZING...</>
                          ) : (
                              <><Rocket className="mr-3 h-6 w-6" /> COMPLETE SETUP</>
                          )}
                      </Button>
                  </CardFooter>
              </Card>
          </form>
        </Form>
      </div>

      <Dialog open={isCropping} onOpenChange={setIsCropping}>
        <DialogContent className="max-w-2xl rounded-[2.5rem] p-8 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Refine Frame</DialogTitle>
            <DialogDescription className="font-bold">Adjust your profile image centering</DialogDescription>
          </DialogHeader>
           {imgSrc && (
            <div className="flex justify-center bg-muted/50 p-6 rounded-[2rem] border-2 border-dashed mt-4 overflow-hidden">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                minWidth={100}
                minHeight={100}
                circularCrop
              >
                <img
                  ref={imgRef}
                  alt="Crop preview"
                  src={imgSrc}
                  onLoad={onImageLoad}
                  style={{ maxHeight: '60vh', borderRadius: '0.5rem' }}
                  width={800}
                  height={800}
                />
              </ReactCrop>
            </div>
          )}
          <DialogFooter className="mt-8">
            <Button variant="ghost" onClick={() => setIsCropping(false)} className="rounded-xl font-bold h-12">Cancel</Button>
            <Button onClick={handleConfirmCrop} disabled={!completedCrop} className="rounded-xl font-black px-10 h-12 shadow-xl shadow-primary/20">Apply Frame</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
