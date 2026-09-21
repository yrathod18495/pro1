'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase, useMemoFirebase, useCollection } from '@/firebase';
import { collection, query, where } from 'firebase/firestore'; 
import type { PendingPayment, Order } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Activity, Loader2, Save, CheckCircle2, Clock } from 'lucide-react';
import { format, subDays, parseISO, isValid } from 'date-fns';
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell, Tooltip } from "recharts";
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { savePaidUntilDate } from '@/app/admin/payments/settings-actions';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Badge } from '@/components/ui/badge';

const chartConfig = {
  revenue: {
    label: "Revenue (₹)",
  },
  today: {
    label: "Today",
    color: "#22c55e",
  },
  paid: {
    label: "Paid Cycle",
    color: "#94a3b8",
  },
  unpaid: {
    label: "Unpaid Balance",
    color: "#6366f1",
  }
} satisfies ChartConfig;

function parseToDate(raw: any): Date | null {
  if (!raw) return null;
  if (typeof raw === 'number') return new Date(raw);
  if (typeof raw === 'string') {
    const d = parseISO(raw);
    if (isValid(d)) return d;
    const d2 = new Date(raw);
    if (isValid(d2)) return d2;
  }
  if (typeof raw === 'object') {
    if (typeof raw.toDate === 'function') return raw.toDate();
    if (raw.seconds) return new Date(raw.seconds * 1000);
  }
  return null;
}

interface DailyDataItem {
  date: string;
  fullDateStr: string;
  revenue: number;
  fill: string;
  statusLabel: string;
}

export function CreditUsageSummary() {
  const { user: currentUser } = useAuth();
  const { firestore } = initializeFirebase();
  const { toast } = useToast();
  const [dailyData, setDailyData] = useState<DailyDataItem[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [unpaidBalance, setUnpaidBalance] = useState(0);
  const [showTotals, setShowTotals] = useState(true);
  
  const [paidUntilDate, setPaidUntilDate] = useState<string | null>(null);
  const [dateInputValue, setDateInputValue] = useState<string>('');
  const [isSavingDate, setIsSavingDate] = useState(false);

  const paymentsQuery = useMemoFirebase(() => {
    if (firestore && currentUser?.role === 'admin') {
      return query(collection(firestore, 'pendingPayments'), where('status', '==', 'approved'));
    }
    return null;
  }, [firestore, currentUser?.role]);
  
  const { data: payments, isLoading: isLoadingPayments } = useCollection<PendingPayment>(paymentsQuery);

  const storeOrdersQuery = useMemoFirebase(() => {
    if (firestore && currentUser?.role === 'admin') {
      return query(collection(firestore, 'storeHistory'), where('status', '==', 'paid'));
    }
    return null;
  }, [firestore, currentUser?.role]);

  const { data: storeOrders, isLoading: isLoadingOrders } = useCollection<Order>(storeOrdersQuery);

  const isLoading = isLoadingPayments || isLoadingOrders;

  useEffect(() => {
    const { database: db } = initializeFirebase();
    if (!db) return;
    const dateRef = ref(db, 'settings/payments/paidUntilDate');
    const unsubscribe = onRtdbValue(dateRef, (snapshot) => {
        const val = snapshot.val();
        setPaidUntilDate(val || null);
        setDateInputValue(val || '');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (payments || storeOrders) {
      const revenueByDate: { [key: string]: number } = {};
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      (payments || []).forEach(payment => {
        let paymentAmount = (Number(payment.amount) || 0) / 100;
        if (payment.currency === 'USD') {
            paymentAmount *= 85;
        }
        const dt = parseToDate(payment.createdAt || payment.timestamp);
        if (dt) {
          const paymentDateStr = format(dt, 'yyyy-MM-dd');
          revenueByDate[paymentDateStr] = (revenueByDate[paymentDateStr] || 0) + paymentAmount;
        }
      });

      (storeOrders || []).forEach(order => {
        const orderAmount = (Number(order.amount) || 0) / 100;
        const dt = parseToDate(order.createdAt);
        if (dt) {
          const orderDateStr = format(dt, 'yyyy-MM-dd');
          revenueByDate[orderDateStr] = (revenueByDate[orderDateStr] || 0) + orderAmount;
        }
      });

      const last10DaysData: DailyDataItem[] = [];
      for (let i = 0; i < 10; i++) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, 'yyyy-MM-dd');
        
        let fillColor = "#6366f1"; // Unpaid Indigo
        let statusLabel = "Unpaid";

        if (dateStr === todayStr) {
          fillColor = "#22c55e"; // Today Green
          statusLabel = "Today";
        } else if (paidUntilDate && dateStr <= paidUntilDate) {
          fillColor = "#94a3b8"; // Paid Slate
          statusLabel = "Paid (Settled)";
        }

        last10DaysData.push({
          date: format(date, 'd MMM'),
          fullDateStr: dateStr,
          revenue: Math.round(revenueByDate[dateStr] || 0),
          fill: fillColor,
          statusLabel
        });
      }
      
      setDailyData(last10DaysData.reverse());
      setTotalRevenue(Object.values(revenueByDate).reduce((sum, rev) => sum + rev, 0));

      let calculatedUnpaid = 0;
      for (const date in revenueByDate) {
        if ((!paidUntilDate || date > paidUntilDate) && date < todayStr) {
            calculatedUnpaid += revenueByDate[date];
        }
      }
      setUnpaidBalance(calculatedUnpaid);
    }
  }, [payments, storeOrders, paidUntilDate]);
  
  const handleSaveDate = async () => {
    if (!currentUser?.email) return;
    setIsSavingDate(true);
    const result = await savePaidUntilDate(dateInputValue, currentUser.email);
    if (result.success) toast({ title: 'Last Paid Date Synced Successfully' });
    else toast({ variant: 'destructive', title: 'Save Failed', description: result.message });
    setIsSavingDate(false);
  };

  const handleQuickSetDate = (daysAgo: number) => {
    const targetDate = format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');
    setDateInputValue(targetDate);
  };

  return (
    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
        <CardHeader className="bg-primary/5 pb-6 border-b border-primary/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <CardTitle className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3 text-primary">
                    <Activity className="h-5 w-5 text-primary" /> 
                    Live Revenue Pulse
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-1">
                    Consolidated financial nodes (last 10 days)
                </CardDescription>
            </div>

            {/* Last Paid Date Indicator Badge */}
            <div className="flex items-center gap-2">
                {paidUntilDate ? (
                    <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 px-3 py-1.5 rounded-xl font-black text-[11px] gap-2 shadow-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Last Paid Until: <b>{format(parseISO(paidUntilDate), 'dd MMM yyyy')}</b></span>
                    </Badge>
                ) : (
                    <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 px-3 py-1.5 rounded-xl font-black text-[11px] gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-600" />
                        <span>Last Paid Date: <b>Not Set</b></span>
                    </Badge>
                )}
            </div>
        </CardHeader>

        <CardContent className="pt-6">
            {/* Color Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-3 rounded-2xl bg-muted/20 border border-border/40 text-xs font-bold">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-[#94a3b8] ring-2 ring-[#94a3b8]/30"></span>
                        <span className="text-muted-foreground">Paid Cycle (Settled)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-[#6366f1] ring-2 ring-[#6366f1]/30"></span>
                        <span className="text-foreground">Unpaid Balance</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-[#22c55e] ring-2 ring-[#22c55e]/30"></span>
                        <span className="text-emerald-600 dark:text-emerald-400">Today</span>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <Skeleton className="h-52 w-full rounded-2xl" />
            ) : (
                <div className="h-[230px] w-full">
                    <ChartContainer config={chartConfig} className="h-full w-full">
                        <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                style={{ fontSize: '11px', fontWeight: 'bold' }}
                                dy={10}
                            />
                            <YAxis 
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => `₹${v}`}
                                style={{ fontSize: '10px', fontWeight: 'bold' }}
                                width={45}
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload as DailyDataItem;
                                        return (
                                            <div className="bg-popover text-popover-foreground p-3 rounded-xl shadow-xl border text-xs space-y-1">
                                                <p className="font-black text-muted-foreground">{data.date}</p>
                                                <p className="text-sm font-black">₹{data.revenue.toLocaleString('en-IN')}</p>
                                                <div className="flex items-center gap-1.5 pt-1">
                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: data.fill }}></span>
                                                    <span className="font-bold text-[11px]" style={{ color: data.fill }}>{data.statusLabel}</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="revenue" radius={[6, 6, 0, 0]} barSize={34}>
                                {dailyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </div>
            )}
        </CardContent>

        <CardFooter className="flex flex-col items-start gap-6 border-t pt-6 bg-muted/5">
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span>LIFETIME SYSTEM REVENUE (INR)</span>
                </div>
                {isLoading ? (
                    <Skeleton className="h-6 w-24" />
                ) : showTotals ? (
                    <p className="text-2xl font-black tracking-tighter text-foreground">
                        ₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </p>
                ) : (
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase rounded-lg border-primary/20" onClick={() => setShowTotals(true)}>
                        LOAD TOTALS
                    </Button>
                )}
            </div>
            
            <Separator className="opacity-40" />
            
            <div className="w-full flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
                <div className="flex-1 space-y-2.5 w-full">
                    <div className="flex items-center justify-between px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Mark Revenue as Paid Until Date
                        </Label>
                        {paidUntilDate && (
                            <span className="text-[10px] font-bold text-muted-foreground">
                                Currently: <b className="text-emerald-600 dark:text-emerald-400">{paidUntilDate}</b>
                            </span>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <Input
                            type="date"
                            value={dateInputValue}
                            onChange={(e) => setDateInputValue(e.target.value)}
                            className="h-11 rounded-xl bg-background border-primary/10 font-bold"
                        />
                        <Button onClick={handleSaveDate} disabled={isSavingDate} className="h-11 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] gap-2">
                            {isSavingDate ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4" />}
                            SYNC DATE
                        </Button>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Quick Set:</span>
                        <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px] font-bold rounded-lg" onClick={() => handleQuickSetDate(1)}>
                            Yesterday
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px] font-bold rounded-lg" onClick={() => handleQuickSetDate(2)}>
                            2 Days Ago
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px] font-bold rounded-lg" onClick={() => handleQuickSetDate(3)}>
                            3 Days Ago
                        </Button>
                        {dateInputValue && (
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] font-bold text-destructive hover:text-destructive" onClick={() => setDateInputValue('')}>
                                Clear
                            </Button>
                        )}
                    </div>
                </div>

                <div className="w-full lg:w-56 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col justify-center items-end">
                    <p className="text-[9px] font-black text-primary/70 uppercase tracking-widest mb-1">Unpaid Cycle Balance</p>
                    <div className="text-xl font-black tracking-tighter text-primary">
                        ₹{unpaidBalance.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </div>
                    <p className="text-[9px] text-muted-foreground font-medium mt-1">
                        {paidUntilDate ? `Revenue after ${paidUntilDate}` : 'All revenue unpaid'}
                    </p>
                </div>
            </div>
        </CardFooter>
    </Card>
  );
}
