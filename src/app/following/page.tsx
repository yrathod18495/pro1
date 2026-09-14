'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, get } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';
import type { SellerProfile } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, Store } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn, generateAvatarColor, getDisplayUrl } from '@/lib/utils';

export default function FollowingPage() {
    const { activeUid } = useAuth();
    const { firestore, database } = initializeFirebase();
    const [followedSellers, setFollowedSellers] = useState<SellerProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!activeUid || !firestore || !database) {
            setIsLoading(false);
            return;
        }

        const followingRef = collection(firestore, 'users', activeUid, 'following');
        const unsubscribe = onSnapshot(followingRef, async (snapshot) => {
            const sellerIds = snapshot.docs.map(doc => doc.id);
            if (sellerIds.length === 0) {
                setFollowedSellers([]);
                setIsLoading(false);
                return;
            }

            try {
                const profiles = await Promise.all(
                    sellerIds.map(async (id) => {
                        const snap = await get(ref(database, `sellerProfiles/${id}`));
                        return snap.exists() ? { id, ...snap.val() } : null;
                    })
                );
                setFollowedSellers(profiles.filter(Boolean) as SellerProfile[]);
            } catch (e) {
                console.error("Error fetching followed sellers:", e);
            } finally {
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, [activeUid, firestore, database]);

    return (
        <>
            <div className="container mx-auto max-w-5xl py-10 px-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
                            <Heart className="text-primary h-8 w-8 fill-current" />
                            Subscribed
                        </h1>
                        <p className="text-muted-foreground font-medium">Creators you've subscribed to in the marketplace.</p>
                    </div>
                    <Button asChild variant="outline" className="rounded-xl h-11 px-6 font-bold gap-2">
                        <Link href="/store">
                            <Store className="h-4 w-4" />
                            Explore Creators
                        </Link>
                    </Button>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex flex-col items-center gap-3">
                                <Skeleton className="h-24 w-24 rounded-full" />
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-16" />
                            </div>
                        ))}
                    </div>
                ) : followedSellers.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
                        {followedSellers.map(seller => {
                            const avatarColor = generateAvatarColor(seller.storeName);
                            return (
                                <Link key={seller.id} href={`/seller/${seller.id}`} className="group flex flex-col items-center text-center gap-3 p-4 rounded-[2rem] hover:bg-muted/50 transition-all">
                                    <Avatar className="h-24 w-24 border-4 border-background shadow-xl transition-transform group-hover:scale-110">
                                        <AvatarImage src={getDisplayUrl(seller.profileImageUrl)} className="object-cover" />
                                        <AvatarFallback className={cn("font-black text-2xl", avatarColor.bg, avatarColor.text)}>
                                            {seller.storeName.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-black text-base line-clamp-1 uppercase tracking-tight">{seller.storeName}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                                            {seller.followerCount || 0} Subscribers
                                        </p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-32 border-4 border-dashed rounded-[3rem] opacity-30 flex flex-col items-center justify-center">
                        <Heart className="h-20 w-20 text-muted-foreground mb-6" />
                        <h3 className="text-2xl font-black uppercase tracking-widest">No Subscriptions</h3>
                        <p className="text-sm font-bold text-muted-foreground mt-2 max-w-xs">Subscribe to your favorite creators to see them here and track their latest assets.</p>
                        <Button asChild className="mt-8 rounded-xl h-12 px-8 font-black uppercase tracking-widest text-xs">
                            <Link href="/store">Visit Store</Link>
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
}
