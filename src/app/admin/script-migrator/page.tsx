
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    Database, Loader2, RefreshCw, ShieldCheck, 
    AlertTriangle, CheckCircle2, ListFilter, 
    Zap, FileText, Check, ArrowRight, ExternalLink
} from 'lucide-react';
import { fetchScriptsForMigration, migrateSingleScriptAction, type MigratableScript } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { reportClientError } from '@/lib/report-client-error';

export default function ScriptMigratorPage() {
    const [isFetching, setIsFetching] = useState(false);
    const [scripts, setScripts] = useState<MigratableScript[]>([]);
    const [isMigratingId, setIsMigratingId] = useState<string | null>(null);
    const { toast } = useToast();

    const handleFetch = async () => {
        setIsFetching(true);
        try {
            const res = await fetchScriptsForMigration();
            if (res.success && res.data) {
                setScripts(res.data);
                toast({ title: 'Sync Queue Populated' });
            } else throw new Error(res.message);
        } catch (e: any) {
            reportClientError('src/app/admin/script-migrator/page.tsx:31', e);
            toast({ variant: 'destructive', title: 'Fetch Failed', description: e.message });
        } finally {
            setIsFetching(false);
        }
    };

    const handleMigrateSingle = async (id: string) => {
        setIsMigratingId(id);
        try {
            const res = await migrateSingleScriptAction(id);
            if (res.success) {
                toast({ title: 'Node Migrated' });
                // Update local state to show completion
                setScripts(prev => prev.map(s => s.id === id ? { ...s, hasGcs: true } : s));
            } else throw new Error(res.message);
        } catch (e: any) {
            reportClientError('src/app/admin/script-migrator/page.tsx:47', e);
            toast({ variant: 'destructive', title: 'Migration Failed', description: e.message });
        } finally {
            setIsMigratingId(null);
        }
    };

    return (
        <div className="space-y-8 max-w-5xl mx-auto py-10 pb-24">
            <div className="flex flex-col gap-1">
                <h1 className="text-4xl font-black uppercase tracking-tight flex items-center gap-4">
                    <Database className="h-10 w-10 text-primary" />
                    Storage Migrator
                </h1>
                <p className="text-muted-foreground font-bold text-xs uppercase tracking-[0.2em] opacity-60 px-1">Syncing Legacy Assets to GCS Private Hub</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Controls Card */}
                <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden h-fit">
                    <CardHeader className="bg-primary/5 border-b p-8">
                        <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                            <Zap className="h-6 w-6 text-primary" />
                            Control Node
                        </CardTitle>
                        <CardDescription className="text-sm font-medium leading-relaxed">
                            फेच करने के बाद आप हर स्क्रिप्ट को बारी-बारी माइग्रेट कर सकते हैं। पुराने क्लाउडिनरी लिंक्स सुरक्षित रहेंगे।
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 space-y-6">
                        <Button 
                            onClick={handleFetch} 
                            disabled={isFetching} 
                            className="w-full h-16 rounded-2xl font-black text-lg btn-shine shadow-xl shadow-primary/20 uppercase gap-3"
                        >
                            {isFetching ? <Loader2 className="h-6 w-6 animate-spin" /> : <ListFilter className="h-6 w-6" />}
                            FETCH SYNC QUEUE
                        </Button>

                        <div className="flex items-center gap-3 p-5 rounded-2xl bg-destructive/5 border border-destructive/10">
                            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                            <p className="text-[9px] font-bold text-destructive uppercase leading-relaxed">
                                Avoid rapid clicking. Each migration creates a secure node on GCS and updates Firestore.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Queue List */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b p-8">
                            <CardTitle className="text-lg font-black uppercase flex items-center gap-3">
                                <FileText className="h-5 w-5 text-primary" />
                                Active Sync Queue ({scripts.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[500px]">
                                {scripts.length > 0 ? (
                                    <div className="divide-y divide-dashed">
                                        {scripts.map((script) => (
                                            <div key={script.id} className="p-6 flex items-center justify-between gap-6 hover:bg-muted/10 transition-colors">
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-black text-sm uppercase truncate tracking-tight">{script.title}</h3>
                                                    <p className="text-[9px] font-bold text-muted-foreground uppercase mt-1 opacity-50">By {script.sellerName} • ID: {script.id.slice(0, 8)}</p>
                                                </div>
                                                <div className="shrink-0">
                                                    {script.hasGcs ? (
                                                        <Badge className="bg-green-500 text-white h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-2">
                                                            <CheckCircle2 className="h-4 w-4" /> SYNCED
                                                        </Badge>
                                                    ) : (
                                                        <Button 
                                                            onClick={() => handleMigrateSingle(script.id)}
                                                            disabled={isMigratingId !== null}
                                                            size="sm"
                                                            className="h-10 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/10"
                                                        >
                                                            {isMigratingId === script.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <>MIGRATE <ArrowRight className="ml-2 h-3 w-3" /></>
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-[400px] text-center opacity-20 grayscale select-none gap-4">
                                        <History className="h-16 w-16" />
                                        <p className="font-black uppercase tracking-widest text-lg">No Records Loaded</p>
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <footer className="text-center py-10 opacity-30 text-[10px] font-bold uppercase tracking-widest">
                12Labs Migration Node v1.2 • GCS Protocol Enabled
            </footer>
        </div>
    );
}

function History(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    )
}
