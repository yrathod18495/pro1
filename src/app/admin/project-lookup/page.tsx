'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Search, FolderSearch, Loader2 } from 'lucide-react';
import { findProjectById } from './actions';
import type { Project } from '@/lib/types';
import { ProjectCard } from '@/components/history/project-card';
import { initializeFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export default function ProjectLookupPage() {
    const [projectId, setProjectId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [foundProject, setFoundProject] = useState<any | null>(null);
    const { toast } = useToast();
    const { firestore } = initializeFirebase();

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
        // Handled by the ProjectCard internal modal logic
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
        </div>
    );
}
