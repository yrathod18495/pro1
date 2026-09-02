'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Pacifico } from 'next/font/google';
import { Footer } from '@/components/landing/footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  BookOpen, 
  FileText, 
  Music, 
  Wand2, 
  Sparkles, 
  Mic, 
  Volume2, 
  Layers, 
  Video, 
  Clock, 
  ArrowRight, 
  Cpu, 
  FileJson, 
  Zap, 
  CheckCircle2, 
  Search, 
  Terminal,
  HelpCircle,
  Play,
  Languages,
  Radio,
  Gamepad,
  Megaphone,
  GraduationCap
} from 'lucide-react';

const pacificoFont = Pacifico({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

// Rich keywords for AI Directories, Crawler indexing, and Search visibility
const TOOLS_DIRECTORY = [
  {
    category: 'Voice & Dubbing',
    items: [
      {
        id: 'studio',
        title: 'Voice Studio',
        path: '/studio',
        icon: Mic,
        description: 'Multi-character professional voice synthesis with parameter controls.',
        keywords: 'elevenlabs alternative india, Indian accent generator, realistic TTS india, character voices generator, voiceover editor online',
        features: ['Pitch & speed control', 'Interactive timelines', 'Multi-character assignment', 'Accurate timing alignment']
      },
      {
        id: 'new-ai-studio',
        title: 'New AI Studio',
        path: '/new-ai-studio',
        icon: Sparkles,
        description: 'Consistent, hyper-expressive dialogue synthesis powered by next-generation voice intelligence.',
        keywords: 'expressive AI dubbing, natural dialogue voice generator, low latency voice synthesis, conversational AI text to speech',
        features: ['Real-time live voice synthesis', 'Emotional tone consistency', 'Ultra-low latency rendering', 'Human-like conversational pacing']
      },
      {
        id: 'voice-cloning',
        title: 'Instant Voice Cloning',
        path: '/voice-cloning',
        icon: Volume2,
        description: 'Clone any voice with high fidelity from a short 15-second audio sample.',
        keywords: 'instant voice cloning online, custom AI voice clone, replica voice maker, multilingual voice cloning, hindi voice cloning',
        features: ['Zero-shot high fidelity clone', 'Multi-lingual outputs', 'Secure personal voice library', 'Natural prosody matching']
      }
    ]
  },
  {
    category: 'Script & Production',
    items: [
      {
        id: 'script-generator',
        title: 'Script Studio',
        path: '/script-generator',
        icon: FileText,
        description: 'Generate production-ready manuscripts with automatic character voice pairing.',
        keywords: 'script to voiceover online, automatic video script writer, screenplay format generator, video production planning tool',
        features: ['Automatic voice assignment', 'Dialogue-narrative normalization', 'Cost credit estimation', 'Visual scene-by-scene script builder']
      },
      {
        id: 'pdf-tools',
        title: 'PDF Document Blueprint',
        path: '/pdf-tools',
        icon: BookOpen,
        description: 'Import full PDFs or books and convert them instantly into clean dialogue scripts.',
        keywords: 'PDF to script converter, ebook voiceover creator, book text to speech converter, document vocalizer tool',
        features: ['Optical chapter parsing', 'Multiple speaker auto-extraction', 'Text-to-speech blueprints', 'Large-document pagination support']
      },
      {
        id: 'youtube-transcript',
        title: 'YouTube Transcript Importer',
        path: '/youtube-transcript',
        icon: Video,
        description: 'Import any YouTube video link to extract subtitles and format it as a screenplay.',
        keywords: 'youtube subtitle transcript tool, video to script extractor, youtube translation voiceover, automated script extraction',
        features: ['Direct URL import', 'Auto timestamp removal', 'Voice assignment ready', 'Clean dialogue formatting']
      }
    ]
  },
  {
    category: 'Music & Audio Design',
    items: [
      {
        id: 'music-studio',
        title: 'AI Music Studio',
        path: '/music-studio',
        icon: Music,
        description: 'Compose original high-fidelity ambient background tracks and cinematic scores.',
        keywords: 'AI music generator, royalty free background music, cinematic score creator, ambient background sound maker',
        features: ['Custom genre prompts', 'Instrument stems separation', 'Seamless looping music tracks', 'Atmospheric tempo matching']
      },
      {
        id: 'sound-search',
        title: 'Smart Sound Finder',
        path: '/sound-search',
        icon: Search,
        description: 'Search for public domain sounds and effects using descriptions or natural queries.',
        keywords: 'audio effects finder, sound search engine, royalty free sound effects, cinematic SFX library',
        features: ['Semantic search matching', 'Instant preview & download', 'Vast SFX library integration', 'Category filters']
      }
    ]
  }
];

const INDUSTRIES_DIRECTORY = [
  {
    title: 'Content Creators & YouTubers',
    icon: Video,
    desc: 'Localize videos globally. Import raw transcripts, assign realistic regional characters, and dub content instantly into multiple languages.',
    keywords: 'video localization, automated translation, voiceover dubbing, multi-voice scripts'
  },
  {
    title: 'Audiobook & E-Learning Publishers',
    icon: GraduationCap,
    desc: 'Convert full manuscripts, PDFs, and textbooks into premium educational modules with natural, patient narrator voices.',
    keywords: 'audiobook text to speech, e-learning voices, educational audio, document narrator'
  },
  {
    title: 'Podcasters & Radio Broadcasters',
    icon: Radio,
    desc: 'Synthesize crisp show introductions, sponsor segments, and full multi-speaker podcast layouts without expensive mic equipment.',
    keywords: 'podcast voice generator, sponsor audio ads, intros and outros'
  },
  {
    title: 'Ad Agencies & Promoters',
    icon: Megaphone,
    desc: 'Create highly energetic, persuasive voice advertisements for products and brands with custom tone modifications.',
    keywords: 'commercial voice generator, ad voiceover creator, marketing audio scripts'
  }
];

const LANGUAGE_RESOURCES = [
  { lang: 'Hindi (India)', code: 'HI-IN', accents: 'Pure, Colloquial, Corporate, Dramatic Narrative' },
  { lang: 'English (Indian Accent)', code: 'EN-IN', accents: 'Professional, Neutral, Fluent, Conversational' },
  { lang: 'Tamil (India)', code: 'TA-IN', accents: 'Classic Tamil, Chennai Regional, Narrator Tone' },
  { lang: 'Telugu (India)', code: 'TE-IN', accents: 'Clear Standard, Narrator, Expressive Drama' },
  { lang: 'Bengali (India/Bangladesh)', code: 'BN-IN', accents: 'Poetic, Classic Standard, High-Clarity Voice' },
  { lang: 'Marathi (India)', code: 'MR-IN', accents: 'Standard Dialect, Conversational, Dynamic Pitch' },
  { lang: 'Kannada (India)', code: 'KN-IN', accents: 'Standard Kannada, Professional Corporate, Clear' },
  { lang: 'Gujarati (India)', code: 'GU-IN', accents: 'Conversational, Upbeat, Commercial, Narrative' }
];

export default function DocsPage() {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = ['All', 'Voice & Dubbing', 'Script & Production', 'Music & Audio Design'];

  const filteredTools = TOOLS_DIRECTORY.filter(cat => activeCategory === 'All' || cat.category === activeCategory)
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.keywords.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })).filter(cat => cat.items.length > 0);

  return (
    <div className="flex flex-col min-h-screen text-foreground bg-background selection:bg-indigo-500/30">

      <main className="flex-1 py-12 px-4 md:px-8 max-w-7xl mx-auto space-y-16 w-full">
        
        {/* HERO SECTION - RICH IN SEO KEYWORDS */}
        <div className="text-center space-y-4 max-w-3xl mx-auto py-8">
          <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 px-3 py-1 text-xs font-black uppercase tracking-[0.2em]">
            Ultimate AI Voice & Script Suite
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-foreground">
            Comprehensive{' '}
            <span className={`${pacificoFont.className} text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500`}>
              12 Labs
            </span>{' '}
            User Hub
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground/80 leading-relaxed font-medium">
            Learn how to use India's leading AI Text-to-Speech (TTS), multi-character script voiceover generators, regional dubbing, and custom voice cloning tools.
          </p>
        </div>

        {/* STEP BY STEP GUIDE SECTION */}
        <div className="p-6 md:p-10 rounded-[2rem] border border-border bg-card shadow-2xl relative overflow-hidden space-y-8">
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-purple-500/5 blur-[100px] rounded-full pointer-events-none" />

          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Official Platform Tutorial</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">
              Master Multi-Voice Generation in 4 Easy Steps
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
              From screenplay text to beautifully synchronized audio timeline masters. Learn how to craft content like a pro.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
            
            {/* STEP 1 */}
            <div className="p-6 rounded-2xl border border-border bg-muted hover:border-indigo-500/20 transition-all space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-indigo-500">01</span>
                <Badge className="bg-indigo-500/10 text-indigo-400 border-none font-bold text-[9px] uppercase tracking-wider">Format</Badge>
              </div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-wide">Prepare the Manuscript</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                Write or paste your dramatic script using the standard <code className="text-foreground font-mono bg-muted px-1 py-0.5 rounded">Character: Spoken Text</code> syntax. Keep narration clean and descriptive to maximize accuracy.
              </p>
            </div>

            {/* STEP 2 */}
            <div className="p-6 rounded-2xl border border-border bg-muted hover:border-indigo-500/20 transition-all space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-indigo-500">02</span>
                <Badge className="bg-indigo-500/10 text-indigo-400 border-none font-bold text-[9px] uppercase tracking-wider">Analyze</Badge>
              </div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-wide">Run Automated Parsing</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                Click **Analyze Script** to let our smart backend process characters, group dialogues, identify age-groups, and suggest optimal regional voice profiles.
              </p>
            </div>

            {/* STEP 3 */}
            <div className="p-6 rounded-2xl border border-border bg-muted hover:border-indigo-500/20 transition-all space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-indigo-500">03</span>
                <Badge className="bg-indigo-500/10 text-indigo-400 border-none font-bold text-[9px] uppercase tracking-wider">Customize</Badge>
              </div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-wide">Assign & Tune Voices</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                Select your preferred voice actor from our library of Premium, Standard, or Live models. Adjust vocal settings like pitch, velocity, or tone for exact match.
              </p>
            </div>

            {/* STEP 4 */}
            <div className="p-6 rounded-2xl border border-border bg-muted hover:border-indigo-500/20 transition-all space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-indigo-500">04</span>
                <Badge className="bg-indigo-500/10 text-indigo-400 border-none font-bold text-[9px] uppercase tracking-wider">Generate</Badge>
              </div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-wide">Synthesize & Download</h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                Click **Generate Voiceover** to render the complete unified audio master. Listen to the timeline synchronized, preview lines, and export high-fidelity MP3.
              </p>
            </div>

          </div>

          {/* SCRIPT FORMAT EXAMPLE */}
          <div className="pt-6 border-t border-border grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                Perfect Script Syntax Example
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                Keep character dialogues isolated and descriptive. For best emotional voice acting, split longer paragraphs into smaller interactive sentences:
              </p>
              <div className="p-4 rounded-xl border border-border bg-muted font-mono text-[11px] text-muted-foreground leading-relaxed">
                <p><strong className="text-foreground">Narrator:</strong> High above the Himalayan ridges, the ancient monastery stood silently.</p>
                <p className="mt-1"><strong className="text-foreground">Kabir:</strong> Have you ever stood here before Meera?</p>
                <p className="mt-1"><strong className="text-foreground">Meera:</strong> Only in my wildest dreams, Kabir. It is beautiful.</p>
              </div>
            </div>

            <div className="lg:col-span-7 p-6 rounded-2xl border border-border bg-muted space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Ready to start creating?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Access any of our specialized studio tools. We support full custom projects, immediate multi-language conversions, and real-time audio editing.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button asChild className="flex-1 justify-between h-11 rounded-xl font-black text-xs uppercase tracking-wider btn-shine bg-indigo-600 hover:bg-indigo-700">
                  <Link href="/studio">
                    Go to Voice Studio <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1 justify-between h-11 rounded-xl font-black text-xs uppercase tracking-wider border-border bg-transparent hover:bg-muted">
                  <Link href="/script-generator">
                    Go to Script Studio <FileText className="h-3.5 w-3.5 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* CREATOR TOOLS INDEX - SEARCHABLE CARDS */}
        <div id="directory" className="space-y-8">
          
          {/* SEARCH & FILTERS */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-border pb-6">
            <div className="space-y-1 text-center md:text-left">
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-foreground">
                12Labs Creator Workspaces Directory
              </h2>
              <p className="text-xs text-muted-foreground">
                Quickly search, filter, and launch specialized workflows to speed up your content creation.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              {/* SEARCH BOX */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search key features or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>

              {/* SITEMAP REF BUTTON FOR SEARCH CRAWLERS */}
              <Button asChild size="sm" variant="outline" className="h-10 rounded-xl font-bold text-xs border-border">
                <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">
                  Sitemap XML
                </a>
              </Button>
            </div>
          </div>

          {/* FILTER PILLS */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                  activeCategory === cat
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* BENTO GRID OF CAPABILITIES */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTools.flatMap(cat => cat.items).map((item) => {
              const IconComponent = item.icon;
              return (
                <Card key={item.id} className="rounded-3xl border-border bg-card overflow-hidden hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/[0.02] transition-all flex flex-col justify-between group">
                  <CardHeader className="p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <Badge className="bg-muted text-muted-foreground/80 border-border text-[9px] font-bold">
                        {item.path}
                      </Badge>
                    </div>

                    <div className="space-y-1.5">
                      <CardTitle className="text-lg font-black text-foreground uppercase tracking-tight group-hover:text-indigo-400 transition-colors">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground leading-relaxed font-medium">
                        {item.description}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="p-6 pt-0 space-y-4 border-t border-border mt-auto">
                    <div className="space-y-1.5 pt-4">
                      <h5 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Core Features</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {item.features.map((feature, idx) => (
                          <Badge key={idx} variant="outline" className="bg-muted border-border text-[9px] font-semibold text-muted-foreground">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h5 className="text-[9px] font-bold uppercase tracking-wider text-indigo-400/80">Search Tags</h5>
                      <p className="text-[10px] text-muted-foreground/60 leading-normal italic">
                        {item.keywords}
                      </p>
                    </div>

                    <div className="pt-2">
                      <Button asChild size="sm" className="w-full justify-between h-9 rounded-xl font-bold text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white">
                        <Link href={item.path}>
                          Launch Workspace <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

        </div>

        {/* INDUSTRIAL USE-CASES AND CORE SOLUTIONS */}
        <div className="space-y-6">
          <div className="text-center md:text-left space-y-2">
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-foreground">
              Professional Workflows & Verticals
            </h2>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Discover how different visual, media, and educational professionals utilize our suite for accelerated production pipelines.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {INDUSTRIES_DIRECTORY.map((ind, idx) => {
              const Icon = ind.icon;
              return (
                <div key={idx} className="p-6 rounded-3xl border border-border bg-card space-y-4 hover:border-indigo-500/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-foreground">{ind.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {ind.desc}
                  </p>
                  <div className="pt-2 border-t border-border">
                    <span className="text-[9px] uppercase font-bold text-indigo-400/80 tracking-wide">SEO Targets: </span>
                    <span className="text-[10px] font-mono text-muted-foreground">{ind.keywords}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COMPREHENSIVE LANGUAGE MATRIX (EXCELLENT FOR DIRECTORY SEARCH CRAWLING) */}
        <div className="p-6 md:p-10 rounded-[2rem] border border-border bg-card space-y-8">
          <div className="space-y-2">
            <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
              <Languages className="h-4 w-4" />
              Supported Indian Regional Languages & Dialect Profiles
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We offer advanced vocal synthesis across major Indian regional languages. Check our index of ready-to-use dialect variations:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {LANGUAGE_RESOURCES.map((lang, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-border bg-muted space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-foreground">{lang.lang}</span>
                  <Badge variant="outline" className="bg-card text-[9px] border-border text-indigo-400 font-bold">{lang.code}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  <strong className="text-muted-foreground">Profiles:</strong> {lang.accents}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* DETAILED USER FAQ SECTION - HIGH INDEXABILITY */}
        <div className="p-6 md:p-10 rounded-[2rem] border border-border bg-card space-y-8">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: [
                  {
                    '@type': 'Question',
                    name: 'What is TwelveLabs Voice Studio?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'TwelveLabs Voice Studio is a state-of-the-art AI-driven vocal dubbing, manuscript narration, and background scoring platform designed specifically for dramatic narrative producers and content localizers.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'How does the AI Script Analyzer work?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'When you submit a text manuscript, our script extraction model parses and cleans production notes (like camerawork/scene directions) and extracts characters, dialogs, and suggests best regional voice matches.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Do you support regional Indian accents?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes! We host a large roster of regional Indian accents (including Hindi, Bengali, Tamil, Telugu, Marathi, Kannada, Gujarati, and neutral English-Indian tones) for localized content production.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I clone my own voice?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Our Instant Voice Cloning tool allows you to upload a short, clean, noise-free audio clip of at least 15 seconds to instantly synthesize a realistic custom voice.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'What audio formats are provided?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'All voiceover synthesis output is exported in high-fidelity MP3 format. The platform also provides custom timelines so you can view timing details for professional video timeline editing.',
                    },
                  },
                  {
                    '@type': 'Question',
                    name: 'Can I use the generated voiceovers commercially?',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'Yes! All final synthesized files generated through our premium voice actors or cloning modules are ready for commercial projects, social media distribution, advertisements, and streaming.',
                    },
                  },
                ],
              }),
            }}
          />
          <div className="flex items-center gap-2.5">
            <HelpCircle className="h-5 w-5 text-indigo-400" />
            <h2 className="text-xl font-black uppercase tracking-tight text-foreground">Frequently Asked Questions (FAQ)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm leading-relaxed">
            
            <div className="space-y-1.5">
              <h4 className="font-bold text-foreground uppercase tracking-tight text-xs">Q: What is TwelveLabs Voice Studio?</h4>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                TwelveLabs Voice Studio is a state-of-the-art AI-driven vocal dubbing, manuscript narration, and background scoring platform designed specifically for dramatic narrative producers and content localizers.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-foreground uppercase tracking-tight text-xs">Q: How does the AI Script Analyzer work?</h4>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                When you submit a text manuscript, our script extraction model parses and cleans production notes (like camerawork/scene directions) and extracts characters, dialogs, and suggests best regional voice matches.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-foreground uppercase tracking-tight text-xs">Q: Do you support regional Indian accents?</h4>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Yes! We host a large roster of regional Indian accents (including Hindi, Bengali, Tamil, Telugu, Marathi, Kannada, Gujarati, and neutral English-Indian tones) for localized content production.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-foreground uppercase tracking-tight text-xs">Q: Can I clone my own voice?</h4>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Our **Instant Voice Cloning** tool allows you to upload a short, clean, noise-free audio clip of at least 15 seconds to instantly synthesize a realistic custom voice.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-foreground uppercase tracking-tight text-xs">Q: What audio formats are provided?</h4>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                All voiceover synthesis output is exported in high-fidelity MP3 format. The platform also provides custom timelines so you can view timing details for professional video timeline editing.
              </p>
            </div>

            <div className="space-y-1.5">
              <h4 className="font-bold text-foreground uppercase tracking-tight text-xs">Q: Can I use the generated voiceovers commercially?</h4>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Yes! All final synthesized files generated through our premium voice actors or cloning modules are ready for commercial projects, social media distribution, advertisements, and streaming.
              </p>
            </div>

          </div>
        </div>

      </main>

      <Footer />
    </div>
  );
}
