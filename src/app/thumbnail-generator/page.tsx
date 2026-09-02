'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pacifico } from 'next/font/google';
import { useAuth } from '@/context/auth-provider';

const pacifico = Pacifico({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { submitThumbnailRequestAction, removeThumbnailJobAction } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Youtube, 
  Download, 
  Copy, 
  Check, 
  Loader2, 
  Trash2, 
  Wand2, 
  SlidersHorizontal,
  Coins,
  Maximize2,
  X,
  Clock,
  CheckCircle2,
  ArrowRight,
  HelpCircle,
  FileText,
  Link2,
  MonitorPlay
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// Helper to extract YouTube Video ID
const extractYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

// Style options for thumbnail generation
const STYLE_OPTIONS = [
  { id: 'clickbait', label: '🔥 YouTube Clickbait (High CTR & Vivid)', promptSuffix: 'high contrast vibrant YouTube thumbnail style, expressive facial reaction, bright bold lighting, vivid saturated colors, eye-catching composition, trending on YouTube' },
  { id: 'cinematic', label: '🎬 Hyper-Realistic 8K Cinematic', promptSuffix: '8k resolution cinematic masterpiece, photorealistic, dramatic dynamic lighting, atmospheric depth, volumetric rays, high fidelity' },
  { id: '3d_animated', label: '✨ 3D Pixar / Disney Stylized', promptSuffix: '3d Pixar stylized animated aesthetic, cute expressive character design, smooth subsurface scattering, colorful studio lighting, octane render' },
  { id: 'dark_horror', label: '👻 Dark Mystery / Horror Thriller', promptSuffix: 'eerie ominous horror thriller aesthetic, dark moody lighting, deep shadows, cinematic mist, suspenseful focal point, 8k depth' },
  { id: 'anime_manga', label: '⚡ Anime & Manga Action Visual', promptSuffix: 'epic anime dynamic key visual, vibrant cel-shaded style, intense action lines, detailed anime illustration, ufotable aesthetic' },
  { id: 'modern_tech', label: '💻 Clean Minimalist & Tech', promptSuffix: 'sleek minimalist modern tech product aesthetic, clean studio background, elegant gradient illumination, apple design language, crisp focus' },
  { id: 'gaming_neon', label: '🎮 Gaming & Cyberpunk Neon', promptSuffix: 'cyberpunk neon glowing synthwave lighting, futuristic gaming atmosphere, high-energy particles, sharp metallic textures' },
];

const ASPECT_RATIO_CONFIGS: Record<string, { label: string; sub: string; width: number; height: number; aspectClass: string }> = {
  '16:9': { label: '16:9 Landscape', sub: 'YouTube Videos (1280×720)', width: 1280, height: 720, aspectClass: 'aspect-[16/9]' },
  '9:16': { label: '9:16 Portrait', sub: 'YouTube Shorts & Reels (720×1280)', width: 720, height: 1280, aspectClass: 'aspect-[9/16]' },
};

interface ActiveThumbnailJob {
  id: string;
  mappingId: string;
  title: string;
  prompt: string;
  referenceImageUrl?: string | null;
  ytLink?: string | null;
  aspectRatio: string;
  style: string;
  status: string;
  imageUrl?: string | null;
  imageDataUri?: string | null;
  thumbnailUrl?: string | null;
  cost?: number;
  createdAt?: string;
  timestamp?: number;
}

interface ThumbnailInfo {
  quality: string;
  resolution: string;
  url: string;
}

export default function ThumbnailGeneratorPage() {
  const { user, activeUid, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { database, firestore } = initializeFirebase();
  const router = useRouter();

  // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
  // silently rendering the full thumbnail generator while logged out.
  useEffect(() => {
    if (!authLoading && !user) {
      toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use the Thumbnail Generator.' });
      router.push('/login');
    }
  }, [authLoading, user, router, toast]);

  // Mode & Tabs
  const [activeTab, setActiveTab] = useState<'generate' | 'download'>('generate');

  // Form States
  const [ytLink, setYtLink] = useState('');
  const [extractedYtImage, setExtractedYtImage] = useState<string | null>(null);
  const [isExtractingYt, setIsExtractingYt] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('clickbait');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [showPromptInput, setShowPromptInput] = useState(false);
  
  // Downloader Tab States
  const [downloadYtLink, setDownloadYtLink] = useState('');
  const [downloaderThumbnails, setDownloaderThumbnails] = useState<ThumbnailInfo[]>([]);
  const [isFetchingDownloader, setIsFetchingDownloader] = useState(false);
  const [downloaderVideoTitle, setDownloaderVideoTitle] = useState('');

  // Generation & Realtime States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ActiveThumbnailJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<ActiveThumbnailJob[]>([]);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pricingNormal, setPricingNormal] = useState(500);

  // Check URL query parameters on load to auto-switch tab
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      if (mode === 'download') {
        setActiveTab('download');
      }
    }
  }, []);

  // Load dynamic pricing if available
  useEffect(() => {
    if (!database) return;
    const pricingRef = ref(database, 'settings/pricing');
    const unsub = onRtdbValue(pricingRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val.thumbnailNormal) setPricingNormal(Number(val.thumbnailNormal));
      }
    });
    return () => unsub();
  }, [database]);

  // YouTube Link Extraction
  const handleExtractYouTube = async (urlToExtract?: string) => {
    const targetUrl = urlToExtract || ytLink;
    const videoId = extractYouTubeVideoId(targetUrl);
    if (!videoId) {
      toast({
        variant: 'destructive',
        title: 'Invalid YouTube URL',
        description: 'Please paste a valid YouTube video link (e.g., https://youtube.com/watch?v=...).',
      });
      return;
    }

    setIsExtractingYt(true);
    try {
      // NOTE: We intentionally do NOT auto-fill the Title field from the
      // YouTube video's title anymore. Users were generating thumbnails
      // with the original video's exact title pasted in by accident.
      // The title box stays empty/user-controlled unless they type in it.

      // Check highest resolution thumbnail
      const maxResUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      setExtractedYtImage(maxResUrl);
      setShowPromptInput(true);
      toast({
        title: '✨ Reference Attached!',
        description: 'High-res frame extracted. Now type your OWN thumbnail title below — leave it empty for a text-free thumbnail.',
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Extraction Error',
        description: err.message || 'Could not extract YouTube video info.',
      });
    } finally {
      setIsExtractingYt(false);
    }
  };

  // YouTube Grab & Extract Handlers (Downloader Tab)
  const handleFetchDownloaderThumbnails = async () => {
    const videoId = extractYouTubeVideoId(downloadYtLink);
    if (!videoId) {
      toast({ variant: 'destructive', title: 'Invalid YouTube URL', description: 'Please enter a valid YouTube video link.' });
      return;
    }

    setIsFetchingDownloader(true);
    setDownloaderThumbnails([]);
    setDownloaderVideoTitle('');

    try {
      try {
        const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oEmbedUrl);
        if (response.ok) {
          const data = await response.json();
          setDownloaderVideoTitle(data.title);
        }
      } catch (e) {
        console.warn("Could not fetch video title.");
      }

      const qualities = [
        { quality: 'Maximum Resolution (4K/HD)', resolution: '1920x1080', url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` },
        { quality: 'High Definition (HQ)', resolution: '1280x720', url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` },
        { quality: 'Standard Quality (SD)', resolution: '640x480', url: `https://i.ytimg.com/vi/${videoId}/sddefault.jpg` },
        { quality: 'Medium Quality (MQ)', resolution: '320x180', url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` },
        { quality: 'Default Quality', resolution: '120x90', url: `https://i.ytimg.com/vi/${videoId}/default.jpg` },
      ];
      
      const validThumbnails: ThumbnailInfo[] = [];

      for (const thumb of qualities) {
        try {
          const response = await fetch(thumb.url, { method: 'HEAD' });
          const contentLength = response.headers.get('content-length');
          if (response.ok && contentLength && parseInt(contentLength) > 500) {
            validThumbnails.push(thumb);
          }
        } catch (e) {
          console.warn(`CORS verification note for: ${thumb.quality}`);
        }
      }

      // If HEAD verification yields zero due to client-side origin settings, populate with fallback default values
      if (validThumbnails.length === 0) {
        qualities.forEach(q => validThumbnails.push(q));
      }
      
      setDownloaderThumbnails(validThumbnails);
      toast({
        title: '✨ Thumbnails Extracted!',
        description: 'Retrieved available resolutions from YouTube server.',
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Extraction Error', description: error.message });
    } finally {
      setIsFetchingDownloader(false);
    }
  };

  const handleDownloadDirectly = async (url: string, quality: string) => {
    try {
      toast({ title: 'Preparing download file...' });
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadUrl;
      a.download = `12Labs_thumbnail_${quality.replace(/\s+/g, '_')}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      toast({ title: 'Download Successful!' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not execute direct download. Right click on image and select save image as.' });
    }
  };

  const handleRemixFromDownloader = (imageUrl: string, videoUrl: string, videoTitle: string) => {
    setYtLink(videoUrl);
    setExtractedYtImage(imageUrl);
    setShowPromptInput(true);
    setActiveTab('generate');
    toast({
      title: '🎨 Remix Active!',
      description: 'Image reference loaded. Type your own title/text for the new thumbnail below.',
    });
  };

  // Realtime Listener for Active & Recent Generations (Direct Firestore History Sync + Live Polling)
  useEffect(() => {
    if (!activeUid || !firestore) return;

    let unsubFs1 = () => {};
    let unsubFs2 = () => {};
    let unsubFs3 = () => {};
    let unsubFs4 = () => {};

    const parseThumbnailDoc = (docSnap: any): ActiveThumbnailJob | null => {
      const val = docSnap.data();
      if (!val) return null;
      const id = docSnap.id;
      const finalUrl = val.imageUrl || val.link || val.url || val.image || val.thumbnailUrl || val.outputUrl || val.mediaUrl || val.audioUrl || val.imageDataUri || null;
      const rawStatus = String(val.status || (finalUrl ? 'ready' : 'pending')).toLowerCase();
      const status = ['ready', 'ok', 'completed', 'done', 'success'].includes(rawStatus) || finalUrl ? 'ready' : rawStatus;

      const rawTime = val.timestamp || val.createdAt || val.queuedAt || val.updatedAt;
      let timestamp = Date.now();
      if (typeof rawTime === 'number') timestamp = rawTime;
      else if (typeof rawTime === 'string') {
        const parsed = new Date(rawTime).getTime();
        if (!isNaN(parsed)) timestamp = parsed;
      }

      return {
        id,
        mappingId: id,
        title: val.title || val.projectName || 'Thumbnail Project',
        prompt: val.prompt || '',
        referenceImageUrl: val.referenceImageUrl || val.sourceImageUrl || null,
        ytLink: val.ytLink || null,
        aspectRatio: val.aspectRatio || '16:9',
        style: val.style || 'Standard',
        status,
        imageUrl: finalUrl,
        imageDataUri: val.imageDataUri || null,
        thumbnailUrl: val.thumbnailUrl || null,
        cost: val.cost || 0,
        createdAt: val.createdAt,
        timestamp,
      };
    };

    const handleSnapshot = (snapshot: any) => {
      if (!snapshot || snapshot.empty) return;
      const incomingJobs: ActiveThumbnailJob[] = [];
      snapshot.forEach((docSnap: any) => {
        const parsed = parseThumbnailDoc(docSnap);
        if (parsed) incomingJobs.push(parsed);
      });

      setRecentJobs((prev) => {
        const map = new Map<string, ActiveThumbnailJob>();
        prev.forEach((p) => map.set(p.mappingId, p));
        incomingJobs.forEach((j) => {
          const existing = map.get(j.mappingId);
          if (!existing) {
            map.set(j.mappingId, j);
          } else {
            map.set(j.mappingId, {
              ...existing,
              ...j,
              imageUrl: j.imageUrl || existing.imageUrl || null,
              status: (j.imageUrl || existing.imageUrl || j.status === 'ready' || existing.status === 'ready') ? 'ready' : (j.status || existing.status),
            });
          }
        });
        const sorted = Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return sorted;
      });
    };

    // 1. thumbnail_projects/{activeUid}/userProjects (Snake case - used by Python backend)
    try {
      const q1 = query(collection(firestore, 'thumbnail_projects', activeUid, 'userProjects'), limit(30));
      unsubFs1 = onSnapshot(q1, handleSnapshot, (e) => console.warn('FS1 err', e));
    } catch (e) {}

    // 2. thumbnailProjects/{activeUid}/userProjects (Camel case)
    try {
      const q2 = query(collection(firestore, 'thumbnailProjects', activeUid, 'userProjects'), limit(30));
      unsubFs2 = onSnapshot(q2, handleSnapshot, (e) => console.warn('FS2 err', e));
    } catch (e) {}

    // 3. users/{activeUid}/thumbnails
    try {
      const q3 = query(collection(firestore, 'users', activeUid, 'thumbnails'), limit(30));
      unsubFs3 = onSnapshot(q3, handleSnapshot, (e) => console.warn('FS3 err', e));
    } catch (e) {}

    // 4. Root thumbnailProjects
    try {
      const q4 = query(collection(firestore, 'thumbnailProjects'), where('userId', '==', activeUid), limit(30));
      unsubFs4 = onSnapshot(q4, handleSnapshot, (e) => console.warn('FS4 err', e));
    } catch (e) {}

    // 5. RTDB tempThumbnailGenerations/{activeUid}
    let unsubRtdb = () => {};
    if (database) {
      try {
        const rtdbRef = ref(database, `tempThumbnailGenerations/${activeUid}`);
        unsubRtdb = onRtdbValue(rtdbRef, (snapshot) => {
          if (!snapshot.exists()) return;
          const val = snapshot.val();
          const incoming: ActiveThumbnailJob[] = [];
          Object.keys(val).forEach((key) => {
            const item = val[key];
            if (!item) return;
            const finalUrl = item.imageUrl || item.link || item.url || item.image || item.thumbnailUrl || item.outputUrl || item.mediaUrl || item.imageDataUri || null;
            const rawStatus = String(item.status || (finalUrl ? 'ready' : 'pending')).toLowerCase();
            const status = ['ready', 'ok', 'completed', 'done', 'success'].includes(rawStatus) || finalUrl ? 'ready' : rawStatus;
            incoming.push({
              id: key,
              mappingId: item.mappingId || key,
              title: item.title || item.projectName || 'Thumbnail Project',
              prompt: item.prompt || '',
              referenceImageUrl: item.referenceImageUrl || item.sourceImageUrl || null,
              ytLink: item.ytLink || null,
              aspectRatio: item.aspectRatio || '16:9',
              style: item.style || 'Standard',
              status,
              imageUrl: finalUrl,
              imageDataUri: item.imageDataUri || null,
              thumbnailUrl: item.thumbnailUrl || null,
              cost: item.cost || 0,
              createdAt: item.createdAt,
              timestamp: item.timestamp || Date.now(),
            });
          });
          if (incoming.length > 0) {
            setRecentJobs((prev) => {
              const map = new Map<string, ActiveThumbnailJob>();
              prev.forEach((p) => map.set(p.mappingId, p));
              incoming.forEach((j) => {
                const existing = map.get(j.mappingId);
                if (!existing) {
                  map.set(j.mappingId, j);
                } else {
                  map.set(j.mappingId, {
                    ...existing,
                    ...j,
                    imageUrl: j.imageUrl || existing.imageUrl || null,
                    status: (j.imageUrl || existing.imageUrl || j.status === 'ready' || existing.status === 'ready') ? 'ready' : (j.status || existing.status),
                  });
                }
              });
              return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });
          }
        });
      } catch (e) {}
    }

    return () => {
      unsubFs1();
      unsubFs2();
      unsubFs3();
      unsubFs4();
      unsubRtdb();
    };
  }, [activeUid, firestore, database]);

  // Keep activeJob synced with latest ready thumbnail from recentJobs
  useEffect(() => {
    if (recentJobs.length === 0) return;

    if (activeJobId) {
      const match = recentJobs.find((j) => j.mappingId === activeJobId);
      if (match) {
        setActiveJob(match);
        if (match.imageUrl) {
          setIsSubmitting(false);
        }
      }
    } else if (!activeJob || !activeJob.imageUrl) {
      // Find the first job that has an image, or default to the latest job
      const readyJob = recentJobs.find((j) => j.imageUrl) || recentJobs[0];
      if (readyJob) {
        setActiveJob(readyJob);
      }
    }
  }, [recentJobs, activeJobId, activeJob]);

  // Submit Thumbnail Request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to generate thumbnails.',
      });
      return;
    }

    if (!title.trim() && !ytLink.trim() && !prompt.trim()) {
      toast({
        variant: 'destructive',
        title: 'Input Missing',
        description: 'Please enter a video title, paste a YouTube link, or write a prompt.',
      });
      return;
    }

    const finalTitle = title.trim() || (ytLink.trim() ? 'YouTube Reference Thumbnail' : 'AI Thumbnail Project');
    // Separate from finalTitle: this is ONLY the text the user actually typed
    // into "Text to show on thumbnail". It stays empty when they leave that
    // field blank, so the image worker doesn't burn a placeholder project
    // name (like "AI Thumbnail Project") into every untitled thumbnail.
    const titleTextForImage = title.trim();
    const selectedStyleObj = STYLE_OPTIONS.find((s) => s.id === selectedStyle);
    
    let fullPrompt = '';
    if (extractedYtImage) {
      const userInstructions = prompt.trim();
      const hasCustomTitle = title.trim().length > 0;
      
      const titleInstruction = hasCustomTitle
        ? `TOP BANNER TITLE TEXT: Prominently write the title "${title.trim()}" at the top of the thumbnail image in huge, bold, high-contrast 3D YouTube thumbnail typography (vibrant white/yellow/red Hindi/English letters with thick black outlines and drop shadow, perfectly crisp and legible).`
        : `CLEAN TOP BANNER: Do not add unnecessary random text unless requested in instructions.`;

      const instructionText = userInstructions 
        ? `USER CREATIVE SPECIFICATIONS (HIGHEST PRIORITY): ${userInstructions}`
        : `CREATIVE COMPOSITION: Generate a fresh, eye-catching visual composition suitable for this topic. Retain the art and drawing style of the reference, but creatively vary character poses, expressions, clothing palettes, and scene layout to create a high-impact YouTube thumbnail rather than an exact copy.`;

      fullPrompt = `HIGH-CTR YOUTUBE THUMBNAIL REMIX SPECIFICATION:
1. ${titleInstruction}
2. ART STYLE CONSISTENCY: Match the signature illustration style, aesthetic texture, and lighting mood of the reference image.
3. CREATIVE SCENE COMPOSITION: Create an engaging, dynamic scene layout. Innovate with expressive character interactions, refreshed color tones, and cinematic depth tailored to the video's context.
4. USER INSTRUCTIONS: ${instructionText}
5. ZERO WATERMARKS: Strictly NO developer logos, AI badges, or corner watermark stamps anywhere in the image.`.trim();
    } else {
      const hasCustomTitle = title.trim().length > 0;
      const titleDirective = hasCustomTitle
        ? `Prominently write the title "${title.trim()}" at the top in big, bold, vibrant high-CTR YouTube thumbnail font with high-contrast outlines.`
        : ``;
      const userPrompt = prompt.trim() || `High-CTR vibrant YouTube thumbnail for video titled "${finalTitle}". Eye-catching visual composition, expressive characters, creative storytelling elements, clean professional lighting`;
      fullPrompt = `${userPrompt}. ${titleDirective} ${selectedStyleObj ? selectedStyleObj.promptSuffix : ''}. Absolutely no watermarks, no AI badges, no corner stamps.`.trim();
    }
    const ratioConfig = ASPECT_RATIO_CONFIGS[aspectRatio] || ASPECT_RATIO_CONFIGS['16:9'];

    setIsSubmitting(true);

    try {
      const res = await submitThumbnailRequestAction({
        userId: user.uid,
        userEmail: user.email || 'N/A',
        title: finalTitle,
        titleTextForImage,
        prompt: fullPrompt,
        referenceImageUrl: extractedYtImage || '',
        ytLink: ytLink.trim() || undefined,
        aspectRatio: aspectRatio as any,
        style: selectedStyleObj?.label || 'Custom',
        width: ratioConfig.width,
        height: ratioConfig.height,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to submit thumbnail request.');
      }

      if (res.mappingId) {
        setActiveJobId(res.mappingId);
        toast({
          title: '🚀 Synthesis Started!',
          description: `Generating high-CTR thumbnail (-${res.cost} credits)...`,
        });
      }
    } catch (error: any) {
      setIsSubmitting(false);
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error.message || 'Could not queue thumbnail generation.',
      });
    }
  };

  // Direct Image Download Trigger (via local proxy attachment stream - saves directly to device)
  const handleDownloadImage = async (imageUrl: string, filename: string) => {
    try {
      const cleanFilename = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}_thumbnail.png`;
      const downloadUrl = `/api/download-image?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(cleanFilename)}`;
      
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = downloadUrl;
      link.download = cleanFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({ title: '📥 Download Started', description: 'Saving image directly to your device.' });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Download Failed',
        description: 'Could not download the image.',
      });
    }
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast({ title: 'Image URL Copied!' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!user) return;
    try {
      await removeThumbnailJobAction(user.uid, jobId);
      if (activeJobId === jobId) setActiveJobId(null);
      toast({ title: 'Job Removed' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Delete Failed' });
    }
  };

  const currentRatio = ASPECT_RATIO_CONFIGS[aspectRatio] || ASPECT_RATIO_CONFIGS['16:9'];
  const isJobReady = Boolean(activeJob && (activeJob.imageUrl || ['ok', 'ready', 'completed', 'done', 'success'].includes(String(activeJob.status || '').toLowerCase())));
  const isJobProcessing = Boolean(activeJob && !activeJob.imageUrl && !isJobReady && (activeJob.status === 'processing' || activeJob.status === 'pending' || activeJob.status === 'in_queue'));

  if (authLoading || !user) {
    return (
        <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 selection:bg-[#9C27B0]/30 relative overflow-hidden">
      
      {/* Decorative Neural background orbs (matching Studio design) */}
      <div className="absolute top-[10%] -left-[10%] w-[450px] h-[450px] bg-gradient-to-tr from-purple-600/10 to-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[10%] -right-[10%] w-[500px] h-[500px] bg-gradient-to-tr from-[#1A237E]/10 to-[#9C27B0]/10 rounded-full blur-[160px] pointer-events-none" />
      
      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 relative z-10">
        
        {/* Unified Mode Toggle Tabs */}
        <div className="flex justify-center mb-8">
          <div className="grid grid-cols-2 p-1 bg-card rounded-2xl border border-border w-full max-w-md">
            <button
              onClick={() => setActiveTab('generate')}
              className={cn(
                "py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === 'generate'
                  ? "bg-gradient-to-r from-[#9C27B0] to-[#1A237E] text-white shadow-lg"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Studio Generator
            </button>
            <button
              onClick={() => setActiveTab('download')}
              className={cn(
                "py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === 'download'
                  ? "bg-gradient-to-r from-[#9C27B0] to-[#1A237E] text-white shadow-lg"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Download className="h-3.5 w-3.5" />
              Grab & Download
            </button>
          </div>
        </div>

        {activeTab === 'generate' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
            
            {/* LEFT FORM: Simple, Logical Flow (YouTube Link -> Title -> Prompt/Style -> Ratio) */}
            <div className="lg:col-span-6 space-y-4">
            
            <div className="p-5 sm:p-6 bg-card rounded-2xl border border-border shadow-2xl space-y-5">
              
              {/* 1. YouTube Video URL (TOP OPTION) */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-red-400">
                    <Youtube className="h-4 w-4" />
                    1. YouTube Video Link (Optional)
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">Reference & auto-fill</span>
                </label>

                <div className="flex gap-2">
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={ytLink}
                    onChange={(e) => {
                      setYtLink(e.target.value);
                      const vId = extractYouTubeVideoId(e.target.value);
                      if (vId) handleExtractYouTube(e.target.value);
                    }}
                    className="text-xs h-11 bg-muted border-border text-foreground placeholder:text-muted-foreground rounded-xl focus:border-[#9C27B0]"
                  />
                  <Button 
                    type="button" 
                    variant="secondary" 
                    size="sm" 
                    className="h-11 px-4 text-xs font-semibold shrink-0 bg-muted hover:bg-muted/70 text-foreground rounded-xl"
                    onClick={() => handleExtractYouTube()}
                    disabled={isExtractingYt || !ytLink.trim()}
                  >
                    {isExtractingYt ? <Loader2 className="h-4 w-4 animate-spin text-[#9C27B0]" /> : 'Fetch'}
                  </Button>
                </div>

                {/* Extracted Thumbnail Live Card */}
                {extractedYtImage && (
                  <div className="relative mt-2 rounded-xl overflow-hidden border border-border aspect-[16/9] bg-black/60 group">
                    <img 
                      src={extractedYtImage} 
                      alt="Extracted YouTube Thumbnail" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs gap-1 rounded-lg"
                        onClick={() => {
                          setExtractedYtImage(null);
                          setYtLink('');
                        }}
                      >
                        <X className="h-3 w-3" /> Remove
                      </Button>
                    </div>
                    <span className="absolute bottom-2 left-2 text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
                      ✓ Reference Active
                    </span>
                  </div>
                )}
              </div>

              {/* 2. Video Title or Topic */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center justify-between">
                  <span>2. Text to Show on Thumbnail (Optional)</span>
                  <span className="text-[10px] text-[#9C27B0] font-medium">Core Subject</span>
                </label>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Type exactly what you want written on the thumbnail image. Leave empty for a clean thumbnail with no text.
                </p>
                <Input
                  placeholder="e.g. GTA 6 Secret Mission Revealed! (leave empty for no text)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xs h-11 bg-muted border-border text-foreground placeholder:text-muted-foreground rounded-xl focus:border-[#9C27B0]"
                />
              </div>

              {/* 3. Remix Instructions or Custom Prompt */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[#9C27B0]" />
                    {extractedYtImage 
                      ? "3. Remix & Layout Modification Instructions (Recommended)" 
                      : "3. Custom Prompt / Creative Direction (Optional)"}
                  </label>
                  {!extractedYtImage && (
                    <button
                      type="button"
                      onClick={() => setShowPromptInput(!showPromptInput)}
                      className="text-[11px] text-[#9C27B0] hover:text-[#b149c4] font-medium underline-offset-2 hover:underline"
                    >
                      {showPromptInput ? 'Hide Prompt Box' : '+ Add Detailed Visual Prompt'}
                    </button>
                  )}
                </div>

                {(showPromptInput || extractedYtImage) ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder={extractedYtImage 
                        ? "Add custom visual instructions or creative changes (optional)..." 
                        : "Describe character expression, lighting, background objects, colors..."}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      className="text-xs bg-muted border-border text-foreground placeholder:text-muted-foreground rounded-xl leading-relaxed resize-none focus:border-[#9C27B0]"
                    />
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground bg-muted p-2.5 rounded-xl border border-border leading-normal">
                    {prompt.trim() ? (
                      <span className="text-[#9C27B0] truncate block">Prompt: {prompt}</span>
                    ) : (
                      'YouTube Link & Custom Prompt are both fully optional! If no link is provided, the thumbnail will be generated directly from your prompt or title.'
                    )}
                  </p>
                )}
              </div>

              {/* 4. Style Aesthetic Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[#9C27B0]" />
                  4. Visual Style Preset
                </label>
                <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                  <SelectTrigger className="text-xs h-11 bg-muted border-border text-foreground rounded-xl focus:ring-[#9C27B0]">
                    <SelectValue placeholder="Select Style" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    {STYLE_OPTIONS.map((style) => (
                      <SelectItem key={style.id} value={style.id} className="text-xs focus:bg-[#9C27B0] focus:text-white">
                        {style.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 5. Aspect Ratio (16:9 vs 9:16) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-foreground">
                  5. Canvas Size / Ratio
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {Object.entries(ASPECT_RATIO_CONFIGS).map(([key, config]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAspectRatio(key)}
                      className={cn(
                        "p-3 rounded-xl border text-left text-xs transition-all flex flex-col justify-between",
                        aspectRatio === key 
                          ? "border-[#9C27B0] bg-[#9C27B0]/15 text-[#9C27B0] font-semibold shadow-inner" 
                          : "border-border bg-muted/60 text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted"
                      )}
                    >
                      <span className="font-bold text-foreground">{config.label}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{config.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit CTA Button */}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || (!title.trim() && !ytLink.trim() && !prompt.trim())}
                className="w-full h-12 text-xs sm:text-sm font-bold gap-2 rounded-xl bg-gradient-to-r from-[#9C27B0] to-[#1A237E] hover:opacity-90 text-white shadow-xl shadow-[#9C27B0]/25 transition-all active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Thumbnail...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    Generate Thumbnail ({pricingNormal} Credits)
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* RIGHT COLUMN: Output Canvas & Live Render Stage */}
          <div className="lg:col-span-6 space-y-4">
            
            <div className="p-5 sm:p-6 bg-card rounded-2xl border border-border shadow-2xl min-h-[460px] flex flex-col justify-between">
              
              {/* Header of Preview Box */}
              <div className="flex items-center justify-between border-b border-border pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-[#9C27B0]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Live Thumbnail Stage
                  </span>
                </div>

                {activeJob && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] uppercase font-mono px-2 py-0.5",
                      isJobReady && "bg-emerald-950/80 text-emerald-300 border-emerald-500/40",
                      isJobProcessing && "bg-[#1A237E]/40 text-[#9C27B0] border-[#9C27B0]/40 animate-pulse"
                    )}
                  >
                    {activeJob.status}
                  </Badge>
                )}
              </div>

              {/* Center Content */}
              <div className="flex-1 flex flex-col items-center justify-center">
                
                {/* 1. In-Progress State */}
                {isJobProcessing && (
                  <div className="text-center space-y-4 py-12">
                    <div className="relative mx-auto w-16 h-16 rounded-2xl bg-[#9C27B0]/10 border border-[#9C27B0]/30 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-[#9C27B0] animate-spin" />
                      <div className="absolute inset-0 rounded-2xl border border-[#9C27B0]/30 animate-ping" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-foreground">Synthesizing High-Resolution Thumbnail</h3>
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                        Backend processing request. Image will appear automatically as soon as ready.
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. Ready State */}
                {isJobReady && (activeJob?.imageUrl || (activeJob as any)?.link || (activeJob as any)?.url || (activeJob as any)?.image) && (
                  <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-300">
                    <div className="relative w-full rounded-xl overflow-hidden border border-border shadow-2xl bg-black group">
                      <div className={cn("w-full relative", currentRatio.aspectClass)}>
                        <img
                          src={activeJob?.imageUrl || (activeJob as any)?.link || (activeJob as any)?.url || (activeJob as any)?.image || ''}
                          alt={activeJob?.title || 'Generated Thumbnail'}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Hover Fullscreen */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                        <div className="text-white text-xs font-semibold truncate max-w-[70%]">
                          {activeJob.title}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 text-xs gap-1.5 bg-white/90 text-black hover:bg-white rounded-lg font-bold"
                          onClick={() => setFullscreenImage(activeJob.imageUrl || (activeJob as any).link || (activeJob as any).url || (activeJob as any).image)}
                        >
                          <Maximize2 className="h-3.5 w-3.5" /> View Full
                        </Button>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-foreground truncate max-w-[260px]">{activeJob.title}</p>
                        <p className="text-[10px] text-muted-foreground">{activeJob.aspectRatio} • {activeJob.style}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs gap-1.5 rounded-xl border-border bg-muted hover:bg-muted/60 text-foreground"
                          onClick={() => handleCopyUrl(activeJob.imageUrl!, activeJob.mappingId)}
                        >
                          {copiedId === activeJob.mappingId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          Copy Link
                        </Button>

                        <Button
                          size="sm"
                          className="h-9 text-xs gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/20"
                          onClick={() => handleDownloadImage(activeJob.imageUrl!, activeJob.title)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download HD
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Empty / Initial State */}
                {!isJobProcessing && !isJobReady && (
                  <div className="text-center space-y-3 py-16 text-muted-foreground">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-muted/80 border border-border flex items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">Ready to Generate</p>
                      <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                        Paste a YouTube video link or type a topic title on the left to synthesize your thumbnail.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Info */}
              <div className="pt-4 border-t border-border mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> 100% YouTube CTR Optimized
                </span>
                <span>Auto-refreshes in real-time</span>
              </div>
            </div>

            {/* Recent Generations Grid */}
            {recentJobs.length > 0 && (
              <div className="p-4 bg-card rounded-2xl border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#9C27B0]" />
                    Recent Thumbnails ({recentJobs.length})
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {recentJobs.map((job) => {
                    const jobImg = job.imageUrl || (job as any).link || (job as any).url || (job as any).image || (job as any).thumbnailUrl;
                    const isJobDone = Boolean(jobImg || ['ok', 'ready', 'completed', 'done', 'success'].includes(String(job.status || '').toLowerCase()));
                    return (
                      <div
                        key={job.mappingId}
                        onClick={() => {
                          setActiveJobId(job.mappingId);
                          setActiveJob({
                            ...job,
                            imageUrl: jobImg || job.imageUrl,
                            status: isJobDone ? 'ready' : job.status,
                          });
                        }}
                        className={cn(
                          "relative rounded-xl overflow-hidden border p-2 bg-muted/60 cursor-pointer transition-all hover:bg-muted group",
                          activeJob?.mappingId === job.mappingId 
                            ? "border-[#9C27B0] ring-2 ring-[#9C27B0]/30" 
                            : "border-border hover:border-muted-foreground/50"
                        )}
                      >
                        <div className="aspect-[16/9] w-full rounded-lg bg-black/60 overflow-hidden relative mb-1.5">
                          {jobImg ? (
                            <img 
                              src={jobImg} 
                              alt={job.title} 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin text-[#9C27B0]" />
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteJob(job.mappingId);
                            }}
                            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/80 text-white/80 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </div>

                        <p className="text-[11px] font-semibold text-foreground truncate">{job.title}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center justify-between mt-0.5">
                          <span>{job.aspectRatio}</span>
                          <span className="capitalize text-[#9C27B0]">{job.status}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
        ) : (
          /* =========================================================================
             📥 TAB 2: GRAB & DOWNLOAD YOUTUBE THUMBNAILS WITH ONE-CLICK DOWNLOAD & REMIX
             ========================================================================= */
          <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-300">
            <Card className="border border-border/60 shadow-2xl shadow-primary/5 overflow-hidden rounded-[2.5rem] bg-card/90 backdrop-blur-3xl">
              <CardHeader className="text-center pt-10 pb-6">
                <div className="mx-auto bg-red-600/10 p-5 rounded-[2rem] w-fit mb-4 border border-red-500/20">
                  <Youtube className="h-12 w-12 text-[#FF0000]" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase leading-tight text-foreground">
                  YouTube Thumbnail <span className="text-[#9C27B0]">Extractor</span>
                </h2>
                <p className="text-xs sm:text-sm max-w-md mx-auto mt-2 font-bold text-muted-foreground leading-relaxed uppercase tracking-wider">
                  Grab crystal clear 4K & HD original thumbnails from any YouTube video instantly. No login, no limits.
                </p>
              </CardHeader>
              <CardContent className="max-w-2xl mx-auto pb-12">
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative flex-grow w-full group">
                    <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-[#9C27B0]" />
                    <Input
                      type="text"
                      placeholder="Paste YouTube video URL here..."
                      value={downloadYtLink}
                      onChange={(e) => setDownloadYtLink(e.target.value)}
                      disabled={isFetchingDownloader}
                      className="pl-12 h-14 text-xs sm:text-sm bg-muted/40 border-border/60 text-foreground placeholder:text-muted-foreground rounded-xl focus-visible:ring-[#9C27B0] focus-visible:ring-offset-0 focus:border-[#9C27B0]"
                      onKeyPress={(e) => e.key === 'Enter' && handleFetchDownloaderThumbnails()}
                    />
                  </div>
                  <Button 
                    onClick={handleFetchDownloaderThumbnails} 
                    disabled={isFetchingDownloader || !downloadYtLink.trim()} 
                    className="h-14 px-8 rounded-xl shadow-xl transition-all font-black text-xs sm:text-sm uppercase tracking-tight bg-[#9C27B0] hover:bg-[#9C27B0]/90 text-white gap-2 w-full sm:w-auto shrink-0 animate-shimmer"
                  >
                    {isFetchingDownloader ? <Loader2 className="h-5 w-5 animate-spin" /> : <MonitorPlay className="h-5 w-5" />}
                    Get HD
                  </Button>
                </div>
              </CardContent>
            </Card>

            {isFetchingDownloader && (
              <div className="text-center py-16 animate-in fade-in">
                <Loader2 className="h-12 w-12 animate-spin text-[#9C27B0] mx-auto mb-4" />
                <p className="text-sm font-black text-muted-foreground animate-pulse uppercase tracking-wider">Analyzing YouTube server frames...</p>
              </div>
            )}

            {downloaderThumbnails.length > 0 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
                <div className="flex flex-col gap-1 items-center text-center">
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight flex items-center gap-2 text-foreground">
                    <ImageIcon className="text-[#9C27B0] h-5 w-5" /> 
                    <span>Available Resolutions</span>
                  </h3>
                  {downloaderVideoTitle && (
                    <p className="text-muted-foreground font-bold max-w-2xl text-xs sm:text-sm italic opacity-80 px-4">&quot;{downloaderVideoTitle}&quot;</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {downloaderThumbnails.map((thumb, index) => (
                    <Card key={thumb.quality} className={cn(
                      "group overflow-hidden transition-all duration-500 border border-border/60 bg-card/90 backdrop-blur-3xl rounded-[2rem]",
                      index === 0 && "md:col-span-2 border-[#9C27B0]/40 shadow-xl shadow-[#9C27B0]/5"
                    )}>
                      <CardContent className="p-0 relative">
                        <div className="relative aspect-video w-full bg-muted">
                          <img 
                            src={thumb.url} 
                            alt={`${thumb.quality} YouTube thumbnail`} 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                          />
                          <div className="absolute top-4 left-4">
                            <Badge className="bg-black/80 backdrop-blur-md border border-border/60 text-white font-mono text-[10px] py-1 px-3 rounded-lg">
                              {thumb.resolution}
                            </Badge>
                          </div>
                          {index === 0 && (
                            <div className="absolute top-4 right-4">
                              <Badge className="bg-[#9C27B0] text-white font-black shadow-lg px-4 py-1 tracking-wider text-[9px] uppercase rounded-full">MAX RES</Badge>
                            </div>
                          )}
                        </div>
                        <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-card gap-3 border-t border-border/60">
                          <div>
                            <h4 className="font-black text-base sm:text-lg tracking-tight uppercase leading-none text-foreground">{thumb.quality}</h4>
                            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1.5">Resolution {thumb.resolution}</p>
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="rounded-xl px-4 h-10 text-[10px] uppercase font-bold tracking-wider border-border/60 bg-muted/40 hover:bg-muted/60 text-foreground gap-1.5 w-1/2 sm:w-auto" 
                              onClick={() => handleRemixFromDownloader(thumb.url, downloadYtLink, downloaderVideoTitle)}
                            >
                              <Wand2 className="h-3.5 w-3.5 text-[#9C27B0]" /> Remix
                            </Button>
                            <Button 
                              size="sm" 
                              className="rounded-xl px-4 h-10 text-[10px] uppercase font-bold tracking-wider bg-[#1A237E] hover:bg-[#1A237E]/90 text-white gap-1.5 w-1/2 sm:w-auto" 
                              onClick={() => handleDownloadDirectly(thumb.url, thumb.quality)}
                            >
                              <Download className="h-3.5 w-3.5" /> Download
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Elegant guidelines section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="p-5 bg-card/90 backdrop-blur-3xl rounded-2xl border border-border/60">
                <p className="font-bold text-[#9C27B0] text-xs sm:text-sm uppercase mb-1">1. Paste link</p>
                <p className="text-[11px] text-muted-foreground">Put any YouTube video link inside the box and extract immediate server images.</p>
              </div>
              <div className="p-5 bg-card/90 backdrop-blur-3xl rounded-2xl border border-border/60">
                <p className="font-bold text-[#9C27B0] text-xs sm:text-sm uppercase mb-1">2. Download directly</p>
                <p className="text-[11px] text-muted-foreground">Save original high-resolution thumbnail images to your device with one single click.</p>
              </div>
              <div className="p-5 bg-card/90 backdrop-blur-3xl rounded-2xl border border-border/60">
                <p className="font-bold text-[#9C27B0] text-xs sm:text-sm uppercase mb-1">3. Remix in Studio</p>
                <p className="text-[11px] text-muted-foreground">Want an improved version? Hit remix to generate an outstanding custom variant using AI.</p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Fullscreen Lightbox Modal */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl border border-white/20">
            <img 
              src={fullscreenImage} 
              alt="Fullscreen Thumbnail View" 
              className="w-full h-auto max-h-[85vh] object-contain"
            />
            <button
              onClick={() => setFullscreenImage(null)}
              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/80 text-white flex items-center justify-center hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

