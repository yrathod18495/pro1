'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Key, Terminal, Copy, Check, Mic2, ListMusic, ArrowRight } from 'lucide-react';

export default function ApiDocsPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="py-10 px-4 md:px-8 max-w-4xl mx-auto space-y-8">

        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
          <div className="space-y-3 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Terminal className="w-3.5 h-3.5" /> REST API Documentation
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">12Labs Studio Voice API</h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-xl">
              One endpoint: send text, get back voice audio from the same engine that powers 12Labs Studio.
            </p>
          </div>
          <Button asChild className="gap-2 font-bold shadow-md shrink-0">
            <Link href="/developer">
              <Key className="w-4 h-4" /> Get an API Key & Test It <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>

        {/* Auth */}
        <Card className="bg-card/50 backdrop-blur border-primary/20">
          <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">Auth header (every request)</p>
                <code className="text-sm font-bold text-foreground">X-API-Key: YOUR_SECRET_KEY</code>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-xs"
              onClick={() => copy(`${baseUrl}/api/v1/voice`, 'base')}
            >
              {copied === 'base' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === 'base' ? 'Copied!' : 'Copy Base URL'}
            </Button>
          </CardContent>
        </Card>

        {/* Endpoint 1: Generate Voice */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 hover:bg-green-700 text-white font-mono">POST</Badge>
                <code className="text-sm font-semibold">/api/v1/voice</code>
              </div>
              <Badge variant="outline" className="text-xs gap-1"><Mic2 className="w-3 h-3" /> Generates audio</Badge>
            </div>
            <CardDescription className="mt-2">
              Converts text to speech and returns a hosted MP3 URL. Billed at 1 credit per character.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Body — single line</h4>
              <div className="border rounded-md divide-y text-xs">
                <div className="p-2.5 flex justify-between items-center">
                  <span className="font-mono font-bold text-primary">name</span>
                  <span className="text-muted-foreground">Voice name — see /api/v1/voice/names</span>
                </div>
                <div className="p-2.5 flex justify-between items-center">
                  <span className="font-mono font-bold text-primary">text</span>
                  <span className="text-muted-foreground">Text to speak</span>
                </div>
                <div className="p-2.5 flex justify-between items-center">
                  <div>
                    <span className="font-mono font-bold text-primary">age</span>
                    <span className="text-muted-foreground ml-2">(Optional)</span>
                  </div>
                  <span className="text-muted-foreground">'adult' | 'kid' | 'old' — default 'adult'</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                For a multi-voice script, send <code className="bg-muted px-1 py-0.5 rounded">lines: [{'{'}name, text, age{'}'}, ...]</code> instead of a single <code className="bg-muted px-1 py-0.5 rounded">name</code>/<code className="bg-muted px-1 py-0.5 rounded">text</code> pair.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Example</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
                <pre>{`curl -X POST "${baseUrl}/api/v1/voice" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_SECRET_KEY" \\
  -d '{"name": "Kore", "text": "Hello world!"}'`}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => copy(`curl -X POST "${baseUrl}/api/v1/voice" -H "Content-Type: application/json" -H "X-API-Key: YOUR_SECRET_KEY" -d '{"name": "Kore", "text": "Hello world!"}'`, 'curl-voice')}
                >
                  {copied === 'curl-voice' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Response</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                <pre>{`{ "success": true, "request_id": "a1b2c3d4e5f6", "audio_url": "https://..." }`}</pre>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <code className="bg-muted px-1 py-0.5 rounded">400</code> — invalid voice name (response lists every valid name) ·{' '}
                <code className="bg-muted px-1 py-0.5 rounded">402</code> — insufficient credits ·{' '}
                <code className="bg-muted px-1 py-0.5 rounded">502</code> — generation failed, charge auto-refunded.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Endpoint 2: Voice Names */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-mono">GET</Badge>
                <code className="text-sm font-semibold">/api/v1/voice/names</code>
              </div>
              <Badge variant="outline" className="text-xs gap-1"><ListMusic className="w-3 h-3" /> Lists voices</Badge>
            </div>
            <CardDescription className="mt-2">
              Returns every valid voice name, so you can validate a name client-side before calling <code className="bg-muted px-1 py-0.5 rounded">/api/v1/voice</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Example</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
                <pre>{`curl "${baseUrl}/api/v1/voice/names" -H "X-API-Key: YOUR_SECRET_KEY"`}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => copy(`curl "${baseUrl}/api/v1/voice/names" -H "X-API-Key: YOUR_SECRET_KEY"`, 'curl-names')}
                >
                  {copied === 'curl-names' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Response</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                <pre>{`{ "available_names": ["Zephyr", "Puck", "Kore", "..."] }`}</pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA to the real testing surface */}
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Want to generate a key and try these live instead of copy-pasting curl? Head to the developer dashboard.
            </p>
            <Button asChild className="gap-2 font-bold shrink-0">
              <Link href="/developer">
                <Key className="w-4 h-4" /> Open Developer Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
