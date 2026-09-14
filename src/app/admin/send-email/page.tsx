
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Send, Eye, Users, Trash2, FileUp, FileText, Download, BarChart3, FileDown, AlertTriangle } from 'lucide-react';
import { sendEmailAction } from './actions';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const LOCAL_STORAGE_KEY = 'email_campaign_v2';
const BATCH_SIZE = 50;

const defaultHtmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>An Update from 12Labs</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        body { margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Poppins', Arial, sans-serif; }
        .button { display: inline-block; background-color: #4f46e5; color: #ffffff !important; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 18px; }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f3f4f6">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: #111827; padding: 40px;">
                            <img src="https://drive.google.com/uc?export=view&id=1l-W6fd5dtVqM8LNo5cpzJrM6LiyNXD2a" width="150" alt="12Labs Logo" style="display: block; margin: 0 auto 20px auto;">
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px; color: #1f2937; line-height: 1.7;">
                            <h1 style="font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 20px; color: #111827; font-family: 'Poppins', Arial, sans-serif;">An Update from the 12Labs Team</h1>
                            <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">Hello Creators, We've updated our AI Voice Studio. For a limited time, both Fast and High-Quality generations will now use <strong>fewer credits</strong>, making it easier to bring your projects to life.</p>
                            <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">It's the perfect time to bring your long scripts and professional projects to life. The new credit costs are applied automatically—just head to the studio to see them.</p>
                            
                            <!-- CTA Button -->
                            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                                <tr><td align="center"><a href="https://www.12labs.in/studio" class="button" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 18px;">Go to Studio</a></td></tr>
                            </table>

                            <p style="margin: 0; font-size: 16px; color: #374151;">Regards,<br><strong>Team 12Labs</strong></p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="background-color: #f9fafb; color: #6b7280; font-size: 13px; padding: 30px; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0 0 10px 0;">&copy; ${new Date().getFullYear()} 12Labs. All Rights Reserved.</p>
                            <p style="margin: 0;">You are receiving this email because you are a registered user of <a href="https://www.12labs.in" style="color: #4f46e5; text-decoration: none;">12labs.in</a>.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

interface CampaignState {
    recipients: string;
    sentEmails: string[];
}

const formSchema = z.object({
  subject: z.string().min(1, 'Subject is required.'),
  html: z.string().min(1, 'HTML body is required.'),
});

export default function SendEmailPage() {
  const { toast } = useToast();
  const [state, setState] = useState<CampaignState>({ recipients: '', sentEmails: [] });
  const [isSending, setIsSending] = useState(false);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    try {
      const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedState) {
        setState(JSON.parse(savedState));
      }
    } catch (e) {
      console.error("Failed to load state from local storage", e);
    }
  }, []);

  const updateState = (newState: Partial<CampaignState>) => {
    setState(prev => {
        const updatedState = { ...prev, ...newState };
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedState));
        } catch (e) {
            console.error("Failed to save state to local storage", e);
        }
        return updatedState;
    });
  };
  
  const allEmails = useMemo(() => {
    return Array.from(new Set(state.recipients.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'))));
  }, [state.recipients]);

  const sentEmailsSet = useMemo(() => new Set(state.sentEmails), [state.sentEmails]);

  const unsentEmails = useMemo(() => {
    return allEmails.filter(email => !sentEmailsSet.has(email));
  }, [allEmails, sentEmailsSet]);

  const nextBatch = useMemo(() => unsentEmails.slice(0, BATCH_SIZE), [unsentEmails]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subject: 'An Update from the 12Labs Team',
      html: defaultHtmlTemplate,
    },
  });
  const htmlContent = form.watch('html');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        updateState({ recipients: text, sentEmails: [] });
        setFileName(file.name);
        toast({ title: 'Emails loaded successfully.' });
      };
      reader.readAsText(file);
    } else {
      toast({ variant: 'destructive', title: 'Invalid File', description: 'Please upload a .txt file.' });
    }
    event.target.value = '';
  };
  
  const handleSendBatch = async () => {
    const { subject, html } = form.getValues();
    if (!subject || !html) {
      toast({ variant: 'destructive', title: 'Missing Content', description: 'Subject and HTML body are required.' });
      return;
    }
    if (unsentEmails.length === 0) {
        toast({ title: 'All Done!', description: 'All emails in this campaign have been sent.' });
        return;
    }
    
    const batchToSend = unsentEmails.slice(0, BATCH_SIZE);

    setIsSending(true);
    try {
        const result = await sendEmailAction({
            from: '12Labs <info@12labs.in>',
            to: batchToSend.join(','),
            subject,
            html,
        });
        
        if (result.success) {
            const newSentEmails = [...state.sentEmails, ...batchToSend];
            updateState({ sentEmails: newSentEmails });
            toast({ title: 'Batch Sent!', description: result.message });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    } catch (error: any) {
        console.error("sendEmailAction threw an unhandled error:", error);
        toast({ variant: 'destructive', title: 'An unexpected error occurred.', description: error.message || 'The server did not respond. This could be a network issue or a server timeout. Please try a smaller batch.' });
    } finally {
        setIsSending(false);
    }
  };
  
  const handleExportUnsent = () => {
    if (unsentEmails.length === 0) {
      toast({ title: 'Nothing to export', description: 'All emails have been sent.' });
      return;
    }
    const blob = new Blob([unsentEmails.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unsent_emails.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearCampaign = () => {
    updateState({ recipients: '', sentEmails: [] });
    setFileName('');
    toast({ title: 'Campaign Cleared', description: 'You can now start a new campaign.' });
  };
  
  const totalCount = allEmails.length;
  const sentCount = sentEmailsSet.size;
  const remainingCount = totalCount - sentCount;
  const progress = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;
  const nextBatchSizeForButton = Math.min(BATCH_SIZE, remainingCount);
  const estimatedTime = Math.ceil(nextBatchSizeForButton * 0.55);

  return (
    <div className="container mx-auto max-w-6xl py-10">
      <h1 className="text-3xl font-bold flex items-center gap-3 mb-8"><Mail /> Bulk Email Campaign</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-1 lg:sticky lg:top-24 space-y-8">
            <Card>
                 <CardHeader>
                    <CardTitle>Recipients</CardTitle>
                    <CardDescription>Paste emails or upload a .txt file.</CardDescription>
                </CardHeader>
                <CardContent>
                    {allEmails.length > 0 ? (
                        <div className="space-y-2">
                             <Label>Next Batch ({nextBatch.length} emails)</Label>
                            <ScrollArea className="h-48 border rounded-md p-2 bg-muted/50">
                                <pre className="text-sm whitespace-pre-wrap break-all">
                                    {nextBatch.join('\n')}
                                </pre>
                            </ScrollArea>
                        </div>
                    ) : (
                         <Textarea
                            placeholder="user1@example.com, user2@example.com"
                            className="min-h-[200px]"
                            value={state.recipients}
                            onChange={(e) => updateState({ recipients: e.target.value, sentEmails: [] })}
                         />
                    )}
                     <div className="flex gap-2 mt-4">
                        <Label htmlFor="file-upload" className="w-full cursor-pointer">
                            <Button asChild variant="outline" className="w-full">
                                <div><FileUp className="mr-2 h-4 w-4" /> Upload .txt</div>
                            </Button>
                        </Label>
                        <Input id="file-upload" type="file" className="hidden" accept=".txt" onChange={handleFileChange} />
                         <Button onClick={handleClearCampaign} variant="destructive" className="w-full">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Clear
                        </Button>
                     </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BarChart3/> Campaign Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2 text-sm font-medium">
                        <div className="flex justify-between"><span>Total Emails</span><span>{totalCount.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span>Sent</span><span>{sentCount.toLocaleString()}</span></div>
                        <div className="flex justify-between text-muted-foreground"><span>Remaining</span><span>{remainingCount.toLocaleString()}</span></div>
                    </div>
                     <div className="space-y-1">
                        <div className="flex justify-between items-center font-medium">
                            <span>Progress</span>
                            <span>{progress.toFixed(0)}%</span>
                        </div>
                        <Progress value={progress} />
                    </div>
                     <div className="space-y-2 pt-4">
                        <Button onClick={handleSendBatch} className="w-full" disabled={isSending || remainingCount === 0}>
                            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4" />}
                            {isSending ? 'Sending...' : `Send to Next ${nextBatchSizeForButton}${estimatedTime > 0 ? ` (~${estimatedTime}s)` : ''}`}
                        </Button>
                         <Button onClick={handleExportUnsent} className="w-full" variant="secondary" disabled={remainingCount === 0}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Export {remainingCount} Unsent
                        </Button>
                     </div>
                </CardContent>
            </Card>
        </div>
        
        <div className="lg:col-span-2">
            <Form {...form}>
                <Card>
                    <CardHeader>
                        <CardTitle>Compose Email</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <FormField control={form.control} name="subject" render={({ field }) => ( <FormItem><FormLabel>Subject</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                        
                        <Tabs defaultValue="compose">
                            <TabsList>
                                <TabsTrigger value="compose">Compose</TabsTrigger>
                                <TabsTrigger value="preview">Preview</TabsTrigger>
                            </TabsList>
                            <TabsContent value="compose" className="mt-4">
                                <FormField control={form.control} name="html" render={({ field }) => ( <FormItem><FormLabel>HTML Body</FormLabel><FormControl><Textarea className="min-h-[450px] font-mono" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                            </TabsContent>
                            <TabsContent value="preview" className="mt-4">
                                <div className="border rounded-lg overflow-x-auto min-h-[450px]">
                                    <div className="prose dark:prose-invert max-w-none scale-[0.9] origin-top-left" dangerouslySetInnerHTML={{ __html: htmlContent }} />
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </Form>
        </div>
      </div>
    </div>
  );
}
