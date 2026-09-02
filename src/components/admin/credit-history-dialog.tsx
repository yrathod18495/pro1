'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { UserProfile, CreditHistoryEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { format } from 'date-fns';
import { 
    CreditCard, Gift, Undo2, Zap, Sparkles, MicVocal, ImageIcon, 
    PlusCircle, Loader2, CalendarClock, History as HistoryIcon, Activity,
    FilePenLine, ShoppingCart, RefreshCw, Trophy, MonitorPlay, Sliders,
    Music, RotateCcw
} from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFirestore, initializeFirebase } from '@/firebase';
import { 
  doc, 
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { syncUserSubscriptionInstallments } from '@/app/actions';
import { plans } from '@/lib/plans';
import { reportClientError } from '@/lib/report-client-error';

const safeFormatDate = (dateVal: any, formatStr: string): string => {
  if (!dateVal) return 'N/A';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) {
      return String(dateVal);
    }
    return format(d, formatStr);
  } catch (err) {
            reportClientError('src/components/admin/credit-history-dialog.tsx:50', err);
    return String(dateVal);
  }
};

interface CreditHistoryDialogProps {
  user: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showBuyButton?: boolean;
}

const getIconForReason = (reason: string, amount: number = 0) => {
    const lowerCaseReason = reason.toLowerCase();
    
    if (lowerCaseReason.includes('admin') || lowerCaseReason.includes('adjustment')) {
        return <Sliders className="h-5 w-5 text-indigo-600" />;
    }

    if (amount >= 0) {
        if (lowerCaseReason.includes('purchase')) return <CreditCard className="h-5 w-5 text-blue-600" />;
        if (lowerCaseReason.includes('initial credits') || lowerCaseReason.includes('promo code') || lowerCaseReason.includes('reward')) return <Gift className="h-5 w-5 text-green-600" />;
        if (lowerCaseReason.includes('refund')) return <Undo2 className="h-5 w-5 text-orange-600" />;
        if (lowerCaseReason.includes('giveaway')) return <Trophy className="h-5 w-5 text-yellow-500" />;
        return <PlusCircle className="h-5 w-5 text-green-600" />;
    }

    if (lowerCaseReason.includes('music studio') || lowerCaseReason.includes('music ai') || lowerCaseReason.includes('lyria')) return <Music className="h-5 w-5 text-pink-500" />;
    if (lowerCaseReason.includes('fast gen') || lowerCaseReason.includes('new ai studio') || lowerCaseReason.includes('chatterbox')) return <Zap className="h-5 w-5 text-amber-500" />;
    if (lowerCaseReason.includes('hq gen') || lowerCaseReason.includes('high-quality') || lowerCaseReason.includes('hq studio')) return <Sparkles className="h-5 w-5 text-blue-500" />;
    if (lowerCaseReason.includes('voice clone')) return <MicVocal className="h-5 w-5 text-purple-500" />;
    if (lowerCaseReason.includes('thumbnail')) return <ImageIcon className="h-5 w-5 text-pink-500" />;
    if (lowerCaseReason.includes('script ai') || lowerCaseReason.includes('story script') || lowerCaseReason.includes('script studio')) return <FilePenLine className="h-5 w-5 text-cyan-500" />;
    if (lowerCaseReason.includes('voice swap') || lowerCaseReason.includes('voice replacement')) return <RotateCcw className="h-5 w-5 text-orange-500" />;
    if (lowerCaseReason.includes('store purchase') || lowerCaseReason.includes('marketplace')) return <ShoppingCart className="h-5 w-5 text-emerald-500" />;
    if (lowerCaseReason.includes('editor sync') || lowerCaseReason.includes('node sync')) return <RefreshCw className="h-5 w-5 text-indigo-500" />;
    if (lowerCaseReason.includes('ad credits') || lowerCaseReason.includes('watch ad')) return <MonitorPlay className="h-5 w-5 text-indigo-500" />;
    if (lowerCaseReason.includes('regenerate')) return <RotateCcw className="h-5 w-5 text-rose-500" />;
    
    return <Zap className="h-5 w-5 text-muted-foreground opacity-40" />;
};

export function CreditHistoryDialog({ user, open, onOpenChange, showBuyButton = false }: CreditHistoryDialogProps) {
  const firestore = useFirestore();
  const { database } = initializeFirebase();
  
  const [history, setHistory] = useState<CreditHistoryEntry[]>([]);
  const [rtdbHistory, setRtdbHistory] = useState<CreditHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Long reasons (e.g. raw error messages with URLs) are clamped by default
  // so they can't push the credit amount off-screen; tap to expand one.
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((key: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  
  const upcomingInstallment = useMemo(() => {
    const sub = user?.subscription;
    if (!sub) return false;
    const maxGrants = plans.find(p => p.id === sub.planId)?.maxGrants ?? 4;
    return (sub.planId === 'autopay_pro' || sub.planId === 'test_sub') && 
           (sub.status === 'active' || sub.status === 'cancelled') && 
           (sub.weeklyGrantCount || 0) < maxGrants;
  }, [user]);

  // 1. Listen to Realtime History (RTDB)
  useEffect(() => {
    if (!open || !user?.uid || !database) return;

    // Read the user ledger first and apply the display limit locally. This
    // avoids RTDB query/rules edge cases where limitToLast is rejected and the
    // balance still changes successfully on the server.
    const rtdbRef = ref(database, `creditHistory/${user.uid}`);
    const unsubscribe = onRtdbValue(rtdbRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data && typeof data === 'object') {
                const list = Object.entries(data)
                    .map(([id, val]: [string, any]) => {
                        if (val && typeof val === 'object') {
                            return { id, ...val };
                        }
                        return null;
                    })
                    .filter((item): item is any => item !== null);
                setRtdbHistory(list
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .slice(0, 100));
            } else {
                setRtdbHistory([]);
            }
        } else {
            setRtdbHistory([]);
        }
    }, (error) => {
        console.error('[Credit History] RTDB read failed:', error);
        setRtdbHistory([]);
    });

    return () => unsubscribe();
  }, [open, user?.uid, database]);

  // 2. Fetch Legacy History (Firestore)
  const fetchLegacyHistory = useCallback(async (isInitial = false) => {
    if (!firestore || !user?.uid) return;

    if (isInitial) {
        setIsLoading(true);
    } else {
        setIsLoadingMore(true);
    }
    
    try {
      let combinedEntries: CreditHistoryEntry[] = [];
      
      if (isInitial) {
        const historyLogRef = doc(firestore, 'users', user.uid, 'creditHistory', 'history_log');
        const historyLogSnap = await getDoc(historyLogRef);
        if (historyLogSnap.exists()) {
          const data = historyLogSnap.data() as { entries: CreditHistoryEntry[] };
          combinedEntries.push(...(data.entries || []).slice(0, 10));
        }
      }

      let oldHistoryQuery = query(
          collection(firestore, 'users', user.uid, 'creditHistory'),
          limit(10)
      );

      if (!isInitial && lastDoc) {
        oldHistoryQuery = query(oldHistoryQuery, startAfter(lastDoc));
      }
      
      const oldHistorySnapshot = await getDocs(oldHistoryQuery);
      
      oldHistorySnapshot.docs.forEach(doc => {
          if (doc.id !== 'history_log') {
              combinedEntries.push(doc.data() as CreditHistoryEntry);
          }
      });
      
      const lastVisible = oldHistorySnapshot.docs[oldHistorySnapshot.docs.length - 1];
      setHasMore(oldHistorySnapshot.docs.length === 10);
      setLastDoc(lastVisible || null);
      
      setHistory(prev => isInitial ? combinedEntries : [...prev, ...combinedEntries]);

    } catch (error) {
        console.error("Legacy history fetch failed:", error);
    } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
    }
  }, [firestore, user?.uid, lastDoc]);

  // Effect to trigger only on open to prevent infinite loops
  useEffect(() => {
    if (open) {
      // Reset pagination for each open. Do not depend on fetchLegacyHistory
      // here: that callback depends on lastDoc, and including it caused every
      // pagination update to trigger another initial fetch (visible blinking).
      setHistory([]);
      setLastDoc(null);
      setHasMore(true);
      if (user?.uid && user?.subscription?.nextWeeklyGrantDate) {
        const nextDate = new Date(user.subscription.nextWeeklyGrantDate);
        const maxGrants = plans.find(p => p.id === user.subscription?.planId)?.maxGrants ?? 4;
        if (new Date() >= nextDate && (user.subscription.weeklyGrantCount || 0) < maxGrants) {
          syncUserSubscriptionInstallments(user.uid)
            .then(() => fetchLegacyHistory(true))
            .catch(() => fetchLegacyHistory(true));
          return;
        }
      }
      fetchLegacyHistory(true);
    }
    // Intentionally use stable scalar values. See the pagination note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.uid, user?.subscription?.nextWeeklyGrantDate, user?.subscription?.weeklyGrantCount]);

  const fullUnifiedHistory = useMemo(() => {
    const combined = [...rtdbHistory, ...history].filter(
        item => item && typeof item === 'object' && item.timestamp && item.reason
    );
    // Remove duplicates via timestamp + reason unique key
    const unique = Array.from(new Map(combined.map(item => [`${item.timestamp}-${item.reason}`, item])).values());
    return unique.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (isNaN(timeA) || isNaN(timeB)) return 0;
        return timeB - timeA;
    });
  }, [rtdbHistory, history]);

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) fetchLegacyHistory(false);
  };

  const [activeFilter, setActiveFilter] = useState<'all' | 'plans'>('all');

  const getPlanDetails = (entry: CreditHistoryEntry) => {
    const r = (entry.reason || '').toLowerCase();
    let badge = 'PLAN';

    if (r.includes('starter') || r.includes('139')) {
      badge = 'STARTER';
    } else if ((r.includes('pro') || r.includes('331') || r.includes('336')) && !r.includes('autopay')) {
      badge = 'PRO';
    } else if (r.includes('business') || r.includes('534') || r.includes('540')) {
      badge = 'BUSINESS';
    } else if (r.includes('enterprise') || r.includes('999')) {
      badge = 'ENTERPRISE';
    } else if (r.includes('consistency') || r.includes('autopay') || r.includes('700') || r.includes('week 1')) {
      badge = 'CONSISTENCY (AUTOPAY)';
    }

    return { badge };
  };

  const plansHistory = useMemo(() => {
     return fullUnifiedHistory.filter(entry => {
      const r = (entry.reason || '').toLowerCase();
      // Plan entries are credit grants/purchases. Do not classify a usage
      // entry such as "Pro Studio: ..." as a plan merely because it contains
      // the word "pro".
      const isCreditGrant = Number(entry.amount ?? 0) > 0;
      const isPurchase = Number(entry.amountPaid ?? 0) > 0 ||
        r.includes('purchase') ||
        r.includes('plan') ||
        r.includes('consistency') ||
        r.includes('grant') ||
        r.includes('starter') ||
        r.includes('business') ||
        r.includes('enterprise') ||
        r.includes('autopay');
      return isCreditGrant && isPurchase;
    });
  }, [fullUnifiedHistory]);

  const visibleHistory = activeFilter === 'all' ? fullUnifiedHistory : plansHistory;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[2.5rem] p-0 overflow-hidden border-none shadow-3xl bg-background">
        <DialogHeader className="p-8 pb-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
              <div>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Production & Plans Ledger</DialogTitle>
                  <DialogDescription className="font-black text-[10px] uppercase tracking-[0.2em] text-primary/60 mt-1">
                    Balance: {user.credits.toLocaleString()} Credits
                  </DialogDescription>
              </div>
          </div>
          
          <div className="flex gap-2 mt-4">
              <Button 
                  size="sm" 
                  variant={activeFilter === 'all' ? 'default' : 'outline'} 
                  onClick={() => setActiveFilter('all')}
                  className="rounded-xl font-black text-[10px] uppercase tracking-wider h-8 flex-1"
              >
                  All Activity ({fullUnifiedHistory.length})
              </Button>
              <Button 
                  size="sm" 
                  variant={activeFilter === 'plans' ? 'default' : 'outline'} 
                  onClick={() => setActiveFilter('plans')}
                  className="rounded-xl font-black text-[10px] uppercase tracking-wider h-8 flex-1 border-primary/20"
              >
                  <CreditCard className="h-3 w-3 mr-1" /> Plans & Subs ({plansHistory.length})
              </Button>
          </div>
        </DialogHeader>
        
        <ScrollArea className="h-[450px]">
            <div className="p-6 space-y-3">
            {upcomingInstallment && !isLoading && (
                <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 border border-amber-500/15 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500 shadow-inner dark:bg-amber-950/20">
                            <CalendarClock className="h-5 w-5" />
                        </div>
                        <div className="flex-grow min-w-0">
                            <p className="font-black text-sm uppercase tracking-tight text-amber-500 whitespace-normal leading-tight">
                                UPCOMING: {(plans.find(p => p.id === user?.subscription?.planId)?.grantIntervalDays ?? 7) === 1 ? 'Day' : 'Week'} {(user?.subscription?.weeklyGrantCount || 0) + 1} Grant
                            </p>
                            <p className="text-[9px] font-black text-amber-500/70 uppercase tracking-widest mt-1">
                                Scheduled: {user?.subscription?.nextWeeklyGrantDate ? safeFormatDate(user.subscription.nextWeeklyGrantDate, "MMM d, h:mm a") : 'Pending'}
                            </p>
                        </div>
                        <div className="text-lg font-black shrink-0 tracking-tighter text-amber-500 ml-2">
                            +{user?.subscription?.planId === 'test_sub' ? '2' : '20,000'}
                        </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-1">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                            Plan Progress: {(plans.find(p => p.id === user?.subscription?.planId)?.grantIntervalDays ?? 7) === 1 ? 'Day' : 'Week'} {user?.subscription?.weeklyGrantCount || 0} of {plans.find(p => p.id === user?.subscription?.planId)?.maxGrants ?? 4} Completed
                        </span>
                        <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-black text-[8px] tracking-wider uppercase px-2 py-0.5 rounded">
                            {Math.max(0, (plans.find(p => p.id === user?.subscription?.planId)?.maxGrants ?? 4) - (user?.subscription?.weeklyGrantCount || 0))} {(plans.find(p => p.id === user?.subscription?.planId)?.grantIntervalDays ?? 7) === 1 ? 'Days' : 'Weeks'} Left
                        </Badge>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="space-y-3">
                    {Array.from({length: 4}).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 rounded-[1.5rem] p-4 border border-dashed opacity-50">
                            <Skeleton className="h-11 w-11 rounded-xl" />
                            <div className="flex-grow space-y-2">
                               <Skeleton className="h-4 w-3/4 rounded-lg" />
                               <Skeleton className="h-3 w-1/2 rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : visibleHistory.length > 0 ? (
                <>
                <div className="space-y-3">
                    {visibleHistory.map((entry, index) => {
                        const planDetails = getPlanDetails(entry);
                        const isExpired = (entry.reason || '').toLowerCase().includes('expire');
                        const entryKey = `${entry.timestamp}-${index}`;
                        const reasonText = entry.reason || '';
                        // Long raw error strings (URLs, stack fragments) are clamped by
                        // default so they can never push the credit amount off-screen.
                        const isLongReason = reasonText.length > 70;
                        const isExpanded = expandedEntries.has(entryKey);
                        return (
                            <div key={entryKey} className={cn(
                                "flex items-center gap-4 rounded-2xl bg-card p-4 border shadow-sm transition-all hover:shadow-xl",
                                isExpired ? "border-red-500/20 bg-red-500/5" : "border-primary/5 hover:border-primary/20"
                            )}>
                                <div className={cn(
                                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-inner",
                                    isExpired ? 'bg-red-100 text-red-600 dark:bg-red-950/40' : (entry.amount ?? 0) >= 0 ? 'bg-green-50' : 'bg-muted/50'
                                )}>
                                    {getIconForReason(entry.reason, entry.amount ?? 0)}
                                </div>
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1 min-w-0">
                                        <p
                                            className={cn(
                                                "font-black text-[13px] uppercase tracking-tight leading-tight whitespace-normal break-all min-w-0",
                                                isLongReason && !isExpanded && "line-clamp-2",
                                                isLongReason && "cursor-pointer"
                                            )}
                                            onClick={isLongReason ? () => toggleExpanded(entryKey) : undefined}
                                        >
                                            {reasonText}
                                            {isLongReason && (
                                                <span className="ml-1 normal-case text-primary/70 font-bold tracking-normal">
                                                    {isExpanded ? ' (show less)' : '...'}
                                                </span>
                                            )}
                                        </p>
                                        {isExpired ? (
                                            <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20 text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0">
                                                EXPIRED
                                            </Badge>
                                        ) : (entry.isPaid === true || (entry.amountPaid && entry.amountPaid > 0) || (entry.reason?.toLowerCase().includes('purchase') && !entry.reason?.toLowerCase().includes('free'))) ? (
                                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0">
                                                {planDetails.badge}
                                            </Badge>
                                        ) : (entry.isPaid === false || entry.amountPaid === 0 || entry.reason?.toLowerCase().includes('free') || entry.reason?.toLowerCase().includes('giveaway')) ? (
                                            <Badge variant="outline" className="text-blue-600 bg-blue-500/10 border-blue-500/20 text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0">
                                                FREE / BONUS
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <p className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">
                                        {safeFormatDate(entry.timestamp, "MMM d, yyyy • h:mm a")}
                                    </p>
                                </div>
                                <div className={cn('text-lg font-black shrink-0 tracking-tighter ml-2', isExpired ? 'text-muted-foreground' : (entry.amount ?? 0) >= 0 ? 'text-green-600 dark:text-green-500' : 'text-foreground')}>
                                    {(entry.amount ?? 0) >= 0 ? '+' : ''}{(entry.amount ?? 0).toLocaleString()}
                                </div>
                            </div>
                        );
                    })}
                </div>
                 {hasMore && activeFilter === 'all' && (
                    <div className="pt-6 flex justify-center">
                        <Button onClick={handleLoadMore} disabled={isLoadingMore} variant="outline" className="rounded-xl font-black text-[10px] uppercase tracking-widest h-11 px-10 border-primary/10 hover:bg-primary/5">
                            {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <RefreshCw className="h-4 w-4 mr-2" />}
                            {isLoadingMore ? 'Syncing...' : 'Sync Previous Records'}
                        </Button>
                    </div>
                )}
                </>
            ) : (
                <div className="text-center py-20 opacity-20 italic">
                    <HistoryIcon className="mx-auto h-12 w-12 mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">Archives Empty</p>
                </div>
            )}
            </div>
        </ScrollArea>

        <DialogFooter className="p-8 border-t bg-muted/20">
          <Button className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-md" variant="outline" onClick={() => onOpenChange(false)}>
            Exit Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
