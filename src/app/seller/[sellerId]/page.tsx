
'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, get } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { SellerProfile, Product, StoreProduct } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, AlertTriangle, MoreVertical, Heart, Loader2, ShieldAlert, Share2, Gem, Hourglass, Video, Play, Coins, MonitorPlay, UserPlus, Eye, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from '@/hooks/use-toast';
import { cn, generateAvatarColor, getDisplayUrl, formatDistanceToNowShort } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';
import { toggleFollowSeller, checkFollowStatus } from '../actions';
import { adminToggleSellerVerification, adminDeleteProduct } from '@/app/store/admin-actions';
import { AdminEditProductDialog } from '@/components/store/admin-edit-product-dialog';
import { VerifiedBadge } from '@/components/verified-badge';
import { Badge } from '@/components/ui/badge';

function ProductCardPlaceholder() {
    return (
        <div className="flex flex-col w-full mb-8">
            <Skeleton className="aspect-video w-full rounded-[2rem]" />
            <div className="flex items-start gap-3 p-3 pt-4">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                </div>
            </div>
        </div>
    )
}

function ProductCard({ product, seller, onUpdate }: { product: StoreProduct; seller?: SellerProfile; onUpdate?: () => void }) {
    const { toast } = useToast();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [isEditOpen, setIsEditOpen] = useState(false);
    
    const isVerified = seller?.isVerified || false;
    const displayImageUrl = getDisplayUrl(product.previewImage || product.previews?.[0]?.url);

    const discountPercentage = product.originalPrice && product.originalPrice > product.price
        ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
        : 0;

    const isStory = product.productType === 'YouTube Story';

    const handleShare = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const shareUrl = `${window.location.origin}/store/${product.id}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: product.title,
                    text: `Check out this product on 12Labs: ${product.title}`,
                    url: shareUrl,
                });
            } catch (error) {
                console.error('Error sharing:', error);
            }
        } else {
            navigator.clipboard.writeText(shareUrl);
            toast({ title: 'Link Copied!', description: 'Product link copied to clipboard.' });
        }
    };
    
    return (
        <div className="flex flex-col w-full bg-background mb-8 group animate-in fade-in duration-500">
            <Link href={`/store/${product.id}`} prefetch={false} className="relative block w-full aspect-video overflow-hidden rounded-[2rem] border-primary/5 shadow-md group-hover:shadow-xl transition-all duration-500 bg-muted/30">
                <img
                    src={displayImageUrl || 'https://res.cloudinary.com/dptryoeis/image/upload/v1772590885/c10h0lknqblj7kfxp5qr.png'}
                    alt={product.title}
                    className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105 disable-long-press-download"
                    loading="lazy"
                />

                {isStory && (
                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none z-10">
                        <div className="p-3 bg-white/20 backdrop-blur-md rounded-full border border-white/30 shadow-2xl scale-100 group-hover:scale-110 transition-transform duration-500">
                            <Play className="h-8 w-8 text-white fill-current" />
                        </div>
                    </div>
                )}
                
                {discountPercentage > 0 && (
                    <div className="absolute top-3 left-3 z-20">
                        <Badge className="bg-destructive text-white font-black text-[11px] h-7 px-3 rounded-full shadow-2xl shadow-destructive/50 border-none animate-pulse uppercase tracking-tighter">
                            {discountPercentage}% OFF
                        </Badge>
                    </div>
                )}

                <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5 z-20">
                    <div className="flex items-center gap-1.5">
                        {product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-[11px] font-black text-white/40 line-through decoration-red-500/80 bg-black/60 px-1.5 rounded-sm">
                                ₹{product.originalPrice}
                            </span>
                        )}
                        <Badge className="bg-primary text-white font-black text-[12px] px-2 h-7 border-none rounded-lg shadow-2xl leading-none">
                            ₹{product.price}
                        </Badge>
                    </div>
                </div>

                {isStory && product.duration && (
                    <div className="absolute bottom-3 left-3 z-20">
                        <Badge className="bg-black/90 text-white font-mono font-bold text-[10px] h-5 px-1.5 border-none rounded flex items-center gap-1 leading-none">
                            <Video className="h-2.5 w-2.5" />
                            {product.duration.replace(' Minutes', '')}
                        </Badge>
                    </div>
                )}

                {product.isOneTimePurchase && (
                    <div className="absolute top-3 right-3 z-20">
                         <div className="bg-amber-500/90 text-white p-2 rounded-xl shadow-2xl animate-pulse">
                            <Gem className="h-4 w-4 fill-current" />
                         </div>
                    </div>
                )}
            </Link>

            <div className="flex items-start gap-3 p-3 pt-5">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex justify-between items-start gap-2">
                        <Link href={`/store/${product.id}`} prefetch={false} className="flex-1">
                            <h3 className="font-black text-[15px] leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors uppercase tracking-tight">
                                {product.title}
                            </h3>
                        </Link>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 shrink-0 rounded-full" onClick={(e) => e.stopPropagation()}>
                                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-2xl">
                                <DropdownMenuItem onClick={handleShare} className="h-11 rounded-lg cursor-pointer font-bold">
                                    <Share2 className="mr-3 h-4 w-4" /> Share Listing
                                </DropdownMenuItem>
                                {isAdmin && (
                                    <>
                                        <DropdownMenuSeparator className="my-1" />
                                        <DropdownMenuItem 
                                            onClick={(e) => { e.stopPropagation(); setIsEditOpen(true); }} 
                                            className="h-11 rounded-lg cursor-pointer font-bold text-primary"
                                        >
                                            <Edit className="mr-3 h-4 w-4" /> Admin Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                            onClick={async (e) => { 
                                                e.stopPropagation(); 
                                                if(window.confirm('Delete product?')) { 
                                                    await adminDeleteProduct(product.id); 
                                                    if (onUpdate) onUpdate(); 
                                                } 
                                            }} 
                                            className="h-11 rounded-lg cursor-pointer text-destructive font-bold"
                                        >
                                            <Trash2 className="mr-3 h-4 w-4" /> Admin Delete
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <div className="flex flex-wrap items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mt-1">
                        {isStory && <span className="text-red-600 mr-2">[READY VIDEO]</span>}
                        <span>{isStory ? 'Readymade Video' : product.productType}</span>
                        {product.createdAt && (
                            <>
                                <span className="mx-2">•</span>
                                <span>{formatDistanceToNowShort(product.createdAt)}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {isAdmin && (
                <AdminEditProductDialog 
                    product={product} 
                    open={isEditOpen} 
                    onOpenChange={setIsEditOpen} 
                    onUpdate={() => { if (onUpdate) onUpdate(); }} 
                />
            )}
        </div>
    );
}

function Description({ text }: { text: string }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isLong = text.length > 100;
    const displayText = isExpanded || !isLong ? text : `${text.substring(0, 100)}`;

    return (
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {displayText}
            {isLong && !isExpanded && <span>... </span>}
            {isLong && (
                <Button variant="link" className="p-0 h-auto text-xs font-black text-primary uppercase tracking-widest ml-1" onClick={() => setIsExpanded(!isExpanded)}>
                    {isExpanded ? 'Show Less' : 'Read More'}
                </Button>
            )}
        </p>
    );
}

export default function SellerPublicProfilePage() {
    const params = useParams();
    const sellerId = params.sellerId as string;
    const { database } = initializeFirebase();
    const { toast } = useToast();
    const { user } = useAuth();

    const [profile, setProfile] = useState<SellerProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isLoadingFollow, setIsLoadingFollow] = useState(true);
    const [followerCount, setFollowerCount] = useState<number | null>(null);
    const [isTogglingPartner, setIsTogglingPartner] = useState(false);
    
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);

    useEffect(() => {
        if (sellerId && database) {
            const profileRef = ref(database, `sellerProfiles/${sellerId}`);
            const unsubscribe = onRtdbValue(profileRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    setProfile(data);
                    setFollowerCount(data.followerCount || 0);
                } else {
                    setProfile(null);
                }
                setProfileLoading(false);
            }, (error) => {
                console.error("Failed to fetch seller profile:", error);
                setProfileLoading(false);
            });
            return () => unsubscribe();
        } else {
            setProfileLoading(false);
        }
    }, [sellerId, database]);

    useEffect(() => {
        if (!sellerId || !database) return;
        setProductsLoading(true);

        const storeProductsRef = ref(database, 'storeProducts');
        const unsubscribe = onRtdbValue(storeProductsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const filteredProducts: StoreProduct[] = Object.entries(data)
                    .filter(([_, val]: [string, any]) => {
                        if (!val || typeof val !== 'object' || !val.title || !val.productType) return false;
                        if (val.sellerId !== sellerId) return false;
                        const isSold = val.status === 'sold' || val.isSold === true || Boolean(val.buyerUid);
                        if (!isSold) return true;
                        const isAdmin = user?.role === 'admin';
                        const isBuyerOrSeller = (user?.uid && (val.buyerUid === user.uid || val.sellerId === user.uid));
                        return isAdmin || isBuyerOrSeller;
                    })
                    .map(([id, val]: [string, any]) => ({
                        ...val,
                        id: val.id || id
                    }));
                
                setProducts(filteredProducts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            } else {
                setProducts([]);
            }
            setProductsLoading(false);
        });

        return () => unsubscribe();
    }, [sellerId, database]);

    useEffect(() => {
        if (user && sellerId) {
            setIsLoadingFollow(true);
            checkFollowStatus(sellerId, user.uid).then(status => {
                setIsFollowing(status);
                setIsLoadingFollow(false);
            });
        } else {
            setIsLoadingFollow(false);
        }
      }, [user, sellerId]);
    
      const handleFollowToggle = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Please log in to subscribe.' });
            return;
        }
        if (user.uid === sellerId) return;
    
        setIsLoadingFollow(true);
        const result = await toggleFollowSeller(sellerId, user.uid);
        if (result.success) {
            setIsFollowing(result.isFollowing);
            setFollowerCount(prev => {
                if (prev === null) return 1;
                return result.isFollowing ? prev + 1 : prev - 1;
            });
            toast({
                title: result.isFollowing ? 'Subscribed to Creator!' : 'Unsubscribed',
            });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
        setIsLoadingFollow(false);
      };

      const handleTogglePartner = async () => {
          if (!profile) return;
          setIsTogglingPartner(true);
          const result = await adminToggleSellerVerification(sellerId, !!profile.isVerified);
          if (result.success) {
              toast({ title: 'Status Updated' });
          } else {
              toast({ variant: 'destructive', title: 'Toggle Failed', description: result.message });
          }
          setIsTogglingPartner(false);
      };

    const isLoading = profileLoading || productsLoading;
    const isAdmin = user?.role === 'admin';

    if (!isLoading && !profile) {
        return (
            <div className="container mx-auto text-center py-20">
                 <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
                <h1 className="text-2xl font-bold">Creator Not Found</h1>
                <p className="text-muted-foreground">The requested creator profile does not exist.</p>
                 <Button asChild className="mt-6">
                    <Link href="/store" prefetch={false}>Back to Store</Link>
                </Button>
            </div>
        )
    }

    if (!isLoading && profile && profile.status !== 'approved' && !isAdmin) {
        return (
            <div className="container mx-auto flex items-center justify-center min-h-[calc(100vh-200px)]">
                <Card className="max-w-md text-center rounded-3xl p-8 border-none shadow-xl bg-card">
                    <CardHeader className="p-0 space-y-6">
                        <div className="mx-auto bg-amber-100 p-4 rounded-full w-fit mb-6">
                            <Hourglass className="h-10 w-10 text-amber-600 animate-pulse" />
                        </div>
                        <h1 className="text-2xl font-black uppercase tracking-tight">Profile Restricted</h1>
                        <p className="text-muted-foreground mt-2 font-medium">This creator profile is currently under review by our moderation team.</p>
                    </CardHeader>
                    <CardContent className="pt-8">
                        <Button asChild className="rounded-xl font-bold px-8">
                            <Link href="/store">Return to Store</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const avatarColor = profile ? generateAvatarColor(profile.storeName) : { bg: '', text: '' };

    return (
        <div className="pb-32" onContextMenu={(e) => e.preventDefault()}>
            {isLoading ? (
                <div className="container px-4 pt-12">
                    <Skeleton className="h-24 w-24 md:h-32 md:w-32 rounded-full border-4 border-background" />
                    <div className="mt-4 space-y-2">
                         <Skeleton className="h-7 w-48" />
                         <Skeleton className="h-4 w-32" />
                         <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            ) : profile && (
                <div className="container px-4 pt-12">
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        <div className="relative group shrink-0">
                            <Avatar className="h-24 w-24 md:h-40 md:w-40 rounded-full border-4 border-background shadow-2xl flex-shrink-0 transition-transform duration-500 group-hover:scale-105">
                                <AvatarImage src={getDisplayUrl(profile.profileImageUrl)} alt={profile.storeName} className="object-cover" />
                                <AvatarFallback className={cn("font-black text-4xl", avatarColor.bg, avatarColor.text)}>
                                    {profile.storeName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                        </div>

                        <div className="flex-grow pt-2">
                            <div className="flex items-center gap-4 flex-wrap">
                                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter flex items-center gap-3 uppercase">
                                    {profile.storeName}
                                    {profile.isVerified && <VerifiedBadge className="h-8 w-8" />}
                                </h1>
                                
                                <div className="flex items-center gap-2 ml-auto">
                                    {isAdmin && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full bg-muted/50 border">
                                                    <MoreVertical className="h-5 w-5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-2xl">
                                                <DropdownMenuItem onClick={handleTogglePartner} className="h-11 rounded-lg cursor-pointer font-bold">
                                                    {isTogglingPartner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <VerifiedBadge className="mr-2 h-4 w-4" />}
                                                    {profile.isVerified ? 'Remove Partner' : 'Verify Partner'}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="h-11 rounded-lg cursor-pointer">
                                                    <Link href={`/admin/users?uid=${sellerId}`}>Admin User Hub</Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}

                                    {user && user.uid !== sellerId && (
                                        <Button 
                                            onClick={handleFollowToggle} 
                                            disabled={isLoadingFollow} 
                                            variant={isFollowing ? 'secondary' : 'default'} 
                                            className="h-11 px-8 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/10 transition-all active:scale-95"
                                        >
                                            {isLoadingFollow ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : (isFollowing ? <Heart className="mr-2 h-4 w-4 fill-current text-primary" /> : <UserPlus className="mr-2 h-4 w-4" />)}
                                            {isFollowing ? 'Subscribed' : 'Subscribe'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-3">
                                <Badge variant="secondary" className="font-black uppercase text-[10px] px-3 h-6 tracking-widest bg-primary/5 text-primary/70 border-primary/10">
                                    {followerCount !== null ? `${followerCount.toLocaleString()} Subscribers` : '...'}
                                </Badge>
                                <Badge variant="outline" className="font-black uppercase text-[10px] px-3 h-6 tracking-widest border-primary/10">
                                    {(products?.length || 0)} Assets Live
                                </Badge>
                            </div>
                            <div className="mt-6 border-l-4 border-primary/10 pl-6 py-1">
                                <Description text={profile.description} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="container px-4 mt-10">
                 <div className="flex items-center justify-between border-b pb-4 mb-10">
                    <h2 className="text-xl font-black uppercase tracking-[0.2em] text-primary/60">Marketplace Listings</h2>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-4">
                    {isLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                           <ProductCardPlaceholder key={i} />
                        ))
                    ) : products && products.length > 0 ? (
                        products.map(product => <ProductCard key={product.id} product={product} seller={profile || undefined} />)
                    ) : (
                        <div className="text-center py-32 col-span-full border-4 border-dashed rounded-[3rem] opacity-20 flex flex-col items-center justify-center">
                            <Package className="mx-auto h-20 w-20 text-muted-foreground" />
                            <h3 className="mt-6 text-2xl font-black uppercase tracking-widest">Inventory Empty</h3>
                        </div>
                    )}
                 </div>
            </div>
        </div>
    );
}

