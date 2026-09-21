'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, update } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '../ui/skeleton';
import { Wrench, Clock, Save, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { reportClientError } from '@/lib/report-client-error';

interface MaintenanceStatus {
    enabled: boolean;
    message: string;
    endTime: string;
    // 'full' = whole site down (redirect to /maintenance).
    // 'toolsOnly' = tools locked, but the site stays open so users can
    // still reach their history and download past work.
    mode: 'full' | 'toolsOnly';
}

export function MaintenanceMode() {
  const { database } = initializeFirebase();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<MaintenanceStatus>({
      enabled: false,
      message: '',
      endTime: '',
      mode: 'full',
  });
  
  useEffect(() => {
    const { database: db } = initializeFirebase();
    if (db) {
      const maintenanceRef = ref(db, 'settings/maintenance');
      const unsubscribe = onRtdbValue(maintenanceRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setStatus({
            enabled: data.enabled ?? false,
            message: data.message ?? '',
            endTime: data.endTime ?? '',
            mode: data.mode === 'toolsOnly' ? 'toolsOnly' : 'full',
          });
        }
        setIsLoading(false);
      });
      return () => unsubscribe();
    }
  }, []);
  
  const handleEnabledChange = async (newEnabled: boolean) => {
    if (!database) return;
    try {
        const maintenanceRef = ref(database, 'settings/maintenance');
        await update(maintenanceRef, { enabled: newEnabled });
        toast({
            title: `Maintenance ${newEnabled ? 'ACTIVE' : 'OFFLINE'}`,
            description: newEnabled
              ? (status.mode === 'toolsOnly'
                  ? "All tools are locked. The site stays open so users can download their history."
                  : "Users are now redirected to the maintenance page.")
              : "The site is now live for everyone."
        });
    } catch (error: any) {
            reportClientError('src/components/admin/maintenance-mode.tsx:72', error);
        toast({ variant: 'destructive', title: 'Update Failed' });
    }
  }

  const handleModeChange = async (mode: 'full' | 'toolsOnly') => {
    if (!database) return;
    setStatus(prev => ({ ...prev, mode }));
    try {
        await update(ref(database, 'settings/maintenance'), { mode });
        toast({
            title: mode === 'toolsOnly' ? 'Mode: Tools Only' : 'Mode: Full Lockdown',
            description: mode === 'toolsOnly'
              ? "Only tools will be locked when maintenance is active."
              : "The whole site goes down when maintenance is active.",
        });
    } catch (error: any) {
        reportClientError('src/components/admin/maintenance-mode.tsx:handleModeChange', error);
        toast({ variant: 'destructive', title: 'Update Failed' });
    }
  }

  const handleSaveDetails = async () => {
    if (!database) return;
    setIsSaving(true);
    try {
        const maintenanceRef = ref(database, 'settings/maintenance');
        await update(maintenanceRef, { 
            message: status.message, 
            endTime: status.endTime 
        });
        toast({ title: 'Config Saved', description: 'Maintenance details updated successfully.' });
    } catch (error: any) {
            reportClientError('src/components/admin/maintenance-mode.tsx:87', error);
        toast({ variant: 'destructive', title: 'Save Failed' });
    } finally {
        setIsSaving(false);
    }
  };

  if (isLoading) return <Skeleton className="h-48 w-full rounded-[1.5rem]" />;

  return (
    <div className="space-y-4 w-full">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-destructive/5 border border-destructive/10">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-xl text-destructive">
                    <Wrench className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none">Maintenance Lock</p>
                    <p className="text-[7px] font-bold text-muted-foreground uppercase mt-1">
                        {status.mode === 'toolsOnly' ? 'Tools locked · site open' : 'Global redirect active'}
                    </p>
                </div>
            </div>
            <Switch
                checked={status.enabled}
                onCheckedChange={handleEnabledChange}
                className="scale-75 data-[state=checked]:bg-destructive"
            />
        </div>

        {/* Mode chooser: full site down vs. tools-only lockdown. */}
        <div className="grid grid-cols-2 gap-2">
            <button
                type="button"
                onClick={() => handleModeChange('full')}
                className={`rounded-xl border p-3 text-left transition-colors ${
                    status.mode === 'full'
                        ? 'border-destructive bg-destructive/10'
                        : 'border-border hover:border-destructive/40'
                }`}
            >
                <p className="text-[10px] font-black uppercase tracking-widest">Full Lockdown</p>
                <p className="text-[8px] font-bold text-muted-foreground mt-1 leading-tight">
                    Whole site down. Users see the maintenance page.
                </p>
            </button>
            <button
                type="button"
                onClick={() => handleModeChange('toolsOnly')}
                className={`rounded-xl border p-3 text-left transition-colors ${
                    status.mode === 'toolsOnly'
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-border hover:border-amber-500/40'
                }`}
            >
                <p className="text-[10px] font-black uppercase tracking-widest">Tools Only</p>
                <p className="text-[8px] font-bold text-muted-foreground mt-1 leading-tight">
                    Tools locked, site open. Users can still download history.
                </p>
            </button>
        </div>

        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-10 rounded-xl font-black uppercase tracking-widest text-[9px] border-primary/10">
                    EDIT LOCKDOWN DETAILS
                </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem]">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase">Lockdown Config</DialogTitle>
                    <DialogDescription>Details visible on the maintenance page.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">User Notification Message</Label>
                        <Textarea
                            placeholder="Reason for maintenance..."
                            value={status.message}
                            onChange={(e) => setStatus(prev => ({ ...prev, message: e.target.value }))}
                            className="min-h-[100px] rounded-2xl bg-muted/20"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 flex items-center gap-2">
                            <Clock className="h-3 w-3" /> Return Timestamp
                        </Label>
                        <Input
                            type="datetime-local"
                            value={status.endTime}
                            onChange={(e) => setStatus(prev => ({ ...prev, endTime: e.target.value }))}
                            className="h-11 rounded-xl bg-muted/20 font-bold"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSaveDetails} disabled={isSaving} className="w-full h-12 rounded-xl font-black uppercase">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        SYNC LOCKDOWN
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
