
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { Project } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, IndianRupee, Database, Save } from 'lucide-react';
import { adminUpdateProjectAction } from '@/app/history/actions';
import { useAuth } from '@/context/auth-provider';
import { resolvePublicAudioUrl } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from '@/components/ui/scroll-area';
import { reportClientError } from '@/lib/report-client-error';

const editProjectSchema = z.object({
  projectName: z.string().min(1, 'Project name is required.'),
  script: z.string().min(1, 'Script cannot be empty.'),
  audioUrl: z.string().optional().or(z.literal('')),
  cost: z.coerce.number().min(0, 'Cost must be non-negative'),
  syncDataJson: z.string().refine((val) => {
    if (!val || val.trim() === '') return true;
    try {
      JSON.parse(val);
      return true;
    } catch (e) {
            reportClientError('src/components/history/edit-project-dialog.tsx:44', e);
      return false;
    }
  }, { message: "Invalid JSON format." }),
});

interface EditProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function EditProjectDialog({ project, open, onOpenChange, onUpdate }: EditProjectDialogProps) {
  const { user, isImpersonating } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof editProjectSchema>>({
    resolver: zodResolver(editProjectSchema),
  });

  useEffect(() => {
    if (project) {
      let jsonString = '';
      if (project.syncData) {
          try {
              // If syncData is already a string, parse it first to avoid double stringification
              const parsed = typeof project.syncData === 'string' ? JSON.parse(project.syncData) : project.syncData;
              jsonString = JSON.stringify(parsed, null, 2);
          } catch (e) {
            reportClientError('src/components/history/edit-project-dialog.tsx:74', e);
              jsonString = String(project.syncData);
          }
      }

      form.reset({
        projectName: project.projectName || '',
        script: project.script || '',
        audioUrl: resolvePublicAudioUrl(project.audioUrl) || '',
        cost: project.cost || 0,
        syncDataJson: jsonString,
      });
    }
  }, [project, form, open]);
  
  if (!project) return null;

  const onSubmit = async (values: z.infer<typeof editProjectSchema>) => {
    const adminUid = (isImpersonating ? sessionStorage.getItem('admin_uid') : user?.uid) || '';
    if (!adminUid) {
      toast({ variant: 'destructive', title: 'Admin identity node missing.' });
      return;
    }

    setIsSubmitting(true);
    try {
        const { syncDataJson, ...rest } = values;
        
        const finalData = {
            ...rest,
            userId: project.userId, 
            syncData: syncDataJson.trim() ? JSON.parse(syncDataJson) : null
        };

        const result = await adminUpdateProjectAction(project.id, finalData, adminUid);
        if (result.success) {
          toast({ title: 'Project Node Updated' });
          onUpdate();
          onOpenChange(false);
        } else {
          toast({ variant: 'destructive', title: 'Update Failed', description: result.message });
        }
    } catch (e: any) {
            reportClientError('src/components/history/edit-project-dialog.tsx:116', e);
        toast({ variant: 'destructive', title: 'Parse Error', description: 'Malformed JSON payload.' });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-[2rem] border-none shadow-3xl bg-background">
        <DialogHeader className="p-8 pb-4 border-b bg-primary/5 shrink-0">
          <DialogTitle className="text-2xl font-black uppercase">Root Override Hub</DialogTitle>
          <DialogDescription className="font-bold text-[10px] uppercase opacity-60">Synchronizing production node metadata</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-8 pt-4">
              <Accordion type="multiple" defaultValue={["basic", "json"]} className="space-y-4">
                
                <AccordionItem value="basic" className="border rounded-[1.5rem] px-4 bg-muted/20 transition-all hover:bg-muted/30">
                  <AccordionTrigger className="hover:no-underline font-black text-[10px] uppercase tracking-widest text-primary/60">
                    <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4" />
                        Basic Information
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-6 pt-4 pb-8">
                    <FormField
                      control={form.control}
                      name="projectName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-black text-[10px] uppercase tracking-widest px-1">Project Name Node</FormLabel>
                          <FormControl><Input {...field} className="rounded-xl h-12 bg-background font-bold" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="script"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-black text-[10px] uppercase tracking-widest px-1">Manuscript Content</FormLabel>
                          <FormControl>
                            <Textarea className="min-h-[150px] font-mono text-[11px] rounded-xl bg-background leading-relaxed shadow-inner" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="finance" className="border rounded-[1.5rem] px-4 bg-muted/20 transition-all hover:bg-muted/30">
                  <AccordionTrigger className="hover:no-underline font-black text-[10px] uppercase tracking-widest text-primary/60">
                    <div className="flex items-center gap-3">
                        <IndianRupee className="h-4 w-4" />
                        Media & Energy
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-6 pt-4 pb-8">
                    <FormField
                      control={form.control}
                      name="cost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-black text-[10px] uppercase tracking-widest px-1">Credit Deduction Unit</FormLabel>
                          <FormControl><Input type="number" {...field} className="rounded-xl h-12 bg-background font-black text-lg" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="audioUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-black text-[10px] uppercase tracking-widest px-1">Master Audio URL (GCS/Cloud)</FormLabel>
                          <FormControl><Input {...field} placeholder="gcs://... OR https://..." className="rounded-xl h-12 bg-background font-mono text-[10px]" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="json" className="border rounded-[1.5rem] px-4 bg-muted/20 transition-all hover:bg-muted/30">
                  <AccordionTrigger className="hover:no-underline font-black text-[10px] uppercase tracking-widest text-destructive/60">
                    <div className="flex items-center gap-3">
                        <Database className="h-4 w-4" />
                        Neural Data (Sync JSON)
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-6 pt-4 pb-8">
                    <FormField
                      control={form.control}
                      name="syncDataJson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-black text-[10px] uppercase text-destructive tracking-widest px-1">Raw Production Payload</FormLabel>
                          <FormControl>
                            <Textarea 
                                className="min-h-[350px] font-mono text-[11px] bg-background border-destructive/20 rounded-xl leading-relaxed p-4" 
                                placeholder='{"dialogues": [...]}'
                                {...field} 
                            />
                          </FormControl>
                          <FormDescription className="text-[9px] font-bold text-destructive uppercase tracking-wide">
                            ⚠️ CAUTION: MODIFYING NEURAL PAYLOADS AFFECTS EDITOR REPLAY AND ZIP BUNDLING.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

              </Accordion>
              </div>
            </ScrollArea>
            
            <DialogFooter className="p-8 border-t bg-muted/20 gap-3">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold h-12">Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 rounded-[1.2rem] font-black h-14 shadow-xl shadow-primary/20 btn-shine uppercase tracking-widest text-[11px]">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                COMMIT CHANGES
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
