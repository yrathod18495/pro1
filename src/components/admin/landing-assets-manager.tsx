'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, update } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Music, Save, Link2, Type, Globe, ImageIcon, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { getDisplayUrl } from '@/lib/utils';
import { reportClientError } from '@/lib/report-client-error';

interface AudioDemo {
    title: string;
    fileId: string;
}

interface LandingAssets {
    audioDemos: {
        demo1: AudioDemo;
        demo2: AudioDemo;
        demo3: AudioDemo;
    };
    masterLogoUrl: string;
    watermarkLogoUrl: string;
}

const defaultAssets: LandingAssets = {
    audioDemos: {
        demo1: { title: 'Clear Narration', fileId: '' },
        demo2: { title: 'Emotional Dialogue', fileId: '' },
        demo3: { title: 'Conversational Style', fileId: '' },
    },
    masterLogoUrl: 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png',
    watermarkLogoUrl: 'https://res.cloudinary.com/dde5hm8ng/image/upload/v1779863372/24299-removebg-preview_lhjpvs.png'
};

export function LandingAssetsManager() {
    const { database } = initializeFirebase();
    const { toast } = useToast();
    const [assets, setAssets] = useState<LandingAssets>(defaultAssets);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const { database: db } = initializeFirebase();
        if (!db) return;
        const assetsRef = ref(db, 'settings/landingPage');
        const unsubscribe = onRtdbValue(assetsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setAssets({
                    audioDemos: {
                        demo1: data.audioDemos?.demo1 || defaultAssets.audioDemos.demo1,
                        demo2: data.audioDemos?.demo2 || defaultAssets.audioDemos.demo2,
                        demo3: data.audioDemos?.demo3 || defaultAssets.audioDemos.demo3,
                    },
                    masterLogoUrl: data.masterLogoUrl || defaultAssets.masterLogoUrl,
                    watermarkLogoUrl: data.watermarkLogoUrl || defaultAssets.watermarkLogoUrl
                });
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSave = async () => {
        if (!database) return;
        setIsSaving(true);
        try {
            await update(ref(database, 'settings/landingPage'), assets);
            toast({ title: 'Production Assets Synced', description: 'Landing page assets and logos updated.' });
        } catch (error: any) {
            reportClientError('src/components/admin/landing-assets-manager.tsx:77', error);
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const updateDemo = (key: keyof LandingAssets['audioDemos'], field: keyof AudioDemo, value: string) => {
        setAssets(prev => ({
            ...prev,
            audioDemos: {
                ...prev.audioDemos,
                [key]: { ...prev.audioDemos[key], [field]: value }
            }
        }));
    };

    if (isLoading) return <Skeleton className="h-96 w-full rounded-[2rem]" />;

    return (
        <div className="space-y-8">
            <Card className="rounded-[2rem] border-none shadow-xl bg-card overflow-hidden">
                <CardHeader className="bg-primary/5 pb-6 border-b border-primary/10">
                    <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                        <ImageIcon className="h-6 w-6 text-primary" />
                        Global Identity Node
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Configure logos for branding and security watermarking.</CardDescription>
                </CardHeader>
                <CardContent className="pt-8 space-y-6">
                    {/* Master Logo */}
                    <div className="space-y-4 p-5 rounded-2xl bg-muted/30 border border-primary/5 relative">
                        <Badge variant="outline" className="absolute -top-2.5 right-4 bg-background h-5 px-2 text-[8px] font-black uppercase">Identity Node</Badge>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1 flex items-center gap-2"><Link2 className="h-3 w-3" /> Master Logo (Branding)</Label>
                            <Input 
                                value={assets.masterLogoUrl} 
                                onChange={(e) => setAssets(prev => ({ ...prev, masterLogoUrl: e.target.value }))}
                                className="h-11 rounded-xl bg-background font-mono text-xs text-primary"
                                placeholder="tg://... OR https://..."
                            />
                        </div>
                        {assets.masterLogoUrl && (
                            <div className="flex items-center gap-4 mt-2 p-2 bg-background/50 rounded-xl">
                                <div className="h-12 w-12 rounded-lg bg-white p-1 border">
                                    <img src={getDisplayUrl(assets.masterLogoUrl)} alt="Master Preview" className="h-full w-full object-contain" />
                                </div>
                                <p className="text-[8px] font-black uppercase text-muted-foreground/40 tracking-tighter truncate">
                                    Used for Site Header, PWA & Meta
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Watermark Logo */}
                    <div className="space-y-4 p-5 rounded-2xl bg-primary/5 border border-primary/10 relative">
                        <Badge variant="outline" className="absolute -top-2.5 right-4 bg-background h-5 px-2 text-[8px] font-black uppercase text-primary border-primary/20">Security Node</Badge>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground px-1 flex items-center gap-2"><ShieldCheck className="h-3 w-3" /> Watermark Logo (Production)</Label>
                            <Input 
                                value={assets.watermarkLogoUrl} 
                                onChange={(e) => setAssets(prev => ({ ...prev, watermarkLogoUrl: e.target.value }))}
                                className="h-11 rounded-xl bg-background font-mono text-xs text-primary"
                                placeholder="tg://... OR https://..."
                            />
                        </div>
                        {assets.watermarkLogoUrl && (
                            <div className="flex items-center gap-4 mt-2 p-2 bg-background/50 rounded-xl">
                                <div className="h-12 w-12 rounded-lg bg-white p-1 border">
                                    <img src={getDisplayUrl(assets.watermarkLogoUrl)} alt="Watermark Preview" className="h-full w-full object-contain" />
                                </div>
                                <p className="text-[8px] font-black uppercase text-primary/60 tracking-tighter truncate">
                                    Applied to all Marketplace Previews
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-none shadow-xl bg-card overflow-hidden">
                <CardHeader className="bg-primary/5 pb-6 border-b border-primary/10">
                    <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                        <Music className="h-6 w-6 text-primary" />
                        Landing Audio Demos
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Configure the 3 audio showcases.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8 pt-8">
                    {(['demo1', 'demo2', 'demo3'] as const).map((key, index) => (
                        <div key={key} className="space-y-4 p-5 rounded-2xl bg-muted/30 border border-primary/5 relative">
                            <Badge variant="outline" className="absolute -top-2.5 right-4 bg-background h-5 px-2 text-[8px] font-black uppercase">Slot {index + 1}</Badge>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1 flex items-center gap-2"><Type className="h-3 w-3" /> Display Title</Label>
                                    <Input 
                                        value={assets.audioDemos[key].title} 
                                        onChange={(e) => updateDemo(key, 'title', e.target.value)}
                                        className="h-11 rounded-xl bg-background font-bold"
                                        placeholder="e.g. Emotional Voice"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1 flex items-center gap-2"><Globe className="h-3 w-3" /> Source URL or File ID</Label>
                                    <Input 
                                        value={assets.audioDemos[key].fileId} 
                                        onChange={(e) => updateDemo(key, 'fileId', e.target.value)}
                                        className="h-11 rounded-xl bg-background font-mono text-xs text-primary"
                                        placeholder="tg://... OR https://..."
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </CardContent>
                <CardFooter className="bg-muted/10 p-6 border-t">
                    <Button onClick={handleSave} disabled={isSaving} className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs btn-shine">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Sync Site Content
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
