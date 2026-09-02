'use client';

import { useEffect, useState, useRef } from 'react';
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Plus, Trash2, Image as ImageIcon, Upload, FileUp, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { adminUpdateProduct } from '@/app/store/admin-actions';
import { getCompleteProduct } from '@/app/admin/projects/actions';
import type { StoreProduct, ProductPreview, DownloadableFile } from '@/lib/types';
import { useAuth } from '@/context/auth-provider';
import { compressImage, getDisplayUrl } from '@/lib/utils';
import { uploadFileDirectly } from '@/lib/gcs-client';
import { Progress } from '@/components/ui/progress';
import { reportClientError } from '@/lib/report-client-error';

const languages = ["Hindi", "English", "Hinglish", "Bengali", "Marathi", "Telugu", "Tamil", "Gujarati", "Punjabi", "Kannada", "Malayalam", "Bhojpuri"];
const qualityOptions = ["Ultra HD (4K)", "Full HD (1080p)", "Standard HD (720p)", "High Compression (SD)"];
const resolutionOptions = ["Vertical (9:16) - For Shorts/Reels", "Horizontal (16:9) - Standard", "Square (1:1)"];
const frameOptions = ["10-20 Scenes", "20-40 Scenes", "40-60 Scenes", "60+ Scenes"];
const audienceOptions = ["General", "Children", "Teenagers", "Young Adults", "Adults"];
const toneOptions = ["Serious", "Humorous", "Dramatic", "Light-hearted", "Suspenseful", "Inspiring", "Casual"];
const statusOptions = ["Included", "Not Included"];

interface AdminEditProductDialogProps {
    product: StoreProduct;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdate: () => void;
}

export function AdminEditProductDialog({ product, open, onOpenChange, onUpdate }: AdminEditProductDialogProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const [isFetchingFullData, setIsFetchingFullData] = useState(false);

    const mainImageInputRef = useRef<HTMLInputElement>(null);
    const previewInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
    const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

    const [uploadingMain, setUploadingMain] = useState(false);
    const [mainUploadProgress, setMainUploadProgress] = useState(0);

    const [uploadingPreviews, setUploadingPreviews] = useState<{ [key: number]: { uploading: boolean; progress: number } }>({});
    const [uploadingFiles, setUploadingFiles] = useState<{ [key: number]: { uploading: boolean; progress: number } }>({});

    const [formData, setFormData] = useState({
        title: product?.title || '',
        description: product?.description || '',
        price: product?.price || 0,
        originalPrice: product?.originalPrice || 0,
        productType: product?.productType || '',
        previews: (product?.previews || []) as ProductPreview[],
        downloadableFiles: ((product as any)?.downloadableFiles || []) as DownloadableFile[],
        fullScriptContent: '',
        language: product?.language || 'Hindi',
        quality: product?.quality || 'Full HD (1080p)',
        sizeValue: '',
        sizeUnit: 'MB' as 'MB' | 'GB',
        resolution: product?.resolution || 'Vertical (9:16) - For Shorts/Reels',
        frameCount: product?.frameCount || '20-40 Scenes',
        targetAudience: product?.targetAudience || 'General',
        emotionalTone: product?.emotionalTone || 'Serious',
        duration: product?.duration || '0:00 Minutes',
        isAiGenerated: !!product?.isAiGenerated,
        soundFx: product?.soundFx || 'Included',
        bgm: product?.bgm || 'Included',
        scriptPreviewUrl: (product as any)?.scriptPreviewUrl || '',
        previewImage: product?.previewImage || '',
    });

    useEffect(() => {
        const fetchFullData = async () => {
            if (open && product?.id) {
                setIsFetchingFullData(true);
                try {
                    const result = await getCompleteProduct(product.id);
                    if (result.success && result.product) {
                        const p = result.product;
                        const sizeParts = (p.videoSize || '').split(' ');
                        const initialPreviews = p.previews && p.previews.length > 0 
                            ? p.previews 
                            : p.previewImage ? [{ type: 'image' as const, url: p.previewImage }] : [];
                        
                        setFormData({
                            title: p.title || '', 
                            description: p.description || '', 
                            price: p.price || 0, 
                            originalPrice: p.originalPrice || 0, 
                            productType: p.productType || '',
                            previews: initialPreviews, 
                            downloadableFiles: p.downloadableFiles || [],
                            fullScriptContent: p.fullScriptContent || '',
                            language: p.language || 'Hindi', 
                            quality: p.quality || 'Full HD (1080p)', 
                            sizeValue: sizeParts[0] || '',
                            sizeUnit: (sizeParts[1] === 'GB' ? 'GB' : 'MB') as 'MB' | 'GB',
                            resolution: p.resolution || 'Vertical (9:16) - For Shorts/Reels',
                            frameCount: p.frameCount || '20-40 Scenes', 
                            targetAudience: p.targetAudience || 'General', 
                            emotionalTone: p.emotionalTone || 'Serious',
                            duration: p.duration || '0:00 Minutes', 
                            isAiGenerated: !!p.isAiGenerated, 
                            soundFx: p.soundFx || 'Included', 
                            bgm: p.bgm || 'Included',
                            scriptPreviewUrl: (p as any).scriptPreviewUrl || '',
                            previewImage: p.previewImage || (initialPreviews[0]?.url || ''),
                        });
                    }
                } finally { 
                    setIsFetchingFullData(false); 
                }
            }
        };
        fetchFullData();
    }, [open, product?.id]);

    const handleSave = async () => {
        if (!product?.id) return;
        setIsSaving(true);
        try {
            // Ensure previewImage is synced with first image preview if set
            let updatedPreviews = [...formData.previews];
            if (formData.previewImage) {
                if (updatedPreviews.length === 0) {
                    updatedPreviews.push({ type: 'image', url: formData.previewImage });
                } else if (updatedPreviews[0].type === 'image') {
                    updatedPreviews[0] = { ...updatedPreviews[0], url: formData.previewImage };
                }
            }

            const finalData = {
                ...formData,
                previews: updatedPreviews,
                videoSize: formData.sizeValue ? `${formData.sizeValue} ${formData.sizeUnit}` : undefined
            };
            const result = await adminUpdateProduct(product.id, finalData as any);
            if (result.success) { 
                toast({ title: 'Product Updated Successfully!' });
                onUpdate(); 
                onOpenChange(false); 
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            reportClientError('src/components/store/admin-edit-product-dialog.tsx:151', error); 
            toast({ variant: 'destructive', title: "Update Failed", description: error.message }); 
        } finally { 
            setIsSaving(false); 
        }
    };

    const updatePreviewUrl = (index: number, url: string) => {
        setFormData(prev => {
            const newPreviews = prev.previews.map((p, i) => i === index ? { ...p, url } : p);
            return {
                ...prev,
                previews: newPreviews,
                previewImage: index === 0 ? url : prev.previewImage
            };
        });
    };

    const updateFileUrl = (index: number, url: string) => {
        setFormData(prev => ({
            ...prev,
            downloadableFiles: prev.downloadableFiles.map((f, i) => i === index ? { ...f, url } : f)
        }));
    };

    const addPreview = () => setFormData(prev => ({ ...prev, previews: [...prev.previews, { type: 'image', url: '' }] }));
    const addFile = () => setFormData(prev => ({ ...prev, downloadableFiles: [...prev.downloadableFiles, { fileName: 'Master File', url: '' }] }));

    // 📤 Handle Direct Thumbnail File Upload & Compression
    const handleMainImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Invalid File', description: 'Please select an image file (PNG, JPG, WEBP).' });
            return;
        }

        setUploadingMain(true);
        setMainUploadProgress(5);

        try {
            toast({ title: 'Compressing Image...', description: 'Optimizing thumbnail image.' });
            const compressedFile = await compressImage(file, 1280, 0.85);

            setMainUploadProgress(25);
            const rawUrl = await uploadFileDirectly({
                file: compressedFile,
                fileName: `thumb_${Date.now()}_${file.name.replace(/\.[^/.]+$/, '')}.webp`,
                bucketType: 'public',
                folder: 'store/thumbnails',
                userId: user?.uid || 'admin',
                userEmail: user?.email || 'admin@12labs.in',
                onProgress: (p) => setMainUploadProgress(Math.min(99, Math.round(p)))
            });

            const finalUrl = getDisplayUrl(rawUrl);

            setFormData(prev => ({
                ...prev,
                previewImage: finalUrl,
                previews: prev.previews.length > 0
                    ? prev.previews.map((p, i) => i === 0 ? { ...p, url: finalUrl } : p)
                    : [{ type: 'image', url: finalUrl }]
            }));

            setMainUploadProgress(100);
            toast({ title: 'Thumbnail Uploaded Successfully!', description: 'Link updated & image saved.' });
        } catch (err: any) {
            console.error('Thumbnail upload error:', err);
            toast({ variant: 'destructive', title: 'Upload Failed', description: err.message || 'Could not upload thumbnail image.' });
        } finally {
            setUploadingMain(false);
            if (mainImageInputRef.current) mainImageInputRef.current.value = '';
        }
    };

    // 📤 Handle Preview Media File Upload
    const handlePreviewFileUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingPreviews(prev => ({ ...prev, [index]: { uploading: true, progress: 10 } }));

        try {
            let fileToUpload: File = file;
            if (file.type.startsWith('image/')) {
                toast({ title: `Compressing preview #${index + 1}...` });
                fileToUpload = await compressImage(file, 1280, 0.85);
            }

            const folder = file.type.startsWith('image/') ? 'store/previews/images' : 'store/previews/videos';
            const rawUrl = await uploadFileDirectly({
                file: fileToUpload,
                fileName: `preview_${Date.now()}_${file.name.replace(/\.[^/.]+$/, '')}`,
                bucketType: 'public',
                folder: folder,
                userId: user?.uid || 'admin',
                userEmail: user?.email || 'admin@12labs.in',
                onProgress: (p) => setUploadingPreviews(prev => ({ ...prev, [index]: { uploading: true, progress: Math.min(99, Math.round(p)) } }))
            });

            const finalUrl = getDisplayUrl(rawUrl);
            updatePreviewUrl(index, finalUrl);
            toast({ title: `Preview Slot #${index + 1} Uploaded!` });
        } catch (err: any) {
            reportClientError('src/components/store/admin-edit-product-dialog.tsx:256', err);
            toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
        } finally {
            setUploadingPreviews(prev => ({ ...prev, [index]: { uploading: false, progress: 100 } }));
            if (previewInputRefs.current[index]) previewInputRefs.current[index]!.value = '';
        }
    };

    // 📤 Handle Downloadable File Upload
    const handleDownloadableFileUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFiles(prev => ({ ...prev, [index]: { uploading: true, progress: 10 } }));

        try {
            const rawUrl = await uploadFileDirectly({
                file: file,
                fileName: file.name,
                bucketType: 'private',
                folder: 'store/downloads',
                userId: user?.uid || 'admin',
                userEmail: user?.email || 'admin@12labs.in',
                onProgress: (p) => setUploadingFiles(prev => ({ ...prev, [index]: { uploading: true, progress: Math.min(99, Math.round(p)) } }))
            });

            const finalUrl = getDisplayUrl(rawUrl);
            
            setFormData(prev => {
                const files = [...prev.downloadableFiles];
                if (!files[index]?.fileName || files[index].fileName === 'Master File') {
                    files[index] = { fileName: file.name, url: finalUrl };
                } else {
                    files[index] = { ...files[index], url: finalUrl };
                }
                return { ...prev, downloadableFiles: files };
            });

            toast({ title: `File Uploaded!` });
        } catch (err: any) {
            reportClientError('src/components/store/admin-edit-product-dialog.tsx:295', err);
            toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
        } finally {
            setUploadingFiles(prev => ({ ...prev, [index]: { uploading: false, progress: 100 } }));
            if (fileInputRefs.current[index]) fileInputRefs.current[index]!.value = '';
        }
    };

    const isStory = formData.productType === 'YouTube Story';
    const isScript = formData.productType === 'Hand Written Script';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[92vh] rounded-[2rem] p-0 overflow-hidden flex flex-col shadow-2xl bg-background border">
                <DialogHeader className="p-6 pb-4 border-b shrink-0 bg-muted/20">
                    <DialogTitle className="text-xl font-black uppercase flex items-center gap-2">
                        <span>Admin Edit Product</span>
                    </DialogTitle>
                </DialogHeader>
                
                <ScrollArea className="flex-1">
                    {isFetchingFullData ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-40">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Loading Product Details...</p>
                        </div>
                    ) : (
                        <div className="p-6 space-y-8">
                            {/* General Details */}
                            <div className="space-y-4">
                                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary pl-3 border-l-4 border-primary">General Metadata</h4>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Product Title</Label>
                                        <input 
                                            value={formData.title} 
                                            onChange={e => setFormData({...formData, title: e.target.value})} 
                                            className="rounded-xl h-11 bg-muted/20 border font-bold w-full px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                                            placeholder="Enter product title"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Sale Price (₹)</Label>
                                            <input 
                                                type="number" 
                                                value={formData.price} 
                                                onChange={e => setFormData({...formData, price: Number(e.target.value)})} 
                                                className="h-11 rounded-xl bg-muted/20 border font-black w-full px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Original Price (MRP ₹)</Label>
                                            <input 
                                                type="number" 
                                                value={formData.originalPrice} 
                                                onChange={e => setFormData({...formData, originalPrice: Number(e.target.value)})} 
                                                className="h-11 rounded-xl bg-muted/20 border font-black w-full px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                                                placeholder="Optional original price"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Product Category</Label>
                                        <Select value={formData.productType} onValueChange={v => setFormData({...formData, productType: v})}>
                                            <SelectTrigger className="h-11 rounded-xl bg-muted/20 border">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-xl">
                                                {["YouTube Story", "Hand Written Script", "PC Character", "Green Screen Character", "Premium Background", "Real Voice"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Description</Label>
                                        <Textarea 
                                            value={formData.description} 
                                            onChange={e => setFormData({...formData, description: e.target.value})} 
                                            className="min-h-[100px] rounded-xl bg-muted/20 border p-4 text-sm" 
                                            placeholder="Enter product description"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Main Preview Image / Media Slots */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary pl-3 border-l-4 border-primary">Main Thumbnail & Media Previews</h4>
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] font-black uppercase rounded-lg" onClick={addPreview}>
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Media Slot
                                    </Button>
                                </div>

                                <div className="space-y-4">
                                    {/* 📸 Main Thumbnail Section with Direct Upload & Compression */}
                                    <div className="space-y-3 bg-muted/10 p-4 sm:p-5 rounded-2xl border border-primary/20 shadow-sm">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[11px] font-black uppercase text-primary flex items-center gap-1.5">
                                                <ImageIcon className="h-4 w-4" /> Main Thumbnail Image
                                            </Label>
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase">Auto-Compressed WebP</span>
                                        </div>

                                        <input 
                                            type="file"
                                            ref={mainImageInputRef}
                                            onChange={handleMainImageFileUpload}
                                            accept="image/*"
                                            className="hidden"
                                        />

                                        <div className="flex flex-col sm:flex-row gap-2.5">
                                            <Button
                                                type="button"
                                                variant="default"
                                                disabled={uploadingMain}
                                                onClick={() => mainImageInputRef.current?.click()}
                                                className="h-11 px-5 rounded-xl font-bold text-xs uppercase gap-2 bg-primary hover:bg-primary/90 shrink-0 shadow-md transition-all"
                                            >
                                                {uploadingMain ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Uploading ({mainUploadProgress}%)...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="h-4 w-4" />
                                                        Upload File
                                                    </>
                                                )}
                                            </Button>

                                            <div className="relative flex-1">
                                                <input 
                                                    value={formData.previewImage} 
                                                    onChange={(e) => {
                                                        const url = e.target.value;
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            previewImage: url,
                                                            previews: prev.previews.length > 0 
                                                                ? prev.previews.map((p, i) => i === 0 ? { ...p, url } : p)
                                                                : [{ type: 'image', url }]
                                                        }));
                                                    }} 
                                                    className="h-11 text-xs font-mono rounded-xl bg-background border w-full px-4 pr-9 focus:outline-none focus:ring-2 focus:ring-primary/20" 
                                                    placeholder="Or paste image URL (https://...)" 
                                                />
                                                {formData.previewImage && (
                                                    <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-emerald-500" />
                                                )}
                                            </div>
                                        </div>

                                        {uploadingMain && (
                                            <div className="space-y-1.5 pt-1">
                                                <Progress value={mainUploadProgress} className="h-2 rounded-full" />
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase text-right">Compressing & Uploading... {mainUploadProgress}%</p>
                                            </div>
                                        )}

                                        {formData.previewImage && (
                                            <div className="mt-2 flex items-center justify-between gap-4 bg-background p-3 rounded-xl border">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="relative w-20 h-12 rounded-lg overflow-hidden border bg-muted shrink-0 shadow-inner">
                                                        <img src={getDisplayUrl(formData.previewImage)} alt="Thumbnail" className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[10px] font-black uppercase text-emerald-600 flex items-center gap-1">
                                                            <CheckCircle2 className="h-3 w-3" /> Active Thumbnail
                                                        </p>
                                                        <p className="text-[11px] font-mono text-muted-foreground truncate">{formData.previewImage}</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-xs text-destructive hover:bg-destructive/10 shrink-0"
                                                    onClick={() => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            previewImage: '',
                                                            previews: prev.previews.map((p, i) => i === 0 ? { ...p, url: '' } : p)
                                                        }));
                                                    }}
                                                >
                                                    Clear
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Preview Slots with File Upload Option */}
                                    {formData.previews.map((p, i) => (
                                        <div key={i} className="flex flex-col gap-2 bg-muted/10 p-3 rounded-xl border">
                                            <div className="flex gap-2 items-center">
                                                <div className="shrink-0 w-10 h-9 bg-muted border rounded-lg flex items-center justify-center font-black text-[10px]">
                                                    {i === 0 ? 'Main' : `#${i+1}`}
                                                </div>

                                                <input 
                                                    type="file"
                                                    ref={(el) => { previewInputRefs.current[i] = el; }}
                                                    onChange={(e) => handlePreviewFileUpload(i, e)}
                                                    accept="image/*,video/*"
                                                    className="hidden"
                                                />

                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={uploadingPreviews[i]?.uploading}
                                                    onClick={() => previewInputRefs.current[i]?.click()}
                                                    className="h-9 px-3 text-[11px] font-bold uppercase rounded-lg shrink-0 gap-1"
                                                >
                                                    {uploadingPreviews[i]?.uploading ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Upload className="h-3.5 w-3.5" />
                                                    )}
                                                    {uploadingPreviews[i]?.uploading ? `${uploadingPreviews[i]?.progress}%` : 'Upload'}
                                                </Button>

                                                <input 
                                                    value={p.url} 
                                                    onChange={(e) => updatePreviewUrl(i, e.target.value)} 
                                                    className="h-9 text-xs font-mono rounded-lg flex-grow bg-background border px-3" 
                                                    placeholder="Preview URL (Image or Video)" 
                                                />

                                                <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive shrink-0" onClick={() => setFormData(prev => ({ ...prev, previews: prev.previews.filter((_, idx) => idx !== i) }))}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>

                                            {uploadingPreviews[i]?.uploading && (
                                                <Progress value={uploadingPreviews[i]?.progress} className="h-1.5 rounded-full" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Downloadable Master Files */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-red-600 pl-3 border-l-4 border-red-500">Secure Master Download Files</h4>
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] font-black uppercase rounded-lg" onClick={addFile}>
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add File
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    {formData.downloadableFiles.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic px-2">No downloadable files added yet.</p>
                                    ) : (
                                        formData.downloadableFiles.map((f, i) => (
                                            <div key={i} className="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-red-500/5 border border-red-500/10">
                                                <div className="flex gap-2 items-center">
                                                    <input 
                                                        value={f.fileName} 
                                                        onChange={(e) => {
                                                            const newFiles = [...formData.downloadableFiles];
                                                            newFiles[i].fileName = e.target.value;
                                                            setFormData({ ...formData, downloadableFiles: newFiles });
                                                        }} 
                                                        className="h-9 rounded-lg bg-background font-bold text-xs px-3 flex-grow border" 
                                                        placeholder="File Label (e.g. Script PDF / Zip)"
                                                    />
                                                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive shrink-0" onClick={() => setFormData(prev => ({ ...prev, downloadableFiles: prev.downloadableFiles.filter((_, idx) => idx !== i) }))}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                <div className="flex gap-2 items-center">
                                                    <input 
                                                        type="file"
                                                        ref={(el) => { fileInputRefs.current[i] = el; }}
                                                        onChange={(e) => handleDownloadableFileUpload(i, e)}
                                                        className="hidden"
                                                    />

                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={uploadingFiles[i]?.uploading}
                                                        onClick={() => fileInputRefs.current[i]?.click()}
                                                        className="h-9 px-3 text-[11px] font-bold uppercase rounded-lg shrink-0 gap-1 border-red-200 hover:bg-red-50 text-red-700"
                                                    >
                                                        {uploadingFiles[i]?.uploading ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <FileUp className="h-3.5 w-3.5" />
                                                        )}
                                                        {uploadingFiles[i]?.uploading ? `${uploadingFiles[i]?.progress}%` : 'Upload File'}
                                                    </Button>

                                                    <input 
                                                        value={f.url} 
                                                        onChange={(e) => updateFileUrl(i, e.target.value)} 
                                                        className="h-9 text-[11px] font-mono rounded-lg bg-background border px-3 flex-grow" 
                                                        placeholder="File URL or Drive Link" 
                                                    />
                                                </div>

                                                {uploadingFiles[i]?.uploading && (
                                                    <Progress value={uploadingFiles[i]?.progress} className="h-1.5 rounded-full" />
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Script Content */}
                            {isScript && (
                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary pl-3 border-l-4 border-primary">Script Details</h4>
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <Label className="text-[11px] font-black uppercase text-muted-foreground ml-1">Full Script Text</Label>
                                            <Textarea 
                                                value={formData.fullScriptContent} 
                                                onChange={(e) => setFormData({...formData, fullScriptContent: e.target.value})}
                                                className="min-h-[200px] font-mono text-xs rounded-xl bg-muted/10 p-4 border"
                                                placeholder="Paste the full script content here..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Readymade Story Specifications */}
                            {isStory && (
                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary pl-3 border-l-4 border-primary">Video Specifications</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Language</Label><Select value={formData.language} onValueChange={v => setFormData({...formData, language: v})}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{languages.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Quality</Label><Select value={formData.quality} onValueChange={v => setFormData({...formData, quality: v})}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{qualityOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Resolution</Label><Select value={formData.resolution} onValueChange={v => setFormData({...formData, resolution: v})}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{resolutionOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground">File Size</Label>
                                            <div className="flex gap-2">
                                                <input placeholder="e.g. 500" value={formData.sizeValue} onChange={e => setFormData({...formData, sizeValue: e.target.value})} className="h-10 rounded-xl bg-muted/20 border font-bold w-full px-3 text-sm" />
                                                <Select value={formData.sizeUnit} onValueChange={v => setFormData({...formData, sizeUnit: v as any})}>
                                                    <SelectTrigger className="h-10 w-20 rounded-xl font-black"><SelectValue /></SelectTrigger>
                                                    <SelectContent className="rounded-xl"><SelectItem value="MB">MB</SelectItem><SelectItem value="GB">GB</SelectItem></SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Scene Density</Label><Select value={formData.frameCount} onValueChange={v => setFormData({...formData, frameCount: v})}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{frameOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Audience</Label><Select value={formData.targetAudience} onValueChange={v => setFormData({...formData, targetAudience: v})}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{audienceOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Tone</Label><Select value={formData.emotionalTone} onValueChange={v => setFormData({...formData, emotionalTone: v})}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{toneOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Duration</Label><input value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="h-10 rounded-xl bg-muted/20 border font-bold w-full px-3 text-sm" placeholder="e.g. 5:00 Minutes" /></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Sound FX</Label><Select value={formData.soundFx} onValueChange={v => setFormData({...formData, soundFx: v})}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">BGM</Label><Select value={formData.bgm} onValueChange={v => setFormData({...formData, bgm: v})}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>

                <DialogFooter className="p-4 border-t bg-muted/20 shrink-0">
                    <Button 
                        onClick={handleSave} 
                        disabled={isSaving || isFetchingFullData} 
                        className="w-full h-12 rounded-xl font-bold text-base shadow-lg uppercase gap-2"
                    >
                        {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
