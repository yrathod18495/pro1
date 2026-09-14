'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Search, FolderSearch, Loader2, FileText, ClipboardCopy, Check, X } from 'lucide-react';
import { findProjectById } from './actions';
import type { Project } from '@/lib/types';
import { ProjectCard } from '@/components/history/project-card';
import { initializeFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadScriptAsPdf, downloadScriptAsTxt, downloadScriptAsDocx } from '@/lib/export-script-pdf';
import { reportClientError } from '@/lib/report-client-error';

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
                        <div className="p-6 sm:p-8">
                            <div className="border-2 border-primary/5 rounded-2xl p-6 bg-muted/10 shadow-inner">
                                <pre className="whitespace-pre-wrap font-sans font-medium text-foreground/80 leading-relaxed">
                                    {getScriptText(viewingProject) || 'No script content available.'}
                                </pre>
                            </div>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-6 border-t bg-muted/20 gap-2 flex-wrap">
                        <Button variant="outline" onClick={handleCopyScript} className="font-bold gap-2">
                            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4 text-primary" />}
                            Copy
                        </Button>
                        <Button variant="outline" onClick={handleDownloadScriptTxt} className="font-bold">.TXT</Button>
                        <Button variant="outline" onClick={handleDownloadScriptPdf} disabled={isDownloadingPdf} className="font-bold gap-2">
                            {isDownloadingPdf && <Loader2 className="h-4 w-4 animate-spin" />} .PDF
                        </Button>
                        <Button variant="outline" onClick={handleDownloadScriptDocx} className="font-bold">.DOCX</Button>
                        <Button onClick={() => setViewingProject(null)} className="font-black uppercase text-[10px] tracking-widest ml-auto">Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
