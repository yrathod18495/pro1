'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { initializeFirebase } from '@/firebase';
import { ref, push, remove } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useToast } from '@/hooks/use-toast';
import { Quote, Plus, Trash2, Loader2 } from 'lucide-react';
import { reportClientError } from '@/lib/report-client-error';

interface QuoteEntry {
    id: string;
    text: string;
}

const QUOTES_PATH = 'settings/landingPage/quotes';

export function QuotesManager() {
    const { database } = initializeFirebase();
    const { toast } = useToast();
    const [quotes, setQuotes] = useState<QuoteEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newQuote, setNewQuote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) return;
        const quotesRef = ref(db, QUOTES_PATH);
        const unsubscribe = onRtdbValue(quotesRef, (snapshot) => {
            const data = snapshot.val() || {};
            const list: QuoteEntry[] = Object.entries(data).map(([id, text]) => ({ id, text: String(text) }));
            setQuotes(list);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleAdd = async () => {
        const text = newQuote.trim();
        if (!text || !database) return;
        setIsSaving(true);
        try {
            await push(ref(database, QUOTES_PATH), text);
            setNewQuote('');
            toast({ title: 'Quote Added', description: 'It will now rotate into the homepage marquee.' });
        } catch (error: any) {
            reportClientError('src/components/admin/quotes-manager.tsx:handleAdd', error);
            toast({ variant: 'destructive', title: 'Failed to Add', description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!database) return;
        setDeletingId(id);
        try {
            await remove(ref(database, `${QUOTES_PATH}/${id}`));
        } catch (error: any) {
            reportClientError('src/components/admin/quotes-manager.tsx:handleDelete', error);
            toast({ variant: 'destructive', title: 'Failed to Delete', description: error.message });
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Card className="rounded-[2rem] border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 pb-6 border-b border-primary/10">
                <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                    <Quote className="h-6 w-6 text-primary" />
                    Homepage Quotes
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest">
                    Custom lines you add here rotate into the scrolling capsule marquee under the homepage headline, alongside the built-in feature callouts.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-8 space-y-6">
                <div className="flex flex-col sm:flex-row gap-3">
                    <Textarea
                        value={newQuote}
                        onChange={(e) => setNewQuote(e.target.value)}
                        placeholder="Write a quote or line to show on the homepage..."
                        className="min-h-[44px] rounded-xl bg-muted/20 border-primary/5 text-sm resize-none"
                        rows={1}
                    />
                    <Button
                        onClick={handleAdd}
                        disabled={!newQuote.trim() || isSaving}
                        className="h-11 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shrink-0"
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                        Add
                    </Button>
                </div>

                <div className="space-y-2">
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-12 w-full rounded-xl" />
                            <Skeleton className="h-12 w-full rounded-xl" />
                        </div>
                    ) : quotes.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-8">
                            No custom quotes yet — only the built-in feature capsules are showing on the homepage.
                        </p>
                    ) : (
                        quotes.map((q) => (
                            <div
                                key={q.id}
                                className="flex items-center justify-between gap-3 p-3 pl-4 rounded-xl bg-muted/10 border border-primary/5"
                            >
                                <p className="text-sm font-medium break-words min-w-0 flex-1">{q.text}</p>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={deletingId === q.id}
                                    onClick={() => handleDelete(q.id)}
                                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                >
                                    {deletingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                        ))
                    )}
                </div>

                {quotes.length > 0 && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 font-bold text-[9px] uppercase px-3 py-1 rounded-full">
                        {quotes.length} Live Quote{quotes.length !== 1 ? 's' : ''}
                    </Badge>
                )}
            </CardContent>
        </Card>
    );
}
