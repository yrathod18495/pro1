
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { User, Image as ImageIcon, Loader2, Settings, Upload } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import Image from 'next/image';
import { updateSellerProfileAction } from './actions';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { SellerProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { uploadFileDirectly } from '@/lib/gcs-client';
import { cn, getDisplayUrl } from '@/lib/utils';
import { reportClientError } from '@/lib/report-client-error';

const settingsSchema = z.object({
  storeName: z.string().min(3, { message: "Store name must be at least 3 characters." }),
  description: z.string().min(20, { message: "Description must be at least 20 characters." }),
  profileImage: z.any().optional(),
  mobileNumber: z.string().min(10, "Mobile number is required."),
  secondaryEmail: z.string().email({ message: "Please enter a valid email." }),
});

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

export default function SellerSettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { database } = initializeFirebase();
  const router = useRouter();
  
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      storeName: "",
      description: "",
      mobileNumber: "",
      secondaryEmail: "",
    },
  });
  
  useEffect(() => {
    if (user && database) {
      const profileRef = ref(database, `sellerProfiles/${user.uid}`);
      const unsubscribe = onRtdbValue(profileRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val() as SellerProfile;
          setProfile(data);
          form.reset({
            storeName: data.storeName,
            description: data.description,
            mobileNumber: data.mobileNumber || '',
            secondaryEmail: data.secondaryEmail || '',
          });
          setImagePreview(getDisplayUrl(data.profileImageUrl));
        }
        setIsLoadingProfile(false);
      });
      return () => unsubscribe();
    }
  }, [user, database, form]);


  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCrop(undefined); // Reset crop state
      const reader = new FileReader();
      reader.onload = () => {
        setImgSrc(reader.result?.toString() || '');
        setIsCropping(true);
      };
      reader.readAsDataURL(file);
    }
  };

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    setCrop(centerAspectCrop(width, height, 1))
  }

  async function handleConfirmCrop() {
    const image = imgRef.current
    if (!image || !completedCrop) {
      return
    }

    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const pixelRatio = window.devicePixelRatio;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('No 2d context');

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );
    
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const croppedFile = new File([blob], 'profile.jpg', { type: 'image/jpeg' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(croppedFile);
        form.setValue('profileImage', dataTransfer.files, { shouldValidate: true });
        
        if (imagePreview && !imagePreview.startsWith('http') && !imagePreview.startsWith('/api')) {
            URL.revokeObjectURL(imagePreview);
        }
        setImagePreview(URL.createObjectURL(croppedFile));
        setIsCropping(false);
      },
      'image/jpeg'
    );
  }

  async function onSubmit(values: z.infer<typeof settingsSchema>) {
    if (!user) return;
    setIsSubmitting(true);
    
    try {
        let finalImageUrl = profile?.profileImageUrl;
        const newProfileImageFile = values.profileImage?.[0];

        if (newProfileImageFile) {
            toast({ title: "Syncing new profile picture..." });
            
            // Use secure client-side signed URL upload
            const cloudUrl = await uploadFileDirectly({
                file: newProfileImageFile,
                bucketType: 'public',
                folder: 'profiles',
                userId: user.uid,
                userEmail: user.email || 'N/A'
            });
            finalImageUrl = cloudUrl;
        }
        
        const result = await updateSellerProfileAction(user.uid, {
            storeName: values.storeName,
            description: values.description,
            profileImageUrl: finalImageUrl,
            mobileNumber: values.mobileNumber || '',
            secondaryEmail: values.secondaryEmail || '',
        });

        if (result.success) {
            toast({ title: "Profile Updated!" });
        } else throw new Error(result.error);
    } catch (error: any) {
            reportClientError('src/app/seller/settings/page.tsx:208', error);
         toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  if (isLoadingProfile) {
      return (
        <div className="space-y-8">
            <Skeleton className="h-10 w-64" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <Skeleton className="h-64 w-full" />
                </div>
                <div className="lg:col-span-2 space-y-8">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-56 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            </div>
        </div>
      )
  }

  return (
    <>
    <div className="space-y-8">
      <h1 className="text-3xl font-bold flex items-center gap-3"><Settings /> Seller Settings</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle>Profile Photo</CardTitle>
                            <CardDescription>A circular 1:1 image for your store.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center gap-6">
                            <Avatar className="h-36 w-36 border-2">
                                <AvatarImage src={imagePreview || undefined} alt={form.getValues('storeName')} />
                                <AvatarFallback>
                                    <User className="h-16 w-16 text-muted-foreground" />
                                </AvatarFallback>
                            </Avatar>
                             <FormField
                                control={form.control}
                                name="profileImage"
                                render={({ field }) => (
                                    <FormItem className="w-full">
                                        <FormLabel htmlFor="profileImage-upload" className="w-full">
                                             <Button asChild variant="outline" className="w-full cursor-pointer">
                                                <div>
                                                    <Upload className="mr-2 h-4 w-4" /> Change Photo
                                                </div>
                                            </Button>
                                        </FormLabel>
                                        <FormControl>
                                            <input
                                                id="profileImage-upload"
                                                type="file"
                                                className="hidden"
                                                accept="image/png, image/jpeg, image/webp"
                                                onChange={(e) => {
                                                    field.onChange(e.target.files);
                                                    handleImageChange(e);
                                                }}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Store Details</CardTitle>
                            <CardDescription>This is what buyers see on your public profile.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField control={form.control} name="storeName" render={({ field }) => ( <FormItem><FormLabel>Store Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                            <FormField control={form.control} name="description" render={({ field }) => ( <FormItem><FormLabel>About You / Your Store</FormLabel><FormControl><Textarea {...field} className="min-h-[120px]"/></FormControl><FormMessage /></FormItem> )}/>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Contact Information</CardTitle>
                            <CardDescription>This information is for internal use and will not be displayed publicly.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField control={form.control} name="mobileNumber" render={({ field }) => ( <FormItem><FormLabel>Mobile Number *</FormLabel><FormControl><Input {...field} placeholder="e.g. +91 00000 00000" /></FormControl><FormMessage /></FormItem> )}/>
                            <FormField control={form.control} name="secondaryEmail" render={({ field }) => ( <FormItem><FormLabel>Secondary Email *</FormLabel><FormControl><Input type="email" {...field} placeholder="name@example.com" /></FormControl><FormMessage /></FormItem> )}/>
                        </CardContent>
                    </Card>

                    <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </div>
            </div>
        </form>
      </Form>
    </div>

    <Dialog open={isCropping} onOpenChange={setIsCropping}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crop Your Profile Picture</DialogTitle>
          </DialogHeader>
           {imgSrc && (
            <div className="flex justify-center">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                minWidth={100}
                minHeight={100}
              >
                <img
                  ref={imgRef}
                  alt="Crop preview"
                  src={imgSrc}
                  onLoad={onImageLoad}
                  style={{ maxHeight: '70vh' }}
                />
              </ReactCrop>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCropping(false)}>Cancel</Button>
            <Button onClick={handleConfirmCrop} disabled={!completedCrop}>Crop Image</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
