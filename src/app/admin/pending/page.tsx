'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { 
    Dialog, 
    DialogContent, 
    DialogDescription, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter, 
    DialogTrigger,
    DialogClose 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
    User, Coins, Loader2, FileText, Trash2, Clock, Mail, 
    CreditCard, Cpu, Sparkles, Copy, AlertTriangle, Zap, 
    IndianRupee, TrendingUp, Activity, ExternalLink, 
    Pause, Link as LinkIcon, Check, Gem, Clipboard, X, 
    Award, ShieldAlert, ShieldX, RotateCcw,
    MicVocal
} from 'lucide-react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, remove, update } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { doc, writeBatch, increment, arrayUnion, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { startProcessingProject, approveSellerAction, rejectSellerAction, completeProjectAction } from './actions';
import { cn, getDisplayUrl, generateAvatarColor } from '@/lib/utils';
import type { SellerProfile, PendingProject } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { voices } from '@/lib/voices';
import { proVoices } from '@/lib/pro-voices';
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

function PendingSellerCard({ profile, onApprove, onReject }: { profile: SellerProfile; onApprove: (id: string) => Promise<void>; onReject: (id: string, reason: string) => Promise<void>; }) {
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [isActing, setIsActing] = useState(false);
    const avatarUrl = getDisplayUrl(profile.profileImageUrl);

    const handleApprove = async () => {
        setIsActing(true);
        await onApprove(profile.id);
        setIsActing(false);
    };

    const handleReject = async () => {
        if (!reason.trim()) return;
        setIsActing(true);
        await onReject(profile.id, reason);
        setIsActing(false);
        setIsRejectDialogOpen(false);
        setReason('');
    };

    return (
        <Card className="rounded-[2.5rem] border-primary/10 shadow-lg bg-card">
            <CardHeader className="p-6 pb-0 flex flex-row items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-primary/20">
                    <AvatarImage src={avatarUrl} alt={profile.storeName} />
                    <AvatarFallback className="font-black text-xl">{profile.storeName?.charAt(0).toUpperCase() || 'S'}</AvatarFallback>
                </Avatar>
                <div className="flex-grow min-w-0">
                    <CardTitle className="truncate text-xl font-black">{profile.storeName || 'Untitled Store'}</CardTitle>
                    <CardDescription className="font-bold text-[10px] uppercase flex items-center gap-1.5 mt-0.5"><Clock className="h-3 w-3" />Requested {profile.createdAt ? formatDistanceToNow(new Date(profile.createdAt), { addSuffix: true }) : 'Recently'}</CardDescription>
                </div>
                <Badge variant="secondary" className="font-black uppercase text-[9px] tracking-widest">{profile.status}</Badge>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
                <p className="text-sm font-medium italic text-muted-foreground line-clamp-3">"{profile.description || 'No description provided.'}"</p>
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold bg-primary/5 p-2 rounded-xl text-primary"><Mail className="h-3.5 w-3.5" /> {profile.secondaryEmail || 'No email'}</div>
                    <div className="flex items-center gap-2 text-xs font-bold bg-primary/5 p-2 rounded-xl text-primary"><Clock className="h-3.5 w-3.5" /> {profile.mobileNumber || 'No mobile'}</div>
                </div>
            </CardContent>
            <CardFooter className="p-6 pt-0 flex gap-2">
                <Button onClick={handleApprove} disabled={isActing} className="flex-1 h-12 rounded-2xl font-black bg-green-600 hover:bg-green-700">Approve</Button>
                <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="flex-1 h-12 rounded-2xl font-black border-destructive/20 text-destructive">Reject</Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-[2.5rem]">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Reject Profile</DialogTitle>
                            <DialogDescription>Please provide a reason. This will be sent to the creator.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4"><Textarea placeholder="Explain why the profile was rejected..." value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[120px] rounded-2xl bg-muted/30" /></div>
                        <DialogFooter className="gap-2">
                            <Button variant="ghost" onClick={() => setIsRejectDialogOpen(false)} className="rounded-xl font-bold">Cancel</Button>
                            <Button variant="destructive" onClick={handleReject} disabled={!reason.trim() || isActing} className="rounded-xl font-black px-8">Confirm Rejection</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardFooter>
        </Card>
    );
}

function PendingProjectCard({ project, onComplete, onDelete, onStartProcessing, isPro = false }: { project: any; onComplete: (projectId: string, audioUrl: string, syncData?: string, usedBridge?: boolean, keyName?: string) => Promise<void>; onDelete: (project: any, reason: string) => Promise<void>; onStartProcessing: (project: any) => Promise<void>; isPro?: boolean; }) {
    const { toast } = useToast();
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isCompleteOpen, setIsCompleteOpen] = useState(false);
    const [isEngaging, setIsEngaging] = useState(false);
    const [refundReason, setRefundReason] = useState('Unstructured script format');
    
    const isProcessing = project.status === 'processing';
    const isUserDeleted = project.userDeleted === true;
    
    const availableVoices = isPro ? proVoices : voices;

    const copyBriefToClipboard = () => {
        let voiceSummaryLines = '';
        if (project.characters && project.characters.length > 0) {
            project.characters.forEach((char: any) => {
                const voiceName = availableVoices.find(v => v.id === char.voice)?.name || char.voice;
                voiceSummaryLines += `${char.name} (${char.emotion || 'Neutral'}): ${voiceName}\n`;
            });
        }
        const fullBrief = `${project.script}\n\nVOICE ASSIGNMENTS:\n${voiceSummaryLines}`;
        navigator.clipboard.writeText(fullBrief);
    };

    const handleCopyFullBrief = () => {
        copyBriefToClipboard();
        toast({ title: 'Production Brief Copied' });
    };

    const handleEngage = async () => {
        setIsEngaging(true);
        copyBriefToClipboard();
        await onStartProcessing(project);
        setIsEngaging(false);
    };

    return (
        <Card className={cn(
            "flex flex-col border shadow-sm transition-all duration-500 rounded-[2.5rem] overflow-hidden bg-card", 
            isProcessing && !isUserDeleted && "ring-4 ring-primary ring-offset-4 ring-offset-background border-primary bg-primary/5 shadow-2xl shadow-primary/20 scale-[1.02] animate-in zoom-in-95",
            isUserDeleted && "border-destructive bg-destructive/5 ring-4 ring-destructive/10 grayscale-[30%] opacity-90",
            isPro && !isProcessing && "border-amber-500/20 bg-amber-500/[0.02]"
        )}>
            <CardHeader className="p-6 pb-3">
                <div className="flex justify-between items-start">
                    <CardTitle className="truncate font-black text-xl tracking-tight">{project.projectName || 'Untitled Project'}</CardTitle>
                    {isUserDeleted ? (
                        <Badge variant="destructive" className="animate-pulse flex items-center gap-1.5 px-3 h-7 text-[10px] font-black uppercase tracking-widest">
                            <ShieldAlert className="h-3 w-3 fill-current" />
                            USER DELETED
                        </Badge>
                    ) : isProcessing ? (
                        <div className="flex flex-col items-end gap-1">
                            <Badge className="bg-primary animate-pulse flex items-center gap-1.5 px-3">
                                <Activity className="h-3 w-3 fill-current" />
                                ACTIVE
                            </Badge>
                            <Badge variant="outline" className="h-4 px-1.5 text-[7px] font-black uppercase border-primary/20 text-primary/60">NEURAL HUB</Badge>
                        </div>
                    ) : (
                        <Badge variant="outline" className={cn(isPro ? "border-amber-500/30 text-amber-600" : "")}>{isPro ? "PRO QUEUE" : "QUEUE"}</Badge>
                    )}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase mt-1 opacity-60"><Clock className="h-3 w-3" />{project.createdAt ? formatDistanceToNow(new Date(project.createdAt), { addSuffix: true }) : 'Recently'}</div>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4">
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-bold truncate">
                            <User className="h-4 w-4 opacity-40" />
                            {project.userName || 'Anonymous User'}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold bg-muted/30 p-2.5 rounded-2xl group/email border border-primary/5">
                        <Mail className="h-3.5 w-3.5 opacity-40" />
                        <span className="truncate flex-1">{project.userEmail || 'No email provided'}</span>
                    </div>

                    {isPro && (
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <div className="bg-primary/5 p-2.5 rounded-xl border border-primary/10 text-center">
                                <p className="text-[7px] font-black uppercase opacity-40">Processed</p>
                                <p className="text-lg font-black text-primary">{project.processed_dialogues || 0}</p>
                            </div>
                            <div className="bg-red-500/5 p-2.5 rounded-xl border border-red-500/10 text-center">
                                <p className="text-[7px] font-black uppercase opacity-40">Rejected</p>
                                <p className="text-lg font-black text-red-600">{project.rejected_nodes || 0}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2">
                        <button onClick={() => { navigator.clipboard.writeText(project.id); toast({ title: 'ID Copied' }) }} className="w-full flex items-center gap-3 text-[9px] font-black bg-primary/5 p-3 rounded-xl border-2 border-dashed border-primary/20 text-primary uppercase font-mono shadow-inner hover:bg-primary/10 transition-all">
                            <Clipboard className="h-4 w-4 opacity-40" />
                            <span className="truncate flex-1 text-left">{project.id}</span>
                            <Copy className="h-3.5 w-3.5 ml-auto opacity-30" />
                        </button>
                    </div>

                    <div className="flex justify-end pt-1">
                        <div className="flex items-center gap-1 font-black text-primary bg-primary/5 px-2.5 py-1 rounded-full text-xs border border-primary/10">
                            <Coins className="h-3.5 w-3.5" />
                            {project.cost?.toLocaleString() || 0}
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 p-6 pt-0 border-t bg-muted/5">
                <div className="grid grid-cols-2 gap-2 w-full mt-4">
                    <Button variant="outline" className="h-11 font-black rounded-2xl border-primary/10" onClick={() => setIsDetailsOpen(true)}><FileText className="mr-2 h-4 w-4" /> Script</Button>
                    {!isUserDeleted && (
                        isProcessing ? (
                            <Button onClick={() => setIsCompleteOpen(true)} className="h-11 font-black rounded-2xl bg-primary shadow-xl shadow-primary/20 uppercase tracking-widest text-[10px]">
                                <Sparkles className="h-4 w-4 mr-2" />
                                Complete
                            </Button>
                        ) : (
                            <Button onClick={handleEngage} disabled={isEngaging} className="h-11 font-black rounded-2xl bg-primary uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20">
                                {isEngaging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-current mr-2" />}
                                Engage
                            </Button>
                        )
                    )}
                </div>

                <div className="flex justify-between w-full pt-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black text-destructive/60 hover:text-destructive hover:bg-destructive/5 uppercase gap-1.5">
                                <RotateCcw className="h-3 w-3" /> Refund
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-[2.5rem] border-destructive/20 p-8">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-2xl font-black uppercase flex items-center gap-3"><AlertTriangle className="text-destructive h-6 w-6" /> Refund Credits?</AlertDialogTitle>
                                <AlertDialogDescription className="text-lg font-medium">
                                    Are you sure you want to refund <b>{project.cost?.toLocaleString() || 0} credits</b> to {project.userName || 'this user'}?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="py-4 space-y-3">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1 tracking-widest">Reason for Refund (User will see this)</Label>
                                <Input 
                                    value={refundReason} 
                                    onChange={(e) => setRefundReason(e.target.value)} 
                                    placeholder="Enter reason..."
                                    className="h-12 rounded-xl bg-muted/20 border-primary/10 font-bold"
                                />
                            </div>
                            <AlertDialogFooter className="mt-4 gap-3">
                                <AlertDialogCancel className="rounded-xl font-bold h-12">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDelete(project, refundReason)} className="bg-destructive hover:bg-destructive/90 rounded-xl font-black h-12 px-8">Confirm Refund</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    {!isUserDeleted && (
                        <Button variant="ghost" size="sm" onClick={handleCopyFullBrief} className="h-8 text-[10px] font-black uppercase text-primary/70 hover:text-primary">Copy Prompts</Button>
                    )}
                </div>
            </CardFooter>
            
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-3xl h-[85vh] flex flex-col rounded-[2.5rem] p-0 overflow-hidden shadow-3xl">
                    <DialogHeader className="p-8 pb-4 border-b shrink-0 bg-muted/20">
                        <DialogTitle className="text-3xl font-black uppercase text-center tracking-tight">Manuscript Review</DialogTitle>
                        <DialogDescription className="text-center font-bold text-[10px] uppercase tracking-widest text-muted-foreground opacity-60">Production Brief Nodes</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1">
                        <div className="p-8 space-y-10">
                            {project.characters && project.characters.length > 0 && (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 border-l-4 border-primary/20 pl-4">
                                        <Sparkles className="h-4 w-4" /> Cast Persona Mapping
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {project.characters.map((char: any, i: number) => {
                                            const voiceName = availableVoices.find(v => v.id === char.voice)?.name || char.voice;
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
                                </div>
                            )}

                            <div className="space-y-6">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-l-4 border-muted-foreground/20 pl-4">
                                    <FileText className="h-4 w-4" /> Production Manuscript
                                </div>
                                <div className="border-2 border-primary/5 rounded-[2rem] p-8 bg-muted/10 font-mono text-base leading-relaxed shadow-inner">
                                    <pre className="whitespace-pre-wrap font-sans font-medium text-foreground/80">
                                        {project.script || 'No script content provided.'}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-8 border-t bg-muted/20 flex flex-col sm:flex-row gap-4">
                         <Button variant="outline" onClick={() => { navigator.clipboard.writeText(project.script); toast({ title: 'Script Copied' }) }} className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest border-primary/10 gap-2">
                             <Copy className="h-4 w-4" /> Copy Manuscript
                         </Button>
                         <Button onClick={() => setIsDetailsOpen(false)} className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">EXIT PREVIEW</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isCompleteOpen} onOpenChange={setIsCompleteOpen}>
                <DialogContent className="max-w-lg rounded-[2.5rem] p-8">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Finalize Production</DialogTitle>
                        <DialogDescription>Upload the master render and complete the hub cycle.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-6">
                        <div className="space-y-2">
                            <Label className="font-bold text-xs uppercase text-muted-foreground px-1">Master Audio URL *</Label>
                            <Input 
                                placeholder="gcs://... OR https://..." 
                                onChange={(e) => (project as any)._tempAudio = e.target.value} 
                                className="h-12 rounded-xl bg-muted/20" 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-bold text-xs uppercase px-1 text-muted-foreground">Sync Payload (Optional JSON)</Label>
                            <Textarea 
                                placeholder='{"timeline": ...}' 
                                onChange={(e) => (project as any)._tempSync = e.target.value} 
                                className="rounded-xl min-h-[100px] bg-muted/20" 
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => { onComplete(project.id, (project as any)._tempAudio || "", (project as any)._tempSync); setIsCompleteOpen(false); }} className="w-full h-14 rounded-2xl font-black text-lg shadow-xl shadow-primary/20">FINISH & NOTIFY USER</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

export default function AdminPendingPage() {
    const { user: currentUser } = useAuth();
    const { firestore, database } = initializeFirebase();
    const { toast } = useToast();
    
    const [pendingProjects, setPendingProjects] = useState<any[]>([]);
    const [proProjects, setProProjects] = useState<any[]>([]);
    const [pendingSellers, setPendingSellers] = useState<SellerProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!database || currentUser?.role !== 'admin') { setIsLoading(false); return; }
        
        // Listen to regular pending_projects
        const unsubscribeProjects = onRtdbValue(ref(database, 'pending_projects'), (snapshot) => {
            const data = snapshot.val();
            const projectsArray = data ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) : [];
            setPendingProjects(projectsArray.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setIsLoading(false);
        });

        // Listen to pro_projects (Backend path: pro_projects/{id})
        const unsubscribePro = onRtdbValue(ref(database, 'pro_projects'), (snapshot) => {
            const data = snapshot.val();
            const proArray = data ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) : [];
            setProProjects(proArray.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        });

        const unsubscribeSellers = onRtdbValue(ref(database, 'pendingSellerProfiles'), (snapshot) => {
            const data = snapshot.val();
            const sellersArray: SellerProfile[] = data ? Object.entries(data).map(([key, val]: [string, any]) => ({ ...val, id: key })) : [];
            setPendingSellers(sellersArray.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        });

        return () => { 
            unsubscribeProjects(); 
            unsubscribePro();
            unsubscribeSellers(); 
        };
    }, [database, currentUser?.role]);

    const handleComplete = async (projectId: string, url: string, sync?: string, usedBridge: boolean = false, keyName?: string) => {
        if (!url) {
            toast({ variant: 'destructive', title: 'Missing URL', description: 'Please provide a valid audio link.' });
            return;
        }
        
        // Find project in either list
        const project = [...pendingProjects, ...proProjects].find(p => p.id === projectId);
        if (!project) return;
        
        setIsLoading(true);
        const result = await completeProjectAction(
            projectId,
            project.userId,
            project.projectName,
            url,
            sync,
            currentUser?.email || undefined,
            usedBridge
        );
        
        if (!result.success) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            // Remove from correct path depending on project type
            const path = project.projectType === 'pro-studio' ? 'pro_projects' : 'pending_projects';
            await remove(ref(database!, `${path}/${projectId}`));
        }
        setIsLoading(false);
    };

    const handleRefund = async (project: any, reason: string) => {
        if (!firestore || !database) return;
        try {
            const batch = writeBatch(firestore);
            const isHardPurge = reason === 'ADMIN_PURGE_NO_REFUND';

            if (!isHardPurge) {
                batch.update(doc(firestore, 'users', project.userId), { credits: increment(project.cost || 0) });
                
                batch.set(doc(firestore, 'users', project.userId, 'creditHistory', 'history_log'), { 
                    entries: arrayUnion({ 
                        amount: project.cost || 0, 
                        reason: `Refund: ${project.projectName} (${reason})`, 
                        timestamp: new Date().toISOString() 
                    }) 
                }, { merge: true });
                
                batch.set(doc(firestore, 'users', project.userId, 'notifications', 'user_notifications'), { 
                    entries: arrayUnion({ 
                        id: `refund-${Date.now()}`, 
                        message: `Project "${project.projectName}" was cancelled. Credits refunded. Reason: ${reason}`, 
                        timestamp: new Date().toISOString(), 
                        read: false, 
                        type: 'system' 
                    }) 
                }, { merge: true });
            }
            
            const firestorePath = project.projectType === 'pro-studio' ? 'pro_projects' : 'projects';
            const partitionedRef = doc(firestore, firestorePath, project.userId, 'userProjects', project.id);
            const partitionedDoc = await getDoc(partitionedRef);
            
            if (partitionedDoc.exists()) {
                batch.update(partitionedRef, { status: isHardPurge ? 'purged' : 'rejected' });
            }
            
            await batch.commit();
            
            // Purge from correct RTDB path
            const rtdbPath = project.projectType === 'pro-studio' ? 'pro_projects' : 'pending_projects';
            await remove(ref(database, `${rtdbPath}/${project.id}`));
            
            toast({ title: isHardPurge ? 'Project Purged' : 'Refunded Successfully' });
        } catch (e: any) { 
            console.error("Refund failed:", e.message);
            toast({ variant: 'destructive', title: 'Action Failed', description: e.message }); 
        }
    };

    const handleApproveSeller = async (uid: string) => {
        const res = await approveSellerAction(uid, currentUser?.email || '');
        if (res.success) toast({ title: 'Seller Approved' }); else toast({ variant: 'destructive', title: 'Failed', description: res.message });
    };

    const handleRejectSeller = async (uid: string, reason: string) => {
        const res = await rejectSellerAction(uid, reason, currentUser?.email || '');
        if (res.success) toast({ title: 'Seller Rejected' }); else toast({ variant: 'destructive', title: 'Failed', description: res.message });
    };

    const handleStartProcessing = async (proj: any) => {
        const result = await startProcessingProject(proj.id, proj.userId, currentUser?.email || '');
        if (!result.success) {
            toast({ variant: 'destructive', title: 'Action Failed', description: result.message });
        }
    }

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col gap-1">
                <h1 className="text-4xl font-black uppercase tracking-tight">Processing Hub</h1>
                <p className="text-muted-foreground font-bold text-[10px] uppercase tracking-[0.2em] opacity-60 px-1">Neural Cluster Oversight</p>
            </div>

            <Tabs defaultValue="projects">
                <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-12 gap-8 px-2">
                    <TabsTrigger value="projects" className="font-black uppercase text-[10px] tracking-widest rounded-none h-full data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Studio Queue ({pendingProjects.length})</TabsTrigger>
                    <TabsTrigger value="pro" className="font-black uppercase text-[10px] tracking-widest rounded-none h-full data-[state=active]:border-b-2 data-[state=active]:border-amber-500 transition-all text-amber-600">Pro Hub ({proProjects.length})</TabsTrigger>
                    <TabsTrigger value="sellers" className="font-black uppercase text-[10px] tracking-widest rounded-none h-full data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">Sellers ({pendingSellers.length})</TabsTrigger>
                </TabsList>
                
                <TabsContent value="projects" className="mt-8">
                    {isLoading && pendingProjects.length === 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {[1,2,3].map(i => <Skeleton key={i} className="h-80 w-full rounded-[2.5rem]" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {pendingProjects.map(p => (
                                <PendingProjectCard 
                                    key={p.id} 
                                    project={p} 
                                    onComplete={handleComplete} 
                                    onDelete={handleRefund} 
                                    onStartProcessing={handleStartProcessing} 
                                />
                            ))}
                            {pendingProjects.length === 0 && (
                                <div className="col-span-full py-32 text-center border-4 border-dashed rounded-[3rem] opacity-20">
                                    <Cpu className="mx-auto h-20 w-20 mb-6" />
                                    <h3 className="text-2xl font-black uppercase tracking-widest">Queue Clear</h3>
                                </div>
                            )}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="pro" className="mt-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {proProjects.map(p => (
                            <PendingProjectCard 
                                key={p.id} 
                                project={p} 
                                onComplete={handleComplete} 
                                onDelete={handleRefund} 
                                onStartProcessing={handleStartProcessing}
                                isPro={true}
                            />
                        ))}
                        {proProjects.length === 0 && (
                            <div className="col-span-full py-32 text-center border-4 border-dashed rounded-[3rem] opacity-20 flex flex-col items-center justify-center">
                                <Zap className="mx-auto h-20 w-20 text-amber-500 mb-6" />
                                <h3 className="text-2xl font-black uppercase tracking-widest">Pro Hub Empty</h3>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="sellers" className="mt-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {pendingSellers.map(s => <PendingSellerCard key={s.id} profile={s} onApprove={handleApproveSeller} onReject={handleRejectSeller} />)}
                        {pendingSellers.length === 0 && (
                            <div className="col-span-full py-32 text-center border-4 border-dashed rounded-[3rem] opacity-30 flex flex-col items-center justify-center">
                                <Sparkles className="mx-auto h-20 w-20 mb-6" />
                                <h3 className="text-2xl font-black uppercase tracking-widest">No Pending Sellers</h3>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
