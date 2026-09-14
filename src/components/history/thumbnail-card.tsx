'use client';

import { useState } from 'react';
import type { Thumbnail } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Calendar, Trash2, Loader2, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { cn, formatSafeDate } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';
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
import { deleteUserThumbnailAction } from '@/app/history/actions';
import { reportClientError } from '@/lib/report-client-error';

export function ThumbnailCard({ thumbnail }: { thumbnail: Thumbnail }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [imgError, setImgError] = useState(false);

  const rawUrl = thumbnail?.imageUrl || (thumbnail as any)?.link || (thumbnail as any)?.url || (thumbnail as any)?.image || (thumbnail as any)?.thumbnailUrl || (thumbnail as any)?.mediaUrl || (thumbnail as any)?.audioUrl || (thumbnail as any)?.outputUrl || (thumbnail as any)?.imageDataUri || '';
  const promptText = thumbnail?.prompt || (thumbnail as any)?.title || (thumbnail as any)?.projectName || 'AI Thumbnail';

  const handleDownload = async () => {
    try {
        if (!rawUrl) {
            throw new Error('Image URL not available.');
        }
        
        const filename = `12labs_thumbnail_${thumbnail.seed || thumbnail.id || Date.now()}.png`;
        const downloadUrl = `/api/download-image?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`;
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        toast({ title: '📥 Download Started', description: 'Saving image directly to your device.' });
    } catch (error: any) {
        console.error('Download failed', error);
        toast({ variant: 'destructive', title: 'Download Failed', description: error?.message || 'Could not download the image.' });
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
        const result = await deleteUserThumbnailAction(thumbnail.id, user.uid);
        if (result.success) {
            toast({ title: 'Thumbnail Deleted' });
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
            reportClientError('src/components/history/thumbnail-card.tsx:69', error);
        toast({ variant: 'destructive', title: 'Delete Failed', description: error.message });
    } finally {
        setIsDeleting(false);
    }
  };

  return (
    <Card className={cn(
        'flex flex-col border shadow-md hover:shadow-lg transition-all duration-300 rounded-[2rem] overflow-hidden bg-card touch-manipulation select-none sm:select-auto'
    )}>
        {/* Top Header Badge */}
        <div className="p-4 pb-3 flex items-center justify-between gap-2 border-b border-border/40 bg-muted/20">
            <Badge variant="outline" className="px-3 py-1 font-black text-[10px] uppercase tracking-wider gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ImageIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                AI Thumbnail
            </Badge>
            <Badge variant="secondary" className="h-6 px-2.5 text-[9px] font-black rounded-full uppercase tracking-wider text-muted-foreground gap-1">
                <Calendar className="h-3 w-3" />
                {formatSafeDate(thumbnail.createdAt || (thumbnail as any).updatedAt || (thumbnail as any).timestamp, 'do MMM, yyyy')}
            </Badge>
        </div>

        <div className="relative aspect-[16/9] w-full bg-muted/50 border-b border-border/40 overflow-hidden flex items-center justify-center">
            {rawUrl && !imgError ? (
                <img
                    src={rawUrl}
                    alt={promptText.slice(0, 50)}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => setImgError(true)}
                />
            ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                    {rawUrl ? (
                        <a
                            href={rawUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-primary hover:underline font-bold flex items-center gap-1"
                        >
                            Open Image Link <ExternalLink className="h-3 w-3" />
                        </a>
                    ) : (
                        <span className="text-[11px] text-muted-foreground font-medium">Processing or Link Pending</span>
                    )}
                </div>
            )}
        </div>

        <div className="p-5 flex-grow flex flex-col justify-between gap-4">
            <div>
                 <Accordion type="single" collapsible>
                    <AccordionItem value="prompt" className="border-b-0">
                        <AccordionTrigger className="text-xs py-2 font-black uppercase tracking-wider hover:no-underline text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                Prompt Details
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl max-h-32 overflow-y-auto leading-relaxed border border-border/30 font-medium">
                            {promptText || 'No prompt recorded'}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-border/40">
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className="h-11 w-11 rounded-xl text-destructive hover:bg-destructive/10 touch-manipulation p-0">
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4.5 w-4.5" />}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-[2rem] border-destructive/20 p-6 sm:p-8">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl font-black uppercase">Delete AI Thumbnail?</AlertDialogTitle>
                            <AlertDialogDescription className="text-sm font-medium">
                                This will permanently remove this generated image from your history. Action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-6 gap-3">
                            <AlertDialogCancel className="rounded-xl font-bold h-11">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 rounded-xl font-black h-11">
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <Button 
                    type="button" 
                    size="sm" 
                    onClick={handleDownload} 
                    disabled={!rawUrl}
                    className="h-11 px-5 rounded-xl font-black uppercase text-[10px] tracking-wider gap-2 shadow-md shadow-primary/20 btn-shine touch-manipulation"
                >
                    <Download className="h-4 w-4" />
                    Download
                </Button>
            </div>
        </div>
    </Card>
  );
}
