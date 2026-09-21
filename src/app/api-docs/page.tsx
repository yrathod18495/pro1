'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Key, Terminal, Copy, Check, Mic2, ListMusic, ArrowRight, FileText, Sparkles, Play } from 'lucide-react';
import { voices } from '@/lib/voices';

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

        {/* 🔴 NEW: this goes FIRST, above everything — the exact copy-paste
            instruction for handing this API to an AI assistant. This page
            itself is a React app; some AI tools only read a search-result
            snippet (title + meta description) instead of actually
            visiting it, and never see the real content below. /api-guide.md
            is a plain static text file with zero JS/rendering dependency —
            telling an AI to FETCH that URL directly (not search for it)
            works regardless of how that AI's tools behave. */}
        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 space-y-3">
          <p className="text-sm font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Building this with an AI assistant (ChatGPT, Claude, etc.)?
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Don't ask it to "search for" or "find" our docs — some AI tools only see a search-result snippet that way and miss the real content. Instead, give it this exact instruction, which tells it to fetch a plain static text file directly:
          </p>
          <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
            <pre>{`Fetch this URL directly and read it fully — do not search for it:\nhttps://www.12labs.in/api-guide.md\n\nThen build [describe what you want] using ONLY what that document describes.`}</pre>
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-1.5 right-1.5 h-7 w-7"
              onClick={() => copy(`Fetch this URL directly and read it fully — do not search for it:\nhttps://www.12labs.in/api-guide.md\n\nThen build [describe what you want] using ONLY what that document describes.`, 'ai-instruction')}
            >
              {copied === 'ai-instruction' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
          <div className="space-y-3 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Terminal className="w-3.5 h-3.5" /> REST API Documentation
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">12Labs Studio Voice API</h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-xl">
              Send text or a full script, get back voice audio — from single-line synthesis to one-click, multi-character project generation.
            </p>
            <a
              href="/api-guide.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <FileText className="w-3.5 h-3.5" /> Or just open the plain-text guide yourself (/api-guide.md)
            </a>
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

        {/* Endpoint 3: Analyze Script */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 hover:bg-green-700 text-white font-mono">POST</Badge>
                <code className="text-sm font-semibold">/api/v1/analyze</code>
              </div>
              <Badge variant="outline" className="text-xs gap-1"><FileText className="w-3 h-3" /> Free within your daily limit</Badge>
            </div>
            <CardDescription className="mt-2">
              Send a script and get back every character it detected — name, gender, age group, and how many lines each one speaks. Use this to build the voice assignment your app sends to <code className="bg-muted px-1 py-0.5 rounded">/api/v1/generate</code> below. Free up to your account's daily analysis limit; each analysis past that costs 300 credits (charged automatically, reflected in <code className="bg-muted px-1 py-0.5 rounded">credits_charged</code> in the response).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Body</h4>
              <div className="border rounded-md divide-y text-xs">
                <div className="p-2.5 flex justify-between items-center">
                  <span className="font-mono font-bold text-primary">script</span>
                  <span className="text-muted-foreground">Full script text — see format below</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Script format — one line per line of dialogue: <code className="bg-muted px-1 py-0.5 rounded">Character: Dialogue text</code>, or with an emotion tag: <code className="bg-muted px-1 py-0.5 rounded">Character: [happy] Dialogue text</code>.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Example</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
                <pre>{`curl -X POST "${baseUrl}/api/v1/analyze" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: YOUR_SECRET_KEY" \\\n  -d '{"script": "John: [happy] Hello there!\\nMary: [curious] Hi John, how are you?"}'`}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => copy(`curl -X POST "${baseUrl}/api/v1/analyze" -H "Content-Type: application/json" -H "X-API-Key: YOUR_SECRET_KEY" -d '{"script": "John: [happy] Hello there!\\nMary: [curious] Hi John, how are you?"}'`, 'curl-analyze')}
                >
                  {copied === 'curl-analyze' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Response</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                <pre>{`{
  "characters": [
    { "name": "John", "gender": "Male", "age": "Adult", "dialogueCount": 1 },
    { "name": "Mary", "gender": "Female", "age": "Adult", "dialogueCount": 1 }
  ],
  "lines": [
    { "character": "John", "text": "Hello there!", "emotion": "happy" },
    { "character": "Mary", "text": "Hi John, how are you?", "emotion": "curious" }
  ],
  "language": "en",
  "credits_charged": 0
}`}</pre>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <code className="bg-muted px-1 py-0.5 rounded">gender</code> is <code className="bg-muted px-1 py-0.5 rounded">"Male"</code> / <code className="bg-muted px-1 py-0.5 rounded">"Female"</code> / <code className="bg-muted px-1 py-0.5 rounded">"Neutral"</code>. <code className="bg-muted px-1 py-0.5 rounded">age</code> is <code className="bg-muted px-1 py-0.5 rounded">"Kid"</code> / <code className="bg-muted px-1 py-0.5 rounded">"Adult"</code> / <code className="bg-muted px-1 py-0.5 rounded">"Old"</code> — pass these straight through to <code className="bg-muted px-1 py-0.5 rounded">/api/v1/generate</code>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Endpoint 4: Generate (one-click full project) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 hover:bg-green-700 text-white font-mono">POST</Badge>
                <code className="text-sm font-semibold">/api/v1/generate</code>
              </div>
              <Badge variant="outline" className="text-xs gap-1"><Sparkles className="w-3 h-3" /> One-click full project</Badge>
            </div>
            <CardDescription className="mt-2">
              Send a full script and get back a finished, multi-character audio file in one call — character detection and voice assignment are handled for you. This is async: the request queues the job and returns a <code className="bg-muted px-1 py-0.5 rounded">project_id</code> right away; poll the status endpoint below for the finished <code className="bg-muted px-1 py-0.5 rounded">audio_url</code>. Billed per character, same rate shown on your account's pricing page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Body</h4>
              <div className="border rounded-md divide-y text-xs">
                <div className="p-2.5 flex justify-between items-center">
                  <span className="font-mono font-bold text-primary">script</span>
                  <span className="text-muted-foreground">Same format as /api/v1/analyze</span>
                </div>
                <div className="p-2.5 flex justify-between items-center">
                  <div>
                    <span className="font-mono font-bold text-primary">project_name</span>
                    <span className="text-muted-foreground ml-2">(Optional)</span>
                  </div>
                  <span className="text-muted-foreground">Label shown in your dashboard</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Example</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
                <pre>{`curl -X POST "${baseUrl}/api/v1/generate" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: YOUR_SECRET_KEY" \\\n  -d '{"script": "John: [happy] Hello there!\\nMary: [curious] Hi John, how are you?", "project_name": "My Project"}'`}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => copy(`curl -X POST "${baseUrl}/api/v1/generate" -H "Content-Type: application/json" -H "X-API-Key: YOUR_SECRET_KEY" -d '{"script": "John: [happy] Hello there!\\nMary: [curious] Hi John, how are you?", "project_name": "My Project"}'`, 'curl-generate')}
                >
                  {copied === 'curl-generate' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Response</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                <pre>{`{ "project_id": "HQ_...", "status": "in_queue", "estimated_cost": 42, "poll_url": "/api/v1/generate/HQ_..." }`}</pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Endpoint 5: Poll generation status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-mono">GET</Badge>
                <code className="text-sm font-semibold">/api/v1/generate/{'{project_id}'}</code>
              </div>
              <Badge variant="outline" className="text-xs gap-1"><ListMusic className="w-3 h-3" /> Poll job status</Badge>
            </div>
            <CardDescription className="mt-2">
              Poll this with the <code className="bg-muted px-1 py-0.5 rounded">project_id</code> from <code className="bg-muted px-1 py-0.5 rounded">/api/v1/generate</code> until <code className="bg-muted px-1 py-0.5 rounded">status</code> is <code className="bg-muted px-1 py-0.5 rounded">"completed"</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Example</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
                <pre>{`curl "${baseUrl}/api/v1/generate/HQ_..." -H "X-API-Key: YOUR_SECRET_KEY"`}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => copy(`curl "${baseUrl}/api/v1/generate/HQ_..." -H "X-API-Key: YOUR_SECRET_KEY"`, 'curl-poll')}
                >
                  {copied === 'curl-poll' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Response</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                <pre>{`{ "project_id": "HQ_...", "status": "completed", "audio_url": "https://...", "error": null }`}</pre>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <code className="bg-muted px-1 py-0.5 rounded">status</code> moves through <code className="bg-muted px-1 py-0.5 rounded">in_queue</code> → <code className="bg-muted px-1 py-0.5 rounded">processing</code> → <code className="bg-muted px-1 py-0.5 rounded">completed</code> (or <code className="bg-muted px-1 py-0.5 rounded">error</code>).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Endpoint 6: Generate Script */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 hover:bg-green-700 text-white font-mono">POST</Badge>
                <code className="text-sm font-semibold">/api/v1/script</code>
              </div>
              <Badge variant="outline" className="text-xs gap-1"><FileText className="w-3 h-3" /> AI script/story writing</Badge>
            </div>
            <CardDescription className="mt-2">
              Same feature as the website's Script Generator — describe what you want, get an AI-written script back. Async, same pattern as generating a voiceover: submit here, poll the status endpoint below for the finished text.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Body</h4>
              <div className="border rounded-md divide-y text-xs">
                <div className="p-2.5 flex justify-between items-center">
                  <span className="font-mono font-bold text-primary">prompt</span>
                  <span className="text-muted-foreground">What the script should be about</span>
                </div>
                <div className="p-2.5 flex justify-between items-center">
                  <div><span className="font-mono font-bold text-primary">length</span><span className="text-muted-foreground ml-2">(Optional)</span></div>
                  <span className="text-muted-foreground">"10min" / "20min" / "30min" — default "10min"</span>
                </div>
                <div className="p-2.5 flex justify-between items-center">
                  <div><span className="font-mono font-bold text-primary">genre, tone, audience, perspective, number_of_characters, language</span></div>
                  <span className="text-muted-foreground ml-2 shrink-0">(All optional)</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Request Example</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto relative group">
                <pre>{`curl -X POST "${baseUrl}/api/v1/script" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: YOUR_SECRET_KEY" \\\n  -d '{"prompt": "A story about a lost dog finding its way home", "length": "10min"}'`}</pre>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1.5 right-1.5 h-7 w-7"
                  onClick={() => copy(`curl -X POST "${baseUrl}/api/v1/script" -H "Content-Type: application/json" -H "X-API-Key: YOUR_SECRET_KEY" -d '{"prompt": "A story about a lost dog finding its way home", "length": "10min"}'`, 'curl-script')}
                >
                  {copied === 'curl-script' ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Response</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                <pre>{`{ "mapping_id": "STORY_...", "status": "processing", "estimated_cost": 500, "poll_url": "/api/v1/script/STORY_..." }`}</pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Endpoint 7: Poll script status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-mono">GET</Badge>
                <code className="text-sm font-semibold">/api/v1/script/{'{mapping_id}'}</code>
              </div>
              <Badge variant="outline" className="text-xs gap-1"><ListMusic className="w-3 h-3" /> Poll job status</Badge>
            </div>
            <CardDescription className="mt-2">
              Poll with the <code className="bg-muted px-1 py-0.5 rounded">mapping_id</code> from <code className="bg-muted px-1 py-0.5 rounded">/api/v1/script</code> until <code className="bg-muted px-1 py-0.5 rounded">status</code> is <code className="bg-muted px-1 py-0.5 rounded">"completed"</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Response</h4>
              <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                <pre>{`{ "mapping_id": "STORY_...", "status": "completed", "script_url": "https://...script.txt", "teaser": "...", "error": null }`}</pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Available Voices */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mic2 className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Available Voices</CardTitle>
            </div>
            <CardDescription>
              Every voice name your script's character assignment can use, with a short preview so you can pick by ear. Use <code className="bg-muted px-1 py-0.5 rounded">/api/v1/voice/names</code> to fetch this list programmatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {voices.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 border rounded-lg p-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{v.name}</p>
                    <p className="text-muted-foreground truncate">{v.gender}</p>
                  </div>
                  <audio controls preload="none" src={v.demoUrl} className="h-8 max-w-[140px] shrink-0" />
                </div>
              ))}
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
