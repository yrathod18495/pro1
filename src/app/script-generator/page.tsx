'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
    Loader2, 
    Sparkles, 
    Zap, 
    FileText, 
    Coins, 
    Activity, 
    CheckCircle2,
    Database,
    Trash2,
    Copy,
    Check,
    Download,
    ChevronDown,
    RotateCcw,
    Users,
    MessageSquare,
    Globe,
    Clock,
    UserCircle,
    Info,
    History as HistoryIcon,
    Search,
    Eye,
    BookOpen,
    FileCheck
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, update, remove } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { cn, getISTDateString, getDisplayUrl, checkIsPaidUser } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { deductScriptCreditsAction, finalizeScriptSelectionAction } from './actions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { downloadScriptAsPdf, downloadScriptAsTxt, downloadScriptAsDocx } from '@/lib/export-script-pdf';
import { format } from 'date-fns';
import { reportClientError } from '@/lib/report-client-error';

const genres = ["Moral", "Horror", "Comedy", "Drama", "Thriller", "Sci-Fi", "Fantasy", "Romance", "Mystery", "Action", "Documentary", "Educational", "Motivational", "Mythological", "Short Story"];
const scriptTypes = [
    "YouTube Story Script",
    "YouTube Video Script",
    "Audiobook / Podcast Script",
    "Documentary Narration"
];
// Simple 0-9 stepper replaces the old confusing preset dropdown.
// 0 = Narrator only (no dialogue characters). 1-9 = that many dialogue characters, always alongside the Narrator.
const MIN_CHARACTER_COUNT = 0;
const MAX_CHARACTER_COUNT = 15;
// A short script doesn't have room to properly introduce and use many named
// characters — the model was being asked for e.g. 15 characters in a 10-Minute
// (~8,000 char) script and simply couldn't fit them all in, so the character
// cap now scales with the chosen length instead of always allowing up to 15.
const CHARACTER_COUNT_LIMITS: Record<string, number> = {
    "10 Minutes": 7,
    "20 Minutes": 10,
    "30 Minutes": 15
};
const getMaxCharacterCount = (wordCount: string) => CHARACTER_COUNT_LIMITS[wordCount] ?? MAX_CHARACTER_COUNT;
// 🔁 Persistence key: without this, a page refresh or navigating away and
// back wipes the activeMappingId/isGenerating React state (they're just
// useState, reset to defaults on every mount). Since generation happens
// server-side now (Python worker keeps running regardless of the tab),
// the job itself is fine — but the frontend "forgets" it was watching
// anything, so the progress bar / in-progress card vanish even though
// the script is still being written. Storing the active job here lets us
// re-attach to it on mount instead of losing track of it.
const ACTIVE_SCRIPT_JOB_KEY = 'scriptgen_active_job';
const getCharacterCountLabel = (n: number) => (n <= 0 ? 'Storyteller Only' : `${n} Character${n > 1 ? 's' : ''}`);
const parseCharacterCount = (value: string): number => {
    if (!value || /storyteller/i.test(value)) return 0;
    const match = value.match(/\d+/);
    return match ? Math.min(MAX_CHARACTER_COUNT, Math.max(MIN_CHARACTER_COUNT, parseInt(match[0], 10))) : 0;
};
const languages = [
    { label: "हिन्दी", value: "Hindi" },
    { label: "English", value: "English" },
    { label: "Hinglish", value: "Hinglish" },
    { label: "বাংলা", value: "Bengali" },
    { label: "मराठी", value: "Marathi" },
    { label: "తెలుగు", value: "Telugu" },
    { label: "தமிழ்", value: "Tamil" },
    { label: "ગુજરાતી", value: "Gujarati" },
    { label: "ਪੰਜਾਬੀ", value: "Punjabi" },
    { label: "ಕನ್ನಡ", value: "Kannada" },
    { label: "മലയാളം", value: "Malayalam" },
    { label: "भोजपुरी", value: "Bhojpuri" },
    { label: "اردو", value: "Urdu" },
    { label: "ଓଡ଼ିଆ", value: "Odia" },
    { label: "অসমীয়া", value: "Assamese" },
    { label: "संस्कृतम्", value: "Sanskrit" },
    { label: "Español", value: "Spanish" },
    { label: "Français", value: "French" },
    { label: "Deutsch", value: "German" },
    { label: "日本語", value: "Japanese" },
    { label: "中文", value: "Chinese" },
    { label: "한국어", value: "Korean" },
    { label: "Русский", value: "Russian" },
    { label: "العربية", value: "Arabic" },
    { label: "Português", value: "Portuguese" },
    { label: "Italiano", value: "Italian" }
];
const wordCounts = ["10 Minutes", "20 Minutes", "30 Minutes"];

const getNativeLanguageLabel = (value: string) => {
    return languages.find(l => l.value === value)?.label || value;
};
const audienceOptions = ["Children (Kids)", "Teenagers", "Young Adults", "Adults (Mature)", "General Audience"];
const toneOptions = ["Serious", "Humorous", "Dramatic", "Educational", "Suspenseful", "Inspiring"];

// Sent to the backend as the MINIMUM target — deliberately higher than the
// depth shown to the user below, since the model tends to undershoot a bare
// "approximately X" ask. Asking for more up front costs nothing extra (same
// single generation call) and biases the output toward the real desired
// length instead of falling short of it.
const wordCountMapping: Record<string, number> = {
    "10 Minutes": 11000,
    "20 Minutes": 23000,
    "30 Minutes": 34000
};

const wordCountDisplayLabels: Record<string, string> = {
    "10 Minutes": "10 Minutes (~8,000 Depth)",
    "20 Minutes": "20 Minutes (~17,000 Depth)",
    "30 Minutes": "30 Minutes (~25,000 Depth)"
};

const initialFormState = {
    scriptType: 'YouTube Story Script', 
    genre: 'Moral',
    language: 'Hindi',
    tone: "Serious",
    audience: "Children (Kids)", 
    perspective: "Narrator-Led Storytelling (Classic)",
    numberOfCharacters: "Storyteller Only",
    wordCount: '10 Minutes',
    plotSummary: '',
    additionalInstructions: '',
};

interface ProductionNode {
    mappingId: string;
    topic?: string;
    projectName: string;
    scriptUrl?: string;
    teaser: string;
    fullText?: string;
    timestamp: number;
    status: string;
    isSyncing?: boolean;
}

interface ScriptHistoryItem {
    id: string;
    projectName: string;
    genre: string;
    language: string;
    wordCount: string;
    tone: string;
    scriptText: string;
    scriptUrl?: string;
    timestamp: string;
}

// --- INDEXED DB LOCAL STORAGE HELPERS ---
const SCRIPT_DB_NAME = '12labs_script_studio_v2';
const SCRIPT_STORE_NAME = 'script_history';

const initScriptDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') return;
        const request = indexedDB.open(SCRIPT_DB_NAME, 1);
        request.onupgradeneeded = (e: any) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(SCRIPT_STORE_NAME)) {
                db.createObjectStore(SCRIPT_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e: any) => resolve(e.target.result);
        request.onerror = (e: any) => reject(e.target.error);
    });
};

const saveScriptHistoryToLocalDB = async (item: ScriptHistoryItem) => {
    try {
        const db = await initScriptDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SCRIPT_STORE_NAME, 'readwrite');
            tx.objectStore(SCRIPT_STORE_NAME).put(item);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.error("Local DB save failed", e);
    }
};

const loadScriptHistoryFromLocalDB = async (): Promise<ScriptHistoryItem[]> => {
    try {
        const db = await initScriptDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SCRIPT_STORE_NAME, 'readonly');
            const store = tx.objectStore(SCRIPT_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                resolve((request.result || []) as ScriptHistoryItem[]);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
            reportClientError('src/app/script-generator/page.tsx:233', e);
        return [];
    }
};

const deleteScriptHistoryFromLocalDB = async (id: string) => {
    try {
        const db = await initScriptDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SCRIPT_STORE_NAME, 'readwrite');
            tx.objectStore(SCRIPT_STORE_NAME).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.error("Local DB delete failed", e);
    }
};

const clearAllScriptHistoryFromLocalDB = async () => {
    try {
        const db = await initScriptDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SCRIPT_STORE_NAME, 'readwrite');
            tx.objectStore(SCRIPT_STORE_NAME).clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.error("Local DB clear failed", e);
    }
};

function ScriptNodeCard({ 
    node
}: { 
    node: ProductionNode
}) {
    const [fullText, setFullText] = useState(node.fullText || node.teaser || '');
    const [isFetchingFull, setIsFetchingFull] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const isReady = node.status === 'ok' || node.status === 'ready' || node.status === 'completed' || node.status === 'done';

    useEffect(() => {
        let isCancelled = false;
        const fetchFull = async (retryCount = 0) => {
            if (!isReady || !node.scriptUrl || isCancelled) return;
            setIsFetchingFull(true);
            try {
                const res = await fetch(getDisplayUrl(node.scriptUrl), { cache: 'no-store' });
                if (res.ok) {
                    const content = await res.text();
                    if (content && content.trim() && !isCancelled) {
                        setFullText(content);
                        setIsFetchingFull(false);
                        return;
                    }
                }
                if (retryCount < 10 && !isCancelled) {
                    const delay = 2000 + (retryCount * 1500);
                    setTimeout(() => fetchFull(retryCount + 1), delay);
                } else setIsFetchingFull(false);
            } catch (e) {
            reportClientError('src/app/script-generator/page.tsx:300', e);
                if (retryCount < 10 && !isCancelled) {
                    const delay = 2000 + (retryCount * 1500);
                    setTimeout(() => fetchFull(retryCount + 1), delay);
                } else setIsFetchingFull(false);
            }
        };
        if (isReady && node.scriptUrl && !node.fullText) fetchFull();
        else if (node.fullText) setFullText(node.fullText);
        return () => { isCancelled = true; };
    }, [isReady, node.scriptUrl, node.fullText]);

    const handleCopy = () => {
        const textToCopy = fullText || node.teaser;
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy);
        setIsCopied(true);
        toast({ title: 'Manuscript Copied' });
        setTimeout(() => setIsCopied(false), 2000);
    };

    const getScriptText = () => fullText || node.teaser || '';

    const handleDownloadTxt = () => {
        const text = getScriptText();
        if (!text) {
            toast({ variant: 'destructive', title: 'No script text available' });
            return;
        }
        downloadScriptAsTxt(node.projectName || 'Script', text);
        toast({ title: 'Downloaded .TXT' });
    };

    const handleDownloadDocx = async () => {
        const text = getScriptText();
        if (!text) {
            toast({ variant: 'destructive', title: 'No script text available' });
            return;
        }
        try {
            await downloadScriptAsDocx(node.projectName || 'Script', text);
            toast({ title: 'Downloaded .DOCX' });
        } catch (e) {
            reportClientError('src/app/script-generator/page.tsx:348', e);
            toast({ variant: 'destructive', title: 'DOCX generation failed' });
        }
    };

    const handleDownloadPdf = async () => {
        const text = getScriptText();
        if (!text) {
            toast({ variant: 'destructive', title: 'No script text available' });
            return;
        }
        try {
            toast({ title: 'Generating PDF...' });
            await downloadScriptAsPdf(node.projectName || 'Script', text);
            toast({ title: 'Downloaded .PDF' });
        } catch (e) {
            console.error("PDF Export Error:", e);
            toast({ variant: 'destructive', title: 'PDF generation failed' });
        }
    };

    return (
        <Card className="rounded-[3rem] border-2 border-emerald-500/30 shadow-3xl bg-card overflow-hidden animate-in slide-in-from-bottom-4 duration-700">
            <CardHeader className="p-8 pb-4 bg-emerald-500/5 border-b border-emerald-500/10">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Badge className="bg-emerald-500 text-slate-950 font-black text-[10px] uppercase tracking-wider px-3 py-1">
                                🎉 YOUR SCRIPT IS READY!
                            </Badge>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">ID: {node.mappingId}</span>
                        </div>
                        <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">{node.projectName}</h3>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-2 bg-emerald-500/5 border-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10" 
                            onClick={handleDownloadTxt}
                            disabled={isFetchingFull}
                        >
                            <Download className="h-3.5 w-3.5" />
                            DOWNLOAD .TXT
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-2 bg-primary/5 border-primary/10" 
                            onClick={handleCopy}
                            disabled={isFetchingFull}
                        >
                            {isCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                            COPY
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button 
                                    variant="outline"
                                    size="sm" 
                                    className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-2 shadow-sm"
                                    disabled={isFetchingFull}
                                >
                                    <FileCheck className="h-3.5 w-3.5" />
                                    OTHER
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-[1.2rem] p-2 border-primary/10 shadow-2xl">
                                <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-2 py-1">Export Manuscript</DropdownMenuLabel>
                                <DropdownMenuItem className="h-10 rounded-lg cursor-pointer font-bold text-xs" onClick={handleDownloadPdf}>.PDF Document</DropdownMenuItem>
                                <DropdownMenuItem className="h-10 rounded-lg cursor-pointer font-bold text-xs" onClick={handleDownloadDocx}>.DOCX Word File</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardHeader>
            <Separator className="bg-primary/5" />
            <CardContent className="p-8 space-y-6">
                <div className="relative">
                    <ScrollArea className="h-[500px] w-full rounded-[2rem] border-2 border-dashed border-primary/10 bg-muted/5 shadow-inner p-6 sm:p-8">
                        <pre className="text-base font-medium leading-relaxed italic text-foreground/80 whitespace-pre-wrap font-sans select-text cursor-text">
                            {fullText || node.teaser || 'Final manuscript node received.'}
                        </pre>
                    </ScrollArea>
                    {isFetchingFull && <div className="absolute top-4 right-4 flex items-center gap-2 bg-background/80 backdrop-blur-md px-3 py-1 rounded-full border shadow-sm animate-in fade-in"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-[8px] font-black uppercase tracking-widest">Updating Full Node...</span></div>}
                    <div className="absolute top-4 left-6 pointer-events-none opacity-40"><Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest bg-background/80">{isFetchingFull ? 'SYNCING...' : 'FULL MANUSCRIPT'}</Badge></div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                    <Button 
                        onClick={() => {
                            const text = fullText || node.teaser;
                            if (!text) return;
                            localStorage.setItem('studio_pending_script', text);
                            router.push('/studio');
                        }} 
                        disabled={!isReady}
                        className="w-full h-16 rounded-[1.5rem] font-black uppercase tracking-widest text-[11px] btn-shine shadow-xl shadow-primary/20 gap-3"
                    >
                        <Zap className="mr-2 h-6 w-6" />
                        USE IN STUDIO
                    </Button>
                </div>
            </CardContent>
            <CardFooter className="p-6 bg-muted/20 border-t flex items-center justify-center">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /><span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">MANUSCRIPT READY • SAVED TO HISTORY</span></div>
            </CardFooter>
        </Card>
    );
}

function HistoryScriptCard({ 
    item, 
    onDelete,
    onDownloadTxt,
    onDownloadPdf,
    onDownloadDocx
}: { 
    item: ScriptHistoryItem, 
    onDelete: (id: string) => void,
    onDownloadTxt: (item: ScriptHistoryItem) => void,
    onDownloadPdf: (item: ScriptHistoryItem) => void,
    onDownloadDocx: (item: ScriptHistoryItem) => void
}) {
    const [scriptText, setScriptText] = useState(item.scriptText || '');
    const [isFetching, setIsFetching] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        // Force fetch full script from URL if it's missing or looks like a teaser
        const isTeaser = item.scriptText && item.scriptText.trim().endsWith('...');
        if ((!item.scriptText || isTeaser || item.scriptText.length < 500) && item.scriptUrl) {
            const fetchFull = async () => {
                setIsFetching(true);
                try {
                    // Use standardized download proxy with 'url' parameter
                    const fetchUrl = `/api/download?url=${encodeURIComponent(item.scriptUrl)}`;

                    const res = await fetch(fetchUrl, { cache: 'no-store' });
                    if (res.ok) {
                        const content = await res.text();
                        if (content && content.trim().length > 100) {
                            setScriptText(content);
                        }
                    }
                } catch (e) {
                    console.error("Background script fetch failed:", e);
                } finally {
                    setIsFetching(false);
                }
            };
            fetchFull();
        }
    }, [item.scriptText, item.scriptUrl]);

    const displayItem = { ...item, scriptText: scriptText || item.scriptText };

    return (
        <Card key={item.id} className="rounded-[2rem] border-primary/10 shadow-lg bg-card overflow-hidden transition-all hover:border-primary/20">
            <CardHeader className="p-6 pb-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider bg-primary/5 border-primary/10 text-primary">
                                {item.genre || 'Story'}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider bg-muted/40">
                                {getNativeLanguageLabel(item.language || 'Hindi')}
                            </Badge>
                            {item.wordCount && (
                                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider bg-muted/40">
                                    {item.wordCount}
                                </Badge>
                            )}
                            {isFetching && (
                                <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse">
                                    <Loader2 className="h-2 w-2 mr-1 animate-spin" /> Fetching Content...
                                </Badge>
                            )}
                        </div>
                        <h3 className="text-lg font-black uppercase tracking-tight">{item.projectName}</h3>
                        <p className="text-[10px] font-bold text-muted-foreground">
                            {item.timestamp ? format(new Date(item.timestamp), 'PPpp') : 'Recent'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 px-3 rounded-xl font-bold text-xs gap-1.5"
                            onClick={() => setIsExpanded(prev => !prev)}
                            disabled={isFetching && !scriptText}
                        >
                            <Eye className="h-3.5 w-3.5 text-primary" />
                            {isExpanded ? 'Collapse' : 'View'}
                        </Button>

                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-9 px-3 rounded-xl font-bold text-xs gap-1.5"
                            disabled={isFetching && !scriptText}
                            onClick={() => {
                                const text = scriptText || item.scriptText;
                                if (!text) {
                                    toast({ variant: 'destructive', title: 'Content not loaded yet', description: 'Please wait a moment...' });
                                    return;
                                }
                                navigator.clipboard.writeText(text);
                                toast({ title: 'Script copied to clipboard' });
                            }}
                        >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-9 px-3 rounded-xl font-bold text-xs gap-1"
                                    disabled={isFetching && !scriptText}
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Export
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl p-2">
                                <DropdownMenuItem 
                                    className="font-bold text-xs cursor-pointer"
                                    onClick={() => onDownloadTxt(displayItem)}
                                >
                                    .TXT Text File
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    className="font-bold text-xs cursor-pointer"
                                    onClick={() => onDownloadPdf(displayItem)}
                                >
                                    .PDF Document
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    className="font-bold text-xs cursor-pointer"
                                    onClick={() => onDownloadDocx(displayItem)}
                                >
                                    .DOCX Word File
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button 
                            variant="default" 
                            size="sm" 
                            className="h-9 px-3 rounded-xl font-bold text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                            disabled={isFetching && !scriptText}
                            onClick={() => {
                                const text = scriptText || item.scriptText;
                                if (!text) return;
                                localStorage.setItem('studio_pending_script', text);
                                window.location.href = '/studio';
                            }}
                        >
                            <Zap className="h-3.5 w-3.5" />
                            Use in Studio
                        </Button>

                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-9 w-9 p-0 rounded-xl text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onDelete(item.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <Separator className="bg-primary/5" />
            <CardContent className="p-6">
                <p className={`text-xs font-medium italic text-muted-foreground leading-relaxed whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-3'}`}>
                    {scriptText || item.scriptText || 'Fetching manuscript content...'}
                </p>
                {!isExpanded && (scriptText || item.scriptText) && (
                    <button
                        type="button"
                        onClick={() => setIsExpanded(true)}
                        className="mt-2 text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                    >
                        Read full preview
                    </button>
                )}
            </CardContent>
        </Card>
    );
}

export default function ScriptGeneratorPage() {
  const { user, setUser, activeUid, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { database } = initializeFirebase();
  const router = useRouter();

  // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
  // silently rendering the full script generator while logged out.
  useEffect(() => {
    if (!authLoading && !user) {
      toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use the Script Generator.' });
      router.push('/login');
    }
  }, [authLoading, user, router, toast]);

  const isPaid = checkIsPaidUser(user);

  const [formState, setFormState] = useState(initialFormState);
  const [isGenerating, setIsGenerating] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
        const raw = window.localStorage.getItem(ACTIVE_SCRIPT_JOB_KEY);
        return !!(raw && JSON.parse(raw)?.mappingId);
    } catch { return false; }
  });
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isStalled, setIsStalled] = useState(false);
  const [activeMappingId, setActiveMappingId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(ACTIVE_SCRIPT_JOB_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed?.mappingId || null;
    } catch { return null; }
  });
  const [productionNodes, setProductionNodes] = useState<ProductionNode[]>([]);
  const [scriptHistory, setScriptHistory] = useState<ScriptHistoryItem[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [isCheckingUsage, setIsCheckingUsage] = useState(true);
  const [usageCount, setUsageCount] = useState(0);
  const [dailyFreeLimit, setDailyFreeLimit] = useState(40);
  const [dailyFreeCount, setDailyFreeCount] = useState(0);
  const [analysisMode, setAnalysisMode] = useState<'realtime' | 'server'>('realtime');
  const [pricing, setPricing] = useState({
    script10Normal: 1000,
    script10Discounted: 500,
    script20Normal: 2000,
    script20Discounted: 700,
    script30Normal: 3000,
    script30Discounted: 1000,
  });
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      // IST is UTC + 5:30. Offset calculation: Current UTC time + 5.5 hours = Current IST time.
      const currentISTMs = Date.now() + (5.5 * 60 * 60 * 1000);
      const nextISTMidnight = new Date(currentISTMs);
      nextISTMidnight.setUTCHours(0, 0, 0, 0);
      nextISTMidnight.setUTCDate(nextISTMidnight.getUTCDate() + 1);

      const diffMs = nextISTMidnight.getTime() - currentISTMs;
      
      if (diffMs <= 0) {
        return { hours: 0, minutes: 0, seconds: 0 };
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      return { hours, minutes, seconds };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!database) return;
    const pricingRef = ref(database, 'settings/pricing');
    const unsubPricing = onRtdbValue(pricingRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setPricing({
          script10Normal: Number(data.script10Normal ?? 1000),
          script10Discounted: Number(data.script10Discounted ?? 500),
          script20Normal: Number(data.script20Normal ?? 2000),
          script20Discounted: Number(data.script20Discounted ?? 700),
          script30Normal: Number(data.script30Normal ?? 3000),
          script30Discounted: Number(data.script30Discounted ?? 1000),
        });
      }
    });
    return () => unsubPricing();
  }, [database]);

  useEffect(() => {
    if (!database) return;
    const modeRef = ref(database, 'settings/analysisExecutionMode');
    const unsub = onRtdbValue(modeRef, (snap) => {
        setAnalysisMode(snap.exists() ? snap.val() : 'realtime');
    });
    return () => unsub();
  }, [database]);

  useEffect(() => {
    if (!activeUid || !database) { setIsCheckingUsage(false); return; }
    const today = getISTDateString();
    const usageRef = ref(database, `userScriptGenerationLimits/${activeUid}/${today}`);
    const unsubscribe = onRtdbValue(usageRef, (snapshot) => { setUsageCount(snapshot.val() || 0); setIsCheckingUsage(false); });
    return () => unsubscribe();
  }, [activeUid, database]);

  // 📡 Real-time listener for global daily free script limit and today's usage
  useEffect(() => {
    if (!database) return;
    const today = getISTDateString();
    
    const limitRef = ref(database, 'settings/app/dailyFreeScriptLimit');
    const unsubLimit = onRtdbValue(limitRef, (snap) => {
        if (snap.exists()) setDailyFreeLimit(Number(snap.val()) || 40);
        else setDailyFreeLimit(40);
    });

    const countRef = ref(database, `dailyFreeScriptGenerations/${today}/count`);
    const unsubCount = onRtdbValue(countRef, (snap) => {
        setDailyFreeCount(snap.exists() ? Number(snap.val()) || 0 : 0);
    });

    return () => {
        unsubLimit();
        unsubCount();
    };
  }, [database]);

  const isQuotaExhausted = dailyFreeCount >= dailyFreeLimit;

  // --- 🔁 RECONCILE PERSISTED JOB WITH CURRENT USER ---
  // Clears a leftover activeMappingId if it belonged to a different signed-in
  // user on this browser (e.g. after logout/login), so we never watch or
  // finalize someone else's job.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
        const raw = window.localStorage.getItem(ACTIVE_SCRIPT_JOB_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed?.mappingId && parsed?.uid !== activeUid) {
            window.localStorage.removeItem(ACTIVE_SCRIPT_JOB_KEY);
            setActiveMappingId(null);
            setIsGenerating(false);
        }
    } catch { /* ignore malformed storage */ }
  }, [activeUid]);

  // --- RTDB SYNC FOR LIVE GENERATIONS ---
  useEffect(() => {
    if (!activeUid || !database) return;
    const hubRef = ref(database, `tempScriptGenerations/${activeUid}`);
    const unsub = onRtdbValue(hubRef, async (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const list: ProductionNode[] = [];

            for (const [id, val] of Object.entries<any>(data)) {
                if (!val || !id.startsWith('STORY_')) continue;
                const currentStatus = String(val.status || 'processing').toLowerCase();
                const isReady = currentStatus === 'ok' || currentStatus === 'ready' || currentStatus === 'completed' || currentStatus === 'done';
                const isFailed = currentStatus === 'error' || currentStatus === 'failed';

                // Generation failed server-side (script_generation.py already
                // refunded credits) — stop the loader and tell the user instead
                // of spinning forever, since nothing client-side is generating
                // this anymore.
                if (isFailed && activeMappingId === id) {
                    setIsGenerating(false);
                    setActiveMappingId(null);
                    if (typeof window !== 'undefined') window.localStorage.removeItem(ACTIVE_SCRIPT_JOB_KEY);
                    toast({
                        variant: 'destructive',
                        title: 'Script Generation Failed',
                        description: val.error || 'The script node reported an error. Your credits have been refunded.'
                    });
                    continue;
                }

                if (currentStatus === 'processing' && id !== activeMappingId) continue;

                let textContent = val.fullText || val.script || val.teaser || '';

                // If URL present and status is ready, attempt to fetch if text is short
                if (isReady && val.scriptUrl && (!textContent || textContent.length < 100)) {
                    try {
                        const res = await fetch(getDisplayUrl(val.scriptUrl), { cache: 'no-store' });
                        if (res.ok) {
                            const text = await res.text();
                            if (text && text.trim()) {
                                textContent = text;
                            }
                        }
                    } catch (e) {
                        console.error("Error fetching script URL from RTDB:", e);
                    }
                }

                list.push({
                    mappingId: id,
                    projectName: val.projectName || 'AI Script Generation',
                    scriptUrl: val.scriptUrl,
                    teaser: textContent.slice(0, 500) + (textContent.length > 500 ? '...' : ''),
                    fullText: textContent,
                    timestamp: val.timestamp || val.completedAt || Date.now(),
                    status: currentStatus
                });

                // When active job becomes OK/ready, finish loader & save to history
                if (activeMappingId === id && isReady) {
                    setGenerationProgress(100);
                    const item: ScriptHistoryItem = {
                        id,
                        projectName: val.projectName || formState.scriptType || 'AI Script',
                        genre: formState.genre,
                        language: formState.language,
                        wordCount: formState.wordCount,
                        tone: formState.tone,
                        scriptText: textContent,
                        scriptUrl: val.scriptUrl || '',
                        timestamp: new Date().toISOString()
                    };

                    setTimeout(() => { 
                        setIsGenerating(false); 
                        setActiveMappingId(null); 
                        if (typeof window !== 'undefined') window.localStorage.removeItem(ACTIVE_SCRIPT_JOB_KEY);
                        toast({ 
                            title: '🎉 Your Script is Ready!', 
                            description: 'Your AI script has been saved to your history below.' 
                        });
                    }, 500);

                    if (textContent) {
                        saveScriptHistoryToLocalDB(item);
                    }

                    // 🔒 AUTO-SAVE TO PROJECTS — same as music/thumbnail: credits were
                    // already charged for this generation, so the project record gets
                    // written straight away instead of waiting on a separate manual
                    // "Save" click. This used to run right after the (now-removed)
                    // client-side Gemini call inside handleGenerate — moved here since
                    // this is the first point the frontend actually has the finished
                    // script (fetched from R2 via scriptUrl above).
                    (async () => {
                        try {
                            const finalizeRes = await finalizeScriptSelectionAction({
                                userId: activeUid,
                                userEmail: user?.email || 'N/A',
                                userName: user?.name || 'User',
                                script: textContent,
                                scriptUrl: val.scriptUrl || '',
                                mappingId: id,
                                generationParams: { ...formState, cost: val.cost, genre: formState.genre }
                            });
                            if (!finalizeRes.success) throw new Error(finalizeRes.error);
                        } catch (finalizeErr: any) {
                            reportClientError('src/app/script-generator/page.tsx:rtdb-autosave', finalizeErr);
                            console.warn("Auto-save to Projects failed (script itself is still safe in local/RTDB history):", finalizeErr);
                        }
                    })();
                }
            }

            setProductionNodes(list.sort((a, b) => b.timestamp - a.timestamp));
        } else setProductionNodes([]);
    });
    return () => unsub();
  }, [activeUid, database, activeMappingId, formState, toast]);

  // --- RTDB & LOCAL INDEXED DB SYNC FOR SCRIPT HISTORY ---
  useEffect(() => {
    if (!activeUid || !database) return;
    const historyRef = ref(database, `scriptHistory/${activeUid}`);
    const unsubscribe = onRtdbValue(historyRef, async (snapshot) => {
        const rtdbData = snapshot.val();
        const rtdbList: ScriptHistoryItem[] = rtdbData 
            ? Object.entries(rtdbData).map(([id, val]: [string, any]) => ({ id, ...val })) 
            : [];
        
        const localCache = await loadScriptHistoryFromLocalDB();
        
        const itemMap = new Map<string, ScriptHistoryItem>();
        [...rtdbList, ...localCache].forEach(item => {
            if (!itemMap.has(item.id) || (item.scriptText && !itemMap.get(item.id)?.scriptText)) {
                itemMap.set(item.id, item);
            }
        });

        const sorted = Array.from(itemMap.values()).sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        setScriptHistory(sorted);
    });

    return () => unsubscribe();
  }, [activeUid, database]);

  // --- ⏱️ PROGRESS SYNC ---
  useEffect(() => {
      if (isGenerating) {
          setGenerationProgress(0); setIsStalled(false);
          const totalTargetSeconds = 90; // 1.30 minutes (90 seconds)
          const intervalMs = 2000;
          const totalSteps = (totalTargetSeconds * 1000) / intervalMs;
          const baseStep = 98 / totalSteps;

          progressIntervalRef.current = setInterval(() => {
              setGenerationProgress(prev => {
                  if (prev >= 98) return 98;
                  const rand = Math.random();
                  if (rand < 0.1) { setIsStalled(true); return prev; }
                  setIsStalled(false);
                  
                  let nextStep = baseStep;
                  if (prev < 30) nextStep = baseStep * 1.5;
                  else if (prev > 80) nextStep = baseStep * 0.4;

                  return Math.min(prev + nextStep, 98);
              });
          }, intervalMs);
      } else { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); setIsStalled(false); }
      return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (!activeUid || !user?.email) return;
    const currentCost = getCost();
    if (!user.isSponsor && user.credits < currentCost) { toast({ variant: 'destructive', title: 'Insufficient Credits' }); return; }
    setIsGenerating(true); setGenerationProgress(0);
    try {
        const targetLength = wordCountMapping[formState.wordCount] || 13000;
        const hubRes = await deductScriptCreditsAction(
            activeUid, 
            user.email, 
            targetLength, 
            formState.scriptType, 
            formState.language,
            new Date().toISOString(),
            {
                genre: formState.genre,
                tone: formState.tone,
                audience: formState.audience,
                perspective: formState.perspective,
                numberOfCharacters: formState.numberOfCharacters,
                plotSummary: formState.plotSummary,
                additionalInstructions: formState.additionalInstructions || formState.plotSummary,
                scriptType: formState.scriptType
            }
        );
        if (!hubRes.success || !hubRes.mappingId) throw new Error(hubRes.error);
        if (hubRes.newCredits !== undefined) setUser({ ...user, credits: hubRes.newCredits } as any);
        setActiveMappingId(hubRes.mappingId);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(ACTIVE_SCRIPT_JOB_KEY, JSON.stringify({ uid: activeUid, mappingId: hubRes.mappingId }));
        }

        // 🚀 Generation now happens server-side (HQ Cluster's script_generation.py,
        // direct Gemini keys) instead of a client-side call. deductScriptCreditsAction
        // already wrote the pending job to Firestore `script_projects` (root doc +
        // userProjects) and initialized RTDB `tempScriptGenerations/{uid}/{mappingId}`
        // with status 'processing'. From here we just wait — the "RTDB SYNC FOR LIVE
        // GENERATIONS" effect below polls that same node and takes over: it updates
        // the progress bar, opens the reader, saves local history, and finalizes the
        // Projects record once the worker reports status 'ok' (or shows an error if
        // status becomes 'error').
        toast({
            title: '📝 Script Dispatched!',
            description: 'Your script is being written — this can take a minute or two for longer scripts.'
        });
    } catch (error: any) {
        // "Insufficient credits" is expected user-facing validation (mirrors the
        // server-side check in deductScriptCreditsAction), not a bug — skip the
        // Telegram report for it so the admin channel isn't spammed every time
        // a user's balance is too low.
        const isInsufficientCredits = typeof error?.message === 'string' && error.message.startsWith('Insufficient credits');
        if (!isInsufficientCredits) {
            reportClientError('src/app/script-generator/page.tsx:handleGenerate', error);
        }
        toast({ variant: 'destructive', title: 'Dispatch Error', description: error.message }); 
        setIsGenerating(false); 
        setActiveMappingId(null); 
        if (typeof window !== 'undefined') window.localStorage.removeItem(ACTIVE_SCRIPT_JOB_KEY);
    }
  };

  const handleDeleteHistoryItem = async (id: string) => {
      await deleteScriptHistoryFromLocalDB(id);
      if (database && activeUid) {
          await remove(ref(database, `scriptHistory/${activeUid}/${id}`));
      }
      setScriptHistory(prev => prev.filter(item => item.id !== id));
      toast({ title: 'Script deleted from history' });
  };

  const handleClearAllHistory = async () => {
      await clearAllScriptHistoryFromLocalDB();
      if (database && activeUid) {
          await remove(ref(database, `scriptHistory/${activeUid}`));
      }
      setScriptHistory([]);
      toast({ title: 'Script history cleared' });
  };

  const getCost = () => {
      const isFirstRun = usageCount === 0;
      if (formState.wordCount === "10 Minutes") {
          return isFirstRun ? pricing.script10Discounted : pricing.script10Normal;
      }
      if (formState.wordCount === "20 Minutes") {
          return isFirstRun ? pricing.script20Discounted : pricing.script20Normal;
      }
      return isFirstRun ? pricing.script30Discounted : pricing.script30Normal;
  };

  const handleInputChange = (field: keyof typeof initialFormState, value: string) => setFormState(p => {
      if (field === 'wordCount') {
          // Length just changed — re-clamp the character count to the new
          // length's cap so a shorter script never keeps a character count
          // it can no longer fit.
          const newMax = getMaxCharacterCount(value);
          const clampedCount = Math.min(parseCharacterCount(p.numberOfCharacters), newMax);
          return { ...p, wordCount: value, numberOfCharacters: getCharacterCountLabel(clampedCount) };
      }
      return { ...p, [field]: value };
  });

  const getScriptContent = async (item: ScriptHistoryItem): Promise<string> => {
      // If we have a URL, ALWAYS try to fetch the full text from it first as the primary source of truth
      if (item.scriptUrl) {
          try {
              // Standardize to use /api/download proxy for all scriptUrl fetches to avoid CORS and handle protocols (pub://)
              const fetchUrl = `/api/download?url=${encodeURIComponent(item.scriptUrl)}`;

              const res = await fetch(fetchUrl, { cache: 'no-store' });
              if (res.ok) {
                  const content = await res.text();
                  // If we got valid content, return it regardless of length (as long as it's not empty)
                  if (content && content.trim()) return content;
              }
          } catch (e) {
              console.warn("URL Fetch failed in getScriptContent:", e);
          }
      }

      // Fallback to locally stored text only if URL fetch failed or doesn't exist
      if (item.scriptText && item.scriptText.trim().length > 0) {
          const text = item.scriptText.trim();
          // Even if it looks like a teaser, it's better than nothing if fetch failed
          return text;
      }

      return '';
  };

  const filteredHistory = scriptHistory.filter(item => {
      const query = historySearchQuery.toLowerCase();
      return (
          (item.projectName || '').toLowerCase().includes(query) ||
          (item.genre || '').toLowerCase().includes(query) ||
          (item.language || '').toLowerCase().includes(query) ||
          (item.scriptText || '').toLowerCase().includes(query)
      );
  });

  if (authLoading || !user) {
    return (
        <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <>
    <div className="relative min-h-screen bg-muted/30 pb-32">
      <div className="container mx-auto max-w-7xl py-12 px-4">
        <div className="flex flex-col items-center text-center mb-12 space-y-4">
            <div className="p-4 bg-primary/10 rounded-3xl shadow-inner"><FileText className="h-12 w-12 text-primary" /></div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase leading-none">Script <span className="text-primary italic">Studio</span></h1>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.3em] text-[10px] opacity-60">Professional Manuscript Engine</p>
        </div>

        <div className="grid grid-cols-1 gap-12 items-start max-w-3xl mx-auto">
            {/* PRODUCTION BLUEPRINT FORM */}
            <Card className="rounded-[3rem] border-none shadow-2xl bg-card overflow-hidden">
                <CardHeader className="bg-primary/5 border-b p-8 text-center flex flex-col items-center justify-center gap-2">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/40 text-center">PRODUCTION BLUEPRINT</CardTitle>
                    <Badge 
                        variant="outline" 
                        className={cn(
                            "font-black text-[9px] uppercase px-3.5 py-1 rounded-full border tracking-wider",
                            dailyFreeLimit - dailyFreeCount <= 5 
                                ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 animate-pulse" 
                                : "bg-primary/10 text-primary border-primary/20"
                        )}
                    >
                        DAILY SCRIPT LIMITS LEFT: {Math.max(0, dailyFreeLimit - dailyFreeCount)}
                    </Badge>
                </CardHeader>
                <CardContent className="p-8">
                    {/* 🚨 EXHAUSTED QUOTA NOTICE FOR FREE USERS */}
                    {isQuotaExhausted ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center space-y-8 animate-in fade-in zoom-in duration-500">
                            <div className="p-6 bg-amber-500/10 rounded-full text-amber-500 shadow-inner">
                                <Clock className="h-16 w-16 animate-pulse" />
                            </div>
                            
                            <div className="space-y-4 max-w-md">
                                <h3 className="text-2xl font-black uppercase tracking-tight text-primary">
                                    Quota Exceeded
                                </h3>
                                <p className="text-sm font-bold text-muted-foreground leading-relaxed italic">
                                    "You can't create more scripts daily script generation limit exceeded come back tomorrow when quota refreshed"
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
                                <Button 
                                    onClick={() => router.push('/store')}
                                    className="flex-1 h-14 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black uppercase tracking-widest text-[11px] shadow-lg shadow-amber-600/20"
                                >
                                    Upgrade to Pro
                                </Button>
                                <Button 
                                    variant="outline"
                                    onClick={() => router.push('/support')}
                                    className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] border-primary/10"
                                >
                                    Contact Support
                                </Button>
                            </div>

                            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-muted/30 border border-primary/5 w-full max-w-xs">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                                    Quota Resetting In
                                </span>
                                <div className="flex gap-3 text-foreground font-black text-xl">
                                    <div className="flex flex-col items-center">
                                        <span>{String(timeLeft.hours).padStart(2, '0')}</span>
                                        <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">Hrs</span>
                                    </div>
                                    <span className="opacity-50">:</span>
                                    <div className="flex flex-col items-center">
                                        <span>{String(timeLeft.minutes).padStart(2, '0')}</span>
                                        <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">Min</span>
                                    </div>
                                    <span className="opacity-50">:</span>
                                    <div className="flex flex-col items-center">
                                        <span>{String(timeLeft.seconds).padStart(2, '0')}</span>
                                        <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">Sec</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-10">
                            <div className="space-y-5">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/50 px-1">Story Setup</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><FileText className="h-3 w-3" /> Script Type</Label>
                                        <Select value={formState.scriptType} onValueChange={(v) => handleInputChange('scriptType', v)}>
                                            <SelectTrigger className="h-12 rounded-xl bg-muted/20 font-bold border-primary/5"><SelectValue placeholder="Select script type" /></SelectTrigger>
                                            <SelectContent className="rounded-xl">{scriptTypes.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><MessageSquare className="h-3 w-3" /> Genre</Label>
                                        <Select value={formState.genre} onValueChange={(v) => handleInputChange('genre', v)}>
                                            <SelectTrigger className="h-12 rounded-xl bg-muted/20 font-bold border-primary/5"><SelectValue placeholder="Select genre" /></SelectTrigger>
                                            <SelectContent className="rounded-xl">{genres.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Globe className="h-3 w-3" /> Language</Label>
                                        <Select value={formState.language} onValueChange={(v) => handleInputChange('language', v)}>
                                            <SelectTrigger className="h-12 rounded-xl bg-muted/20 font-bold border-primary/5"><SelectValue placeholder="Select language" /></SelectTrigger>
                                            <SelectContent className="rounded-xl">{languages.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Clock className="h-3 w-3" /> Story Length / Depth</Label>
                                        <Select value={formState.wordCount} onValueChange={(v) => handleInputChange('wordCount', v)}>
                                            <SelectTrigger className="h-12 rounded-xl bg-muted/20 font-bold border-primary/5"><SelectValue /></SelectTrigger>
                                            <SelectContent className="rounded-xl">{wordCounts.map(w => <SelectItem key={w} value={w}>{wordCountDisplayLabels[w] || w}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-5">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/50 px-1">Voice & Craft</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Zap className="h-3 w-3" /> Emotional Tone</Label>
                                        <Select value={formState.tone} onValueChange={(v) => handleInputChange('tone', v)}>
                                            <SelectTrigger className="h-12 rounded-xl bg-muted/20 font-bold border-primary/5"><SelectValue /></SelectTrigger>
                                            <SelectContent className="rounded-xl">{toneOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><UserCircle className="h-3 w-3" /> Target Audience</Label>
                                        <Select value={formState.audience} onValueChange={(v) => handleInputChange('audience', v)}>
                                            <SelectTrigger className="h-12 rounded-xl bg-muted/20 font-bold border-primary/5"><SelectValue /></SelectTrigger>
                                            <SelectContent className="rounded-xl">{audienceOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Users className="h-3 w-3" /> How Many Characters?</Label>
                                        <div className="h-12 rounded-xl bg-muted/20 border border-primary/5 flex items-center justify-between px-1.5">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 rounded-lg font-black text-lg shrink-0"
                                                onClick={() => handleInputChange('numberOfCharacters', getCharacterCountLabel(Math.max(MIN_CHARACTER_COUNT, parseCharacterCount(formState.numberOfCharacters) - 1)))}
                                            >
                                                −
                                            </Button>
                                            <div className="flex flex-col items-center leading-tight select-none">
                                                <span className="font-black text-sm">{parseCharacterCount(formState.numberOfCharacters)}</span>
                                                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">
                                                    {parseCharacterCount(formState.numberOfCharacters) === 0 ? 'Narrator Only' : 'Characters'}
                                                </span>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                disabled={parseCharacterCount(formState.numberOfCharacters) >= getMaxCharacterCount(formState.wordCount)}
                                                className="h-9 w-9 rounded-lg font-black text-lg shrink-0 disabled:opacity-30"
                                                onClick={() => handleInputChange('numberOfCharacters', getCharacterCountLabel(Math.min(getMaxCharacterCount(formState.wordCount), parseCharacterCount(formState.numberOfCharacters) + 1)))}
                                            >
                                                +
                                            </Button>
                                        </div>
                                        <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider px-1">Up to {getMaxCharacterCount(formState.wordCount)} for this length</p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <Label className="text-[10px] font-black uppercase text-primary px-1">Source Story / Storyline & Performance Instructions</Label>
                                <Textarea 
                                    placeholder="उदा: एक घने जंगल में एक मेहनती चींटी और एक आलसी टिड्डा रहते थे... (यहाँ अपनी कहानी, प्लॉट या निर्देश लिखें। इंजन इसे डायलॉग और इमोशन टैग्स में कन्वर्ट करेगा)" 
                                    value={formState.plotSummary} 
                                    onChange={(e) => {
                                        handleInputChange('plotSummary', e.target.value);
                                        handleInputChange('additionalInstructions', e.target.value);
                                    }} 
                                    className="min-h-[180px] rounded-2xl bg-muted/10 border-primary/5 p-6 font-bold shadow-inner focus-visible:ring-primary leading-relaxed" 
                                />
                            </div>
                            
                            <div className="space-y-6">
                                <Button 
                                    onClick={handleGenerate} 
                                    disabled={isCheckingUsage || isGenerating} 
                                    className={cn(
                                        "w-full h-16 text-[11px] font-black uppercase shadow-xl btn-shine rounded-2xl flex flex-col gap-0.5 leading-tight transition-all duration-300 shadow-primary/20"
                                    )}
                                >
                                    {isCheckingUsage ? (
                                        <Loader2 className="animate-spin h-5 w-5" />
                                    ) : (
                                        <>
                                            <span className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> SUBMIT</span>
                                            <span className="text-[10px] opacity-60 flex items-center gap-1 uppercase"><Coins className="h-3 w-3" /> {getCost().toLocaleString()} CREDITS</span>
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="p-6 border-t bg-muted/5"><Button variant="ghost" className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-[10px] text-destructive/60 hover:text-destructive gap-2" onClick={() => setFormState(initialFormState)}><RotateCcw className="h-4 w-4" /> RESET STUDIO</Button></CardFooter>
            </Card>

            {/* GENERATION PROGRESS (shown only while a script is being written) */}
            {isGenerating && (
                <div className="space-y-8 pt-2">
                    <Card className="rounded-[3rem] border-none shadow-3xl bg-card overflow-hidden p-10 text-center space-y-8 animate-in zoom-in-95 duration-500">
                        <div className="space-y-4">
                            <div className="flex justify-between items-end px-2">
                                <p className="text-[11px] font-black uppercase text-primary flex items-center gap-3 animate-pulse">
                                    <Activity className="h-4 w-4" /> {isStalled ? 'SYNCHRONIZING...' : 'WRITING MANUSCRIPT...'}
                                </p>
                                <span className="text-2xl font-black font-mono text-primary">{Math.round(generationProgress)}%</span>
                            </div>
                            <Progress value={generationProgress} className="h-4 rounded-full bg-primary/10 shadow-inner transition-all duration-1000" />
                        </div>
                        <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest leading-relaxed">
                            Manuscript is being generated. Once ready, it will appear in Script History below.
                        </p>
                    </Card>
                </div>
            )}

            {/* 📜 SCRIPT HISTORY SECTION (DIRECTLY ON SCRIPT PAGE) */}
            <div className="space-y-6 pt-8 border-t border-primary/10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-2">
                    <div className="space-y-1">
                        <h2 className="text-[24px] sm:text-[28px] font-black uppercase tracking-tighter leading-none text-foreground flex items-center gap-3">
                            <HistoryIcon className="h-7 w-7 text-primary" />
                            SCRIPT HISTORY
                        </h2>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Saved manuscripts & production logs
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <Link href="/history">
                            <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest gap-2 bg-primary/5 hover:bg-primary/10 border-primary/10 transition-all active:scale-95 shadow-sm">
                                <Eye className="h-3.5 w-3.5" />
                                View Full History
                            </Button>
                        </Link>
                        {scriptHistory.length > 0 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest text-destructive hover:bg-destructive/10 border-destructive/20 gap-2">
                                        <Trash2 className="h-3.5 w-3.5" />
                                        CLEAR HISTORY
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-[2rem] border-primary/10">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="font-black uppercase tracking-tight">Clear Script History?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-xs">
                                            This will permanently delete all saved script records from your local history and RTDB storage.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleClearAllHistory} className="rounded-xl bg-destructive font-bold text-white hover:bg-destructive/90">Clear All</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                </div>

                {/* SEARCH BAR */}
                {scriptHistory.length > 0 && (
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search history by title, genre, language or text..." 
                            value={historySearchQuery}
                            onChange={(e) => setHistorySearchQuery(e.target.value)}
                            className="pl-11 h-12 rounded-2xl bg-card border-primary/10 text-xs font-bold shadow-sm"
                        />
                    </div>
                )}

                {/* HISTORY LIST */}
                {filteredHistory.length > 0 ? (
                    <div className="space-y-4">
                        {filteredHistory.map((item) => (
                            <HistoryScriptCard 
                                key={item.id}
                                item={item}
                                onDelete={handleDeleteHistoryItem}
                                onDownloadTxt={async (it) => {
                                    const text = await getScriptContent(it);
                                    if (!text || text.length < 5) { toast({ variant: 'destructive', title: 'Content Not Ready', description: 'Manuscript content is still being processed or could not be found.' }); return; }
                                    downloadScriptAsTxt(it.projectName || 'AI Script', text);
                                    toast({ title: 'Downloaded .TXT' });
                                }}
                                onDownloadPdf={async (it) => {
                                    const text = await getScriptContent(it);
                                    if (!text || text.length < 5) { toast({ variant: 'destructive', title: 'Content Not Ready', description: 'Manuscript content is still being processed or could not be found.' }); return; }
                                    toast({ title: 'Generating PDF...' });
                                    await downloadScriptAsPdf(it.projectName || 'AI Script', text);
                                    toast({ title: 'Downloaded .PDF' });
                                }}
                                onDownloadDocx={async (it) => {
                                    const text = await getScriptContent(it);
                                    if (!text || text.length < 5) { toast({ variant: 'destructive', title: 'Content Not Ready', description: 'Manuscript content is still being processed or could not be found.' }); return; }
                                    await downloadScriptAsDocx(it.projectName || 'AI Script', text);
                                    toast({ title: 'Downloaded .DOCX' });
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <Card className="rounded-[2.5rem] border-dashed border-2 border-primary/10 bg-card p-12 text-center space-y-3">
                        <div className="p-4 bg-primary/5 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                            <BookOpen className="h-6 w-6 text-primary opacity-60" />
                        </div>
                        <h4 className="text-base font-black uppercase tracking-tight">No Script History Yet</h4>
                        <p className="text-xs text-muted-foreground font-medium max-w-md mx-auto">
                            Scripts generated using the blueprint above will automatically be saved and displayed right here in your script history.
                        </p>
                    </Card>
                )}
            </div>
        </div>
      </div>

    </div>
    </>
  );
}
