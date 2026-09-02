'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    ShoppingCart, Package, Gem, ShieldAlert, CheckCircle, Lock, FileText, 
    Clock, Coins, Sparkles, Verified, Loader2, ThumbsUp, Calendar, Heart, 
    Video, Play, Zap, MonitorPlay, Cpu, MicVocal, Info, Youtube, Link2, 
    Check, ShieldCheck, IndianRupee, Download, Award, 
    FileDown, Printer, Eye, X, RefreshCw, Save, Trash2, Edit, ImageIcon, 
    ChevronsUpDown, User, Activity, ExternalLink, ClipboardCopy, Database,
    ChevronDown, ChevronUp, Plus, Globe, Layers, UserCircle, MessageSquare, Volume2, Music
} from 'lucide-react';
import Link from 'next/link';
import type { Product, SellerProfile, DownloadableFile, StoreProduct, ProductPreview } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { format, isValid, parseISO } from 'date-fns';
import { useEffect, useState, useRef, useMemo } from 'react';
import { checkIfUserLiked, toggleLikeProduct, checkPurchaseStatus, getSecureDownloadUrls, incrementProductView } from '@/app/store/[productId]/actions';
import { getCompleteProduct } from '@/app/admin/projects/actions';
import { adminDeleteProduct, adminUpdateProduct } from '@/app/store/admin-actions';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { cn, generateAvatarColor, getDisplayUrl } from '@/lib/utils';
import { toggleFollowSeller, checkFollowStatus } from '@/app/seller/actions';
import { useCart } from '@/context/cart-provider';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import Autoplay from "embla-carousel-autoplay";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { VerifiedBadge } from '@/components/verified-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { reportClientError } from '@/lib/report-client-error';

const languages = ["Hindi", "English", "Hinglish", "Bengali", "Marathi", "Telugu", "Tamil", "Gujarati", "Punjabi", "Kannada", "Malayalam", "Bhojpuri"];
const qualityOptions = ["Ultra HD (4K)", "Full HD (1080p)", "Standard HD (720p)", "High Compression (SD)"];
const resolutionOptions = ["Vertical (9:16) - For Shorts/Reels", "Horizontal (16:9) - Standard", "Square (1:1)"];
const frameOptions = ["10-20 Scenes", "20-40 Scenes", "40-60 Scenes", "60+ Scenes"];
const audienceOptions = ["General", "Children", "Teenagers", "Young Adults", "Adults"];
const toneOptions = ["Serious", "Humorous", "Dramatic", "Light-hearted", "Suspenseful", "Inspiring", "Casual"];
const statusOptions = ["Included", "Not Included"];

interface ProductViewProps {
    initialProduct: StoreProduct;
    initialSeller: SellerProfile | null;
}

function AdminEditDialog({ product, open, onOpenChange, onUpdate }: { product: StoreProduct, open: boolean, onOpenChange: (open: boolean) => void, onUpdate: () => void }) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isFetchingFullData, setIsFetchingFullData] = useState(false);
    
    const [formData, setFormData] = useState({
        title: product.title || '',
        description: product.description || '',
        price: product.price || 0,
        originalPrice: product.originalPrice || 0,
        productType: product.productType || '',
        previews: [] as ProductPreview[],
        downloadableFiles: [] as DownloadableFile[],
        fullScriptContent: '',
        language: product.language || 'Hindi',
        quality: product.quality || 'Full HD (1080p)',
        sizeValue: '',
        sizeUnit: 'MB' as 'MB' | 'GB',
        resolution: product.resolution || 'Vertical (9:16) - For Shorts/Reels',
        frameCount: product.frameCount || '20-40 Scenes',
        targetAudience: product.targetAudience || 'General',
        emotionalTone: product.emotionalTone || 'Serious',
        duration: product.duration || '0:00 Minutes',
        isAiGenerated: !!product.isAiGenerated,
        soundFx: product.soundFx || 'Included',
        bgm: product.bgm || 'Included',
        scriptPreviewUrl: (product as any).scriptPreviewUrl || '',
    });

    useEffect(() => {
        const fetchFullData = async () => {
            if (open) {
                setIsFetchingFullData(true);
                try {
                    const result = await getCompleteProduct(product.id);
                    if (result.success && result.product) {
                        const p = result.product;
                        const sizeParts = (p.videoSize || '').split(' ');
                        setFormData({
                            title: p.title || '', 
                            description: p.description || '', 
                            price: p.price || 0, 
                            originalPrice: p.originalPrice || 0, 
                            productType: p.productType || '',
                            previews: p.previews || [], 
                            downloadableFiles: p.downloadableFiles || [],
                            fullScriptContent: p.fullScriptContent || '',
                            language: p.language || 'Hindi', quality: p.quality || 'Full HD (1080p)', 
                            sizeValue: sizeParts[0] || '',
                            sizeUnit: (sizeParts[1] === 'GB' ? 'GB' : 'MB') as 'MB' | 'GB',
                            resolution: p.resolution || 'Vertical (9:16) - For Shorts/Reels',
                            frameCount: p.frameCount || '20-40 Scenes', targetAudience: p.targetAudience || 'General', emotionalTone: p.emotionalTone || 'Serious',
                            duration: p.duration || '0:00 Minutes', isAiGenerated: !!p.isAiGenerated, soundFx: p.soundFx || 'Included', bgm: p.bgm || 'Included',
                            scriptPreviewUrl: (p as any).scriptPreviewUrl || '',
                        });
                    }
                } finally { setIsFetchingFullData(false); }
            }
        };
        fetchFullData();
    }, [open, product.id]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const finalData = {
                ...formData,
                videoSize: formData.sizeValue ? `${formData.sizeValue} ${formData.sizeUnit}` : undefined
            };
            const result = await adminUpdateProduct(product.id, finalData as any);
            if (result.success) { 
                toast({ title: 'System Synchronized' });
                onUpdate(); 
                onOpenChange(false); 
            }
            else throw new Error(result.message);
        } catch (error: any) {
            reportClientError('src/components/store/product-view.tsx:137', error); toast({ variant: 'destructive', title: "Update Failed", description: error.message }); }
        finally { setIsSaving(false); }
    };

    const updatePreviewUrl = (index: number, url: string) => {
        setFormData(prev => ({
            ...prev,
            previews: prev.previews.map((p, i) => i === index ? { ...p, url } : p)
        }));
    };

    const updateFileUrl = (index: number, url: string) => {
        setFormData(prev => ({
            ...prev,
            downloadableFiles: prev.downloadableFiles.map((f, i) => i === index ? { ...f, url } : f)
        }));
    };

    const addPreview = () => setFormData(prev => ({ ...prev, previews: [...prev.previews, { type: 'image', url: '' }] }));
    const addFile = () => setFormData(prev => ({ ...prev, downloadableFiles: [...prev.downloadableFiles, { fileName: 'Master File', url: '' }] }));

    const isStory = formData.productType === 'YouTube Story';
    const isScript = formData.productType === 'Hand Written Script';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[95vh] rounded-[2rem] p-0 overflow-hidden flex flex-col shadow-2xl">
                <DialogHeader className="p-8 pb-4 border-b shrink-0 bg-muted/20">
                    <DialogTitle className="text-2xl font-black uppercase">Production Override</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1">
                    {isFetchingFullData ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-40">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Decrypting Records...</p>
                        </div>
                    ) : (
                        <div className="p-8 space-y-12">
                            <div className="space-y-6">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 pl-3 border-l-4 border-primary/20">General Metadata</h4>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Asset Title</Label>
                                        <input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="rounded-xl h-11 bg-muted/10 border-primary/5 font-bold w-full px-4 text-sm" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Sale Price (INR)</Label>
                                            <input type="number" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="h-11 rounded-xl bg-muted/10 font-black w-full px-4 text-sm" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Market Category</Label>
                                            <Select value={formData.productType} onValueChange={v => setFormData({...formData, productType: v})}>
                                                <SelectTrigger className="h-11 rounded-xl bg-muted/10">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    {["YouTube Story", "Hand Written Script", "PC Character", "Green Screen Character", "Premium Background", "Real Voice"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Marketing Description</Label>
                                        <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="min-h-[100px] rounded-xl bg-muted/10 p-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 pl-3 border-l-4 border-primary/20">Media Preview Nodes</h4>
                                    <Button size="sm" variant="ghost" className="h-6 text-[8px] font-black uppercase" onClick={addPreview}>
                                        <Plus className="h-3 w-3 mr-1" /> Add Slot
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    {formData.previews.map((p, i) => (
                                        <div key={i} className="flex gap-3">
                                            <div className="shrink-0 w-12 h-11 bg-muted/30 border rounded-xl flex items-center justify-center font-black text-[10px]">{i === 0 ? 'M' : i}</div>
                                            <input 
                                                value={p.url} 
                                                onChange={(e) => updatePreviewUrl(i, e.target.value)} 
                                                className="h-11 text-[10px] font-mono rounded-xl flex-grow bg-muted/10 px-4" 
                                                placeholder="tg://... OR https://..." 
                                            />
                                            <Button size="icon" variant="ghost" className="h-11 w-11 text-destructive" onClick={() => setFormData(prev => ({ ...prev, previews: prev.previews.filter((_, idx) => idx !== i) }))}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 pl-3 border-l-4 border-red-500/20">Secure Master Assets (Download)</h4>
                                    <Button size="sm" variant="ghost" className="h-6 text-[8px] font-black uppercase" onClick={addFile}>
                                        <Plus className="h-3 w-3 mr-1" /> Add Asset
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    {formData.downloadableFiles.map((f, i) => (
                                        <div key={i} className="flex flex-col gap-2 p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
                                            <div className="flex gap-2">
                                                <input 
                                                    value={f.fileName} 
                                                    onChange={(e) => {
                                                        const newFiles = [...formData.downloadableFiles];
                                                        newFiles[i].fileName = e.target.value;
                                                        setFormData({ ...formData, downloadableFiles: newFiles });
                                                    }} 
                                                    className="h-9 rounded-lg bg-background font-bold text-xs px-3 flex-grow" 
                                                    placeholder="File Label"
                                                />
                                                <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => setFormData(prev => ({ ...prev, downloadableFiles: prev.downloadableFiles.filter((_, idx) => idx !== i) }))}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <input 
                                                value={f.url} 
                                                onChange={(e) => updateFileUrl(i, e.target.value)} 
                                                className="h-9 text-[10px] font-mono rounded-lg bg-background border-red-500/20 px-3" 
                                                placeholder="Protected URL / Drive Link / File ID" 
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {isScript && (
                                <div className="space-y-6 animate-in fade-in duration-500">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 pl-3 border-l-4 border-primary/20">Script Content Node</h4>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">GCS Preview URL (Direct Text)</Label>
                                            <input value={formData.scriptPreviewUrl} onChange={e => setFormData({...formData, scriptPreviewUrl: e.target.value})} className="rounded-xl h-11 bg-muted/10 border-primary/5 font-mono text-[10px] w-full px-4" placeholder="pub://..." />
                                        </div>
                                        <div className="space-y-3">
                                            <Label className="text-[10px] font-bold text-destructive uppercase tracking-widest px-1">⚠️ Full Manuscript Override</Label>
                                            <Textarea 
                                                value={formData.fullScriptContent} 
                                                onChange={(e) => setFormData({...formData, fullScriptContent: e.target.value})}
                                                className="min-h-[300px] font-mono text-xs rounded-xl bg-muted/10 p-6 leading-relaxed border-primary/10 shadow-inner"
                                                placeholder="Paste the full script here..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isStory && (
                                <div className="space-y-6 animate-in fade-in duration-500">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 pl-3 border-l-4 border-red-500/20">Asset Specifications</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">Language</Label><Select value={formData.language} onValueChange={v => setFormData({...formData, language: v})}><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{languages.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">Quality</Label><Select value={formData.quality} onValueChange={v => setFormData({...formData, quality: v})}><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{qualityOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">Resolution</Label><Select value={formData.resolution} onValueChange={v => setFormData({...formData, resolution: v})}><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{resolutionOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        
                                        <div className="space-y-2">
                                            <Label className="text-[9px] font-black uppercase">File Size</Label>
                                            <div className="flex gap-2">
                                                <input placeholder="e.g. 500" value={formData.sizeValue} onChange={e => setFormData({...formData, sizeValue: e.target.value})} className="h-10 rounded-xl bg-muted/10 border-primary/5 font-bold w-full px-3 text-sm" />
                                                <Select value={formData.sizeUnit} onValueChange={v => setFormData({...formData, sizeUnit: v as any})}>
                                                    <SelectTrigger className="h-10 w-20 rounded-xl bg-muted/10 font-black"><SelectValue /></SelectTrigger>
                                                    <SelectContent className="rounded-xl"><SelectItem value="MB">MB</SelectItem><SelectItem value="GB">GB</SelectItem></SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">Density</Label><Select value={formData.frameCount} onValueChange={v => setFormData({...formData, frameCount: v})}><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{frameOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">Audience</Label><Select value={formData.targetAudience} onValueChange={v => setFormData({...formData, targetAudience: v})}><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{audienceOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">Tone</Label><Select value={formData.emotionalTone} onValueChange={v => setFormData({...formData, emotionalTone: v})}><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{toneOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">Duration Label</Label><input value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="h-10 rounded-xl bg-muted/10 font-bold w-full px-3 text-sm" /></div>
                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">Sound FX</Label><Select value={formData.soundFx} onValueChange={v => setFormData({...formData, soundFx: v})}><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                        <div className="space-y-2"><Label className="text-[9px] font-black uppercase">BGM</Label><Select value={formData.bgm} onValueChange={v => setFormData({...formData, bgm: v})}><SelectTrigger className="h-10 rounded-xl bg-muted/10"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{statusOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>
                <DialogFooter className="p-8 border-t bg-muted/30">
                    <Button onClick={handleSave} disabled={isSaving || isFetchingFullData} className="w-full h-16 rounded-[1.5rem] font-black text-lg shadow-xl shadow-primary/20 btn-shine uppercase gap-3">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-6 w-6" />}
                        SYNC HUB
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function MetadataBlock({ icon: Icon, label, value, colorClass, statusBadge }: { icon: any, label: string, value: any, colorClass?: string, statusBadge?: boolean }) {
    if (value === undefined || value === null || value === '' || value === false) return null;
    return (
        <div className="p-4 sm:p-5 rounded-[1.5rem] bg-white dark:bg-card border border-primary/5 shadow-sm transition-all hover:bg-muted/5 flex flex-col gap-2 h-full">
            <div className="flex items-center gap-2.5 mb-0.5"><div className={cn("p-2 rounded-xl bg-primary/5 shadow-inner", colorClass || "text-primary")}><Icon className="h-4 w-4" /></div><span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">{label}</span></div>
            <div className="flex items-center gap-2">{statusBadge && value === true ? (<div className="flex items-center gap-2 text-green-600"><div className="p-1 bg-green-500 rounded-full"><Check className="h-3 w-3 text-white" /></div><span className="text-[12px] font-black uppercase tracking-tight">YES / VERIFIED</span></div>) : (<span className="text-[13px] font-black uppercase tracking-tighter text-foreground truncate">{value === true ? 'Yes' : String(value)}</span>)}</div>
        </div>
    );
}

export default function ProductView({ initialProduct, initialSeller }: ProductViewProps) {
    const { user, activeUid, activeUser: currentUser, setUser, isImpersonating } = useAuth();
    const { toast } = useToast();
    const { addToCart, isInCart } = useCart();
    const { database } = initializeFirebase();

    const isScript = initialProduct.productType === 'Hand Written Script';
    const isStory = initialProduct.productType === 'YouTube Story';
    const isVerifiedPartner = initialSeller?.isVerified || false;
    const isAdmin = user?.role === 'admin' || isImpersonating;

    const [product] = useState<StoreProduct>(initialProduct);
    const [seller] = useState<SellerProfile | null>(initialSeller);
    const [isLiked, setIsLiked] = useState(false);
    const [currentLikes, setCurrentLikes] = useState(product.likes || 0);
    const [isLikeLoading, setIsLikeLoading] = useState(true);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isLoadingFollow, setIsLoadingFollow] = useState(true);
    const [accessState, setAccessState] = useState<'verifying' | 'granted' | 'restricted'>('verifying');
    const [hasPurchased, setHasPurchased] = useState(false);
    const [api, setApi] = useState<CarouselApi>()
    const plugin = useRef(Autoplay({ delay: 3000, stopOnInteraction: true }));
    const [selectedTier, setSelectedTier] = useState<'singleChannel' | 'multipleWorks' | 'fullOwnership'>(product.tieredPricing ? 'singleChannel' : 'singleChannel');
    const [youtubeLink, setYoutubeLink] = useState('');
    const [downloadableFiles, setDownloadableFiles] = useState<DownloadableFile[] | null>(null);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    
    const [scriptPreviewText, setScriptPreviewUrlText] = useState<string[]>(product.scriptPreview || []);
    const [isFetchingPreview, setIsFetchingPreview] = useState(false);

    const [fullScript, setFullScript] = useState<string | null>(null);
    const [isLoadingScript, setIsLoadingScript] = useState(false);
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
    const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
    const [isDownloadingTxt, setIsDownloadingTxt] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isGeneratingLicense, setIsGeneratingLicense] = useState(false);
    const [logos, setLogos] = useState<{ master: string, watermark: string }>({ master: '', watermark: '' });
    const [isAdminEditOpen, setIsAdminEditOpen] = useState(false);
    const [globalDiscount, setGlobalDiscount] = useState(0);
    const viewIncremented = useRef(false);

    useEffect(() => {
        if (!database) return;
        const pricingRef = ref(database, 'settings/pricing');
        return onRtdbValue(pricingRef, (snap) => {
            if (snap.exists()) {
                setGlobalDiscount(Number(snap.val().verifiedSellerGlobalDiscount || 0));
            }
        });
    }, [database]);

    const avatarColor = useMemo(() => {
        return seller ? generateAvatarColor(seller.id) : { bg: 'bg-muted', text: 'text-muted-foreground' };
    }, [seller]);

    useEffect(() => {
        if (!database) return;
        onRtdbValue(ref(database, 'settings/landingPage'), (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                setLogos({ master: getDisplayUrl(data.masterLogoUrl), watermark: getDisplayUrl(data.watermarkLogoUrl) });
            }
        });
    }, [database]);

    useEffect(() => {
        if (product.id && !viewIncremented.current) {
            viewIncremented.current = true;
            incrementProductView(product.id).catch(() => {
                // Non-critical: view count tracking failure should never surface to the user.
            });
        }
    }, [product.id]);

    useEffect(() => {
        const previewUrl = product.scriptPreviewUrl;
        if (isScript && previewUrl && scriptPreviewText.length <= 1) {
            const fetchPreview = async () => {
                setIsFetchingPreview(true);
                try {
                    const res = await fetch(getDisplayUrl(previewUrl));
                    if (res.ok) {
                        const text = await res.text();
                        if (text) {
                            setScriptPreviewUrlText(text.split('\n'));
                        }
                    }
                } catch (e) {
                    console.error("GCS Preview Node unreachable.");
                } finally {
                    setIsFetchingPreview(false);
                }
            };
            fetchPreview();
        }
    }, [isScript, product.scriptPreviewUrl, scriptPreviewText.length]);

    const effectivePreviews = useMemo(() => {
        if (product.previews && product.previews.length > 0) return product.previews;
        if (product.previewImage) return [{ type: 'image' as const, url: product.previewImage }];
        return [];
    }, [product.previews, product.previewImage]);

    const displayPrice = useMemo(() => {
        let basePrice = product.price;
        if (product.tieredPricing) {
            basePrice = (product.tieredPricing as any)[selectedTier] || product.price;
        }

        if (isVerifiedPartner && globalDiscount > 0) {
            return Math.floor(basePrice * (1 - globalDiscount / 100));
        }
        return basePrice;
    }, [product.price, product.tieredPricing, selectedTier, isVerifiedPartner, globalDiscount]);

    useEffect(() => {
        const verifyAccess = async () => {
            const currentStatus = (initialProduct.status || '').toLowerCase();
            if (currentStatus === 'approved' || currentStatus === 'pending_update') { setAccessState('granted'); return; }
            if (currentStatus === 'sold') {
                if (user) {
                    const purchased = await checkPurchaseStatus(initialProduct.id, user.uid);
                    setHasPurchased(purchased); setAccessState(purchased ? 'granted' : 'restricted');
                } else setAccessState('restricted');
                return;
            }
            setAccessState('restricted');
        };
        verifyAccess();
    }, [initialProduct, user]);

    useEffect(() => {
        if (accessState !== 'granted' && accessState !== 'restricted') return;
        if (user) {
            setIsLikeLoading(true);
            checkIfUserLiked(product.id, user.uid).then(val => { setIsLiked(val); setIsLikeLoading(false); });
            setIsLoadingFollow(true);
            checkFollowStatus(product.sellerId, user.uid).then(val => { setIsFollowing(val); setIsLoadingFollow(false); });
        } else { setIsLikeLoading(false); setIsLoadingFollow(false); }
    }, [product.id, user, accessState, product.sellerId]);

    const handleAddToCart = () => {
        if (product.requiresYoutubeLink && !youtubeLink.trim()) {
            toast({ variant: 'destructive', title: 'Link Required' }); return;
        }
        addToCart({ ...product, price: displayPrice, sellerIsVerified: seller?.isVerified || false, selectedTier, youtubeChannelLink: youtubeLink } as any);
    };

    const handleDownloadLicense = async () => {
        if (!product || !currentUser) return;
        setIsGeneratingLicense(true);
        try {
            const masterLogoBuffer = logos.master ? await (async () => { try { const res = await fetch(logos.master); return await res.arrayBuffer(); } catch(e) {
            reportClientError('src/components/store/product-view.tsx:491', e); return null; } })() : null;
            const watermarkLogoBuffer = logos.watermark ? await (async () => { try { const res = await fetch(logos.watermark); return await res.arrayBuffer(); } catch(e) {
            reportClientError('src/components/store/product-view.tsx:492', e); return null; } })() : null;
            
            const docSectionsChildren: any[] = [];
            if (masterLogoBuffer) {
                docSectionsChildren.push(
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: masterLogoBuffer, transformation: { width: 80, height: 80 } } as any)], }),
                    new Paragraph({ text: "\n" })
                );
            }
            
            docSectionsChildren.push(
                new Paragraph({ text: "12LABS AI STUDIO", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
                new Paragraph({ text: "COMMERCIAL USAGE LICENSE", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
                new Paragraph({ children: [new TextRun({ text: "LICENSED TO: ", bold: true, size: 24 }), new TextRun({ text: currentUser.name || currentUser.email || '', size: 24 })] }),
                new Paragraph({ children: [new TextRun({ text: "PRODUCT: ", bold: true, size: 24 }), new TextRun({ text: product.title, size: 24 })] }),
                new Paragraph({ text: "This certificate confirms that the user mentioned above has purchased the digital asset and is hereby granted a worldwide, perpetual license.", spacing: { before: 400 } }),
                new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "✔ VERIFIED BY 12LABS", bold: true, size: 24, color: "22c55e" })], spacing: { before: 800 } })
            );

            if (watermarkLogoBuffer) {
                docSectionsChildren.push(
                    new Paragraph({ text: "\n\n" }),
                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ data: watermarkLogoBuffer, transformation: { width: 120, height: 40 } } as any)] })
                );
            }

            const doc = new Document({
                sections: [{
                    children: docSectionsChildren
                }]
            });
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `12labs_license_${product.title.replace(/\s+/g, '_')}.docx`);
        } finally { setIsGeneratingLicense(false); }
    };

    const handleDownloadTxt = async () => {
        const result = await getSecureDownloadUrls(product.id, activeUid || '');
        if (result.success && result.fullScriptContent) {
            saveAs(new Blob([result.fullScriptContent], { type: 'text/plain;charset=utf-8' }), `12labs_${product.title.replace(/\s+/g, '_')}.txt`);
        }
    };

    const handleFollowToggle = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Please log in to subscribe.' });
            return;
        }
        if (user.uid === product.sellerId) return;

        setIsLoadingFollow(true);
        const result = await toggleFollowSeller(product.sellerId, user.uid);
        if (result.success) {
            setIsFollowing(result.isFollowing);
            toast({ title: result.isFollowing ? 'Subscribed to Creator!' : 'Unsubscribed' });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
        setIsLoadingFollow(false);
    };

    const isSoldOut = product.status === 'sold' && !hasPurchased;

    const safeFormattedDate = useMemo(() => {
        if (!product.createdAt) return 'Recently';
        const date = typeof product.createdAt === 'string' ? parseISO(product.createdAt) : new Date(product.createdAt);
        return isValid(date) ? format(date, 'PP') : 'Recently';
    }, [product.createdAt]);

    return (
        <div className="pb-32">
            <div className="container mx-auto max-w-6xl py-10 px-4">
                <div className="grid lg:grid-cols-3 gap-8 md:gap-12">
                    <div className="lg:col-span-2 space-y-4">
                        <Carousel setApi={setApi} plugins={[plugin.current]} className="w-full">
                            <CarouselContent>
                                {effectivePreviews.map((preview, index) => (
                                    <CarouselItem key={index}>
                                        <div className="aspect-video w-full bg-muted rounded-3xl overflow-hidden relative group border shadow-sm">
                                            {preview.type === 'image' ? <img src={getDisplayUrl(preview.url)} alt="P" className="w-full h-full object-contain" /> : <video src={getDisplayUrl(preview.url)} controls className="w-full h-full object-contain" />}
                                        </div>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            {effectivePreviews.length > 1 && (<><CarouselPrevious className="left-2" /><CarouselNext className="right-2" /></>)}
                        </Carousel>
                        <div className="space-y-4 pt-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <Badge variant="secondary" className="font-black uppercase text-[10px] px-3 h-6 tracking-widest bg-primary/5 text-primary border-primary/10">{product.productType}</Badge>
                                {isVerifiedPartner && (<Badge className="bg-primary/10 text-primary border-none h-6 px-3 text-[10px] uppercase font-black flex items-center gap-1"><VerifiedBadge className="h-3 w-3" /> Verified Partner</Badge>)}
                            </div>
                            <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase leading-none">{product.title}</h1>
                            
                            {isVerifiedPartner && globalDiscount > 0 && (
                                <div className="flex items-baseline gap-3 pt-2">
                                    <span className="text-2xl md:text-3xl font-black text-primary">₹{displayPrice}</span>
                                    <span className="text-lg font-bold text-muted-foreground line-through opacity-50">₹{product.tieredPricing ? (product.tieredPricing as any)[selectedTier] || product.price : product.price}</span>
                                    <Badge className="bg-primary text-white font-black text-[10px] px-2 h-5 border-none rounded-lg uppercase">{globalDiscount}% OFF</Badge>
                                </div>
                            )}

                            <div className="flex items-center flex-wrap gap-x-6 gap-y-3 text-muted-foreground pt-2">
                                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><Calendar className="h-4 w-4" /><span>Listed {safeFormattedDate}</span></div>
                            </div>
                        </div>
                        <Separator className="my-8" />
                        {isStory && (
                            <div className="space-y-8 pt-4">
                                <h3 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-4"><Activity className="h-8 w-8 text-primary" />ASSET SPECIFICATIONS</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <MetadataBlock icon={Globe} label="Audio Language" value={product.language} />
                                    <MetadataBlock icon={Cpu} label="AI Audio Sync" value={!!product.isAiGenerated} colorClass="text-green-500" statusBadge />
                                    <MetadataBlock icon={Sparkles} label="Video Quality" value={product.quality} colorClass="text-amber-500" />
                                    <MetadataBlock icon={MonitorPlay} label="Resolution" value={product.resolution} />
                                    <MetadataBlock icon={Clock} label="Duration" value={product.duration} />
                                    <MetadataBlock icon={Download} label="File Size Range" value={product.videoSize} colorClass="text-blue-600" />
                                    <MetadataBlock icon={Layers} label="Scene Density" value={product.frameCount} />
                                    <MetadataBlock icon={UserCircle} label="Target Audience" value={product.targetAudience} />
                                    <MetadataBlock icon={MessageSquare} label="Emotional Tone" value={product.emotionalTone} />
                                    <MetadataBlock icon={Award} label="License Hub" value="Full Commercial" colorClass="text-green-600" />
                                    <MetadataBlock icon={Volume2} label="Sound FX" value={product.soundFx} />
                                    <MetadataBlock icon={Music} label="BGM" value={product.bgm} />
                                </div>
                            </div>
                        )}
                        <div className="space-y-6 pt-12">
                            <h3 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-4"><Info className="h-8 w-8 text-primary" />PRODUCTION INSIGHT</h3>
                            <p className="text-muted-foreground text-lg leading-relaxed whitespace-pre-wrap font-medium">{product.description}</p>
                            
                            {isScript && (scriptPreviewText.length > 0 || isFetchingPreview) && (
                                <div className="space-y-4 pt-6">
                                    <h4 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                                        <FileText className="h-6 w-6 text-primary" />
                                        SCRIPT BLUEPRINT (PREVIEW)
                                    </h4>
                                    <div
                                        className="border-2 border-primary/10 rounded-[2rem] p-6 sm:p-10 bg-muted/20 font-mono text-sm leading-relaxed shadow-inner relative select-none"
                                        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                                        onCopy={(e) => {
                                            e.preventDefault();
                                            toast({ variant: 'destructive', title: 'Copying disabled', description: 'Purchase the script to get the full, downloadable manuscript.' });
                                        }}
                                        onCut={(e) => e.preventDefault()}
                                        onContextMenu={(e) => e.preventDefault()}
                                        onDragStart={(e) => e.preventDefault()}
                                    >
                                        {isFetchingPreview ? (
                                            <div className="flex flex-col items-center justify-center py-10 gap-3 opacity-30">
                                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                <p className="text-[10px] font-black uppercase tracking-widest">Fetching GCS Preview...</p>
                                            </div>
                                        ) : (
                                            scriptPreviewText.map((line, index) => (
                                                <div key={index} className="mb-2">
                                                    {line.trim() === '[LOCKED_LINE]' ? (
                                                        <Badge variant="outline" className="h-6 px-3 bg-background border-primary/20 text-primary font-black uppercase text-[9px] tracking-widest gap-2">
                                                            <Lock className="h-3 w-3" /> 
                                                            FULL SCRIPT ENCRYPTED - UNLOCK VIA PURCHASE
                                                        </Badge>
                                                    ) : (
                                                        <p className="whitespace-pre-wrap break-words opacity-80">{line}</p>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between px-4">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 italic">
                                            Displaying 30% teaser of the complete manuscript.
                                        </p>
                                        {product.characterCount && (
                                            <Badge variant="secondary" className="h-5 px-2 text-[9px] font-black uppercase bg-primary/5 text-primary/70">
                                                {product.characterCount.toLocaleString()} CHARACTERS
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="lg:col-span-1">
                        <Card className="sticky top-24 border-primary/10 shadow-2xl overflow-hidden rounded-[2.5rem]">
                            <CardHeader className="bg-primary/5 pb-6 border-b border-primary/10 text-center">
                                {hasPurchased ? (<div className="space-y-1"><Badge className="bg-green-600 text-white font-black uppercase tracking-widest">OWNED BY YOU</Badge><CardTitle className="text-xl font-black mt-2">Secured Archive Active</CardTitle></div>) : isSoldOut ? (<div className="space-y-1"><Badge variant="destructive" className="font-black uppercase tracking-widest">SOLD OUT</Badge><CardTitle className="text-xl font-black mt-2">Exclusive Asset Sold</CardTitle></div>) : (<><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Standard Entry</p><CardTitle className="text-5xl font-black tracking-tighter">₹{displayPrice}</CardTitle></>)}
                            </CardHeader>
                            <CardContent className="pt-8 space-y-8">
                                {hasPurchased ? (
                                    <div className="space-y-6">
                                        <div className="p-5 rounded-3xl bg-green-500/5 border border-green-500/10 text-center space-y-3">
                                            <div className="p-3 bg-green-500/20 rounded-2xl w-fit mx-auto"><ShieldCheck className="h-8 w-8 text-green-600" /></div>
                                            <p className="text-[10px] font-bold text-green-700 uppercase">Licensed for commercial projects.</p>
                                        </div>
                                        <div className="space-y-4">
                                            {isScript && (<Button onClick={handleDownloadTxt} className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine uppercase gap-3"><Download className="h-6 w-6" />Download .TXT</Button>)}
                                            <div className="grid grid-cols-2 gap-3">
                                                <Button variant="secondary" className="h-12 rounded-xl font-black text-[10px] uppercase tracking-widest gap-2 bg-primary/5 text-primary border-primary/10 shadow-sm" onClick={handleDownloadLicense} disabled={isGeneratingLicense}>{isGeneratingLicense ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}License</Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : isSoldOut ? (
                                    <div className="space-y-6">
                                        <div className="p-5 rounded-3xl bg-muted/30 border-2 border-dashed text-center space-y-3 grayscale"><Gem className="h-8 w-8 text-muted-foreground mx-auto" /><p className="text-xs font-bold text-muted-foreground uppercase">This exclusive item has been sold.</p></div><Button variant="outline" className="w-full h-16 text-sm font-black rounded-2xl border-2 uppercase" asChild><Link href="/store">BROWSE MARKETPLACE</Link></Button>
                                    </div>
                                ) : (
                                    <>
                                        {product.tieredPricing && (
                                            <div className="space-y-4">
                                                <p className="text-[10px] font-black uppercase text-primary px-1">Select Tier</p>
                                                <RadioGroup value={selectedTier} onValueChange={(v: any) => setSelectedTier(v)} className="grid gap-3">
                                                    <Label className={cn("flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer", selectedTier === 'singleChannel' ? 'border-primary bg-primary/5' : 'border-muted/50 opacity-60')}>
                                                        <div className="flex items-center gap-3">
                                                            <RadioGroupItem value="singleChannel" id="t1" />
                                                            <div className="space-y-0.5"><p className="font-black text-sm uppercase">Single Channel</p></div>
                                                        </div>
                                                        <span className="font-black">₹{product.tieredPricing.singleChannel}</span>
                                                    </Label>
                                                    <Label className={cn("flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer", selectedTier === 'multipleWorks' ? 'border-primary bg-primary/5' : 'border-muted/50 opacity-60')}>
                                                        <div className="flex items-center gap-3">
                                                            <RadioGroupItem value="multipleWorks" id="t2" />
                                                            <div className="space-y-0.5"><p className="font-black text-sm uppercase">Multi-Commercial</p></div>
                                                        </div>
                                                        <span className="font-black">₹{product.tieredPricing.multipleWorks}</span>
                                                    </Label>
                                                </RadioGroup>
                                            </div>
                                        )}
                                        {isInCart(product.id) ? (<Button className="w-full h-16 text-lg font-black rounded-2xl bg-green-600 hover:bg-green-700 uppercase" asChild><Link href="/store/checkout"><Check className="mr-3 h-6 w-6" /> GO TO CHECKOUT</Link></Button>) : (<Button className="w-full h-16 text-xl font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine uppercase tracking-tight" onClick={handleAddToCart}><ShoppingCart className="mr-3 h-6 w-6" /> ADD TO CART</Button>)}
                                    </>
                                )}
                            </CardContent>
                            {seller && (
                                <CardFooter className="p-6 bg-muted/20 border-t">
                                    <div className="flex items-center justify-between w-full gap-3">
                                        <Link href={`/seller/${product.sellerId}`} className="flex items-center justify-between p-2 rounded-2xl transition-all hover:bg-background/80 flex-grow min-w-0 group">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Avatar className="h-10 w-10 shadow-md">
                                                    <AvatarImage src={getDisplayUrl(seller.profileImageUrl)} />
                                                    <AvatarFallback className={cn("font-black text-xs", avatarColor.bg, avatarColor.text)}>{seller.storeName.charAt(0).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1"><p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Creator</p>{isVerifiedPartner && <VerifiedBadge className="h-3 w-3" />}</div>
                                                    <p className="font-black text-sm truncate">{seller.storeName}</p>
                                                </div>
                                            </div>
                                        </Link>
                                        {user && user.uid !== product.sellerId && (
                                            <Button onClick={handleFollowToggle} disabled={isLoadingFollow} variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full hover:bg-primary/10 hover:text-primary transition-all active:scale-90">
                                                {isLoadingFollow ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Heart className={cn("h-5 w-5", isFollowing && "fill-current text-primary")}/>}
                                            </Button>
                                        )}
                                    </div>
                                </CardFooter>
                            )}
                        </Card>
                        {isAdmin && (<div className="mt-6"><Button variant="outline" className="w-full h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest border-primary/10 text-primary/70 hover:bg-primary transition-all gap-3" onClick={() => setIsAdminEditOpen(true)}><Edit className="h-4 w-4" /> Admin Override</Button></div>)}
                    </div>
                </div>
            </div>
            {isAdmin && <AdminEditDialog product={product} open={isAdminEditOpen} onOpenChange={setIsAdminEditOpen} onUpdate={() => window.location.reload()}/>}
        </div>
    );
}
