'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IndianRupee, Package, Users, Activity } from 'lucide-react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase, useMemoFirebase, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Product, Order } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

function StatCard({ title, value, description, icon, isLoading }: { title: string, value: string, description?: string, icon: React.ReactNode, isLoading: boolean }) {
  return (
    <Card className="transition-all hover:shadow-md hover:-translate-y-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-16 mt-1" />
              {description && <Skeleton className="h-4 w-32 mt-2" />}
            </>
          ) : (
            <>
              <div className="text-2xl font-bold">{value}</div>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </>
          )}
      </CardContent>
    </Card>
  );
}

export default function SellerDashboardPage() {
  const { user } = useAuth();
  const { firestore } = initializeFirebase();

  // Fetch Active Products Count
  const activeProductsQuery = useMemoFirebase(() => {
    if (user?.uid && firestore) {
      return query(
        collection(firestore, 'products'),
        where('sellerId', '==', user.uid),
        where('status', '==', 'approved')
      );
    }
    return null;
  }, [user, firestore]);

  const { data: activeProducts, isLoading: productsLoading } = useCollection<Product>(activeProductsQuery);

  // Fetch Sales Data
  const salesQuery = useMemoFirebase(() => {
    if (user?.uid && firestore) {
      return query(
        collection(firestore, 'storeHistory'),
        where('sellerId', '==', user.uid),
        where('status', '==', 'paid')
      );
    }
    return null;
  }, [user, firestore]);

  const { data: sales, isLoading: salesLoading } = useCollection<Order>(salesQuery);

  const stats = useMemo(() => {
    if (!sales) return { totalRevenue: 0, totalSales: 0, customers: 0 };
    
    const revenue = sales.reduce((acc, sale) => acc + (sale.amount / 100), 0);
    const uniqueCustomers = new Set(sales.map(s => s.userId)).size;
    
    return {
      totalRevenue: revenue,
      totalSales: sales.length,
      customers: uniqueCustomers
    };
  }, [sales]);

  const activeProductsCount = activeProducts ? activeProducts.length : 0;
  const isLoading = productsLoading || salesLoading;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Seller Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.name || 'Seller'}!</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
            title="Total Revenue" 
            value={`₹${stats.totalRevenue.toLocaleString()}`} 
            description="All-time sales" 
            icon={<IndianRupee className="h-4 w-4 text-muted-foreground" />} 
            isLoading={isLoading} 
        />
        <StatCard 
            title="Total Sales" 
            value={stats.totalSales.toString()} 
            description="Number of products sold" 
            icon={<Package className="h-4 w-4 text-muted-foreground" />} 
            isLoading={isLoading} 
        />
        <StatCard 
            title="Active Products" 
            value={activeProductsCount.toString()} 
            description="Products currently for sale" 
            icon={<Activity className="h-4 w-4 text-muted-foreground" />} 
            isLoading={isLoading} 
        />
        <StatCard 
            title="Customers" 
            value={stats.customers.toString()} 
            description="Unique buyers" 
            icon={<Users className="h-4 w-4 text-muted-foreground" />} 
            isLoading={isLoading} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
                <CardTitle>Recent Sales</CardTitle>
                <CardDescription>Your 5 most recent transactions.</CardDescription>
            </CardHeader>
            <CardContent>
                {!isLoading && sales && sales.length > 0 ? (
                    <div className="space-y-4">
                        {sales.slice(0, 5).map((sale) => (
                            <div key={sale.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-sm truncate">{sale.productTitle || 'Digital Asset'}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase font-medium">{format(new Date(sale.createdAt), 'PPpp')}</p>
                                </div>
                                <p className="font-black text-green-600 text-sm shrink-0 ml-4">+₹{sale.amount / 100}</p>
                            </div>
                        ))}
                    </div>
                ) : isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                    </div>
                ) : (
                    <div className="h-40 flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                        No sales data yet.
                    </div>
                )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
                <CardTitle>Active Listings</CardTitle>
                <CardDescription>Your products currently on the store.</CardDescription>
            </CardHeader>
            <CardContent>
                 {!isLoading && activeProducts && activeProducts.length > 0 ? (
                    <div className="space-y-4">
                        {activeProducts.slice(0, 5).map((product) => (
                            <div key={product.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                <p className="font-bold text-sm truncate pr-2">{product.title}</p>
                                <Badge variant="secondary" className="shrink-0 text-[10px] font-bold">₹{product.price}</Badge>
                            </div>
                        ))}
                        {activeProducts.length > 5 && (
                            <Button asChild variant="link" className="w-full text-xs font-bold uppercase tracking-widest p-0 h-auto">
                                <Link href="/seller/products">View All Products</Link>
                            </Button>
                        )}
                    </div>
                 ) : isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                    </div>
                 ) : (
                    <div className="h-40 flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                        No active products yet.
                    </div>
                 )}
            </CardContent>
          </Card>
      </div>
      
    </div>
  );
}
