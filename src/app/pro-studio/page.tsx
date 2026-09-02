
'use client';

import { ProStudioProvider, useProStudio } from '@/context/pro-studio-provider';
import { ScriptEditor } from '@/components/pro-studio/script-editor';
import { CharacterAssignments } from '@/components/pro-studio/character-assignments';
import { GenerationSettings } from '@/components/pro-studio/generation-settings';
import { Sparkles, Zap, Loader2, Activity, Play, Pause, Music, Volume2 } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { cn, getDisplayUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

import { StudioDemoCard } from '@/components/studio/studio-demo-card';

function ProStudioContent() {
  const { scriptState, hqProject, hqProjectId, isGenerating, isAnalyzing } = useProStudio();

  // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
  // silently rendering the full Pro Studio (this page had no guard at all,
  // same bug that was previously fixed on /new-ai-studio — anyone could
  // open and use the editor while logged out).
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use Pro Studio.' });
      router.push('/login');
    }
  }, [authLoading, user, router, toast]);

  if (authLoading || !user) {
    return (
      <div className="relative min-h-screen bg-muted/30 pb-20 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Hardened Purge logic during submission or analysis
  const isHqActive = hqProjectId || (hqProject && (hqProject.status === 'in_queue' || hqProject.status === 'processing'));

  return (
    <div className="relative min-h-screen bg-muted/30 pb-20">
      <div className="container mx-auto max-w-7xl py-10 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {!isHqActive && (
            <div className="lg:col-span-2 space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
              <ScriptEditor />
            </div>
          )}

          <div className={cn(
              "space-y-8 mt-4 lg:mt-0 animate-in fade-in duration-700",
              isHqActive ? "lg:col-span-3 max-w-2xl mx-auto w-full" : "lg:col-span-1"
          )}>
            {scriptState === 'valid' || isHqActive ? (
              <div className="space-y-8 lg:sticky lg:top-24 pb-12">
                {!isHqActive && <CharacterAssignments />}
                <GenerationSettings />
              </div>
            ) : (
                <StudioDemoCard 
                  title="PRO ENGINE READY" 
                  badgeText="50% CHEAPER NOW" 
                  subtitle="Analyze manuscript to initiate Neural Node" 
                />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProStudioPage() {
    return (
        <ProStudioProvider>
            <ProStudioContent />
        </ProStudioProvider>
    );
}
