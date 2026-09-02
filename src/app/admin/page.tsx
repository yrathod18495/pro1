'use client';

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Users, 
  FileText, 
  Loader2, 
  MicVocal, 
  BarChart3, 
  Wrench, 
  Activity, 
  Coins, 
  TrendingUp, 
  Save, 
  Cpu, 
  ShieldCheck, 
  Sparkles, 
  Zap, 
  MonitorPlay, 
  Store,
  Mic,
  Music,
  Tags,
  FileCode,
  Wifi,
  PlusCircle,
  Database,
} from 'lucide-react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, set, update, get } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { ToolSetting } from '@/lib/types';
import { MaintenanceMode } from '@/components/admin/maintenance-mode';
import { useToast } from '@/hooks/use-toast';
import { DailySummary } from '@/components/admin/daily-summary';
import { cn, generateAvatarColor, getDisplayUrl, getISTDateString } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BroadcastNotification } from '@/components/admin/broadcast-notification';
import { PushNotificationManager } from '@/components/admin/push-notification-manager';
import { LandingAssetsManager } from '@/components/admin/landing-assets-manager';
import { MusicLibraryManager } from '@/components/admin/music-library-manager';
import { PricingSettingsManager } from '@/components/admin/pricing-settings-manager';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  saveDailyFreeScriptLimitAction, 
  saveHqBackendUrlAction, 
  saveEditingHfBackendAction, 
  toggleToolLockAction, 
  saveMusicWatermarkUrlAction,
  setAnalysisExecutionModeAction,
  getAdminDashboardStatsAction
} from '@/app/admin/actions';
import { reportClientError } from '@/lib/report-client-error';

function LiveUsers() {
    const { database } = initializeFirebase();
    const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const LIVE_THRESHOLD = 180000; 

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) return;
        const usersRef = ref(db, 'onlineUsers');
        const unsubscribe = onRtdbValue(usersRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const now = Date.now();
                const list = Object.entries(data).map(([uid, val]: [string, any]) => ({
                    uid, ...val
                })).filter(u => (now - (u.lastSeen || 0) < 7200000));
                list.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
                setOnlineUsers(list);
            } else {
                setOnlineUsers([]);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const activeCount = onlineUsers.filter(u => (Date.now() - (u.lastSeen || 0) < LIVE_THRESHOLD)).length;
    const formatLastSeen = (lastSeen: number) => {
        const now = Date.now();
        const diff = now - lastSeen;
        if (diff < LIVE_THRESHOLD) return <Badge className="bg-green-500 text-white h-4 px-2 rounded-full text-[7px] font-black uppercase border-none shadow-sm">Live</Badge>;
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return <Badge variant="outline" className="text-muted-foreground border-muted/50 h-4 px-1.5 rounded-full text-[7px] font-bold uppercase">{mins}m</Badge>;
        const hours = Math.floor(mins / 60);
        return <Badge variant="outline" className="text-muted-foreground border-muted/50 h-4 px-1.5 rounded-full text-[7px] font-bold uppercase">{hours}h</Badge>;
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden flex flex-col">
            <CardHeader className="p-6 pb-4 flex flex-row items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em]">LIVE NODES</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-black h-6 px-3 rounded-full text-[9px] tracking-widest">{activeCount} ACTIVE</Badge>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-[280px]">
                    <div className="p-4 space-y-2">
                        {isLoading ? [1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-2xl" />) : onlineUsers.length > 0 ? onlineUsers.map(u => {
                            const avatarColor = generateAvatarColor(u.email);
                            const isLive = (Date.now() - (u.lastSeen || 0) < LIVE_THRESHOLD);
                            return (
                                <div key={u.uid} className="flex items-center justify-between p-3 px-4 rounded-[1.5rem] bg-white dark:bg-zinc-900 border border-primary/5 shadow-sm transition-all hover:bg-muted/5">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="relative shrink-0">
                                            <Avatar className="h-9 w-9 border-background shadow-md">
                                                <AvatarFallback className={cn("font-black text-[10px]", avatarColor.bg, avatarColor.text)}>{u.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                                            </Avatar>
                                            {isLive && <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white dark:border-zinc-900 shadow-sm" />}
                                        </div>
                                        <div className="min-w-0 flex flex-col flex-1">
                                            <p className="text-[9px] font-black uppercase truncate tracking-tight leading-tight">{u.name}</p>
                                            <p className="text-[7px] font-bold text-muted-foreground uppercase break-all tracking-widest opacity-40 leading-tight mt-0.5">{u.email}</p>
                                        </div>
                                    </div>
                                    <div className="shrink-0 ml-2">{formatLastSeen(u.lastSeen)}</div>
                                </div>
                            );
                        }) : (
                            <div className="text-center py-20 opacity-20 italic flex flex-col items-center gap-2"><Users className="h-10 w-10" /><p className="text-[10px] font-black uppercase tracking-[0.4em]">Node Registry Empty</p></div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

function GlobalUsersStat({ total, today, isLoading }: { total: number, today: number, isLoading: boolean }) {
    return (
        <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden group">
            <CardHeader className="pb-2 p-8">
                <div className="flex justify-between items-start">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">GLOBAL REGISTRY</CardTitle>
                    <div className="p-3 bg-primary/5 rounded-2xl group-hover:scale-110 transition-transform duration-500"><Users className="h-4 w-4 text-primary" /></div>
                </div>
            </CardHeader>
            <CardContent className="px-8 pb-8">
                {isLoading ? <Skeleton className="h-12 w-32 rounded-xl" /> : (
                    <div className="space-y-0">
                        <div className="text-5xl font-black tracking-tighter leading-none">{total.toLocaleString()}</div>
                        <div className="flex items-center gap-1.5 text-primary font-black uppercase text-[10px] tracking-widest pt-4"><PlusCircle className="h-3 w-3" />+{today} NEW USERS TODAY</div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function DailyFreeScriptLimitSettings() {
    const { database } = initializeFirebase();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [limit, setLimit] = useState<number | string>(40);
    const [todayCount, setTodayCount] = useState<number | string>(0);

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) return;
        const today = getISTDateString();

        const unsubLimit = onRtdbValue(ref(db, 'settings/app/dailyFreeScriptLimit'), (snapshot) => {
            if (snapshot.exists()) {
                setLimit(Number(snapshot.val()) || 40);
            }
        });

        const unsubCount = onRtdbValue(ref(db, `dailyFreeScriptGenerations/${today}/count`), (snapshot) => {
            if (snapshot.exists()) {
                setTodayCount(Number(snapshot.val()) || 0);
            } else {
                setTodayCount(0);
            }
        });

        return () => {
            unsubLimit();
            unsubCount();
        };
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const today = getISTDateString();
            const numLimit = Math.max(1, Number(limit) || 40);
            const numCount = Math.max(0, Number(todayCount) || 0);

            const result = await saveDailyFreeScriptLimitAction({
                limit: numLimit,
                todayCount: numCount,
                today,
            });

            if (result.success) {
                toast({ 
                    title: 'Daily Limit & Usage Saved', 
                    description: `Updated today's usage count (${numCount}) and daily limit (${numLimit}) successfully.` 
                });
            } else {
                toast({ variant: 'destructive', title: 'Update Failed', description: result.error });
            }
        } catch (error: any) {
            reportClientError('src/app/admin/page.tsx:219', error); 
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message }); 
        } finally { setIsSaving(false); }
    };

    return (
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Free Users Daily Script Limit
                </CardTitle>
                <Badge variant="secondary" className="bg-primary/10 text-primary font-black text-[9px] uppercase px-3 py-1 rounded-full">
                    USAGE TODAY: {todayCount} / {limit}
                </Badge>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 px-1">
                            Used Today Count
                        </Label>
                        <Input 
                            type="number"
                            min={0}
                            value={todayCount} 
                            onChange={(e) => setTodayCount(e.target.value)} 
                            placeholder="0" 
                            className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4" 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 px-1">
                            Max Daily Quota Limit
                        </Label>
                        <Input 
                            type="number"
                            min={1}
                            value={limit} 
                            onChange={(e) => setLimit(e.target.value)} 
                            placeholder="40" 
                            className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4" 
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase px-1 leading-relaxed max-w-md">
                        Free users will be restricted when global daily generations reach this count. Both today's usage count and daily limit can be manually set here.
                    </p>
                    <Button onClick={handleSave} disabled={isSaving} className="h-11 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shrink-0">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} SAVE SETTINGS
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}


function HqBackendSettings() {
    const { database } = initializeFirebase();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [url, setUrl] = useState('');

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) return;
        const unsubscribe = onRtdbValue(ref(db, 'admin/config/hq_backend_url'), (snapshot) => {
            if (snapshot.exists()) {
                setUrl(snapshot.val() || '');
            }
        });
        return () => unsubscribe();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await saveHqBackendUrlAction(url);
            if (res.success) {
                toast({ title: 'HQ Backend Updated', description: 'The core script analysis and generation URL has been updated.' });
            } else {
                toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
            }
        } catch (error: any) { 
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message }); 
        } finally { setIsSaving(false); }
    };

    return (
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/10 p-5">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    HQ Backend (Script/Generation)
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 px-1">HF Space URL (Root)</Label>
                    <Input 
                        value={url} 
                        onChange={(e) => setUrl(e.target.value)} 
                        placeholder="https://your-backend-domain.example" 
                        className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-[11px] px-4" 
                    />
                    <p className="text-[7px] font-bold text-muted-foreground uppercase px-1">
                        Base URL for Script Analysis and HQ Generation. Paths /script/analyze etc will be appended automatically.
                    </p>
                </div>
                <Button onClick={handleSave} disabled={isSaving} className="w-full h-11 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} SAVE HQ BACKEND
                </Button>
            </CardContent>
        </Card>
    );
}

function EditingHfBackendSettings() {
    const { database } = initializeFirebase();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [url, setUrl] = useState('');
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) return;
        const unsubscribe = onRtdbValue(ref(db, 'settings/editingHfBackend'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setUrl(data.url || '');
                setEnabled(data.enabled !== false);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await saveEditingHfBackendAction({ url, enabled });
            if (res.success) {
                toast({ title: 'Editing HF Backend Synchronized', description: 'Dialogue voice editing requests will route to this URL.' });
            } else {
                toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
            }
        } catch (error: any) { 
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message }); 
        } finally { setIsSaving(false); }
    };

    return (
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <Mic className="h-5 w-5 text-primary" />
                    Dialogue Editing Backend
                </CardTitle>
                <Badge className={cn("border-none font-black text-[8px] tracking-widest h-5", enabled ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive")}>
                    {enabled ? 'ROUTING ENABLED' : 'ROUTING DISABLED'}
                </Badge>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-3">
                            <div className={cn("p-1.5 rounded-lg", enabled ? "bg-primary text-white" : "bg-muted text-muted-foreground")}><Wifi className="h-3.5 w-3.5" /></div>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest leading-none">HF Endpoint Status</p>
                                <p className="text-[7px] font-bold text-muted-foreground uppercase mt-1">{enabled ? 'Active Path' : 'Bypassed'}</p>
                            </div>
                        </div>
                        <Switch checked={enabled} onCheckedChange={setEnabled} className="scale-[0.7] data-[state=checked]:bg-primary" />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 px-1">HF Space URL / API Endpoint</Label>
                        <Input 
                            value={url} 
                            onChange={(e) => setUrl(e.target.value)} 
                            placeholder="https://your-username-space-name.hf.space/edit-voice" 
                            className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-[11px] px-4" 
                        />
                        <p className="text-[7px] font-bold text-muted-foreground uppercase px-1">
                            When user regenerates/edits voice for any dialogue, request will be dispatched to this HF URL.
                        </p>
                    </div>
                </div>
                <Button onClick={handleSave} disabled={isSaving} className="w-full h-11 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} SAVE HF EDITING BACKEND
                </Button>
            </CardContent>
        </Card>
    );
}

function AnalysisExecutionModeSettings() {
    const { toast } = useToast();
    const [mode, setMode] = useState<'realtime' | 'server'>('realtime');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) return;
        const unsubscribe = onRtdbValue(ref(db, 'settings/analysisExecutionMode'), (snapshot) => {
            if (snapshot.exists()) {
                setMode(snapshot.val() || 'realtime');
            }
        });
        return () => unsubscribe();
    }, []);

    const handleToggle = async (checked: boolean) => {
        const newMode = checked ? 'server' : 'realtime';
        setMode(newMode);
        setIsUpdating(true);
        try {
            const res = await setAnalysisExecutionModeAction(newMode);
            if (res.success) {
                toast({
                    title: newMode === 'server' ? 'Server Engine Mode Active' : 'Vercel Realtime Mode Active',
                    description: newMode === 'server'
                        ? 'Manuscripts will submit to the HF Backend server queue and process via Server Engine.'
                        : 'Manuscripts will process normally in real-time via Vercel/Client engine.'
                });
            } else {
                toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" />
                    Script Analysis Engine Mode
                </CardTitle>
                <Badge variant={mode === 'server' ? 'default' : 'secondary'} className="text-[8px] uppercase font-black tracking-widest px-2.5 py-0.5">
                    {mode === 'server' ? 'HQ Server Queue' : 'Vercel / Realtime'}
                </Badge>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/10 border border-primary/5">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider">
                            {mode === 'server' ? 'HF Server Submission (Server Mode)' : 'Vercel Realtime (Default Mode)'}
                        </p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase leading-relaxed max-w-sm">
                            {mode === 'server' 
                                ? 'Active: Manuscripts submit to pending_script_analysis queue and process via HQ Backend server.'
                                : 'Active: Scripts are analyzed locally/realtime directly through Vercel serverless functions.'}
                        </p>
                    </div>
                    <Switch 
                        checked={mode === 'server'} 
                        onCheckedChange={handleToggle} 
                        disabled={isUpdating}
                        className="scale-[0.8] data-[state=checked]:bg-purple-600"
                    />
                </div>
            </CardContent>
        </Card>
    );
}



export default function AdminPage() {
  const { firestore, database } = initializeFirebase();
  const { toast } = useToast();
  const [stats, setStats] = useState({ totalUsers: 0, newUsersToday: 0, totalProjects: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [toolSettings, setToolSettings] = useState<{ [key: string]: ToolSetting }>({});
  const [toolSettingsLoading, setToolSettingsLoading] = useState(true);
  const [musicWatermark, setMusicWatermark] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      const { firestore: fs, database: db } = initializeFirebase();
      if (!fs || !db) {
        setStatsLoading(false);
        return;
      }
      try {
        let uCount = 0;
        let pCount = 0;
        let todayJoined = 0;
        try {
          // 🔧 Fetched via Admin SDK server action — client-side
          // getCountFromServer() silently failed permission checks for
          // admins outside the hardcoded Firestore-rules email list,
          // leaving these cards stuck at 0.
          const statsRes = await getAdminDashboardStatsAction();
          if (statsRes.success) {
            uCount = statsRes.totalUsers;
            pCount = statsRes.totalProjects;
          }
        } catch {}
        try {
          const todayStr = getISTDateString();
          const dailySummarySnap = await get(ref(db, `dailySummaries/${todayStr}/newUserJoined`));
          todayJoined = dailySummarySnap.exists() ? Number(dailySummarySnap.val()) || 0 : 0;
        } catch {}
        setStats({ totalUsers: uCount, totalProjects: pCount, newUsersToday: todayJoined });
      } catch (e) { 
        console.error(e); 
      } finally { 
        setStatsLoading(false); 
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const { database: db } = initializeFirebase();
    if (!db) return;
    const unsubToolSettings = onRtdbValue(ref(db, 'toolSettings'), (snap) => {
      setToolSettings(snap.val() || {});
      setToolSettingsLoading(false);
    });
    const unsubWatermark = onRtdbValue(ref(db, 'settings/app/musicWatermarkUrl'), (snap) => { setMusicWatermark(snap.val() || ''); });
    
    return () => {
      unsubToolSettings();
      unsubWatermark();
    };
  }, []);

  const toggleTool = async (id: string, current: boolean) => {
    try {
      const res = await toggleToolLockAction(id, !current);
      if (res.success) {
        toast({ title: 'Status Updated' });
      } else {
        toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
      }
    } catch (e: any) { 
      toast({ variant: 'destructive', title: 'Update Failed', description: e.message }); 
    }
  };

  const handleSaveWatermark = async () => {
    try {
      const res = await saveMusicWatermarkUrlAction(musicWatermark);
      if (res.success) {
        toast({ title: 'Watermark Synced' });
      } else {
        toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
      }
    } catch (e: any) { 
      toast({ variant: 'destructive', title: 'Update Failed', description: e.message }); 
    }
  };

  const adminTools = [
    { id: 'ai-voice-studio', label: 'Voice Studio', icon: <MicVocal className="h-3 w-3 text-blue-500" /> },
    { id: 'pro-studio', label: 'Pro Studio', icon: <Sparkles className="h-3 w-3 text-amber-500" /> },
    { id: 'chatterbox-studio', label: 'New AI Studio', icon: <Zap className="h-3 w-3 text-indigo-500" /> },
    { id: 'music-studio', label: 'Music AI Studio', icon: <Music className="h-3 w-3 text-pink-500" /> },
    { id: 'voice-cloning', label: 'Voice Cloning', icon: <Mic className="h-3 w-3 text-violet-500" /> },
    { id: 'ai-script-studio', label: 'Script AI Studio', icon: <FileText className="h-3 w-3 text-amber-500" /> },
    { id: 'youtube-transcript', label: 'Transcription Tool', icon: <FileText className="h-3 w-3 text-rose-500" /> },
    { id: 'youtube-seo-kit', label: 'YouTube SEO Kit', icon: <Tags className="h-3 w-3 text-cyan-500" /> },
    { id: 'thumbnail-generator', label: 'AI Thumbnail Gen', icon: <Sparkles className="h-3 w-3 text-emerald-500" /> },
    { id: 'text-to-video', label: 'Text To Video AI', icon: <MonitorPlay className="h-3 w-3 text-purple-500" /> },
    { id: 'pdf-tools', label: 'PDF Studio', icon: <FileCode className="h-3 w-3 text-slate-500" /> },
    { id: 'sound-effect-search', label: 'SFX Library', icon: <Music className="h-3 w-3 text-yellow-500" /> },
    { id: 'music-library', label: 'Music Library', icon: <Music className="h-3 w-3 text-teal-500" /> },
    { id: 'store', label: 'Storefront', icon: <Store className="h-3 w-3 text-purple-600" /> },
    { id: 'seller-hub', label: 'Seller Hub', icon: <Store className="h-3 w-3 text-orange-600" /> },
    { id: 'developer-api', label: 'Developer API', icon: <FileCode className="h-3 w-3 text-emerald-600" /> },
    { id: 'fast-generation', label: 'Fast Engine', icon: <Zap className="h-3 w-3 text-amber-400" /> },
    { id: 'creator-plan', label: 'Creator Plan', icon: <TrendingUp className="h-3 w-3 text-emerald-500" /> },
    { id: 'premium-only', label: 'Paid-Only Mode', icon: <ShieldCheck className="h-3 w-3 text-blue-600" /> },
  ];

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto w-full px-1">
      <div className="space-y-0.5 px-2">
          <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">COMMAND <span className="text-primary italic">CENTER</span></h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-60">Neural Network Hub</p>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        <LiveUsers />
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <GlobalUsersStat total={stats.totalUsers} today={stats.newUsersToday} isLoading={statsLoading} />
            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden group h-full">
                <CardHeader className="pb-2 p-8"><div className="flex justify-between items-start"><CardTitle className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground">PRODUCTION LOAD</CardTitle><div className="p-3 bg-purple-500/5 rounded-2xl group-hover:scale-110 transition-transform duration-500"><Cpu className="h-4 w-4 text-purple-600" /></div></div></CardHeader>
                <CardContent className="px-8 pb-8">{statsLoading ? <Skeleton className="h-12 w-32 rounded-xl" /> : (<div className="space-y-0"><div className="text-5xl font-black tracking-tighter leading-none">{stats.totalProjects.toLocaleString()}</div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pt-4 opacity-40">Verified Output Nodes</p></div>)}</CardContent>
            </Card>
        </div>
      </div>

       <Tabs defaultValue="overview" className="w-full">
        <div className="sticky top-[104px] z-30 bg-background/95 backdrop-blur-md py-3 border-b mb-6 px-1">
            <ScrollArea className="w-full">
                <TabsList className="bg-muted/30 p-0.5 h-10 rounded-xl border border-primary/5 inline-flex w-auto min-w-full sm:min-w-0">
                    <TabsTrigger value="overview" className="rounded-lg px-6 font-black uppercase text-[9px] tracking-widest">Master</TabsTrigger>
                    <TabsTrigger value="neural" className="rounded-lg font-black uppercase text-[9px] tracking-widest">Neural</TabsTrigger>
                    <TabsTrigger value="site" className="rounded-lg font-black uppercase text-[9px] tracking-widest">Assets</TabsTrigger>
                    <TabsTrigger value="music" className="rounded-lg font-black uppercase text-[9px] tracking-widest">Music Lib</TabsTrigger>
                    <TabsTrigger value="push" className="rounded-lg font-black uppercase text-[9px] tracking-widest">Logs</TabsTrigger>
                    <TabsTrigger value="pricing" className="rounded-lg font-black uppercase text-[9px] tracking-widest">Pricing</TabsTrigger>
                </TabsList>
                <ScrollBar orientation="horizontal" className="invisible" />
            </ScrollArea>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6"><DailySummary /></div>
            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-card overflow-hidden h-fit">
                <CardHeader className="bg-primary/5 p-6 border-b border-primary/10"><CardTitle className="text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-3"><Wrench className="h-5 w-5 text-primary" />Protocol Matrix</CardTitle></CardHeader>
                <CardContent className="p-3">
                    <div className="grid grid-cols-2 gap-2">
                        {toolSettingsLoading ? <Skeleton className="h-64 col-span-2 rounded-[2rem]" /> : adminTools.map((tool) => {
                            const isLocked = toolSettings[tool.id]?.locked ?? false;
                            return (
                                <div key={tool.id} className={cn("flex items-center justify-between p-2 rounded-xl border transition-all duration-300", isLocked ? "bg-destructive/5 border-destructive/10" : "bg-background border-primary/5 shadow-sm")}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={cn("p-1.5 rounded-lg shadow-inner shrink-0", isLocked ? "bg-destructive/10 text-destructive" : "bg-primary/5 text-primary")}>{tool.icon}</div>
                                        <div className="min-w-0"><p className="text-[9px] font-black uppercase truncate">{tool.label}</p><p className={cn("text-[7px] font-bold uppercase", isLocked ? 'OFFLINE' : 'LIVE')}>{isLocked ? 'OFFLINE' : 'LIVE'}</p></div>
                                    </div>
                                    <Switch checked={!isLocked} onCheckedChange={() => toggleTool(tool.id, isLocked)} className="scale-[0.6] origin-right data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-destructive" />
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
                <CardFooter className="bg-muted/10 p-4 border-t"><MaintenanceMode /></CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="neural" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AnalysisExecutionModeSettings />
                <DailyFreeScriptLimitSettings />
                <HqBackendSettings />
                <EditingHfBackendSettings />
            </div>
        </TabsContent>

        <TabsContent value="site" className="mt-4"><LandingAssetsManager /></TabsContent>
        <TabsContent value="music" className="mt-4"><MusicLibraryManager /></TabsContent>
        <TabsContent value="push" className="mt-4 space-y-8"><div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><PushNotificationManager /><BroadcastNotification /></div></TabsContent>
        <TabsContent value="pricing" className="mt-4"><PricingSettingsManager /></TabsContent>
      </Tabs>
    </div>
  );
}
