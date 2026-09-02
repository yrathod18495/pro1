
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IndianRupee, Wallet, Calendar, History, Loader2, PackageSearch, Landmark } from 'lucide-react';
import { getAffiliateDashboardData, type AffiliateDashboardData } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import type { AffiliateTransaction } from '@/lib/types';


function StatCard({ title, value, isLoading }: { title: string, value: string | number, isLoading: boolean }) {
  const formattedValue = typeof value === 'number' ? `₹${value.toFixed(2)}` : value;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24 mt-1" />
        ) : (
          <div className="text-3xl font-bold">{formattedValue}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PayoutsPage() {
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [data, setData] = useState<AffiliateDashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 🔒 AUTH GUARD: this is personal payout/earnings data — redirect
    // unauthenticated visitors to /login instead of silently rendering it.
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [authLoading, user, router]);


    useEffect(() => {
        if (user?.uid) {
            getAffiliateDashboardData(user.uid).then(result => {
                if (result.success && result.data) {
                    setData(result.data);
                } else if (!result.success) {
                    toast({ variant: 'destructive', title: 'Error', description: result.message });
                }
            }).finally(() => setIsLoading(false));
        }
    }, [user, toast]);
    
    const transactionsForDisplay = data?.transactions || [];

    if (authLoading || !user) {
        return (
            <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-5xl py-10 space-y-8">
             <div className="space-y-1.5">
                <h1 className="text-3xl font-bold tracking-tight">Affiliate Payouts</h1>
                <p className="text-muted-foreground">Track your earnings and see your payment history.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard title="Today's Earnings" value={data?.todayEarnings ?? 0} isLoading={isLoading} />
                <StatCard title="Yesterday's Earnings" value={data?.yesterdayEarnings ?? 0} isLoading={isLoading} />
                <StatCard title="Withdrawable Balance" value={data?.withdrawableAmount ?? 0} isLoading={isLoading} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Total Earnings</CardTitle>
                    </CardHeader>
                    <CardContent className="text-4xl font-bold text-primary">
                        {isLoading ? <Skeleton className="h-10 w-40" /> : `₹${(data?.totalEarnings ?? 0).toFixed(2)}`}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Total Withdrawn</CardTitle>
                    </CardHeader>
                    <CardContent className="text-4xl font-bold">
                        {isLoading ? <Skeleton className="h-10 w-40" /> : `₹${(data?.totalWithdrawn ?? 0).toFixed(2)}`}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Commission History</CardTitle>
                    <CardDescription>
                        A log of all commissions you've earned from sales using your code: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{data?.affiliateCode}</code>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Your Commission</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={2}><Skeleton className="h-6 w-full" /></TableCell>
                                    </TableRow>
                                ))
                            ) : transactionsForDisplay.length > 0 ? (
                                transactionsForDisplay.map((tx) => (
                                    <TableRow key={tx.id}>
                                        <TableCell>{format(new Date(tx.timestamp), 'PP')}</TableCell>
                                        <TableCell className="text-right font-medium text-green-600">+₹{tx.commissionEarned.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-48 text-center">
                                        <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground" />
                                        <p className="mt-4">No commissions earned yet.</p>
                                        <p className="text-sm text-muted-foreground">Share your code to start earning!</p>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

        </div>
    );
}
