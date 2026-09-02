
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingBag, User, Store, Clock, IndianRupee, Coins, Search, ExternalLink, Package } from 'lucide-react';
import { getSoldProductsList, type SoldProductEntry } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function SoldProductsPage() {
    const [entries, setEntries] = useState<SoldProductEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const result = await getSoldProductsList();
            if (result.success && result.data) {
                setEntries(result.data);
            }
            setIsLoading(false);
        };
        fetchData();
    }, []);

    const filteredEntries = entries.filter(e => 
        e.productTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.sellerName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalInr = entries.filter(e => e.paymentMethod === 'cash').reduce((acc, e) => acc + (e.amount / 100), 0);
    const totalCredits = entries.filter(e => e.paymentMethod === 'credits').reduce((acc, e) => acc + (e.amount / 100) * 100, 0);

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black uppercase tracking-tighter leading-none flex items-center gap-4">
                        <ShoppingBag className="h-10 w-10 text-primary" />
                        Sold Assets
                    </h1>
                    <p className="text-muted-foreground font-bold text-xs uppercase tracking-[0.2em] opacity-60">Complete audit of marketplace sales</p>
                </div>
                
                <div className="flex flex-wrap gap-3">
                    <Card className="bg-primary/5 border-primary/10 rounded-2xl px-4 py-2 flex flex-col justify-center min-w-[120px]">
                        <span className="text-[8px] font-black text-primary/60 uppercase tracking-widest">Total Cash</span>
                        <span className="text-sm font-black">₹{totalInr.toLocaleString()}</span>
                    </Card>
                    <Card className="bg-purple-50 border-purple-100 rounded-2xl px-4 py-2 flex flex-col justify-center min-w-[120px]">
                        <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest">Total Credits</span>
                        <span className="text-sm font-black flex items-center gap-1">
                            <Coins className="h-3 w-3" />
                            {totalCredits.toLocaleString()}
                        </span>
                    </Card>
                </div>
            </div>

            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
                <CardHeader className="bg-muted/30 border-b p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg font-black uppercase">Sales Archive</CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-60">Verified marketplace transactions</CardDescription>
                        </div>
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Search title, seller, or buyer..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 rounded-xl bg-background border-primary/5 h-10"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/50 h-14">
                                <TableRow className="border-none">
                                    <TableHead className="pl-8 font-black uppercase tracking-widest text-[10px]">Asset Reference</TableHead>
                                    <TableHead className="font-black uppercase tracking-widest text-[10px]">Creator / Buyer</TableHead>
                                    <TableHead className="text-right font-black uppercase tracking-widest text-[10px]">Bounty</TableHead>
                                    <TableHead className="text-right pr-8 font-black uppercase tracking-widest text-[10px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i} className="h-24">
                                            <TableCell className="pl-8"><Skeleton className="h-6 w-48 rounded-lg" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-32 rounded-lg" /></TableCell>
                                            <TableCell className="text-right pr-8"><Skeleton className="h-6 w-20 ml-auto rounded-lg" /></TableCell>
                                            <TableCell />
                                        </TableRow>
                                    ))
                                ) : filteredEntries.length > 0 ? (
                                    filteredEntries.map((entry) => (
                                        <TableRow key={entry.id} className="min-h-[100px] hover:bg-primary/[0.02] transition-colors border-muted/10 group">
                                            <TableCell className="pl-8 py-6">
                                                <div className="space-y-1 max-w-[250px] sm:max-w-[400px]">
                                                    <div className="font-black text-sm uppercase leading-tight group-hover:text-primary transition-colors">
                                                        {entry.productTitle}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[8px] font-bold text-muted-foreground uppercase">
                                                        <Clock className="h-2.5 w-2.5" /> 
                                                        {format(new Date(entry.createdAt), 'PPpp')}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <Store className="h-3 w-3 text-primary opacity-40" />
                                                        <span className="text-[11px] font-black uppercase tracking-tighter">{entry.sellerName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-3 w-3 text-muted-foreground opacity-40" />
                                                        <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[150px]">{entry.userEmail}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        {entry.paymentMethod === 'credits' ? (
                                                            <>
                                                                <Coins className="h-4 w-4 text-primary fill-current" />
                                                                <span className="text-lg font-black tracking-tighter">{(entry.amount / 100) * 100}</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <IndianRupee className="h-4 w-4 text-foreground" />
                                                                <span className="text-lg font-black tracking-tighter">{entry.amount / 100}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <Badge variant="outline" className={cn(
                                                        "text-[8px] font-black uppercase px-1.5 h-4 border-none",
                                                        entry.paymentMethod === 'credits' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                                    )}>
                                                        {entry.paymentMethod}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="pr-8 text-right">
                                                <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10">
                                                    <Link href={`/store/${entry.productId}`}>
                                                        <ExternalLink className="h-4 w-4 text-primary/40 group-hover:text-primary transition-colors" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-64 text-center py-20 opacity-20 italic">
                                            <Package className="mx-auto h-16 w-16 mb-4" />
                                            <p className="text-xl font-bold uppercase tracking-widest">No Sales Found</p>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
            <footer className="text-center py-10 opacity-30 text-[10px] font-bold uppercase tracking-widest">
                12Labs Tools Hub • Built for Indian Creators
            </footer>
        </div>
    );
}
