'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Search, FolderSearch, Loader2, FileText, ClipboardCopy, Check, X, Download, Sparkles, MessageSquareText } from 'lucide-react';
import { findProjectById } from './actions';
import type { Project } from '@/lib/types';
import { ProjectCard } from '@/components/history/project-card';
import { initializeFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadScriptAsPdf, downloadScriptAsTxt, downloadScriptAsDocx } from '@/lib/export-script-pdf';
import { reportClientError } from '@/lib/report-client-error';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, generateAvatarColor, shortVoiceLabel } from '@/lib/utils';
import { voices } from '@/lib/voices';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ProjectLookupPage() {
    const [projectId, setProjectId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [foundProject, setFoundProject] = useState<any | null>(null);
    const [viewingProject, setViewingProject] = useState<Project | null>(null);
    const [isCopied, setIsCopied] = useState(false);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const { toast } = useToast();
    const { firestore } = initializeFirebase();

    const getScriptText = (project: Project | null) => {
        if (!project) return '';
        if (typeof project.script === 'string' && project.script) return project.script;
        if (typeof project.generationParams === 'string' && project.generationParams) return project.generationParams;
        if (typeof (project.generationParams as any)?.prompt === 'string') return (project.generationParams as any).prompt;
        return project.projectName || '';
    };

    const handleCopyScript = () => {
        const text = getScriptText(viewingProject);
        if (!text) return;
        navigator.clipboard.writeText(text);
        setIsCopied(true);
        toast({ title: 'Script copied!' });
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleDownloadScriptTxt = () => {
        const text = getScriptText(viewingProject);
        if (!text) {
            toast({ variant: 'destructive', title: 'No script content available' });
            return;
        }
        downloadScriptAsTxt(viewingProject?.projectName || 'Script', text);
        toast({ title: 'Downloaded .TXT' });
    };

    const handleDownloadScriptDocx = async () => {
        const text = getScriptText(viewingProject);
        if (!text) {
            toast({ variant: 'destructive', title: 'No script content available' });
            return;
        }
        try {
            await downloadScriptAsDocx(viewingProject?.projectName || 'Script', text);
            toast({ title: 'Downloaded .DOCX' });
        } catch (err) {
            reportClientError('src/app/admin/project-lookup/page.tsx:handleDownloadScriptDocx', err);
            toast({ variant: 'destructive', title: 'DOCX generation failed' });
        }
    };

    const handleDownloadScriptPdf = async () => {
        const text = getScriptText(viewingProject);
        if (!text) {
            toast({ variant: 'destructive', title: 'No script content available' });
            return;
        }
        setIsDownloadingPdf(true);
        try {
            await downloadScriptAsPdf(viewingProject?.projectName || 'Script', text);
            toast({ title: 'Downloaded .PDF' });
        } catch (err) {
            reportClientError('src/app/admin/project-lookup/page.tsx:handleDownloadScriptPdf', err);
            toast({ variant: 'destructive', title: 'PDF generation failed' });
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    const handleSearch = async () => {
        if (!projectId.trim()) {
            toast({ variant: 'destructive', title: 'Project ID required' });
            return;
        }

        if (!firestore) {
            toast({ variant: 'destructive', title: 'Connection Error', description: 'Database connection is not initialized.' });
            return;
        }

        setIsLoading(true);
        setFoundProject(null);
        const result = await findProjectById(projectId);
        
        if (result.success && result.project) {
            /**
             * 🎯 DYNAMIC REF MAPPING
             * Uses the full path returned from the server to create the correct Firestore reference.
             */
            setFoundProject({
                ...result.project,
                ref: doc(firestore, result.project.path)
            });
        } else {
            toast({ variant: 'destructive', title: 'Not Found', description: result.message });
        }
        setIsLoading(false);
    };

    const handleProjectUpdated = () => {
        handleSearch(); // Refetch the project after an update
    };
    
    const handleProjectDeleted = () => {
        setFoundProject(null); // Clear the found project
        setProjectId('');
    }

    const handleViewProject = (project: Project) => {
        setViewingProject(project);
    };

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold flex items-center gap-3"><FolderSearch /> Project Lookup</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Find AI Generated Project</CardTitle>
                    <CardDescription>Enter a project ID (from Telegram logs) to view, edit, or delete it.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex w-full max-sm:flex-col items-center gap-2">
                        <Input 
                            placeholder="12labs-proj-..." 
                            value={projectId} 
                            onChange={(e) => setProjectId(e.target.value)} 
                            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                            disabled={isLoading}
                        />
                        <Button onClick={handleSearch} disabled={isLoading || !projectId} className="max-sm:w-full">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Search
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {isLoading && (
                <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                </div>
            )}
            
            {foundProject && (
                <Card className="border-none shadow-none bg-transparent">
                    <CardHeader className="px-0">
                        <CardTitle className="text-lg font-black uppercase tracking-widest">Search Result</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                        <div className="max-w-md">
                            <ProjectCard
                                project={foundProject}
                                onViewProject={handleViewProject}
                                onProjectDeleted={handleProjectDeleted}
                                onProjectUpdated={handleProjectUpdated}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            <Dialog open={!!viewingProject} onOpenChange={() => setViewingProject(null)}>
                <DialogContent className="max-w-3xl w-[95vw] sm:w-full h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl">
                    <DialogHeader className="p-6 border-b shrink-0 relative">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary text-white rounded-xl"><FileText className="h-5 w-5" /></div>
                            <div>
                                <DialogTitle className="text-lg sm:text-xl font-black uppercase truncate max-w-[250px] sm:max-w-none">{viewingProject?.projectName}</DialogTitle>
                                <DialogDescription className="font-bold text-[10px] uppercase tracking-widest opacity-60">Project Script</DialogDescription>
                            </div>
                        </div>
                        <DialogClose className="absolute right-6 top-6 rounded-full p-2 hover:bg-muted transition-colors"><X className="h-5 w-5" /></DialogClose>
                    </DialogHeader>
                    <ScrollArea className="flex-1">
                        <div className="p-6 sm:p-8 space-y-8">
                            {/* 🔴 FIX: this dialog never showed the character/voice
                                mapping at all (unlike the same dialog in User
                                Management and the user-facing History page) — an
                                11Labs project looked up here had no way to tell
                                which persona each character got, "assignment"
                                was simply missing from the view, not broken in
                                the data. Same Cast Persona Mapping block as
                                those two, reused here. */}
                            {Array.isArray(viewingProject?.characters) && viewingProject!.characters!.length > 0 && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-2 border-l-4 border-primary/20 pl-4">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
                                            <Sparkles className="h-4 w-4" /> Cast Persona Mapping
                                        </div>
                                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-primary/20 text-muted-foreground">
                                            {viewingProject!.characters!.length} {viewingProject!.characters!.length === 1 ? 'Character' : 'Characters'}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {viewingProject!.characters!.map((char: any, i: number) => {
                                            if (!char) return null;
                                            const charName = (typeof char.name === 'string' && char.name.trim()) ? char.name : `Character ${i + 1}`;
                                            const voiceName = char.voiceName || voices.find(v => v.id === char.voice)?.name || char.voice;
                                            const hasVoice = !!char.voice;
                                            const avatarColor = generateAvatarColor(charName);
                                            return (
                                                <div key={i} className="flex justify-between items-center p-3 px-4 rounded-2xl bg-muted/30 border border-primary/5 shadow-sm">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <Avatar className="h-8 w-8 shrink-0">
                                                            <AvatarFallback className={cn("font-black text-[10px]", avatarColor.bg, avatarColor.text)}>
                                                                {charName.charAt(0).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0 flex flex-col">
                                                            <span className="font-black text-sm truncate uppercase tracking-tight">{charName}</span>
                                                            <span className="text-[8px] font-bold text-muted-foreground uppercase">{char.emotion || 'Neutral'}</span>
                                                        </div>
                                                    </div>
                                                    <Badge className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest border-none h-6 px-3 shadow-md shrink-0 max-w-[50%] truncate ml-2",
                                                        hasVoice ? "bg-primary text-white" : "bg-destructive/10 text-destructive"
                                                    )} title={hasVoice ? voiceName : undefined}>
                                                        {hasVoice ? shortVoiceLabel(voiceName) : 'Unassigned'}
                                                    </Badge>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <Separator className="opacity-40" />
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-l-4 border-muted-foreground/20 pl-4">
                                    <MessageSquareText className="h-4 w-4" /> Manuscript Content
                                </div>
                                <div className="border-2 border-primary/5 rounded-2xl p-6 bg-muted/10 shadow-inner">
                                    <pre className="whitespace-pre-wrap font-sans font-medium text-foreground/80 leading-relaxed">
                                        {getScriptText(viewingProject) || 'No script content available.'}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-6 border-t bg-muted/20 flex flex-row items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={handleCopyScript} title="Copy Script" className="h-11 w-11 shrink-0 rounded-xl">
                                {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4 text-primary" />}
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" disabled={isDownloadingPdf} className="group h-11 rounded-xl gap-2 font-black text-[10px] uppercase tracking-widest btn-shine">
                                        {isDownloadingPdf
                                            ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                            : <Download className="h-4 w-4 text-primary transition-transform duration-300 group-hover:translate-y-0.5" />}
                                        <span className="hidden sm:inline">Export</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="rounded-2xl w-56">
                                    <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-2 py-1">Export Manuscript</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={handleDownloadScriptPdf} className="h-10 rounded-lg cursor-pointer font-bold text-xs gap-2">
                                        <FileText className="h-4 w-4 text-red-500" /> .PDF Document
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDownloadScriptDocx} className="h-10 rounded-lg cursor-pointer font-bold text-xs gap-2">
                                        <FileText className="h-4 w-4 text-blue-500" /> .DOCX Word File
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDownloadScriptTxt} className="h-10 rounded-lg cursor-pointer font-bold text-xs gap-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" /> .TXT Plain Text
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <Button onClick={() => setViewingProject(null)} className="font-black uppercase text-[10px] tracking-widest gap-2">
                            <X className="h-4 w-4" /> Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
