'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Bell, Link as LinkIcon, Mail, Smartphone, Check, Sparkles } from 'lucide-react';
import { sendPushToUserByEmail } from '@/app/admin/push-actions';
import { Badge } from '../ui/badge';
import { reportClientError } from '@/lib/report-client-error';

export function PushNotificationManager() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    
    const [targetEmail, setTargetEmail] = useState('');
    const [title, setTitle] = useState('12Labs Update');
    const [body, setBody] = useState('');
    const [url, setUrl] = useState(''); 

    const handleSendPush = async () => {
        if (!targetEmail || !body) {
            toast({ variant: 'destructive', title: 'Details Missing' });
            return;
        }

        setIsLoading(true);
        try {
            const result = await sendPushToUserByEmail(targetEmail.trim(), title, body, url);
            if (result.success) {
                toast({ 
                    title: 'Push Delivered', 
                    description: result.message,
                    className: 'bg-white/95 dark:bg-zinc-900/90 backdrop-blur-xl border-primary/20 shadow-2xl text-slate-950 dark:text-white font-bold',
                    action: <div className="p-1 bg-green-500 rounded-full"><Check className="h-4 w-4 text-white" /></div>
                });
                setBody('');
            } else {
                toast({ variant: 'destructive', title: 'Push Failed', description: result.error });
            }
        } catch (e: any) {
            reportClientError('src/components/admin/push-notification-manager.tsx:43', e);
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-card overflow-hidden">
            <CardHeader className="bg-primary/5 border-b border-primary/10 p-8">
                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-primary" />
                    Targeted Push Node
                </CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Send instant browser notifications to a specific user.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Recipient Identity (Email)</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/40" />
                            <Input 
                                placeholder="user@gmail.com" 
                                value={targetEmail}
                                onChange={(e) => setTargetEmail(e.target.value)}
                                className="pl-10 h-12 rounded-xl bg-muted/20 border-primary/5"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Notification Title</Label>
                            <Input 
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="h-11 rounded-xl bg-muted/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Target Action URL (Optional)</Label>
                            <div className="relative">
                                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                                <Input 
                                    placeholder="No redirection (empty)"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="pl-10 h-11 rounded-xl bg-muted/20 font-mono text-[10px]"
                                />
                            </div>
                            <p className="text-[8px] font-bold text-muted-foreground/40 uppercase px-1">Leave empty for silent notification (no link)</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Message Body</Label>
                        <Textarea 
                            placeholder="Your project is ready for download!" 
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            className="min-h-[100px] rounded-xl bg-muted/20 p-4"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                    <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                    <p className="text-[9px] font-black uppercase text-primary/70 leading-relaxed tracking-wider">
                        High-reliability dispatch mode active. Matches &quot;Get Notified&quot; system logic for 100% delivery.
                    </p>
                </div>
            </CardContent>
            <CardFooter className="bg-muted/10 p-8 border-t">
                <Button 
                    onClick={handleSendPush} 
                    disabled={isLoading || !targetEmail || !body}
                    className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs btn-shine shadow-xl shadow-primary/20"
                >
                    {isLoading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <Send className="mr-3 h-5 w-5" />}
                    DISPATCH NOTIFICATION
                </Button>
            </CardFooter>
        </Card>
    );
}
