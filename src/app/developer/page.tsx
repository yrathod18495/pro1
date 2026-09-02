'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { voices } from '@/lib/voices';
import { cn } from '@/lib/utils';
import {
  Key,
  Terminal,
  Copy,
  Check,
  Plus,
  Trash2,
  ShieldCheck,
  Code,
  Sparkles,
  RefreshCw,
  Lock,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  User,
  LogOut,
  Mic2,
  Eye,
  EyeOff,
  Coins,
  Volume2,
  Power,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { handleCustomTopupAction } from '@/app/buy-credits/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import Link from 'next/link';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { initializeFirebase } from '@/firebase';
import { reportClientError } from '@/lib/report-client-error';

interface ApiKeyItem {
  id: string;
  apiKey?: string;
  maskedKey: string;
  name: string;
  createdAt: string;
  balance?: number;
  disabled?: boolean;
}

export default function DeveloperDashboardPage() {
  const { user, activeUser, loading: authLoading, logout } = useAuth();
  const isAdmin = user?.role === 'admin' || activeUser?.role === 'admin';
  const { toast } = useToast();
  const { database } = initializeFirebase();

  const [isLocked, setIsLocked] = useState(false);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);

  // Top up API credits — same pool as "Account Live Credits" above, since
  // API keys bill against the account's shared credit balance.
  const TOPUP_MIN_RUPEES = 50;
  const [topupAmount, setTopupAmount] = useState('120');
  const [isToppingUp, setIsToppingUp] = useState(false);
  const topupAmountNum = parseFloat(topupAmount) || 0;
  const isTopupAmountValid = topupAmountNum >= TOPUP_MIN_RUPEES;
  // Mirrors the server's rate (₹120 => 10,000 credits, scaled). No bonus —
  // the wallet is credited exactly what's paid for.
  const topupPreviewCredits = Math.floor(topupAmountNum * (10000 / 120));

  const handleApiCreditsTopup = async () => {
    if (!user || !user.uid || !user.email) {
        toast({ variant: 'destructive', title: 'Session Required', description: 'Please sign in to proceed with payment.' });
        return;
    }
    if (!isTopupAmountValid) {
        toast({ variant: 'destructive', title: 'Amount Too Low', description: `Minimum top-up amount is ₹${TOPUP_MIN_RUPEES}.` });
        return;
    }
    if (typeof window === 'undefined' || !(window as any).Razorpay) {
        toast({ variant: 'destructive', title: 'Payment Node Syncing', description: 'The payment module is still loading. Please try again in 3 seconds.' });
        return;
    }

    setIsToppingUp(true);
    try {
        const result = await handleCustomTopupAction(
            topupAmountNum,
            { uid: user.uid, name: user.name, email: user.email },
        );
        if (!result.success) throw new Error(result.error);

        const order = result.order;
        if (!order || !order.key_id) throw new Error('Payment configuration sync failed.');

        const options: any = {
            key: order.key_id,
            name: '12Labs AI Studio',
            image: 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png',
            description: `API Credits Top-up - ${result.breakdown.totalCredits.toLocaleString()} Credits`,
            handler: function () {
                toast({
                    title: 'Payment Secured!',
                    description: 'Your API credits are being synchronized. This might take a few moments.'
                });
                setIsToppingUp(false);
            },
            prefill: { name: user.name, email: user.email },
            theme: { color: '#16a34a' },
            modal: {
                ondismiss: function() {
                    setIsToppingUp(false);
                }
            },
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            config: {
              display: {
                blocks: {
                  other: {
                    name: "Payment Options",
                    instruments: [
                        { method: "upi", flows: ["qr", "intent", "collect"] },
                        { method: "card" },
                        { method: "netbanking" }
                    ]
                  }
                },
                sequence: ["block.other"],
                preferences: { show_default_blocks: false }
              }
            }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
    } catch (error: any) {
            reportClientError('src/app/developer/page.tsx:topup', error);
        toast({ variant: 'destructive', title: 'Checkout Failed', description: error.message || 'An unknown error occurred during dispatch.' });
        setIsToppingUp(false);
    }
  };

  // Playground Test State — POST /api/v1/voice (the only endpoint this API exposes)
  const [testVoiceName, setTestVoiceName] = useState('Kore');
  const [testVoiceText, setTestVoiceText] = useState('Welcome to 12Labs AI Voice Studio.');
  const [testCustomApiKey, setTestCustomApiKey] = useState('');
  // Defaults to 'binary' — skips the R2 upload round trip entirely (see
  // /api/v1/voice), so the playground gets audio back noticeably faster
  // than the old 'url' mode.
  const [testResponseFormat, setTestResponseFormat] = useState<'binary' | 'url'>('binary');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [testAudioMeta, setTestAudioMeta] = useState<{ format: string; bytes: number; requestId?: string; credits?: string } | null>(null);
  const [isAnalyzingTest, setIsAnalyzingTest] = useState(false);
  // Tracks the last blob: URL we created for a 'binary' response, so it can
  // be revoked before making a new one instead of leaking memory.
  const testAudioObjectUrlRef = useRef<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://12labs.ai';

  useEffect(() => {
    if (user?.uid) {
      fetchUserKeys();
    }
  }, [user?.uid]);

  // Prefill the playground's key field with the developer's first live key.
  useEffect(() => {
    if (!testCustomApiKey && keys[0]?.apiKey) {
      setTestCustomApiKey(keys[0].apiKey);
    }
  }, [keys]);

  // Release the last binary-mode blob: URL when the page unmounts.
  useEffect(() => {
    return () => {
      if (testAudioObjectUrlRef.current) {
        URL.revokeObjectURL(testAudioObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (database) {
      const toolRef = ref(database, 'toolSettings/developer-api/locked');
      const unsubscribe = onRtdbValue(toolRef, (snapshot) => {
        setIsLocked(snapshot.val() === true);
      });
      return () => unsubscribe();
    }
  }, [database]);

  const fetchUserKeys = async () => {
    setLoadingKeys(true);
    try {
      const token = user ? await (user as any).getIdToken?.() : null;
      const res = await fetch(`/api/keys${user?.uid ? `?uid=${user.uid}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.keys)) {
        setKeys(data.keys);
      }
    } catch (err: any) {
      console.error('Error fetching API keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const handleOpenDialog = () => {
    setCreatedKey(null);
    setNewKeyName('');
    setIsDialogOpen(true);
  };

  const handleCreateApiKey = async () => {
    if (!user) {
      toast({ title: 'Authentication Required', description: 'Please sign in to generate an API key.', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      const token = await (user as any).getIdToken?.();
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newKeyName.trim() || 'Production Secret Key',
          uid: user.uid,
          email: user.email,
        }),
      });
      const data = await res.json();
      if (data.success && data.apiKey) {
        setCreatedKey(data.apiKey);
        setNewKeyName('');
        toast({ title: 'API Key Created!', description: 'Secret API key generated successfully.' });
        fetchUserKeys();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to generate key', variant: 'destructive' });
      }
    } catch (err: any) {
            reportClientError('src/app/developer/page.tsx:197', err);
      toast({ title: 'Error', description: err.message || 'Network error', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);
  // Client-side lock: after a toggle, that key's switch is disabled for a
  // few seconds so people can't spam on/off/on. Keyed by keyId -> unlock timestamp.
  const [toggleLockedUntil, setToggleLockedUntil] = useState<Record<string, number>>({});
  const TOGGLE_LOCK_MS = 3000;

  const handleToggleApiKey = async (keyId: string, nextDisabled: boolean) => {
    const lockedUntil = toggleLockedUntil[keyId] || 0;
    if (Date.now() < lockedUntil) {
      toast({ title: 'Please wait', description: 'You can toggle this key again in a moment.' });
      return;
    }
    setToggleLockedUntil((prev) => ({ ...prev, [keyId]: Date.now() + TOGGLE_LOCK_MS }));
    window.setTimeout(() => {
      setToggleLockedUntil((prev) => {
        const next = { ...prev };
        delete next[keyId];
        return next;
      });
    }, TOGGLE_LOCK_MS);

    setTogglingKeyId(keyId);
    // Optimistic update so the switch feels instant.
    setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, disabled: nextDisabled } : k)));
    try {
      const token = user ? await (user as any).getIdToken?.() : null;
      const res = await fetch('/api/keys', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ keyId, disabled: nextDisabled }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: nextDisabled ? 'Key Disabled' : 'Key Enabled',
          description: nextDisabled
            ? 'This key will now be rejected by the public API until re-enabled.'
            : 'This key can call the public API again.',
        });
      } else {
        setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, disabled: !nextDisabled } : k)));
        toast({ title: 'Error', description: data.error || 'Failed to update key', variant: 'destructive' });
      }
    } catch (err: any) {
      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, disabled: !nextDisabled } : k)));
      reportClientError('src/app/developer/page.tsx:handleToggleApiKey', err);
      toast({ title: 'Error', description: err.message || 'Network error', variant: 'destructive' });
    } finally {
      setTogglingKeyId(null);
    }
  };

  const handleDeleteApiKey = async (keyId: string, apiKey?: string) => {
    try {
      const token = user ? await (user as any).getIdToken?.() : null;
      const res = await fetch(`/api/keys?keyId=${keyId}&apiKey=${apiKey || ''}&uid=${user?.uid || ''}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Key Deleted', description: 'API Key has been permanently deleted. You can generate a new one now.' });
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to delete key', variant: 'destructive' });
      }
    } catch (err: any) {
            reportClientError('src/app/developer/page.tsx:216', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRunPlaygroundTest = async () => {
    if (!testCustomApiKey.trim()) {
      setTestResult(JSON.stringify({ error: 'Enter a secret API key above (or create one in the API Keys tab).' }, null, 2));
      toast({ title: 'API Key Required', description: 'Paste a secret API key to run a live test.', variant: 'destructive' });
      return;
    }
    if (!testVoiceText.trim()) {
      toast({ title: 'Text Required', description: 'Enter some text for the voice to say.', variant: 'destructive' });
      return;
    }

    setIsAnalyzingTest(true);
    // Release the previous blob: URL (binary mode) before starting a new
    // request — otherwise these pile up in memory across repeated tests.
    if (testAudioObjectUrlRef.current) {
      URL.revokeObjectURL(testAudioObjectUrlRef.current);
      testAudioObjectUrlRef.current = null;
    }
    setTestAudioUrl(null);
    setTestAudioMeta(null);
    setTestResult(`Sending request to POST /api/v1/voice (response_format: "${testResponseFormat}")...`);
    try {
      const res = await fetch('/api/v1/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': testCustomApiKey.trim(),
        },
        body: JSON.stringify({
          name: testVoiceName.trim() || 'Kore',
          text: testVoiceText,
          response_format: testResponseFormat,
        }),
      });

      const contentType = res.headers.get('content-type') || '';

      // 'binary' mode: the response body IS the MP3, not JSON — reading it
      // with res.text() would corrupt the audio (lossy UTF-8 decoding of
      // binary bytes). Read it as a Blob instead and play it via a local
      // blob: URL, same as any other <audio src>.
      if (res.ok && contentType.includes('audio')) {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        testAudioObjectUrlRef.current = objectUrl;
        setTestAudioUrl(objectUrl);
        setTestAudioMeta({
          format: contentType,
          bytes: blob.size,
          requestId: res.headers.get('x-request-id') || undefined,
          credits: res.headers.get('x-credits-charged') || undefined,
        });
        setTestResult(JSON.stringify({
          success: true,
          response_format: 'binary',
          content_type: contentType,
          bytes: blob.size,
          request_id: res.headers.get('x-request-id') || null,
          credits_charged: res.headers.get('x-credits-charged') ? Number(res.headers.get('x-credits-charged')) : null,
        }, null, 2));
        return;
      }

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
            reportClientError('src/app/developer/page.tsx:298', err);
        data = {
          success: false,
          error: `Server returned an invalid JSON or HTML error response (Status: ${res.status}).`,
          rawResponse: responseText.substring(0, 500)
        };
      }

      setTestResult(JSON.stringify(data, null, 2));
      if (data?.audio_url) {
        setTestAudioUrl(data.audio_url);
        setTestAudioMeta({ format: 'audio/mpeg (hosted URL)', bytes: 0 });
      }
    } catch (err: any) {
            reportClientError('src/app/developer/page.tsx:309', err);
      setTestResult(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsAnalyzingTest(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const currentAccountCredits = (activeUser as any)?.credits ?? user?.credits ?? 0;

  // Render Locked State
  if (isLocked && !isAdmin) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <main className="flex-1 py-20 px-4 max-w-7xl mx-auto flex flex-col items-center justify-center text-center space-y-6">
          <div className="p-6 rounded-full bg-destructive/10">
            <Lock className="w-16 h-16 text-destructive" />
          </div>
          <h1 className="text-4xl font-black tracking-tight">API Platform Locked</h1>
          <p className="text-muted-foreground text-lg max-w-lg">
            The developer API is currently under maintenance or disabled by an administrator. Please check back later.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            <Button asChild size="lg" variant="outline" className="rounded-xl px-8 font-semibold">
              <Link href="/api-docs">View API Documentation</Link>
            </Button>
            <Button asChild size="lg" className="rounded-xl px-8 font-semibold">
              <Link href="/">Return Home</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Render Premium Auth Checking State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <main className="flex-1 py-20 px-4 max-w-7xl mx-auto flex flex-col items-center justify-center space-y-4">
          <RefreshCw className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm font-semibold text-muted-foreground">Authenticating Developer Session...</p>
        </main>
      </div>
    );
  }

  // Render Login Wall (If user is not logged in)
  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-foreground flex flex-col">
        <main className="flex-1 py-16 px-4 md:px-8 max-w-7xl mx-auto space-y-16">
          
          {/* Landing Banner */}
          <div className="text-center max-w-3xl mx-auto space-y-6 py-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-xs font-bold tracking-wider uppercase border border-neutral-200 dark:border-neutral-800">
              <Terminal className="w-3.5 h-3.5 text-primary" /> Developer Platform
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none text-neutral-900 dark:text-neutral-50">
              12Labs Studio Voice API
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400 text-base md:text-lg leading-relaxed">
              Send text, get back production-ready voice audio. One endpoint, powered by the same voice engine behind 12Labs Studio — drop it into any app, bot, or backend.
            </p>
            <div className="pt-4 flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="rounded-xl px-8 py-6 font-bold text-base shadow-md hover:shadow-lg transition-all gap-2">
                <Link href="/login">
                  Login to Access Developer APIs <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button variant="outline" asChild size="lg" className="rounded-xl px-8 py-6 font-semibold">
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl">
              <CardHeader className="space-y-3">
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 w-12 h-12 flex items-center justify-center">
                  <Key className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg font-bold">Secure Access Keys</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Generate and delete secure secret API keys. Keep full server-side control over script processing limits.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl">
              <CardHeader className="space-y-3">
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 w-12 h-12 flex items-center justify-center">
                  <Code className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg font-bold">Comprehensive Developer SDK</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Easily integrate using cURL, Node.js, or Python. Test inputs in real-time inside our interactive sandbox playground.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-xl">
              <CardHeader className="space-y-3">
                <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 w-12 h-12 flex items-center justify-center">
                  <Mic2 className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg font-bold">Same Engine as Studio</CardTitle>
                <CardDescription className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Every request runs on the exact voice engine and voice catalog behind 12Labs Studio — no separate quality tier.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Code Preview Section to entice developers */}
          <div className="max-w-4xl mx-auto border border-neutral-200/80 dark:border-neutral-800 rounded-2xl bg-neutral-900 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Terminal className="w-64 h-64 text-white" />
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-neutral-700" />
                <span className="w-3 h-3 rounded-full bg-neutral-600" />
                <span className="w-3 h-3 rounded-full bg-neutral-500" />
                <span className="text-xs text-neutral-400 font-mono ml-2">POST /api/v1/voice</span>
              </div>
              <Badge variant="outline" className="text-xs border-neutral-800 text-neutral-400 font-mono">cURL Example</Badge>
            </div>
            <pre className="text-xs text-neutral-100 font-mono leading-relaxed overflow-x-auto whitespace-pre">
{`curl -X POST "${baseUrl}/api/v1/voice" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_12LABS_SECRET_KEY" \\
  -d '{
    "name": "Kore",
    "text": "Welcome to 12Labs AI Voice Studio."
  }'`}
            </pre>
          </div>

        </main>
      </div>
    );
  }

  // Render Full Authenticated Developer Portal
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-foreground flex flex-col">
      <main className="flex-1 py-8 px-4 md:px-8 max-w-7xl mx-auto space-y-8 w-full">
        {isLocked && isAdmin && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm font-bold shadow-xs">
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Developer API is currently set to LOCKED for regular users in Tool Settings. As Admin, you have full override access.</span>
            </div>
            <Badge className="bg-amber-500 text-black font-black text-[10px] shrink-0">ADMIN OVERRIDE</Badge>
          </div>
        )}
        
        {/* Top Profile & Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-bold uppercase">
                  <Terminal className="w-3.5 h-3.5 text-primary" /> Developer Platform & API
                </div>
                
                {/* STRICT PROFILE CLARIFICATION */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                  <User className="w-3.5 h-3.5" />
                  <span>Logged in as: {user.email || 'Developer'}</span>
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-neutral-900 dark:text-neutral-50">
                Developer Center
              </h1>
              <p className="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed">
                Generate production secret API keys and trace live voice generation usage.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {keys.length === 0 && (
                <Button onClick={handleOpenDialog} size="lg" className="gap-2 font-bold shadow-sm h-11 px-6 rounded-xl">
                  <Plus className="w-4 h-4" /> Create New Secret Key
                </Button>
              )}
              <Button onClick={() => logout()} variant="outline" size="lg" className="gap-2 font-semibold h-11 px-5 rounded-xl text-neutral-600 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400">
                <LogOut className="w-4 h-4" /> Logout
              </Button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-neutral-100 dark:border-neutral-800/80">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Active Secret Keys</p>
              <p className="text-2xl font-black text-neutral-900 dark:text-neutral-50">{keys.length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Account Live Credits</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {currentAccountCredits.toLocaleString()} Credits
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">API Health Status</p>
              <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                100% Operational
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Auth Protocol</p>
              <p className="text-sm font-bold font-mono text-neutral-800 dark:text-neutral-200">X-API-Key</p>
            </div>
          </div>
        </div>

        {/* Generate Key Modal Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setCreatedKey(null);
            setNewKeyName('');
          }
        }}>
          <DialogContent className="sm:max-w-lg border-neutral-200 dark:border-neutral-800 shadow-xl rounded-2xl">
            {!createdKey ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                    <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
                      <Key className="w-5 h-5 text-primary" />
                    </div>
                    Create Secret API Key
                  </DialogTitle>
                  <DialogDescription className="text-xs text-neutral-500">
                    Secret API keys provide full authenticated access to voice analysis & generation APIs.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                      Key Identifier / Name
                    </label>
                    <Input
                      placeholder="e.g. Production Backend, VoiceBot Integration"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="font-medium h-11 rounded-xl"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['Production Key', 'Development API', 'Voice Bot Service', 'Mobile App Client'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewKeyName(preset)}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors font-medium"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                    <ShieldCheck className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <span className="leading-relaxed">
                      Your generated API key will share your account live credit balance (<strong>{currentAccountCredits.toLocaleString()} Credits</strong>).
                    </span>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="font-semibold rounded-xl">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateApiKey} disabled={isGenerating} className="gap-2 font-bold shadow-md rounded-xl">
                    {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isGenerating ? 'Generating Secret Key...' : 'Generate Secret Key'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    Secret Key Generated!
                  </DialogTitle>
                  <DialogDescription className="text-xs text-neutral-500">
                    Please copy and store your secret key immediately in your secure environment variables.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3">
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Important Security Notice</span>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      This secret key will <strong>never be shown in full again</strong>. If you lose this key, you will need to delete it and generate a new one.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                      Your Secret API Key
                    </label>
                    <div className="flex items-center gap-2 p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-xs break-all font-semibold text-primary relative">
                      <span className="flex-1 select-all">{createdKey}</span>
                      <Button
                        size="sm"
                        className="gap-1.5 shrink-0 font-bold shadow-sm rounded-lg"
                        onClick={() => copyToClipboard(createdKey, 'modal-created-key')}
                      >
                        {copiedKeyId === 'modal-created-key' ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-300" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy Key
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    className="w-full font-bold h-11 rounded-xl"
                    variant="default"
                    onClick={() => {
                      setCreatedKey(null);
                      setNewKeyName('');
                      setIsDialogOpen(false);
                    }}
                  >
                    I Have Saved My Secret Key
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Main Tabs */}
        <Tabs defaultValue="keys" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md h-12 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl border border-neutral-200/50 dark:border-neutral-800/50">
            <TabsTrigger value="keys" className="gap-2 font-bold rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800">
              <Key className="w-4 h-4" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="docs" className="gap-2 font-bold rounded-lg data-[state=active]:shadow-sm data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800">
              <Code className="w-4 h-4" /> API Docs & Testing
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: API KEYS MANAGER */}
          <TabsContent value="keys" className="space-y-6">
            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 dark:border-neutral-800/80 pb-4">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                    <ShieldCheck className="w-5 h-5 text-primary" /> Active API Secret Keys
                  </CardTitle>
                  <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                    Pass your secret key via the <code className="bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-mono text-primary font-semibold">X-API-Key</code> request header. Each account can hold one active key at a time — delete it to generate a new one.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" className="gap-2 text-xs font-semibold rounded-lg" onClick={fetchUserKeys}>
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingKeys ? 'animate-spin' : ''}`} /> Refresh Keys
                </Button>
              </CardHeader>

              <CardContent className="p-0 divide-y divide-neutral-100 dark:divide-neutral-800">
                {loadingKeys ? (
                  <div className="p-12 text-center text-sm text-neutral-400 animate-pulse font-medium">
                    Loading secret API keys...
                  </div>
                ) : keys.length === 0 ? (
                  <div className="p-12 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
                      <Key className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-neutral-850 dark:text-neutral-100">No API Keys Generated Yet</p>
                      <p className="text-xs text-neutral-500 max-w-md mx-auto">
                        Generate an API key above to start connecting external applications, voice bots, or scripts.
                      </p>
                    </div>
                    <Button onClick={handleOpenDialog} size="sm" className="gap-2 font-bold rounded-xl">
                      <Plus className="w-4 h-4" /> Create First API Key
                    </Button>
                  </div>
                ) : (
                  keys.map((k) => {
                    const isRevealed = revealedKeyId === k.id;
                    const isCopied = copiedKeyId === k.id;
                    const isDisabled = k.disabled === true;
                    const displayValue = isRevealed && k.apiKey ? k.apiKey : k.maskedKey;
                    return (
                      <div key={k.id} className={cn("p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/50 transition-colors", isDisabled && "opacity-60")}>
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5", isDisabled ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-400" : "bg-primary/10 text-primary")}>
                            <Key className="w-4.5 h-4.5" />
                          </div>
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">{k.name}</span>
                              {isDisabled ? (
                                <Badge variant="outline" className="text-[10px] font-mono bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20 font-bold gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" /> Disabled
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-bold gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <code className="text-xs font-mono text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1.5 rounded-lg inline-block font-semibold border border-neutral-200/50 dark:border-neutral-700/50 break-all">
                                {displayValue}
                              </code>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                                title={isRevealed ? 'Hide key' : 'Reveal full key'}
                                onClick={() => setRevealedKeyId(isRevealed ? null : k.id)}
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                                title="Copy full key"
                                onClick={() => k.apiKey && copyToClipboard(k.apiKey, k.id)}
                              >
                                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </Button>
                            </div>

                            <p className="text-[11px] text-neutral-400">
                              Created {new Date(k.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-3 pl-[3.25rem] md:pl-0">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                              {currentAccountCredits.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800">
                            <Power className={cn("w-3.5 h-3.5", isDisabled ? "text-neutral-400" : "text-emerald-500")} />
                            <Switch
                              checked={!isDisabled}
                              disabled={togglingKeyId === k.id || Date.now() < (toggleLockedUntil[k.id] || 0)}
                              onCheckedChange={(checked) => handleToggleApiKey(k.id, !checked)}
                              aria-label={isDisabled ? 'Enable key' : 'Disable key'}
                            />
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-500/10 h-9 rounded-lg"
                            onClick={() => handleDeleteApiKey(k.id, k.apiKey)}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Top Up API Credits — same pool as Account Live Credits above */}
            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-bold text-neutral-900 dark:text-neutral-50">
                  <Coins className="w-5 h-5 text-primary" /> Top Up API Credits
                </CardTitle>
                <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                  Enter any amount (min ₹{TOPUP_MIN_RUPEES}) — ₹120 gets you 10,000 credits, scaled to whatever you enter. Credits land in your account's live balance, which every API key bills against.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-neutral-400 pl-1">₹</span>
                  <Input
                    type="number"
                    min={TOPUP_MIN_RUPEES}
                    value={topupAmount}
                    onChange={e => setTopupAmount(e.target.value)}
                    placeholder="120"
                    className="rounded-xl h-12 text-lg font-black bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
                  />
                </div>

                {!isTopupAmountValid && topupAmount !== '' && (
                  <p className="text-[11px] font-bold text-red-500 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Minimum top-up amount is ₹{TOPUP_MIN_RUPEES}.
                  </p>
                )}

                <div className="flex items-center justify-between rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 px-4 py-3">
                  <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Credits to Wallet</span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{topupPreviewCredits.toLocaleString()}</span>
                </div>

                <Button
                  className="w-full h-12 text-base font-black rounded-xl shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleApiCreditsTopup}
                  disabled={isToppingUp || !isTopupAmountValid}
                >
                  {isToppingUp ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isToppingUp ? 'Processing...' : 'TOP-UP NOW'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: API DOCS & PLAYGROUND */}
          <TabsContent value="docs" className="space-y-6">
            <Card className="border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm rounded-2xl">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                    <Code className="w-5 h-5 text-primary" /> API Reference
                  </CardTitle>
                  <CardDescription className="text-xs text-neutral-500 dark:text-neutral-400">
                    Test it live below with a real key, or read the full request/response docs.
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm" className="gap-2 text-xs font-bold rounded-lg shrink-0">
                  <Link href="/api-docs">
                    <Code className="w-3.5 h-3.5" /> Full API Docs
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Quick reference strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-3.5 bg-neutral-50/50 dark:bg-neutral-900/30">
                    <Badge className="bg-emerald-600 text-white font-mono text-xs px-2.5 py-0.5 font-bold rounded-md shrink-0">POST</Badge>
                    <code className="text-xs font-mono text-neutral-700 dark:text-neutral-300 truncate">/api/v1/voice</code>
                    <span className="ml-auto text-[10px] text-neutral-400 shrink-0">generate audio</span>
                  </div>
                  <div className="flex items-center gap-3 border border-neutral-200/80 dark:border-neutral-800 rounded-xl p-3.5 bg-neutral-50/50 dark:bg-neutral-900/30">
                    <Badge className="bg-blue-600 text-white font-mono text-xs px-2.5 py-0.5 font-bold rounded-md shrink-0">GET</Badge>
                    <code className="text-xs font-mono text-neutral-700 dark:text-neutral-300 truncate">/api/v1/voice/names</code>
                    <span className="ml-auto text-[10px] text-neutral-400 shrink-0">list voices</span>
                  </div>
                </div>

                {/* Interactive Playground */}
                <div className="space-y-4 border border-neutral-200/80 dark:border-neutral-800 rounded-2xl p-5 bg-neutral-100/50 dark:bg-neutral-900/10">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm flex items-center gap-2 text-neutral-900 dark:text-neutral-50">
                      <Play className="w-4 h-4 text-primary" /> Try It — POST /api/v1/voice
                    </h3>
                    <Badge variant="outline" className="text-[10px] font-mono bg-white dark:bg-neutral-900 text-neutral-500">
                      Live Test Console
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
                      <span>X-API-Key</span>
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono normal-case">
                        Auto-filled from your keys below
                      </span>
                    </label>
                    <Input
                      type="text"
                      className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono h-10 focus:ring-2 focus:ring-primary outline-none transition-all"
                      placeholder="Paste a secret API key, or generate one in the API Keys tab"
                      value={testCustomApiKey}
                      onChange={(e) => setTestCustomApiKey(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                        Voice Name
                      </label>
                      <Select value={testVoiceName} onValueChange={setTestVoiceName}>
                        <SelectTrigger className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono h-10 focus:ring-2 focus:ring-primary outline-none transition-all">
                          <SelectValue placeholder="Select a voice..." />
                        </SelectTrigger>
                        <SelectContent>
                          {voices.map((v) => (
                            <SelectItem key={v.id} value={v.name} disabled={v.disabled} className="text-xs font-mono">
                              {v.name} <span className="text-neutral-400">({v.gender})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
                        <span>Response Format</span>
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono normal-case">
                          default: binary
                        </span>
                      </label>
                      <Select value={testResponseFormat} onValueChange={(v) => setTestResponseFormat(v as 'binary' | 'url')}>
                        <SelectTrigger className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs font-mono h-10 focus:ring-2 focus:ring-primary outline-none transition-all">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="binary" className="text-xs font-mono">binary — raw audio, faster</SelectItem>
                          <SelectItem value="url" className="text-xs font-mono">url — hosted link</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                        Estimated Cost
                      </label>
                      <div className="h-10 flex items-center px-3 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 text-xs font-bold text-neutral-600 dark:text-neutral-300">
                        {testVoiceText.length.toLocaleString()} credits ({testVoiceText.length} chars)
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                      Text
                    </label>
                    <textarea
                      className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 rounded-xl font-mono text-xs h-40 focus:ring-2 focus:ring-primary outline-none transition-all leading-relaxed text-neutral-800 dark:text-neutral-150"
                      value={testVoiceText}
                      onChange={(e) => setTestVoiceText(e.target.value)}
                    />
                  </div>

                  <Button onClick={handleRunPlaygroundTest} disabled={isAnalyzingTest} className="gap-2 font-bold text-xs h-10 shadow-sm rounded-xl">
                    {isAnalyzingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {isAnalyzingTest ? 'Generating Audio...' : 'Send Live API Request'}
                  </Button>

                  {testAudioUrl && (
                    <div className="space-y-1.5 pt-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-primary" /> Generated Audio
                      </label>
                      <audio controls src={testAudioUrl} className="w-full h-10" />
                      {testAudioMeta && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                          <span>format: {testAudioMeta.format}</span>
                          {testAudioMeta.bytes > 0 && <span>size: {(testAudioMeta.bytes / 1024).toFixed(1)} KB</span>}
                          {testAudioMeta.requestId && <span>request_id: {testAudioMeta.requestId}</span>}
                          {testAudioMeta.credits && <span>credits_charged: {testAudioMeta.credits}</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {testResult && (
                    <div className="space-y-1.5 pt-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Response Output</label>
                      <pre className="bg-neutral-900 text-emerald-400 border border-neutral-850 p-4 rounded-xl text-xs font-mono max-h-60 overflow-y-auto leading-relaxed">
                        {testResult}
                      </pre>
                    </div>
                  )}
                </div>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
