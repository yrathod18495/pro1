
'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth-provider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { UserProfile, CreditHistoryEntry, Notification, Project } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { 
    Users, MoreHorizontal, Search, Loader2, Coins, ShieldCheck, 
    History, UserPlus, UserMinus, ShieldAlert, CheckCircle, Clock, 
    Trash2, Copy, Fingerprint, FolderSearch, AlertTriangle, Eye,
    Bell, FileText, Settings2, ShieldX, ClipboardCopy, Check,
    CreditCard, Zap, RefreshCw, X, CalendarClock, PlusCircle,
    Activity, Gem, Save, Sliders, Edit, ChevronsUpDown, Store,
    TrendingUp, IndianRupee, Award, Sparkles, ImageIcon, FilePenLine, ShoppingCart, Trophy, MonitorPlay, MicVocal,
    Gift, Undo2, Music
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, generateAvatarColor, getDisplayUrl } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { 
    getUserProfileFromServer, 
    searchAuthUsers, 
    adjustUserCredits, 
    updateUserRole, 
    toggleSellerStatus,
    toggleSponsorStatus,
    banUser, 
    suspendUser, 
    reactivateUser,
    updateUserHistory,
    manuallyGrantAutopayAction,
    updateUserSubscription,
    recalculateUserFinancials,
    fixUserDuplicateGrants,
    getActiveConsistencyPlanUsers,
    logCreditExpiry
} from '@/app/admin/users/actions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { useFirestore, initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, getCountFromServer } from 'firebase/firestore';
import { ProjectCard } from '@/components/history/project-card';
import { ThumbnailCard } from '@/components/history/thumbnail-card';
import { Separator } from '../ui/separator';
import { voices } from '@/lib/voices';
import { reportClientError } from '@/lib/report-client-error';

interface ConfirmActionState {
    type: 'role' | 'seller' | 'sponsor' | 'ban' | 'suspend' | 'reactivate' | 'cancel_sub';
    title: string;
    description: string;
    data?: any;
}

const getIconForReason = (reason: string, amount: number = 0) => {
    const lowerCaseReason = reason.toLowerCase();
    
    if (lowerCaseReason.includes('admin') || lowerCaseReason.includes('adjustment') || lowerCaseReason.includes('deactivated')) {
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
    if (lowerCaseReason.includes('fast gen') || lowerCaseReason.includes('new ai studio')) return <Zap className="h-5 w-5 text-amber-500" />;
    if (lowerCaseReason.includes('hq gen') || lowerCaseReason.includes('high-quality')) return <Sparkles className="h-5 w-5 text-blue-500" />;
    if (lowerCaseReason.includes('voice clone')) return <MicVocal className="h-5 w-5 text-purple-500" />;
    if (lowerCaseReason.includes('thumbnail')) return <ImageIcon className="h-5 w-5 text-pink-500" />;
    if (lowerCaseReason.includes('script ai') || lowerCaseReason.includes('story script') || lowerCaseReason.includes('script studio')) return <FilePenLine className="h-5 w-5 text-cyan-500" />;
    if (lowerCaseReason.includes('store purchase') || lowerCaseReason.includes('marketplace')) return <ShoppingCart className="h-5 w-5 text-emerald-500" />;
    if (lowerCaseReason.includes('editor sync') || lowerCaseReason.includes('node sync')) return <RefreshCw className="h-5 w-5 text-indigo-500" />;
    if (lowerCaseReason.includes('ad credits') || lowerCaseReason.includes('watch ad')) return <MonitorPlay className="h-5 w-5 text-indigo-500" />;
    
    return <Zap className="h-5 w-5 text-muted-foreground opacity-40" />;
};

function UserUnifiedViewDialog({ 
    user, 
    open, 
    onOpenChange,
    onProfileUpdate
}: { 
    user: UserProfile; 
    open: boolean; 
    onOpenChange: (open: boolean) => void;
    onProfileUpdate: (updated: UserProfile) => void;
}) {
    const firestore = useFirestore();
    const { user: adminUser } = useAuth();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('projects');
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isLoadingOverview, setIsLoadingOverview] = useState(false);
    const [isReconstructing, setIsReconstructing] = useState(false);
    
    const [creditHistory, setCreditHistory] = useState<CreditHistoryEntry[]>([]);
    const [rtdbHistory, setRtdbHistory] = useState<CreditHistoryEntry[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [presence, setPresence] = useState<{ status: string; lastSeen: number | null } | null>(null);
    const [loadedTabs, setLoadedTabs] = useState<Record<string, boolean>>({});
    const [studioCounts, setStudioCounts] = useState({
        voiceCount: 0,
        musicCount: 0,
        scriptCount: 0,
        thumbnailCount: 0,
        chatterboxCount: 0,
        proCount: 0,
    });

    const fullUnifiedHistory = useMemo(() => {
        const combined = [...rtdbHistory, ...creditHistory].filter(
            item => item && typeof item === 'object' && item.timestamp && item.reason
        );
        const unique = Array.from(new Map(combined.map(item => [`${item.timestamp}-${item.reason}`, item])).values());
        return unique.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            if (isNaN(timeA) || isNaN(timeB)) return 0;
            return timeB - timeA;
        });
    }, [rtdbHistory, creditHistory]);

    const usageStats = useMemo(() => {
        let totalCreditsSpent = 0;
        let totalCreditsGranted = 0;

        fullUnifiedHistory.forEach(item => {
            const amt = item.amount || 0;
            if (amt < 0) {
                totalCreditsSpent += Math.abs(amt);
            } else {
                totalCreditsGranted += amt;
            }
        });

        return {
            ...studioCounts,
            totalCreditsSpent,
            totalCreditsGranted
        };
    }, [studioCounts, fullUnifiedHistory]);

    const joinDateStr = useMemo(() => {
        const getValidTime = (val: any): number | null => {
            if (!val) return null;
            if (typeof val === 'string') {
                const t = new Date(val).getTime();
                return isNaN(t) ? null : t;
            }
            if (typeof val === 'number') return val;
            if (typeof val === 'object') {
                if (val.seconds !== undefined) return val.seconds * 1000;
                if (val.toDate && typeof val.toDate === 'function') {
                    const t = val.toDate().getTime();
                    return isNaN(t) ? null : t;
                }
                const t = new Date(val).getTime();
                return isNaN(t) ? null : t;
            }
            return null;
        };

        const userCreatedTime = getValidTime(user.createdAt);
        if (userCreatedTime) {
            return new Date(userCreatedTime).toISOString();
        }

        let dates: number[] = [];
        fullUnifiedHistory.forEach(item => {
            const t = getValidTime(item.timestamp);
            if (t) dates.push(t);
        });
        projects.forEach(p => {
            const t = getValidTime(p.createdAt);
            if (t) dates.push(t);
        });
        if (dates.length > 0) {
            const oldest = Math.min(...dates);
            return new Date(oldest).toISOString();
        }
        return null;
    }, [user.createdAt, fullUnifiedHistory, projects]);

    const favoriteTool = useMemo(() => {
        const tools = [
            { name: 'Voice Studio', count: usageStats.voiceCount, icon: <MicVocal className="h-4 w-4 text-blue-500" /> },
            { name: 'Music Studio', count: usageStats.musicCount, icon: <Music className="h-4 w-4 text-pink-500" /> },
            { name: 'AI Script Studio', count: usageStats.scriptCount, icon: <FileText className="h-4 w-4 text-amber-500" /> },
            { name: 'AI Thumbnail Generator', count: usageStats.thumbnailCount, icon: <Sparkles className="h-4 w-4 text-emerald-500" /> },
            { name: 'New AI Studio', count: usageStats.chatterboxCount, icon: <Zap className="h-4 w-4 text-indigo-500" /> },
            { name: 'Pro Studio', count: usageStats.proCount, icon: <Sparkles className="h-4 w-4 text-amber-500" /> }
        ];
        const max = Math.max(...tools.map(t => t.count));
        if (max === 0) return { name: 'No Activity Yet', count: 0, icon: <Activity className="h-4 w-4 text-slate-400" /> };
        return tools.find(t => t.count === max) || tools[0];
    }, [usageStats]);

    useEffect(() => {
        if (!open || !user?.uid) return;
        const { database } = initializeFirebase();
        if (!database) return;

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
                    setRtdbHistory(list);
                } else {
                    setRtdbHistory([]);
                }
            } else {
                setRtdbHistory([]);
            }
        });

        return () => unsubscribe();
    }, [open, user?.uid]);

    useEffect(() => {
        if (!open || !user?.uid) return;
        const { database } = initializeFirebase();
        if (!database) return;

        const presenceRef = ref(database, `onlineUsers/${user.uid}`);
        const unsubscribe = onRtdbValue(presenceRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data && typeof data === 'object') {
                    setPresence({
                        status: data.status || 'offline',
                        lastSeen: data.lastSeen || null
                    });
                } else {
                    setPresence(null);
                }
            } else {
                setPresence(null);
            }
        });

        return () => unsubscribe();
    }, [open, user?.uid]);
    
    const [viewingProject, setViewingProject] = useState<Project | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    
    const [projectCategoryFilter, setProjectCategoryFilter] = useState<'all' | 'voice' | 'music' | 'script' | 'thumbnail'>('all');
    const [projectsLimit, setProjectsLimit] = useState(10);
    const [creditsLimit, setCreditsLimit] = useState(15);
    const [logsLimit, setLogsLimit] = useState(15);
    const [hasMoreProjects, setHasMoreProjects] = useState(false);
    
    const [isUpdating, setIsUpdating] = useState(false);
    const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
    const [suspensionDays, setSuspensionDays] = useState('7');

    /**
     * 🕵️‍♂️ UNIVERSAL TIMESTAMP RESOLVER
     */
    const getTimestamp = (val: any) => {
        if (!val) return 0;
        if (typeof val === 'string') return new Date(val).getTime();
        if (val.toDate && typeof val.toDate === 'function') return val.toDate().getTime();
        if (val.seconds) return val.seconds * 1000;
        return 0;
    };

    const fetchProjectsTab = useCallback(async () => {
        if (!user || !firestore) return;
        setIsLoadingData(true);
        try {
            let legacyProjs: any[] = [];
            try {
                const legacyQuery = query(
                    collection(firestore, 'projects'),
                    where('userId', '==', user.uid),
                    limit(projectsLimit + 5)
                );
                const legacySnap = await getDocs(legacyQuery);
                legacyProjs = legacySnap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref, studioType: 'voice' }));
            } catch (err) {
                console.error("Error fetching legacy projects:", err);
            }
            
            let partitionedProjs: any[] = [];
            try {
                const partitionedQuery = query(
                    collection(firestore, 'projects', user.uid, 'userProjects'),
                    limit(projectsLimit + 5)
                );
                const partitionedSnap = await getDocs(partitionedQuery);
                partitionedProjs = partitionedSnap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref, studioType: 'voice' }));
            } catch (err) {
                console.error("Error fetching partitioned projects:", err);
            }

            let proPartitionedProjs: any[] = [];
            try {
                const proPartitionedQuery = query(
                    collection(firestore, 'pro_projects', user.uid, 'userProjects'),
                    limit(projectsLimit + 5)
                );
                const proPartitionedSnap = await getDocs(proPartitionedQuery);
                proPartitionedProjs = proPartitionedSnap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref, studioType: 'pro' }));
            } catch (err) {
                console.error("Error fetching pro_projects partitioned:", err);
            }

            let proRootProjs: any[] = [];
            try {
                const proRootQuery = query(
                    collection(firestore, 'pro_projects'),
                    where('userId', '==', user.uid),
                    limit(projectsLimit + 5)
                );
                const proRootSnap = await getDocs(proRootQuery);
                proRootProjs = proRootSnap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref, studioType: 'pro' }));
            } catch (err) {
                console.error("Error fetching pro_projects root:", err);
            }

            let musicPartitionedProjs: any[] = [];
            try {
                const musicPartitionedQuery = query(
                    collection(firestore, 'music_project', user.uid, 'userProjects'),
                    limit(projectsLimit + 5)
                );
                const musicPartitionedSnap = await getDocs(musicPartitionedQuery);
                musicPartitionedProjs = musicPartitionedSnap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref, studioType: 'music' }));
            } catch (err) {
                console.error("Error fetching music_project partitioned:", err);
            }

            let chatterboxPartitionedProjs: any[] = [];
            try {
                const chatterboxPartitionedQuery = query(
                    collection(firestore, 'chatterbox_projects', user.uid, 'userProjects'),
                    limit(projectsLimit + 5)
                );
                const chatterboxSnap = await getDocs(chatterboxPartitionedQuery);
                chatterboxPartitionedProjs = chatterboxSnap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref, studioType: 'chatterbox' }));
            } catch (err) {
                console.error("Error fetching chatterbox partitioned projects:", err);
            }

            let thumbnailsData: any[] = [];
            try {
                const thumbnailsQuery = query(
                    collection(firestore, 'users', user.uid, 'thumbnails'),
                    limit(projectsLimit + 5)
                );
                const thumbnailsSnap = await getDocs(thumbnailsQuery);
                thumbnailsData = thumbnailsSnap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref, itemType: 'thumbnail', studioType: 'thumbnail' }));
            } catch (err) {
                console.error("Error fetching thumbnails:", err);
            }

            const combinedMap = new Map();
            [
                ...legacyProjs, 
                ...partitionedProjs, 
                ...proPartitionedProjs, 
                ...proRootProjs, 
                ...musicPartitionedProjs, 
                ...chatterboxPartitionedProjs,
                ...thumbnailsData
            ].forEach(p => combinedMap.set(p.id, p));
            
            const finalSorted = Array.from(combinedMap.values())
                .filter((p: any) => !p.userDeleted)
                .sort((a: any, b: any) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));

            setProjects(finalSorted.slice(0, projectsLimit));
            setHasMoreProjects(finalSorted.length > projectsLimit);
            setLoadedTabs(prev => ({ ...prev, projects: true }));
        } catch (e: any) {
            console.error("Error fetching projects tab:", e);
        } finally {
            setIsLoadingData(false);
        }
    }, [user, firestore, projectsLimit]);

    const fetchCreditsTab = useCallback(async () => {
        if (!user || !firestore) return;
        setIsLoadingData(true);
        try {
            const combinedCredits: CreditHistoryEntry[] = [];
            
            // 1. Fetch single aggregated history_log document (just 1 read)
            try {
                const creditsSnap = await getDoc(doc(firestore, 'users', user.uid, 'creditHistory', 'history_log'));
                if (creditsSnap.exists()) {
                    combinedCredits.push(...(creditsSnap.data()?.entries || []));
                }
            } catch (err) {
                console.error("Error fetching history_log:", err);
            }

            // 2. Fetch recent sub-collection docs only if history_log was empty
            if (combinedCredits.length === 0) {
                try {
                    const oldHistoryQuery = query(
                        collection(firestore, 'users', user.uid, 'creditHistory'),
                        limit(20)
                    );
                    const oldHistorySnapshot = await getDocs(oldHistoryQuery);
                    oldHistorySnapshot.docs.forEach(doc => {
                        if (doc.id !== 'history_log') {
                            combinedCredits.push(doc.data() as CreditHistoryEntry);
                        }
                    });
                } catch (err) {
                    console.error("Error fetching individual credit history documents:", err);
                }
            }

            const validCredits = combinedCredits.filter(
                item => item && typeof item === 'object' && item.timestamp && item.reason
            );
            setCreditHistory(validCredits.sort((a: any, b: any) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                if (isNaN(timeA) || isNaN(timeB)) return 0;
                return timeB - timeA;
            }));
            setLoadedTabs(prev => ({ ...prev, credits: true }));
        } catch (e: any) {
            console.error("Error fetching credits:", e);
        } finally {
            setIsLoadingData(false);
        }
    }, [user, firestore]);

    const fetchLogsTab = useCallback(async () => {
        if (!user || !firestore) return;
        setIsLoadingData(true);
        try {
            const notifsSnap = await getDoc(doc(firestore, 'users', user.uid, 'notifications', 'user_notifications'));
            const notifs = notifsSnap.exists() ? (notifsSnap.data()?.entries || []) : [];
            setNotifications(notifs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
            setLoadedTabs(prev => ({ ...prev, notifications: true }));
        } catch (e: any) {
            console.error("Error fetching logs tab:", e);
        } finally {
            setIsLoadingData(false);
        }
    }, [user, firestore]);

    /**
     * ⚡ Pure Count Aggregation via getCountFromServer (Only 1 read per studio metadata, zero doc downloads)
     */
    const fetchOverviewData = useCallback(async () => {
        if (!user || !firestore) return;
        setIsLoadingOverview(true);
        try {
            if (!loadedTabs.credits) {
                fetchCreditsTab();
            }

            // Perform getCountFromServer in parallel - minimal metadata reads (1 read per count query)
            const [
                voicePartCount,
                legacyVoiceCount,
                proPartCount,
                proRootCount,
                musicPartCount,
                chatterboxPartCount,
                thumbnailCount
            ] = await Promise.all([
                getCountFromServer(collection(firestore, 'projects', user.uid, 'userProjects')).then(s => s.data().count).catch(() => 0),
                getCountFromServer(query(collection(firestore, 'projects'), where('userId', '==', user.uid))).then(s => s.data().count).catch(() => 0),
                getCountFromServer(collection(firestore, 'pro_projects', user.uid, 'userProjects')).then(s => s.data().count).catch(() => 0),
                getCountFromServer(query(collection(firestore, 'pro_projects'), where('userId', '==', user.uid))).then(s => s.data().count).catch(() => 0),
                getCountFromServer(collection(firestore, 'music_project', user.uid, 'userProjects')).then(s => s.data().count).catch(() => 0),
                getCountFromServer(collection(firestore, 'chatterbox_projects', user.uid, 'userProjects')).then(s => s.data().count).catch(() => 0),
                getCountFromServer(collection(firestore, 'users', user.uid, 'thumbnails')).then(s => s.data().count).catch(() => 0),
            ]);

            setStudioCounts({
                voiceCount: voicePartCount + legacyVoiceCount,
                proCount: proPartCount + proRootCount,
                musicCount: musicPartCount,
                chatterboxCount: chatterboxPartCount,
                thumbnailCount: thumbnailCount,
                scriptCount: 0,
            });
            setLoadedTabs(prev => ({ ...prev, overview: true }));
        } catch (e: any) {
            console.error("Error calculating overview count aggregations:", e);
        } finally {
            setIsLoadingOverview(false);
        }
    }, [user, firestore, loadedTabs.credits, fetchCreditsTab]);

    const fetchData = useCallback(async () => {
        const promises = [];
        promises.push(fetchProjectsTab());
        promises.push(fetchCreditsTab());
        promises.push(fetchLogsTab());
        promises.push(fetchOverviewData());
        await Promise.all(promises);
    }, [fetchProjectsTab, fetchCreditsTab, fetchLogsTab, fetchOverviewData]);

    // Lazy load specific tab on activeTab change
    useEffect(() => {
        if (!open || !user?.uid) return;
        if (activeTab === 'projects' && !loadedTabs.projects) {
            fetchProjectsTab();
        } else if (activeTab === 'credits' && !loadedTabs.credits) {
            fetchCreditsTab();
        } else if (activeTab === 'notifications' && !loadedTabs.notifications) {
            fetchLogsTab();
        } else if (activeTab === 'overview' && !loadedTabs.overview) {
            fetchOverviewData();
        }
    }, [open, activeTab, user?.uid, loadedTabs, fetchProjectsTab, fetchCreditsTab, fetchLogsTab, fetchOverviewData]);

    const filteredProjects = useMemo(() => {
        if (!projects) return [];
        if (projectCategoryFilter === 'all') return projects;
        return projects.filter(p => {
            if (projectCategoryFilter === 'thumbnail') return p.itemType === 'thumbnail';
            if (p.itemType === 'thumbnail') return false;
            
            const projType = (p.projectType || '').toLowerCase();
            const isMusic = projType.includes('music') || p.isMusic || p.tags?.includes('music');
            const isScript = projType === 'script' || (!p.audioUrl && (p.script || p.generationParams));
            
            if (projectCategoryFilter === 'music') return isMusic;
            if (projectCategoryFilter === 'script') return isScript;
            if (projectCategoryFilter === 'voice') return !isMusic && !isScript;
            return true;
        });
    }, [projects, projectCategoryFilter]);

    const handleExecuteAction = async () => {
        if (!confirmAction || !adminUser) return;
        setIsUpdating(true);
        try {
            const idToken = await adminUser.getIdToken();
            let updatedProfile = { ...user };
            switch (confirmAction.type) {
                case 'role': 
                    updatedProfile.role = user.role === 'admin' ? 'user' : 'admin'; 
                    await updateUserRole(idToken, user.uid, user.email, updatedProfile.role); 
                    break;
                case 'seller': 
                    updatedProfile.isSeller = !user.isSeller; 
                    await toggleSellerStatus(idToken, user.uid, user.email, user.isSeller!); 
                    break;
                case 'sponsor': 
                    updatedProfile.isSponsor = !user.isSponsor; 
                    await toggleSponsorStatus(idToken, user.uid, user.email, user.isSponsor!); 
                    break;
                case 'ban': 
                    updatedProfile.status = 'banned'; 
                    await banUser(idToken, user.uid, adminUser?.email || ''); 
                    break;
                case 'suspend':
                    updatedProfile.status = 'suspended';
                    const days = parseInt(suspensionDays);
                    updatedProfile.suspensionEndDate = new Date(Date.now() + days * 86400000).toISOString();
                    await suspendUser(idToken, user.uid, days, adminUser?.email || '');
                    break;
                case 'reactivate': 
                    updatedProfile.status = 'active'; 
                    delete updatedProfile.suspensionEndDate; 
                    await reactivateUser(idToken, user.uid, adminUser?.email || ''); 
                    break;
                case 'cancel_sub': {
                    const res = await updateUserSubscription(idToken, user.uid, null, adminUser?.email || '');
                    if (!res.success) throw new Error(res.error || 'Failed to cancel subscription');
                    updatedProfile.subscription = undefined;
                    break;
                }
            }
            onProfileUpdate(updatedProfile);
            setConfirmAction(null);
            toast({ title: 'System Node Updated' });
        } catch (e: any) {
            reportClientError('src/components/admin/user-management.tsx:642', e);
            toast({ variant: 'destructive', title: 'Action Failed', description: e.message });
        } finally {
            setIsUpdating(false);
        }
    };

    const handleGrantAutopay = async () => {
        if (!adminUser?.email) return;
        setIsUpdating(true);
        const idToken = await adminUser.getIdToken();
        const res = manuallyGrantAutopayAction(idToken, user.uid, adminUser.email);
        const resolvedRes = await res;
        if (resolvedRes.success && resolvedRes.subscription) {
            toast({ title: 'Consistency Plan Initialized' });
            onProfileUpdate({ ...user, subscription: resolvedRes.subscription, credits: user.credits + 20000 });
        } else {
            toast({ variant: 'destructive', title: 'Grant Failed', description: resolvedRes.error });
        }
        setIsUpdating(false);
    };

    const handleUpdateHistory = async (type: 'credit' | 'notification', updatedEntries: any[]) => {
        setIsUpdating(true);
        const result = await updateUserHistory(user.uid, type, updatedEntries);
        if (result.success) {
            if (type === 'credit') setCreditHistory(updatedEntries);
            else setNotifications(updatedEntries);
            toast({ title: 'Success', description: 'Records updated.' });
        } else {
            toast({ variant: 'destructive', title: 'Update Failed', description: result.message });
        }
        setIsUpdating(false);
    };

    const handleSyncFinancials = async () => {
        setIsReconstructing(true);
        try {
            const res = await recalculateUserFinancials(user.uid);
            if (res.success) {
                toast({ title: 'Financial Node Synchronized' });
                const updated = await getUserProfileFromServer(user.uid);
                if (updated) onProfileUpdate(updated);
            } else throw new Error(res.error);
        } catch (e: any) {
            reportClientError('src/components/admin/user-management.tsx:685', e);
            toast({ variant: 'destructive', title: 'Reconstruct Failed', description: e.message });
        } finally {
            setIsReconstructing(false);
        }
    };

    const handleCopyScript = () => {
        if (!viewingProject?.script) return;
        navigator.clipboard.writeText(viewingProject.script);
        setIsCopied(true);
        toast({ title: 'Script copied!' });
        setTimeout(() => setIsCopied(false), 2000);
    };

    const isAutopay = !!user.purchasedPlans?.["700"] || user.subscription?.planId === 'autopay_pro';
    const isEnterprise = !!user.purchasedPlans?.["999"];
    const isRoyal = isAutopay || isEnterprise;

    // Filter plan purchases and subscription installments
    const planHistoryEntries = useMemo(() => {
        return fullUnifiedHistory.filter(entry => {
            const r = (entry.reason || '').toLowerCase();
            return (
                r.includes('purchase') ||
                r.includes('plan') ||
                r.includes('consistency') ||
                r.includes('grant') ||
                r.includes('starter') ||
                r.includes('pro') ||
                r.includes('business') ||
                r.includes('enterprise') ||
                r.includes('manual approval') ||
                (entry.amountPaid && entry.amountPaid > 0)
            );
        });
    }, [fullUnifiedHistory]);

    const getPlanDetails = (entry: CreditHistoryEntry) => {
        const r = (entry.reason || '').toLowerCase();
        let price = 0;
        let planBadge = "PLAN";
        let isConsistency = false;

        if (entry.amountPaid && entry.amountPaid > 0) {
            price = entry.amountPaid;
            if (entry.currency === 'USD') price *= 85;
        } else if (r.includes('starter') || r.includes('139')) {
            price = 139;
            planBadge = "STARTER TIER";
        } else if ((r.includes('pro') || r.includes('331') || r.includes('336')) && !r.includes('autopay')) {
            price = 331;
            planBadge = "PRO TIER";
        } else if (r.includes('business') || r.includes('534') || r.includes('540')) {
            price = 534;
            planBadge = "BUSINESS TIER";
        } else if (r.includes('enterprise') || r.includes('999')) {
            price = 999;
            planBadge = "ENTERPRISE TIER";
        } else if (r.includes('consistency') || r.includes('autopay') || r.includes('700') || r.includes('week 1')) {
            price = 700;
            planBadge = "CONSISTENCY (AUTOPAY)";
            isConsistency = true;
        }

        // Check if duplicate entry exists
        const sameMatches = fullUnifiedHistory.filter(other => {
            if (other === entry) return false;
            const otherR = (other.reason || '').toLowerCase();
            const timeDiff = Math.abs(new Date(other.timestamp).getTime() - new Date(entry.timestamp).getTime()) / (1000 * 60);
            return (otherR === r && other.amount === entry.amount && timeDiff < 10) ||
                   ((r.includes('week 1') && otherR.includes('week 1')) && timeDiff < 1440);
        });

        return { price: Math.round(price), planBadge, isConsistency, isDuplicate: sameMatches.length > 0 };
    };

    const handleRevertSingleDuplicate = async (entry: CreditHistoryEntry) => {
        setIsUpdating(true);
        try {
            const res = await fixUserDuplicateGrants(
                user.uid,
                [{ id: (entry as any).id, timestamp: entry.timestamp, reason: entry.reason, amount: entry.amount }],
                entry.amount
            );
            if (res.success) {
                toast({ title: 'Duplicate Reverted', description: `Reverted ${entry.amount.toLocaleString()} credits.` });
                await fetchData();
                const updated = await getUserProfileFromServer(user.uid);
                if (updated) onProfileUpdate(updated);
            } else {
                toast({ variant: 'destructive', title: 'Revert Failed', description: res.message });
            }
        } catch (e: any) {
            reportClientError('src/components/admin/user-management.tsx:778', e);
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setIsUpdating(false);
        }
    };

    const handleExpireCredits = async () => {
        if (!user.credits || user.credits <= 0) return;
        if (!confirm(`Are you sure you want to expire ${user.credits.toLocaleString()} remaining credits for ${user.name || user.email}? This will deduct the credits and create an explicit 'Credit Expired' history record.`)) return;
        setIsUpdating(true);
        try {
            const res = await logCreditExpiry(user.uid, user.credits, 'Plan Credits Expired (30-Day Cycle Ended)');
            if (res.success) {
                toast({ title: 'Credits Expired', description: `Successfully logged credit expiry for ${user.name || user.email}.` });
                await fetchData();
                const updated = await getUserProfileFromServer(user.uid);
                if (updated) onProfileUpdate(updated);
            } else {
                toast({ variant: 'destructive', title: 'Expiry Failed', description: res.error });
            }
        } catch (e: any) {
            reportClientError('src/components/admin/user-management.tsx:799', e);
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-[3rem] border-none shadow-3xl bg-background">
                <DialogHeader className="p-10 pb-6 border-b bg-muted/20 shrink-0">
                    <div className="flex items-start gap-6">
                        <Avatar className="h-20 w-20 border-4 border-background shadow-xl shrink-0">
                            <AvatarFallback className={cn("font-black text-3xl", generateAvatarColor(user.email).bg, generateAvatarColor(user.email).text)}>
                                {user.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-grow min-w-0 pt-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <DialogTitle className="text-3xl font-black uppercase tracking-tight break-words leading-tight">{user.name}</DialogTitle>
                                
                                {/* Account Status Badge with high-contrast, beautiful layout */}
                                <Badge className={cn(
                                    "font-black text-[9px] h-5 px-3 rounded-full border shadow-md uppercase tracking-widest",
                                    user.status === 'active' 
                                        ? 'bg-emerald-600 text-white border-emerald-500' 
                                        : 'bg-red-600 text-white border-red-500'
                                )}>
                                    {user.status}
                                </Badge>

                                {/* Live Presence and Last Seen Tracker */}
                                {presence && (
                                    presence.status === 'online' ? (
                                        <Badge className="bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 shadow-sm animate-pulse flex items-center gap-1.5 h-5 px-3 text-[9px] font-black uppercase tracking-widest">
                                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                            Live Online
                                        </Badge>
                                    ) : presence.lastSeen ? (
                                        <Badge variant="outline" className="h-5 px-3 rounded-full text-[9px] font-black uppercase tracking-widest bg-muted/10 border-muted-foreground/15 text-muted-foreground/80 flex items-center gap-1">
                                            <Clock className="h-2.5 w-2.5 opacity-60" />
                                            Last Active: {(() => {
                                                try {
                                                    return format(new Date(presence.lastSeen), "MMM d, yyyy • h:mm a");
                                                } catch (e) {
            reportClientError('src/components/admin/user-management.tsx:844', e);
                                                    return 'Recently';
                                                }
                                            })()}
                                        </Badge>
                                    ) : null
                                )}

                                {user.isSponsor && <Badge className="bg-amber-100 text-amber-800 border-none h-5 px-3 text-[9px] font-black uppercase tracking-widest gap-1"><Gem className="h-3 w-3" /> SPONSOR</Badge>}
                            </div>
                            <DialogDescription className="font-mono text-xs flex items-center gap-2 mt-2 opacity-60">
                                <Fingerprint className="h-3.5 w-3.5" />
                                <span className="truncate">{user.uid}</span>
                                <button onClick={() => { navigator.clipboard.writeText(user.uid); toast({ title: 'UID Copied' }) }} className="p-1 hover:bg-muted rounded-md transition-colors"><Copy className="h-3 w-3" /></button>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="border-b bg-muted/20 shrink-0 overflow-x-auto">
                        <TabsList className="bg-transparent h-14 gap-6 px-8 flex w-max">
                            <TabsTrigger value="projects" className="rounded-none h-full px-2 font-black uppercase text-[11px] tracking-wider text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Projects</TabsTrigger>
                            <TabsTrigger value="credits" className="rounded-none h-full px-2 font-black uppercase text-[11px] tracking-wider text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Finances</TabsTrigger>
                            <TabsTrigger value="notifications" className="rounded-none h-full px-2 font-black uppercase text-[11px] tracking-wider text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Logs</TabsTrigger>
                            <TabsTrigger value="actions" className="rounded-none h-full px-2 font-black uppercase text-[11px] tracking-wider text-muted-foreground hover:text-foreground data-[state=active]:text-destructive data-[state=active]:border-b-2 data-[state=active]:border-destructive transition-all">Security</TabsTrigger>
                            <TabsTrigger value="overview" className="rounded-none h-full px-2 font-black uppercase text-[11px] tracking-wider text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Overview</TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-8 sm:p-10 space-y-6">
                                <TabsContent value="projects" className="m-0 space-y-6">
                                    {isLoadingData ? (
                                        <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-40">
                                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                            <p className="text-[10px] font-black uppercase tracking-widest">Decrypting Projects...</p>
                                        </div>
                                    ) : (
                                        <>
                                            {projects.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-2 pb-2">
                                                    <Button 
                                                        variant={projectCategoryFilter === 'all' ? 'default' : 'outline'} 
                                                        size="sm" 
                                                        className="rounded-xl text-[10px] font-black uppercase h-8 px-3" 
                                                        onClick={() => setProjectCategoryFilter('all')}
                                                    >
                                                        All ({projects.length})
                                                    </Button>
                                                    <Button 
                                                        variant={projectCategoryFilter === 'voice' ? 'default' : 'outline'} 
                                                        size="sm" 
                                                        className="rounded-xl text-[10px] font-black uppercase h-8 px-3" 
                                                        onClick={() => setProjectCategoryFilter('voice')}
                                                    >
                                                        Voice / Studio
                                                    </Button>
                                                    <Button 
                                                        variant={projectCategoryFilter === 'music' ? 'default' : 'outline'} 
                                                        size="sm" 
                                                        className="rounded-xl text-[10px] font-black uppercase h-8 px-3" 
                                                        onClick={() => setProjectCategoryFilter('music')}
                                                    >
                                                        Music Studio
                                                    </Button>
                                                    <Button 
                                                        variant={projectCategoryFilter === 'script' ? 'default' : 'outline'} 
                                                        size="sm" 
                                                        className="rounded-xl text-[10px] font-black uppercase h-8 px-3" 
                                                        onClick={() => setProjectCategoryFilter('script')}
                                                    >
                                                        Script AI
                                                    </Button>
                                                    <Button 
                                                        variant={projectCategoryFilter === 'thumbnail' ? 'default' : 'outline'} 
                                                        size="sm" 
                                                        className="rounded-xl text-[10px] font-black uppercase h-8 px-3" 
                                                        onClick={() => setProjectCategoryFilter('thumbnail')}
                                                    >
                                                        Thumbnails
                                                    </Button>
                                                </div>
                                            )}

                                            {filteredProjects.length > 0 ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                                    {filteredProjects.map(p => (
                                                        p.itemType === 'thumbnail' ? (
                                                            <ThumbnailCard key={p.id} thumbnail={p} />
                                                        ) : (
                                                            <ProjectCard key={p.id} project={p} onViewProject={setViewingProject} onProjectDeleted={fetchData} onProjectUpdated={fetchData} />
                                                        )
                                                    ))}
                                                </div>
                                            ) : <div className="text-center py-32 opacity-20 italic font-black uppercase tracking-widest">No Projects Found</div>}
                                            {hasMoreProjects && (
                                                <div className="flex justify-center pt-8">
                                                    <Button variant="outline" className="h-12 px-10 rounded-2xl font-black uppercase text-[10px] tracking-widest border-primary/20" onClick={() => setProjectsLimit(prev => prev + 10)}>LOAD MORE</Button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </TabsContent>

                                <TabsContent value="credits" className="m-0 space-y-10">
                                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                                        <Card className="bg-primary/5 border-primary/10 rounded-[2.5rem] shadow-xl overflow-hidden group relative">
                                            <div className="p-8">
                                                <div className="flex items-center justify-between mb-2 px-1">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Vault Balance</p>
                                                    {user.credits > 0 && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-7 px-2.5 text-[9px] font-black uppercase rounded-lg border-red-500/30 text-red-600 bg-red-500/10 hover:bg-red-500/20 shadow-sm"
                                                            onClick={handleExpireCredits}
                                                            disabled={isUpdating}
                                                            title="Expire remaining credits"
                                                        >
                                                            <Clock className="h-3 w-3 mr-1" /> Expire Credits
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="text-5xl font-black flex items-center gap-4 tracking-tighter">
                                                    <Coins className="h-10 w-10 text-primary animate-bounce-slow" />
                                                    {user.credits.toLocaleString()}
                                                </div>
                                            </div>
                                        </Card>

                                        <Card className={cn(
                                            "border-none rounded-[2.5rem] shadow-xl overflow-hidden relative group h-full",
                                            isRoyal ? "bg-gradient-to-br from-amber-100 to-yellow-50 border-2 border-amber-300" : "bg-green-50 dark:bg-green-900/5 border-green-500/10"
                                        )}>
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-1000">
                                                <TrendingUp className="h-32 w-32 -rotate-12" />
                                            </div>
                                            <div className="p-8 relative z-10 flex flex-col h-full">
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-center mb-2 px-1">
                                                        <p className={cn("text-[10px] font-black uppercase tracking-[0.3em]", isRoyal ? "text-amber-800" : "text-green-600")}>LIFETIME INVESTMENT</p>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className={cn("h-7 w-7 rounded-full bg-white/50 hover:bg-white", isRoyal ? "text-amber-600" : "text-green-600")}
                                                            onClick={handleSyncFinancials}
                                                            disabled={isReconstructing}
                                                            title="Recalculate Node from History"
                                                        >
                                                            {isReconstructing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    </div>
                                                    <div className={cn("text-5xl font-black flex items-center gap-4 tracking-tighter", isRoyal ? "text-amber-700" : "text-green-700 dark:text-green-400")}>
                                                        <IndianRupee className={cn("h-10 w-10", isRoyal ? "text-amber-600" : "text-green-600")} />
                                                        {user.totalInvestment?.toLocaleString() || '0'}
                                                    </div>
                                                </div>
                                                
                                                {user.purchasedPlans && Object.keys(user.purchasedPlans).length > 0 ? (
                                                    <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-top-1 duration-500">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("h-px flex-1", isRoyal ? "bg-amber-500/20" : "bg-green-500/20")} />
                                                            <p className={cn("text-[9px] font-black uppercase tracking-widest whitespace-nowrap", isRoyal ? "text-amber-600/40" : "text-green-600/40")}>Plan Inventory</p>
                                                            <div className={cn("h-px flex-1", isRoyal ? "bg-amber-500/20" : "bg-green-500/20")} />
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {Object.entries(user.purchasedPlans).map(([price, count]) => {
                                                                const isHighTierPlan = price === '999' || price === '700';
                                                                return (
                                                                    <Badge key={price} className={cn(
                                                                        "font-black text-[10px] h-8 px-3 uppercase tracking-tighter shadow-md rounded-xl flex items-center gap-2",
                                                                        isHighTierPlan 
                                                                            ? "bg-amber-500 text-white border-none animate-pulse" 
                                                                            : "bg-white dark:bg-zinc-800 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                                                    )}>
                                                                        ₹{price} × {count}
                                                                        {isHighTierPlan && <Sparkles className="h-3 w-3 fill-current" />}
                                                                    </Badge>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mt-8 border-t border-green-500/10 pt-4">
                                                        <p className="text-[8px] font-bold text-green-600/30 uppercase tracking-widest italic">NO SPECIFIC PLAN RECORDS FOUND.</p>
                                                    </div>
                                                )}
                                                
                                                <div className="mt-auto pt-6">
                                                    <Badge variant="outline" className="h-5 px-2 text-[8px] font-black uppercase">
                                                        {isRoyal ? 'ROYAL NODE ACTIVE' : 'VERIFIED REVENUE NODE'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </Card>
                                        
                                        <Card className={cn(
                                            "rounded-[2.5rem] shadow-xl border-2 border-dashed transition-all duration-500",
                                            user.subscription ? "bg-indigo-50 border-indigo-200" : "bg-muted/20 border-muted-foreground/10 opacity-60"
                                        )}>
                                            <div className="p-8">
                                                <div className="flex items-center justify-between mb-4">
                                                    <p className={cn("text-[10px] font-black uppercase tracking-[0.3em]", user.subscription ? "text-indigo-600" : "text-muted-foreground")}>Consistency Plan</p>
                                                    <div className="flex gap-2">
                                                        {user.subscription && (
                                                            <Button 
                                                                variant="destructive" 
                                                                size="sm" 
                                                                className="h-7 px-3 text-[9px] font-black uppercase rounded-lg shadow-sm flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                                                                onClick={() => setConfirmAction({
                                                                    type: 'cancel_sub',
                                                                    title: 'Deactivate Consistency Plan?',
                                                                    description: `This will stop all upcoming consistency installments and deactivate the plan for ${user.name || user.email || 'this user'}.`
                                                                })}
                                                                disabled={isUpdating}
                                                            >
                                                                <X className="h-3 w-3" /> DEACTIVATE PLAN
                                                            </Button>
                                                        )}
                                                        {!user.subscription && (
                                                            <Button variant="ghost" size="sm" className="h-7 text-[9px] font-black uppercase bg-primary/10 text-primary rounded-lg" onClick={handleGrantAutopay} disabled={isUpdating}>GRANT</Button>
                                                        )}
                                                    </div>
                                                </div>
                                                {user.subscription ? (
                                                    <div className="space-y-3">
                                                        <div className="text-2xl font-black text-indigo-700 tracking-tight uppercase">W{user.subscription.weeklyGrantCount} ACTIVE</div>
                                                        <Badge className="bg-white/50 text-indigo-500 border-indigo-200 font-black text-[9px] uppercase h-5 px-2">NEXT: {format(new Date(user.subscription.nextWeeklyGrantDate), 'do MMM')}</Badge>
                                                    </div>
                                                ) : <p className="text-lg font-black uppercase tracking-widest text-muted-foreground/30">OFFLINE</p>}
                                            </div>
                                        </Card>
                                     </div>

                                    <div className="space-y-6">
{/* 📦 PLANS & SUBSCRIPTIONS HISTORY SECTION */}
                                     <div className="space-y-4 mb-6">
                                         <div className="flex items-center justify-between px-3">
                                             <div className="flex items-center gap-2">
                                                 <CreditCard className="h-4 w-4 text-primary" />
                                                 <h3 className="font-black text-[11px] text-primary uppercase tracking-[0.25em]">
                                                     Plans & Subscriptions History ({planHistoryEntries.length})
                                                 </h3>
                                             </div>
                                             {planHistoryEntries.some(p => getPlanDetails(p).isDuplicate) && (
                                                 <Badge variant="destructive" className="font-black text-[9px] uppercase px-2.5 h-6 animate-pulse flex items-center gap-1">
                                                     <AlertTriangle className="h-3 w-3" /> Duplicate Grants Detected
                                                 </Badge>
                                             )}
                                         </div>

                                         {planHistoryEntries.length > 0 ? (
                                             <div className="space-y-3">
                                                 {planHistoryEntries.map((entry, idx) => {
                                                     const details = getPlanDetails(entry);
                                                     return (
                                                         <div 
                                                             key={`plan-${entry.timestamp}-${idx}`} 
                                                             className={cn(
                                                                 "p-5 rounded-[2rem] border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm",
                                                                 details.isDuplicate 
                                                                     ? "bg-red-500/5 border-red-500/30 dark:bg-red-950/20" 
                                                                     : "bg-background border-primary/10 hover:border-primary/20"
                                                             )}
                                                         >
                                                             <div className="flex items-start sm:items-center gap-4">
                                                                 <div className={cn(
                                                                     "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner",
                                                                     details.isDuplicate ? "bg-red-100 text-red-600 dark:bg-red-900/40" : "bg-primary/10 text-primary"
                                                                 )}>
                                                                     {details.isConsistency ? <Sparkles className="h-6 w-6" /> : <CreditCard className="h-6 w-6" />}
                                                                 </div>
                                                                 <div className="space-y-1 min-w-0">
                                                                     <div className="flex items-center gap-2 flex-wrap">
                                                                         <p className="font-black text-sm uppercase tracking-tight text-foreground">{entry.reason}</p>
                                                                         <Badge className={cn(
                                                                             "text-[9px] font-black uppercase px-2 h-5 rounded-md",
                                                                             details.isConsistency ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300" : "bg-primary/10 text-primary"
                                                                         )}>
                                                                             {details.planBadge}
                                                                         </Badge>
                                                                         {details.isDuplicate && (
                                                                             <Badge className="bg-red-600 text-white text-[9px] font-black uppercase px-2 h-5 rounded-md flex items-center gap-1 shadow-sm">
                                                                                 <AlertTriangle className="h-3 w-3" /> DUPLICATE GRANT
                                                                             </Badge>
                                                                         )}
                                                                     </div>
                                                                     <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase flex-wrap">
                                                                         <span className="flex items-center gap-1">
                                                                             <Clock className="h-3 w-3 opacity-60" /> {format(new Date(entry.timestamp), 'PPpp')}
                                                                         </span>
                                                                         {details.price > 0 && (
                                                                             <span className="flex items-center gap-0.5 font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                                                 <IndianRupee className="h-3 w-3" />{details.price.toLocaleString()}
                                                                             </span>
                                                                         )}
                                                                     </div>
                                                                 </div>
                                                             </div>

                                                             <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-muted">
                                                                 <div className="text-right">
                                                                     <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Credits Granted</p>
                                                                     <p className={cn(
                                                                         "text-lg font-black tracking-tight",
                                                                         details.isDuplicate ? "text-red-600" : "text-emerald-600 dark:text-emerald-400"
                                                                     )}>
                                                                         +{entry.amount.toLocaleString()}
                                                                     </p>
                                                                 </div>

                                                                 {details.isDuplicate && (
                                                                     <Button 
                                                                         variant="destructive" 
                                                                         size="sm" 
                                                                         className="h-9 px-3 rounded-xl font-black text-[10px] uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center gap-1.5"
                                                                         onClick={() => handleRevertSingleDuplicate(entry)}
                                                                         disabled={isUpdating}
                                                                     >
                                                                         <Undo2 className="h-3.5 w-3.5" /> Revert & Deduct
                                                                     </Button>
                                                                 )}
                                                             </div>
                                                         </div>
                                                     );
                                                 })}
                                             </div>
                                         ) : (
                                             <div className="p-8 rounded-[2rem] border-2 border-dashed border-muted text-center space-y-1">
                                                 <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/50">No plan purchases recorded yet</p>
                                             </div>
                                         )}
                                     </div>

                                     <Separator />

                                     <h3 className="font-black text-[10px] text-primary/60 uppercase tracking-[0.3em] px-3 mt-6">All Activity Ledger</h3>
                                        {isLoadingData ? (
                                            <div className="space-y-3">
                                                {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {fullUnifiedHistory.slice(0, creditsLimit).map((entry, i) => (
                                                    <div key={i} className="flex items-center gap-4 p-5 border-2 border-primary/5 rounded-[2rem] bg-background shadow-sm group">
                                                        <div className={cn(
                                                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-inner",
                                                            entry.amount >= 0 ? 'bg-green-50' : 'bg-muted/50'
                                                        )}>
                                                            {getIconForReason(entry.reason, entry.amount)}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-black text-[11px] sm:text-[13px] uppercase leading-tight text-foreground/90 break-words line-clamp-3 sm:line-clamp-none">{entry.reason}</p>
                                                            <p className="text-[9px] font-bold text-muted-foreground uppercase mt-2 opacity-50">{format(new Date(entry.timestamp), 'PPpp')}</p>
                                                        </div>
                                                        <div className="flex items-center gap-3 sm:gap-4 shrink-0 self-start sm:self-center pt-1 sm:pt-0">
                                                            <div className={cn("font-black text-sm sm:text-xl tracking-tighter", entry.amount >= 0 ? "text-green-600" : "text-foreground")}>
                                                                {entry.amount >= 0 ? '+' : ''}{entry.amount.toLocaleString()}
                                                            </div>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-destructive opacity-0 group-hover:opacity-100 transition-all duration-300" onClick={() => handleUpdateHistory('credit', fullUnifiedHistory.filter(c => c.timestamp !== entry.timestamp))}><Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></Button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {fullUnifiedHistory.length === 0 && (
                                                    <div className="text-center py-10 text-xs font-bold text-muted-foreground/40 uppercase tracking-widest">
                                                        No history ledger entries found
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                <TabsContent value="notifications" className="m-0 space-y-4">
                                    {isLoadingData ? (
                                        <div className="space-y-3">
                                            {[1,2].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
                                        </div>
                                    ) : (
                                        notifications.slice(0, logsLimit).map((notif, i) => (
                                            <div key={i} className="p-6 border-2 border-primary/5 rounded-[2rem] bg-muted/20 relative group">
                                                <p className="text-sm font-bold leading-relaxed pr-8 whitespace-normal break-words">{notif.message}</p>
                                                <p className="text-[10px] font-black uppercase text-muted-foreground mt-4 opacity-50">{format(new Date(notif.timestamp), 'PPpp')}</p>
                                                <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-destructive opacity-0 group-hover:opacity-100 transition-all duration-300" onClick={() => handleUpdateHistory('notification', notifications.filter(n => n.timestamp !== notif.timestamp))}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        ))
                                    )}
                                </TabsContent>

                                <TabsContent value="actions" className="m-0 space-y-8">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <Button variant="outline" className="h-14 justify-start gap-4 px-6 font-black uppercase tracking-widest text-[10px] rounded-2xl" onClick={() => setConfirmAction({type:'role', title:'Toggle Admin?', description:'Access levels will be synchronized.'})}><ShieldCheck className="h-5 w-5 text-primary" /> {user.role === 'admin' ? 'DEMOTE ADMIN' : 'PROMOTE ADMIN'}</Button>
                                        <Button variant="outline" className="h-14 justify-start gap-4 px-6 font-black uppercase tracking-widest text-[10px] rounded-2xl" onClick={() => setConfirmAction({type:'seller', title:'Toggle Seller?', description:'Merchant status synchronization.'})}><Store className="h-5 w-5 text-primary" /> {user.isSeller ? 'TERMINATE SELLER' : 'INIT SELLER'}</Button>
                                        <Button variant="outline" className="h-14 justify-start gap-4 px-6 font-black uppercase tracking-widest text-[10px] rounded-2xl" onClick={() => setConfirmAction({type:'sponsor', title:'Toggle Sponsor?', description:'Grant bypass for all limits.'})}><Gem className="h-5 w-5 text-amber-600" /> {user.isSponsor ? 'REVOKE SPONSOR' : 'AUTHORIZE SPONSOR'}</Button>
                                    </div>
                                    <Separator />
                                    <div className="p-8 rounded-[2.5rem] border-4 border-destructive/20 bg-destructive/[0.02] space-y-6">
                                        <div className="flex items-center gap-3 text-destructive font-black uppercase tracking-widest text-[10px]"><ShieldAlert className="h-5 w-5" /> SECURITY OVERRIDE</div>
                                        {user.status === 'active' ? (
                                             <Button variant="destructive" className="w-full h-16 font-black text-lg rounded-2xl shadow-xl shadow-destructive/20 uppercase" onClick={() => setConfirmAction({type:'ban', title:'PERMANENT PURGE?', description:'Irreversible termination of account tokens.'})}><ShieldX className="mr-3 h-6 w-6" /> TERMINATE ACCOUNT</Button>
                                        ) : (
                                             <Button className="w-full h-16 font-black text-lg rounded-2xl shadow-xl bg-green-600 hover:bg-green-700 text-white uppercase" onClick={() => setConfirmAction({type:'reactivate', title:'RESTORE ACCESS?', description:'Synchronize node state back to active.'})}><CheckCircle className="mr-3 h-6 w-6" /> REACTIVATE ACCOUNT</Button>
                                        )}
                                    </div>
                                </TabsContent>

                                <TabsContent value="overview" className="m-0 space-y-6 animate-in fade-in slide-in-from-top-1 duration-300">
                                    {/* Overview Top Header with On-Demand Refresh */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-primary/10 text-primary rounded-xl shrink-0">
                                                <Activity className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-black text-sm uppercase tracking-tight text-foreground">User Overview & Matrix</h3>
                                                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase h-5 px-2">On-Demand</Badge>
                                                </div>
                                                <p className="text-xs font-semibold text-muted-foreground">Calculated on click to minimize database reads.</p>
                                            </div>
                                        </div>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={fetchOverviewData} 
                                            disabled={isLoadingOverview}
                                            className="h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider border-border hover:bg-muted gap-2 shrink-0 self-start sm:self-auto"
                                        >
                                            <RefreshCw className={cn("h-3.5 w-3.5", isLoadingOverview && "animate-spin text-primary")} />
                                            {isLoadingOverview ? "Calculating..." : "Recalculate Stats"}
                                        </Button>
                                    </div>

                                    {isLoadingOverview ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-3 border border-border rounded-2xl bg-card">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Calculating overview metrics...</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Membership and Core Profile Information */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <Card className="md:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex items-center justify-between gap-2 mb-3">
                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Member Identity & Nodes</p>
                                                            <Badge variant="outline" className="text-[9px] font-black uppercase px-2 h-5 text-foreground border-border">
                                                                {user.role === 'admin' ? 'System Administrator' : 'Standard Member'}
                                                            </Badge>
                                                        </div>
                                                        <h3 className="text-lg font-black uppercase text-foreground leading-tight tracking-tight mb-5">Account Profile Details</h3>
                                                        
                                                        <div className="grid grid-cols-2 gap-3.5">
                                                            <div className="bg-muted/40 p-3.5 rounded-xl border border-border/60">
                                                                <span className="text-[10px] font-black text-muted-foreground uppercase block tracking-wider mb-1">Registry Date</span>
                                                                <span className="font-black text-sm uppercase tracking-tight text-foreground">
                                                                    {joinDateStr ? format(new Date(joinDateStr), "MMMM d, yyyy") : "Not Recorded"}
                                                                </span>
                                                            </div>
                                                            <div className="bg-muted/40 p-3.5 rounded-xl border border-border/60">
                                                                <span className="text-[10px] font-black text-muted-foreground uppercase block tracking-wider mb-1">Subscription Plan</span>
                                                                <span className="font-black text-sm uppercase tracking-tight text-primary">
                                                                    {user.subscription?.planId ? user.subscription.planId.replace(/_/g, ' ') : "Free Tier"}
                                                                </span>
                                                            </div>
                                                            <div className="bg-muted/40 p-3.5 rounded-xl border border-border/60">
                                                                <span className="text-[10px] font-black text-muted-foreground uppercase block tracking-wider mb-1">Lifetime Investment</span>
                                                                <span className="font-black text-sm uppercase tracking-tight text-foreground">
                                                                    ₹{(user.totalInvestment || 0).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className="bg-muted/40 p-3.5 rounded-xl border border-border/60">
                                                                <span className="text-[10px] font-black text-muted-foreground uppercase block tracking-wider mb-1">Vault Balance</span>
                                                                <span className="font-black text-sm uppercase tracking-tight text-emerald-600 dark:text-emerald-400">
                                                                    {user.credits.toLocaleString()} Credits
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-6 pt-4 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground font-mono font-bold">
                                                         <span>ROLE: {user.role === 'admin' ? 'SYSTEM ROOT' : 'CREATOR NODE'}</span>
                                                         {joinDateStr && (
                                                             <span>ACTIVE: {Math.max(1, Math.ceil((Date.now() - new Date(joinDateStr).getTime()) / (1000 * 60 * 60 * 24)))} DAYS</span>
                                                         )}
                                                    </div>
                                                </Card>

                                                <Card className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                                                    <div className="absolute -right-6 -top-6 opacity-10 pointer-events-none">
                                                        <Trophy className="h-28 w-28 rotate-12 text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2">Usage Favorite</p>
                                                        <h3 className="text-lg font-black uppercase text-foreground leading-tight tracking-tight mb-2">Most Active Studio</h3>
                                                        <p className="text-xs font-semibold text-muted-foreground leading-relaxed mb-4">
                                                            Calculated from user's created generation projects.
                                                        </p>
                                                    </div>

                                                    <div className="flex items-center gap-3.5 bg-muted/40 p-4 rounded-xl border border-border">
                                                        <div className="p-3 bg-primary/10 text-primary rounded-xl shrink-0">
                                                            {favoriteTool.icon}
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Top Engine</p>
                                                            <p className="font-black text-sm uppercase text-foreground tracking-tight">{favoriteTool.name}</p>
                                                            <p className="text-xs font-black text-primary">{favoriteTool.count} Total Runs</p>
                                                        </div>
                                                    </div>
                                                </Card>
                                            </div>

                                            {/* Tool Utilization Matrix */}
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">Utilization Matrix</p>
                                                    <h3 className="text-lg font-black uppercase text-foreground leading-tight tracking-tight">Studio Engine Utilization</h3>
                                                </div>

                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                                                    {/* Voice Studio */}
                                                    <div className="bg-card border border-border hover:border-blue-500/50 p-5 rounded-2xl flex flex-col justify-between transition-all shadow-sm group">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
                                                                <MicVocal className="h-4 w-4" />
                                                            </div>
                                                            <Badge variant="outline" className="text-[9px] font-black tracking-widest text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30 uppercase">VOICE</Badge>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Voice Studio</p>
                                                            <p className="text-2xl font-black text-foreground tracking-tight mt-1">{usageStats.voiceCount} <span className="text-xs font-bold text-muted-foreground">Runs</span></p>
                                                        </div>
                                                    </div>

                                                    {/* Pro Studio */}
                                                    <div className="bg-card border border-border hover:border-amber-500/50 p-5 rounded-2xl flex flex-col justify-between transition-all shadow-sm">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                                                                <Sparkles className="h-4 w-4" />
                                                            </div>
                                                            <Badge variant="outline" className="text-[9px] font-black tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30 uppercase">PRO</Badge>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Pro Studio</p>
                                                            <p className="text-2xl font-black text-foreground tracking-tight mt-1">{usageStats.proCount} <span className="text-xs font-bold text-muted-foreground">Runs</span></p>
                                                        </div>
                                                    </div>

                                                    {/* Script Studio */}
                                                    <div className="bg-card border border-border hover:border-cyan-500/50 p-5 rounded-2xl flex flex-col justify-between transition-all shadow-sm">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <div className="p-2 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-xl">
                                                                <FileText className="h-4 w-4" />
                                                            </div>
                                                            <Badge variant="outline" className="text-[9px] font-black tracking-widest text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/30 uppercase">SCRIPT</Badge>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Script Studio</p>
                                                            <p className="text-2xl font-black text-foreground tracking-tight mt-1">{usageStats.scriptCount} <span className="text-xs font-bold text-muted-foreground">Runs</span></p>
                                                        </div>
                                                    </div>

                                                    {/* Thumbnail Generator */}
                                                    <div className="bg-card border border-border hover:border-emerald-500/50 p-5 rounded-2xl flex flex-col justify-between transition-all shadow-sm">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                                                                <Sparkles className="h-4 w-4" />
                                                            </div>
                                                            <Badge variant="outline" className="text-[9px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30 uppercase">THUMBNAIL</Badge>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Thumbnail Gen</p>
                                                            <p className="text-2xl font-black text-foreground tracking-tight mt-1">{usageStats.thumbnailCount} <span className="text-xs font-bold text-muted-foreground">Runs</span></p>
                                                        </div>
                                                    </div>

                                                    {/* Music Studio */}
                                                    <div className="bg-card border border-border hover:border-pink-500/50 p-5 rounded-2xl flex flex-col justify-between transition-all shadow-sm">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <div className="p-2 bg-pink-500/10 text-pink-600 dark:text-pink-400 rounded-xl">
                                                                <Music className="h-4 w-4" />
                                                            </div>
                                                            <Badge variant="outline" className="text-[9px] font-black tracking-widest text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/30 uppercase">MUSIC</Badge>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Music Studio</p>
                                                            <p className="text-2xl font-black text-foreground tracking-tight mt-1">{usageStats.musicCount} <span className="text-xs font-bold text-muted-foreground">Runs</span></p>
                                                        </div>
                                                    </div>

                                                    {/* Chatterbox Studio */}
                                                    <div className="bg-card border border-border hover:border-violet-500/50 p-5 rounded-2xl flex flex-col justify-between transition-all shadow-sm">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <div className="p-2 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-xl">
                                                                <Zap className="h-4 w-4" />
                                                            </div>
                                                            <Badge variant="outline" className="text-[9px] font-black tracking-widest text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30 uppercase">CHATTERBOX</Badge>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">New AI Studio</p>
                                                            <p className="text-2xl font-black text-foreground tracking-tight mt-1">{usageStats.chatterboxCount} <span className="text-xs font-bold text-muted-foreground">Runs</span></p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Credit Economy Overview */}
                                            <div className="p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20">
                                                        <Coins className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black uppercase text-sm text-foreground">Vault Credit Circulation</h4>
                                                        <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                                                            Current balance: <span className="text-emerald-600 dark:text-emerald-400 font-black">{user.credits.toLocaleString()} credits</span>.
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-6 sm:gap-8">
                                                    <div>
                                                        <span className="text-[10px] font-black text-muted-foreground uppercase block tracking-wider mb-0.5">Burned / Consumed</span>
                                                        <span className="font-black text-lg text-red-600 dark:text-red-400">-{usageStats.totalCreditsSpent.toLocaleString()}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-black text-muted-foreground uppercase block tracking-wider mb-0.5">Deposited / Granted</span>
                                                        <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">+{usageStats.totalCreditsGranted.toLocaleString()}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-black text-muted-foreground uppercase block tracking-wider mb-0.5">Net Burn Ratio</span>
                                                        <span className="font-black text-lg text-primary">
                                                             {((usageStats.totalCreditsSpent / (usageStats.totalCreditsGranted || 1)) * 100).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </TabsContent>
                            </div>
                        </ScrollArea>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>

        <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
            <AlertDialogContent className="rounded-[2.5rem]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-2xl font-black uppercase">{confirmAction?.title}</AlertDialogTitle>
                    <AlertDialogDescription className="text-lg font-medium">{confirmAction?.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-8 gap-3">
                    <AlertDialogCancel className="rounded-xl font-bold">ABORT</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExecuteAction} className="rounded-xl font-black px-10 bg-primary shadow-xl shadow-primary/20 uppercase text-[10px]">CONFIRM PROTOCOL</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!viewingProject} onOpenChange={() => setViewingProject(null)}>
            <DialogContent className="max-w-4xl w-[95vw] sm:w-full h-[90vh] flex flex-col p-0 overflow-hidden rounded-[3rem] border-none shadow-3xl bg-background">
                <DialogHeader className="p-8 sm:p-10 pb-4 border-b shrink-0 bg-muted/20 relative">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary text-white rounded-2xl shadow-lg"><FileText className="h-6 w-6" /></div>
                        <div>
                            <div className="flex items-center gap-2">
                                <DialogTitle className="text-xl sm:text-2xl font-black uppercase tracking-tight truncate max-w-[250px] sm:max-w-none">{viewingProject?.projectName}</DialogTitle>
                                {((viewingProject?.cost && viewingProject.cost > 0) || (viewingProject?.creditCost && viewingProject.creditCost > 0) || ((viewingProject as any)?.credits && (viewingProject as any).credits > 0)) && (
                                    <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-black text-xs px-2.5 h-6 rounded-full flex items-center gap-1">
                                        <Coins className="h-3.5 w-3.5" />
                                        {Number(viewingProject?.cost || viewingProject?.creditCost || (viewingProject as any)?.credits || 0).toLocaleString()} Credits
                                    </Badge>
                                )}
                            </div>
                            <DialogDescription className="font-bold text-[10px] uppercase tracking-widest opacity-60">Source Manuscript Node</DialogDescription>
                        </div>
                    </div>
                    <DialogClose className="absolute right-6 top-6 rounded-full p-2 hover:bg-muted transition-colors"><X className="h-5 w-5" /></DialogClose>
                </DialogHeader>
                
                <ScrollArea className="flex-1">
                    <div className="p-8 sm:p-12 space-y-12">
                        {/* NEW: Voice Assignment Section for Admin Review */}
                        {viewingProject?.characters && viewingProject.characters.length > 0 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-500">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 border-l-4 border-primary/20 pl-4">
                                    <Sparkles className="h-4 w-4" /> Cast Persona Mapping
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {viewingProject.characters.map((char: any, i: number) => {
                                        const voiceName = voices.find(v => v.id === char.voice)?.name || char.voice;
                                        const avatarColor = generateAvatarColor(char.name);
                                        return (
                                            <div key={i} className="flex justify-between items-center p-4 px-6 rounded-[1.5rem] bg-muted/30 border border-primary/5 shadow-sm transition-all hover:bg-muted/40">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <Avatar className="h-8 w-8 shrink-0">
                                                        <AvatarFallback className={cn("font-black text-[10px]", avatarColor.bg, avatarColor.text)}>
                                                            {char.name?.charAt(0).toUpperCase() || 'C'}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0 flex flex-col">
                                                        <span className="font-black text-sm truncate uppercase tracking-tight">{char.name}</span>
                                                        <span className="text-[8px] font-bold text-muted-foreground uppercase">{char.emotion || 'Neutral'}</span>
                                                    </div>
                                                </div>
                                                <Badge className="text-[9px] font-black uppercase tracking-widest bg-primary text-white border-none h-6 px-3 shadow-md">{voiceName}</Badge>
                                            </div>
                                        );
                                    })}
                                </div>
                                <Separator className="opacity-40" />
                            </div>
                        )}

                        <div className="space-y-6">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-l-4 border-muted-foreground/20 pl-4">
                                <FileText className="h-4 w-4" /> Manuscript Content
                            </div>
                            <div className="border-2 border-primary/5 rounded-[2rem] p-8 sm:p-10 bg-muted/10 font-mono text-base leading-relaxed shadow-inner">
                                <pre className="whitespace-pre-wrap font-sans font-bold text-foreground/80 leading-relaxed text-lg sm:text-xl">
                                    {viewingProject?.script}
                                </pre>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="p-8 border-t bg-muted/20 gap-3">
                    <Button variant="outline" onClick={handleCopyScript} className="font-black h-12 rounded-xl border-primary/20 gap-2 bg-white">
                        {isCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <ClipboardCopy className="mr-2 h-4 w-4 text-primary" />} 
                        COPY SCRIPT
                    </Button>
                    <Button onClick={() => setViewingProject(null)} className="h-12 px-12 rounded-xl font-black bg-primary uppercase tracking-widest text-[10px]">EXIT VIEW</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}

const LastSeenCell = ({ uid }: { uid: string }) => {
    const { database } = initializeFirebase();
    const [presence, setPresence] = useState<any>(null);

    useEffect(() => {
        if (!database || !uid) return;
        const presenceRef = ref(database, `onlineUsers/${uid}`);
        const unsubscribe = onRtdbValue(presenceRef, (snapshot) => {
            setPresence(snapshot.val());
        });
        return () => unsubscribe();
    }, [database, uid]);

    if (!presence) return <span className="text-[10px] text-muted-foreground opacity-30 italic">Offline</span>;

    if (presence.status === 'online') {
        return (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-sm animate-pulse flex items-center gap-1.5 h-5 px-2 text-[8px] font-black uppercase tracking-widest w-fit">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live
            </Badge>
        );
    }

    if (presence.lastSeen) {
        try {
            return (
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-tighter">
                        {format(new Date(presence.lastSeen), "MMM d, h:mm a")}
                    </span>
                </div>
            );
        } catch (e) {
            return <span className="text-[10px] text-muted-foreground opacity-30">Recently</span>;
        }
    }

    return <span className="text-[10px] text-muted-foreground opacity-30">Offline</span>;
};

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [firestoreProfiles, setFirestoreProfiles] = useState<Record<string, UserProfile | 'loading' | null>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [showUnifiedView, setShowUnifiedView] = useState(false);
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  // Active Consistency Plan filter state
  const [isFilteringConsistency, setIsFilteringConsistency] = useState(false);
  const [activeConsistencyUsers, setActiveConsistencyUsers] = useState<UserProfile[] | null>(null);

  // Real-time calculation state
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [creditReason, setCreditReason] = useState('Admin manual adjustment');

  const handleSearch = async () => {
      if (!searchQuery.trim()) return;
      setIsSearching(true);
      setActiveConsistencyUsers(null);
      const result = await searchAuthUsers(searchQuery);
      if (result.success && result.users) setSearchResults(result.users);
      setIsSearching(false);
  };

  const handleFilterActiveConsistency = async () => {
      setIsFilteringConsistency(true);
      setSearchResults(null);
      try {
          const res = await getActiveConsistencyPlanUsers();
          if (res.success && res.users) {
              setActiveConsistencyUsers(res.users);
              res.users.forEach(u => {
                  setFirestoreProfiles(prev => ({ ...prev, [u.uid]: u }));
              });
              toast({
                  title: '⚡ Filter Applied',
                  description: `Found ${res.users.length} Active Consistency Plan users. (${res.users.length} reads used)`
              });
          } else {
              toast({ variant: 'destructive', title: 'Filter Failed', description: res.error });
          }
      } catch (e: any) {
          toast({ variant: 'destructive', title: 'Error', description: e.message });
      } finally {
          setIsFilteringConsistency(false);
      }
  };

  const fetchProfile = useCallback(async (uid: string) => {
    if (firestoreProfiles[uid] && firestoreProfiles[uid] !== 'loading') return firestoreProfiles[uid] as UserProfile;
    setFirestoreProfiles(prev => ({ ...prev, [uid]: 'loading' }));
    const fetchedProfile = await getUserProfileFromServer(uid);
    setFirestoreProfiles(prev => ({ ...prev, [uid]: fetchedProfile }));
    return fetchedProfile;
  }, [firestoreProfiles]);

  const handleUpdateProfileDirectly = (updated: UserProfile) => {
      setFirestoreProfiles(prev => ({ ...prev, [updated.uid]: updated }));
      setSelectedProfile(updated);
  };

  const handleAdjustCredits = async () => {
    if (!selectedProfile || !currentUser?.email) return;
    setIsActionLoading(true);
    try {
        const adjustment = parseInt(adjustmentAmount) || 0;
        const finalBalance = selectedProfile.credits + adjustment;
        
        const idToken = await currentUser.getIdToken();
        const result = await adjustUserCredits(idToken, selectedProfile.uid, selectedProfile.credits, finalBalance, currentUser.email, creditReason);
        if (result.success) {
            toast({ title: 'Credits Synchronized' });
            const updated = await getUserProfileFromServer(selectedProfile.uid);
            setFirestoreProfiles(prev => ({ ...prev, [selectedProfile.uid]: updated }));
            setShowCreditDialog(false);
        } else throw new Error(result.error);
    } catch (e: any) { toast({ variant: 'destructive', title: 'Update Failed', description: e.message }); }
    finally { setIsActionLoading(false); }
  };

  const projectedBalance = useMemo(() => {
      if (!selectedProfile) return 0;
      const adj = parseInt(adjustmentAmount) || 0;
      return selectedProfile.credits + adj;
  }, [selectedProfile, adjustmentAmount]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-black uppercase tracking-tight flex items-center gap-4"><Users className="h-10 w-10 text-primary" /> User Hub</h1>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-60">Full Platform Node Oversight</p>
      </div>

      <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-sm rounded-[2rem]">
        <CardHeader className="pb-8 border-b">
          <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input placeholder="Search identity via email or UID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearch()} className="pl-10 h-12 text-base rounded-xl border-primary/10 bg-muted/10 font-medium" />
              </div>
              <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSearch} disabled={isSearching} className="h-12 px-8 rounded-xl font-black uppercase text-[11px] tracking-widest transition-all shadow-xl shadow-primary/10">
                      {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search Database'}
                  </Button>

                  <Button 
                      onClick={handleFilterActiveConsistency} 
                      disabled={isFilteringConsistency}
                      variant="outline"
                      className="h-12 px-5 rounded-xl font-black uppercase text-[10px] tracking-wider border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all shadow-sm flex items-center gap-2"
                  >
                      {isFilteringConsistency ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-emerald-600 fill-current" />}
                      ⚡ Active Consistency Plan ({activeConsistencyUsers ? activeConsistencyUsers.length : 'Filter'})
                  </Button>

                  {activeConsistencyUsers && (
                      <Button 
                          onClick={() => setActiveConsistencyUsers(null)} 
                          variant="ghost" 
                          className="h-12 px-4 rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted"
                      >
                          Clear Filter
                      </Button>
                  )}
              </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
                <TableHeader className="bg-muted/50 h-14">
                    <TableRow className="border-none">
                    <TableHead className="pl-8 font-black uppercase text-[9px] tracking-widest">User Identity</TableHead>
                    <TableHead className="font-black uppercase text-[9px] tracking-widest">Vault</TableHead>
                    <TableHead className="font-black uppercase text-[9px] tracking-widest">Credentials</TableHead>
                    <TableHead className="font-black uppercase text-[9px] tracking-widest">Last Activity</TableHead>
                    <TableHead className="font-black uppercase text-[9px] tracking-widest text-right pr-8"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {activeConsistencyUsers ? (
                        activeConsistencyUsers.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-32 opacity-30 font-black uppercase tracking-widest">No Active Consistency Plan Users Found</TableCell></TableRow>
                        ) : activeConsistencyUsers.map(profile => {
                            const avatarColor = generateAvatarColor(profile.email || '');
                            return (
                                <TableRow key={profile.uid} className="h-24 hover:bg-primary/5 transition-colors border-muted/10 group">
                                    <TableCell className="pl-8">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-11 w-11 border-2 border-background shadow-lg"><AvatarFallback className={cn("font-black", avatarColor.bg, avatarColor.text)}>{(profile.name || profile.email || 'U').charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                                            <div className="min-w-0 flex-col">
                                                <p className="font-black text-sm uppercase tracking-tight truncate flex items-center gap-2">
                                                    {profile.name || 'Anonymous Creator'}
                                                    <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 text-[8px] font-black uppercase px-2 h-4">CONSISTENCY PLAN</Badge>
                                                    <Badge className={cn(
                                                        "text-[7px] font-black uppercase px-1.5 h-3.5 border shadow-sm",
                                                        profile.status === 'active' ? "bg-emerald-500 text-white border-emerald-600" : "bg-red-500 text-white border-red-600"
                                                    )}>
                                                        {profile.status}
                                                    </Badge>
                                                </p>
                                                <p className="text-[10px] font-bold text-muted-foreground truncate">{profile.email}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell><div className="flex items-center gap-2"><Coins className="h-3.5 w-3.5 text-primary" /><span className="text-base font-black tracking-tight">{(profile.credits || 0).toLocaleString()}</span></div></TableCell>
                                    <TableCell><div className="flex wrap gap-1">{profile.role === 'admin' && <Badge className="bg-primary/10 text-primary border-none text-[8px] h-5 font-black uppercase">ROOT</Badge>}{profile.isSeller && <Badge className="bg-orange-100 text-orange-700 border-none text-[8px] h-5 font-black uppercase">MERCHANT</Badge>}</div></TableCell>
                                    <TableCell><LastSeenCell uid={profile.uid} /></TableCell>
                                    <TableCell className="pr-8 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button size="sm" variant="outline" onClick={() => { setSelectedProfile(profile); setShowUnifiedView(true); }} className="h-9 px-5 rounded-full font-black text-[9px] uppercase tracking-widest border-primary/20">Analyze</Button>
                                            <Button size="sm" variant="ghost" onClick={() => { setSelectedProfile(profile); setAdjustmentAmount(''); setShowCreditDialog(true); }} className="h-9 px-4 rounded-full font-black text-[9px] uppercase tracking-widest">Credits</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    ) : !searchResults ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-32 opacity-20 italic font-black uppercase tracking-[0.4em]">Search database or filter Active Consistency Users</TableCell></TableRow>
                    ) : searchResults.map(user => {
                        const profile = firestoreProfiles[user.uid] === 'loading' ? null : firestoreProfiles[user.uid] as UserProfile | null;
                        const avatarColor = generateAvatarColor(user.email || '');
                        return (
                            <TableRow key={user.uid} className="h-24 hover:bg-primary/5 transition-colors border-muted/10 group">
                                <TableCell className="pl-8">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-11 w-11 border-2 border-background shadow-lg"><AvatarImage src={user.photoURL} /><AvatarFallback className={cn("font-black", avatarColor.bg, avatarColor.text)}>{(user.displayName || user.email || 'U').charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                                        <div className="min-w-0 flex-col">
                                            <p className="font-black text-sm uppercase tracking-tight truncate flex items-center gap-2">
                                                {user.displayName || 'Anonymous Creator'}
                                                {profile && (
                                                    <Badge className={cn(
                                                        "text-[7px] font-black uppercase px-1.5 h-3.5 border shadow-sm",
                                                        profile.status === 'active' ? "bg-emerald-500 text-white border-emerald-600" : "bg-red-500 text-white border-red-600"
                                                    )}>
                                                        {profile.status}
                                                    </Badge>
                                                )}
                                            </p>
                                            <p className="text-[10px] font-bold text-muted-foreground truncate">{user.email}</p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>{profile ? (<div className="flex items-center gap-2"><Coins className="h-3.5 w-3.5 text-primary" /><span className="text-base font-black tracking-tight">{profile.credits.toLocaleString()}</span></div>) : <Badge variant="outline" className="opacity-30">NO PROFILE</Badge>}</TableCell>
                                <TableCell><div className="flex wrap gap-1">{profile?.role === 'admin' && <Badge className="bg-primary/10 text-primary border-none text-[8px] h-5 font-black uppercase">ROOT</Badge>}{profile?.isSeller && <Badge className="bg-orange-100 text-orange-700 border-none text-[8px] h-5 font-black uppercase">MERCHANT</Badge>}</div></TableCell>
                                <TableCell><LastSeenCell uid={user.uid} /></TableCell>
                                <TableCell className="pr-8 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button size="sm" variant="outline" onClick={() => fetchProfile(user.uid).then(p => { if(p) { setSelectedProfile(p); setShowUnifiedView(true); } })} className="h-9 px-5 rounded-full font-black text-[9px] uppercase tracking-widest border-primary/20">Analyze</Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full opacity-40 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontal className="h-5 w-5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-2xl border-primary/5">
                                                <DropdownMenuItem className="h-10 rounded-lg cursor-pointer" onClick={() => { fetchProfile(user.uid).then(p => { if(p) { setSelectedProfile(p); setAdjustmentAmount(''); setShowCreditDialog(true); } }); }}>
                                                    <Coins className="mr-3 h-4 w-4 text-primary" /> Adjust Credits
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
          <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-3xl bg-background">
              <DialogHeader className="p-8 pb-4 bg-primary/5 border-b border-primary/10">
                <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                    <Coins className="h-6 w-6 text-primary" />
                    Adjust Vault Balance
                </DialogTitle>
                <DialogDescription className="font-bold text-[10px] uppercase">Incremental credit node update</DialogDescription>
              </DialogHeader>
              <div className="p-8 space-y-8">
                  <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-muted/30 border border-primary/5">
                          <p className="text-[9px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Current Balance</p>
                          <p className="text-xl font-black font-mono">{selectedProfile?.credits.toLocaleString()}</p>
                      </div>
                      <div className={cn(
                          "p-4 rounded-2xl border transition-all duration-500",
                          projectedBalance >= (selectedProfile?.credits || 0) ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                      )}>
                          <p className={cn("text-[9px] font-black uppercase mb-1 tracking-widest", projectedBalance >= (selectedProfile?.credits || 0) ? "text-green-600" : "text-red-600")}>Estimated New Balance</p>
                          <p className={cn("text-xl font-black font-mono", projectedBalance >= (selectedProfile?.credits || 0) ? "text-green-700" : "text-red-700")}>{projectedBalance.toLocaleString()}</p>
                      </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest px-1">Adjustment Amount (+ to add, - to remove)</Label>
                        <Input 
                            type="text" 
                            placeholder="e.g. +11000 or -500" 
                            value={adjustmentAmount} 
                            onChange={(e) => setAdjustmentAmount(e.target.value)} 
                            className="h-16 text-3xl font-black text-center rounded-2xl bg-muted/20 border-primary/10 focus-visible:ring-primary shadow-inner" 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest px-1">Ledger Reason</Label>
                        <Input 
                            value={creditReason} 
                            onChange={(e) => setCreditReason(e.target.value)} 
                            className="h-11 rounded-xl bg-muted/10 border-primary/5 font-bold" 
                        />
                    </div>
                  </div>
              </div>
              <DialogFooter className="p-8 pt-0 flex gap-3">
                  <Button variant="ghost" onClick={() => setShowCreditDialog(false)} className="rounded-xl font-bold h-12">Cancel</Button>
                  <Button onClick={handleAdjustCredits} disabled={isActionLoading || !adjustmentAmount} className="flex-1 h-12 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-xl shadow-primary/20 btn-shine">
                      {isActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      SYNC TO USER
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {selectedProfile && (<UserUnifiedViewDialog user={selectedProfile} open={showUnifiedView} onOpenChange={setShowUnifiedView} onProfileUpdate={handleUpdateProfileDirectly} />)}
    </div>
  );
}
