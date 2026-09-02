'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { BarChart3, Coins, FileText, ImageIcon, Music, Sparkles, Zap, MicVocal, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailySummaryData {
    scriptsGenerated?: number;
    normalScriptAnalysis?: number;
    fastVoicesGenerated?: number;
    hqVoicesSubmitted?: number;
    thumbnailsGenerated?: number;
    soundSearches?: number;
    chatterboxGenerations?: number;
    voiceCloningGenerations?: number;
    creditsSpent?: number;
    creditsPurchased?: number;
    newUserJoined?: number;
}

function SummaryRow({ icon, label, value, isLoading, colorClass }: { icon: React.ReactNode, label: string, value: string | number, isLoading: boolean, colorClass?: string }) {
    return (
        <div className="flex items-center justify-between p-2 rounded-xl border border-primary/5 bg-muted/5 transition-all hover:bg-muted/10 group">
            <div className="flex items-center gap-2 min-w-0">
                <div className={cn("p-1.5 rounded-lg bg-background shadow-sm border border-primary/5 group-hover:scale-105 transition-transform duration-300", colorClass || "text-primary")}>
                    {icon}
                </div>
                <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground/80 truncate">{label}</span>
            </div>
            {isLoading ? (
                <Skeleton className="h-4 w-12 rounded-lg" />
            ) : (
                <span className="text-sm font-black font-mono tracking-tighter text-foreground pl-2">
                    {value}
                </span>
            )}
        </div>
    );
}

export function DailySummary() {
    const { database } = initializeFirebase();
    const [summary, setSummary] = useState<DailySummaryData>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) {
            setIsLoading(false);
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const summaryRef = ref(db, `dailySummaries/${today}`);

        const unsubscribe = onRtdbValue(summaryRef, (snapshot) => {
            const data = snapshot.val();
            setSummary(data || {});
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const totalVoiceGenerations = (summary.fastVoicesGenerated || 0) + (summary.chatterboxGenerations || 0) + (summary.voiceCloningGenerations || 0) + (summary.hqVoicesSubmitted || 0);

    return (
        <Card className="rounded-[2rem] border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 p-4 border-b border-primary/10">
                <CardTitle className="text-[9px] font-black uppercase tracking-[0.3em] flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Daily Operations
                </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
                <div className="grid grid-cols-2 gap-2">
                    <SummaryRow icon={<Coins className="h-3.5 w-3.5" />} label="Purchased" value={(summary.creditsPurchased || 0).toLocaleString()} isLoading={isLoading} colorClass="text-green-600" />
                    <SummaryRow icon={<Coins className="h-3.5 w-3.5" />} label="Consumed" value={(summary.creditsSpent || 0).toLocaleString()} isLoading={isLoading} colorClass="text-red-500" />
                    <SummaryRow icon={<UserPlus className="h-3.5 w-3.5" />} label="New Signups" value={(summary.newUserJoined || 0).toLocaleString()} isLoading={isLoading} colorClass="text-cyan-500" />
                    <SummaryRow icon={<Sparkles className="h-3.5 w-3.5" />} label="Conversions" value={totalVoiceGenerations.toLocaleString()} isLoading={isLoading} colorClass="text-blue-500" />
                    <SummaryRow icon={<FileText className="h-3.5 w-3.5" />} label="Normal SN" value={(summary.normalScriptAnalysis || 0).toLocaleString()} isLoading={isLoading} colorClass="text-amber-500" />
                    <SummaryRow icon={<FileText className="h-3.5 w-3.5" />} label="Manuscripts" value={(summary.scriptsGenerated || 0).toLocaleString()} isLoading={isLoading} colorClass="text-orange-500" />
                    <SummaryRow icon={<ImageIcon className="h-3.5 w-3.5" />} label="Mapped" value={(summary.thumbnailsGenerated || 0).toLocaleString()} isLoading={isLoading} colorClass="text-purple-500" />
                    <SummaryRow icon={<Music className="h-3.5 w-3.5" />} label="Extractions" value={(summary.soundSearches || 0).toLocaleString()} isLoading={isLoading} colorClass="text-pink-500" />
                    <SummaryRow icon={<MicVocal className="h-3.5 w-3.5" />} label="Deep Renders" value={(summary.hqVoicesSubmitted || 0).toLocaleString()} isLoading={isLoading} colorClass="text-indigo-600" />
                </div>
            </CardContent>
        </Card>
    )
}
