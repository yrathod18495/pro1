'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, Clock3, Coins, RefreshCw, UserRound } from 'lucide-react';
import { useAuth } from '@/context/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type ApiLog = {
  requestId?: string;
  endpoint?: string;
  username?: string;
  userId?: string;
  cost?: number;
  remainingCredits?: number;
  latencyMs?: number;
  status?: string;
  timestamp?: string;
  model?: string;
};

export default function AdminApiLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [summary, setSummary] = useState({ requests: 0, credits: 0 });
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const token = await (user as any)?.getIdToken?.();
      const response = await fetch('/api/developer/analytics?all=1', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setLogs(Array.isArray(data.recent) ? data.recent : []);
        setSummary({ requests: Number(data.totalRequests || 0), credits: Number(data.totalCredits || 0) });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadLogs();
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest">
            <Activity className="h-4 w-4" /> Operations
          </div>
          <h1 className="text-3xl font-black tracking-tight mt-2">Public API Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">Last 7 days of Vercel-to-engine requests, billing, and remaining balances.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadLogs()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button asChild>
            <Link href="/developer">API Console <ArrowRight className="h-4 w-4 ml-2" /></Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card><CardContent className="p-5 flex items-center gap-4"><Activity className="h-8 w-8 text-primary" /><div><p className="text-xs text-muted-foreground uppercase font-bold">Requests</p><p className="text-2xl font-black">{summary.requests.toLocaleString()}</p></div></CardContent></Card>
        <Card><CardContent className="p-5 flex items-center gap-4"><Coins className="h-8 w-8 text-emerald-500" /><div><p className="text-xs text-muted-foreground uppercase font-bold">Credits charged</p><p className="text-2xl font-black">{summary.credits.toLocaleString()}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <CardDescription>Audio links are deliberately excluded from operator logs; billing and identity details remain available here.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-12 flex justify-center"><RefreshCw className="h-6 w-6 animate-spin text-primary" /></div> : logs.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No API requests recorded yet.</p> : (
            <div className="divide-y">
              {logs.map((log, index) => (
                <div key={`${log.requestId || 'request'}-${index}`} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{String(log.endpoint || 'api').toUpperCase()}</Badge>
                      <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'}>{log.status || 'unknown'}</Badge>
                      <span className="text-xs text-muted-foreground">{log.requestId}</span>
                    </div>
                    <p className="text-sm font-semibold flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-muted-foreground" />{log.username || log.userId || 'Unlinked user'}</p>
                    <p className="text-xs text-muted-foreground">{log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown time'}{log.model ? ` · ${log.model}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-5 text-sm">
                    <span className="flex items-center gap-1.5"><Coins className="h-4 w-4 text-emerald-500" />-{Number(log.cost || 0).toLocaleString()}</span>
                    <span className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="h-4 w-4" />{Number(log.latencyMs || 0)}ms</span>
                    <span className="text-xs text-muted-foreground">Balance: <b className="text-foreground">{Number(log.remainingCredits || 0).toLocaleString()}</b></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
