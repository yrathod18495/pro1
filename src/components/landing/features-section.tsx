'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Lock,
  EyeOff,
  Sparkles,
  Mic,
  FileText,
  Video,
  ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { initializeFirebase } from '@/firebase';
import { onValue, ref } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useAuth } from '@/context/auth-provider';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { reportClientError } from '@/lib/report-client-error';

export type ToolCategory = 'all' | 'voice' | 'content' | 'visual' | 'store';

export interface ToolItem {
  id: string;
  /** Emoji shown in the tool tile (Option A — 3D-style system emoji). */
  emoji: string;
  /** Optional real icon image (SVG/PNG path) shown instead of the emoji. */
  iconSrc?: string;
  /** Soft tint (Tailwind bg-* class) behind the emoji. */
  tint: string;
  title: string;
  desc: string;
  category: ToolCategory;
  link: string;
  badge?: string;
}

/**
 * 🛠️ 12LABS PRODUCTION TOOLS SUITE
 */
export const tools: ToolItem[] = [
  {
    id: 'ai-script-studio',
    emoji: '📝',
    tint: 'bg-amber-100 dark:bg-amber-500/15',
    title: 'SCRIPT AI',
    desc: 'Multi-scene scripts & viral stories',
    category: 'content',
    link: '/script-generator',
  },
  {
    id: 'ai-voice-studio',
    emoji: '🎙️',
    tint: 'bg-blue-100 dark:bg-blue-500/15',
    title: 'VOICE STUDIO',
    desc: 'HQ multi-character voice dubbing',
    category: 'voice',
    link: '/studio',
  },
  {
    id: 'thumbnail-generator',
    emoji: '🖼️',
    tint: 'bg-pink-100 dark:bg-pink-500/15',
    title: 'THUMBNAIL AI',
    desc: 'High-CTR YouTube thumbnail generator',
    category: 'visual',
    link: '/thumbnail-generator',
    badge: 'NEW',
  },
  {
    id: 'music-studio',
    emoji: '🎵',
    tint: 'bg-violet-100 dark:bg-violet-500/15',
    title: 'MUSIC AI',
    desc: 'Original AI tracks & soundscapes',
    category: 'voice',
    link: '/music-studio',
  },
  {
    id: 'voice-cloning',
    emoji: '🧬',
    tint: 'bg-green-100 dark:bg-green-500/15',
    title: 'VOICE CLONE',
    desc: 'Instant voice persona cloning',
    category: 'voice',
    link: '/voice-cloning',
  },
  {
    id: 'music-library',
    emoji: '🎼',
    tint: 'bg-rose-100 dark:bg-rose-500/15',
    title: 'MUSIC LIB',
    desc: 'Royalty-free background tracks',
    category: 'voice',
    link: '/music-library',
  },
  {
    id: 'sound-effect-search',
    emoji: '🔊',
    tint: 'bg-orange-100 dark:bg-orange-500/15',
    title: 'SFX LIB',
    desc: 'Instant cinematic sound effects',
    category: 'voice',
    link: '/sound-search',
  },
  {
    id: 'store',
    emoji: '🛒',
    tint: 'bg-teal-100 dark:bg-teal-500/15',
    title: 'STORE',
    desc: 'Creator digital marketplace',
    category: 'store',
    link: '/store',
  },
  {
    id: 'seller-hub',
    emoji: '🏪',
    tint: 'bg-indigo-100 dark:bg-indigo-500/15',
    title: 'SELLER HUB',
    desc: 'Monetize scripts & voice packs',
    category: 'store',
    link: '/seller',
  },
  {
    id: 'pdf-tools',
    emoji: '📕',
    iconSrc: '/icons/pdf-file-icon.svg',
    tint: 'bg-red-100 dark:bg-red-500/15',
    title: 'PDF STUDIO',
    desc: 'Extract, merge & synthesize scripts',
    category: 'content',
    link: '/pdf-tools',
  },
];

interface ToolSetting {
  locked: boolean;
  discount?: string;
}

interface PricingConfig {
  studioNormal: number;
  studioDiscounted: number;
  script10Normal: number;
  script10Discounted: number;
}

const CATEGORIES: { id: ToolCategory; label: string; icon: any }[] = [
  { id: 'all', label: 'All Tools', icon: Sparkles },
  { id: 'voice', label: 'Voice & Audio', icon: Mic },
  { id: 'content', label: 'Script & AI', icon: FileText },
  { id: 'visual', label: 'Visuals & Video', icon: Video },
  { id: 'store', label: 'Marketplace', icon: ShoppingBag },
];

function ToolCardNode({
  tool,
  isHidden,
  isLockedForUsers,
  index,
  discount,
}: {
  tool: ToolItem;
  isHidden: boolean;
  isLockedForUsers?: boolean;
  index: number;
  discount?: string | null;
}) {
  const badgeText = discount || tool.badge;

  return (
    <div className="flex flex-col items-center w-full">
      <Link 
        href={tool.link} 
        className={cn(
          "group relative flex flex-col items-center text-center w-full p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl transition-all duration-200 select-none",
          "hover:bg-muted/30 active:scale-95",
          isHidden && "opacity-40 grayscale pointer-events-none",
          isLockedForUsers && "bg-amber-500/5 dark:bg-amber-500/10 border-2 border-dashed border-amber-500/40 p-2 sm:p-3"
        )}
      >
        {/* Discount / Status Badge */}
        {badgeText && !isLockedForUsers && (
          <div className="absolute -top-1 right-1 sm:right-2 z-20 pointer-events-none">
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black tracking-tight uppercase shadow-xs border",
              badgeText.includes('OFF') 
                ? "bg-rose-500 text-white border-rose-600" 
                : "bg-purple-600 text-white border-purple-700"
            )}>
              {badgeText}
            </span>
          </div>
        )}

        {/* Emoji tile (Option A). A soft, per-tool tinted rounded square
            with a 3D system emoji inside — colourful and lively like the
            original set, but consistent (all system emoji, nothing
            hot-linked that can break). The inset shadow gives the tile a
            gentle raised feel. */}
        <motion.div 
          whileHover={{ scale: 1.06, y: -2 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className={cn(
            "relative w-14 h-14 sm:w-16 sm:h-16 md:w-[68px] md:h-[68px] mb-2",
            "flex items-center justify-center rounded-2xl",
            tool.tint,
            "shadow-[inset_0_-3px_8px_rgba(0,0,0,0.06),0_4px_10px_rgba(0,0,0,0.05)]",
            isLockedForUsers && "opacity-80"
          )}
        >
          {tool.iconSrc ? (
            <img
              src={tool.iconSrc}
              alt={tool.title}
              className={cn(
                "w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 object-contain transition-transform duration-200 group-hover:scale-110",
                "drop-shadow-sm"
              )}
            />
          ) : (
            <span
              className={cn(
                "text-2xl sm:text-3xl md:text-[32px] leading-none transition-transform duration-200 group-hover:scale-110",
                "drop-shadow-sm"
              )}
              role="img"
              aria-label={tool.title}
            >
              {tool.emoji}
            </span>
          )}

          {isHidden && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center rounded-2xl">
              <Lock className="h-4 w-4 text-white drop-shadow-sm" />
            </div>
          )}

          {isLockedForUsers && (
            <div className="absolute -top-1 -right-1 bg-amber-500 text-black rounded-full p-1 shadow-sm border border-black/10">
              <EyeOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </div>
          )}
        </motion.div>

        {/* Title & Admin Hidden Badge */}
        <div className="w-full">
          <span className="block text-[10px] sm:text-xs md:text-[13px] font-extrabold uppercase tracking-tight text-foreground/90 group-hover:text-primary transition-colors truncate px-0.5 leading-tight">
            {tool.title}
          </span>
          {isLockedForUsers && (
            <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 mt-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-black text-[7px] sm:text-[8px] uppercase tracking-wider shadow-2xs">
              <Lock className="w-2 h-2 text-amber-500 shrink-0" /> HIDDEN (ADMIN)
            </span>
          )}
        </div>

      </Link>
    </div>
  );
}

export function FeaturesSection() {
  const { user } = useAuth();
  const [toolSettingsData, setToolSettingsData] = useState<Record<string, { hidden?: boolean; locked?: boolean }>>({});
  const [toolSettingsLoaded, setToolSettingsLoaded] = useState(false);
  const [pricingData, setPricingData] = useState<PricingConfig | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory>('all');
  const sectionRef = useRef<HTMLElement>(null);
  const isAdmin = user?.role === 'admin';

  // Load Firebase tool settings & pricing in background without blocking initial render
  useEffect(() => {
    try {
      const { database } = initializeFirebase();
      if (!database) return;

      // NOTE: the actual RTDB nodes are 'toolSettings' (camelCase) and
      // 'settings/pricing' — this previously pointed at 'tool_settings' and
      // 'pricing_config', which don't exist in the database rules at all,
      // so every read here was permanently denied (permission_denied).
      const settingsRef = ref(database, 'toolSettings');
      const unsubscribeSettings = onRtdbValue(
        settingsRef,
        (snapshot) => {
          if (snapshot.exists()) {
            setToolSettingsData(snapshot.val());
          }
          // Fires on every update, including "no data at this path" — that's
          // still a real answer (nothing is locked), and is what lets the
          // grid render immediately below instead of waiting forever.
          setToolSettingsLoaded(true);
        },
        (err) => {
          setToolSettingsLoaded(true);
          if (err?.message?.includes('permission_denied')) return;
          console.warn('Tool settings sync warning:', err);
        }
      );

      const pricingRef = ref(database, 'settings/pricing');
      const unsubscribePricing = onRtdbValue(
        pricingRef,
        (snapshot) => {
          if (snapshot.exists()) {
            setPricingData(snapshot.val());
          }
        },
        (err) => {
          if (err?.message?.includes('permission_denied')) return;
          console.warn('Pricing sync warning:', err);
        }
      );

      return () => {
        unsubscribeSettings();
        unsubscribePricing();
      };
    } catch (e) {
        reportClientError('src/components/landing/features-section.tsx:323', e);
      console.warn('Firebase init warning:', e);
    }
  }, []);

  // Helper function to get the discount label for a tool
  const getDiscountLabel = (toolId: string): string | null => {
    if (!pricingData) return null;

    if (toolId === 'ai-voice-studio') {
      const { studioNormal, studioDiscounted } = pricingData;
      if (studioNormal && studioDiscounted && studioDiscounted < studioNormal) {
        const percent = Math.round(((studioNormal - studioDiscounted) / studioNormal) * 100);
        return `${percent}% OFF`;
      }
    } else if (toolId === 'ai-script-studio') {
      const { script10Normal, script10Discounted } = pricingData;
      if (script10Normal && script10Discounted && script10Discounted < script10Normal) {
        const percent = Math.round(((script10Normal - script10Discounted) / script10Normal) * 100);
        return `${percent}% OFF`;
      }
    }
    return null;
  };

  const visibleTools = useMemo(() => {
    let filtered = [...tools];
    if (!isAdmin && !user?.isSeller) {
      filtered = filtered.filter((t) => t.id !== 'seller-hub');
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((t) => t.category === selectedCategory);
    }
    return filtered;
  }, [isAdmin, user?.isSeller, selectedCategory]);

  return (
    <section id="tools" ref={sectionRef} className="w-full py-12 md:py-20 bg-background border-t border-border/40 relative z-10">
      <div className="container px-4 md:px-6 mx-auto">
        
        {/* Headline Section */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '300px 0px -5% 0px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-3 mx-auto"
          >
            <Sparkles className="w-3.5 h-3.5" /> Complete Creator Suite
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '300px 0px -5% 0px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.05 }}
            className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground font-headline"
          >
            Explore All Studio <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Powerhouses</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '300px 0px -5% 0px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
            className="text-muted-foreground text-xs sm:text-sm font-medium max-w-lg mx-auto mt-2"
          >
            Instant voice dubbing, cinematic scripts, background music, and video graphics in one cohesive workspace.
          </motion.p>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-5">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200",
                    isSelected 
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105" 
                      : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Studio Tools Grid - 4 per row.
            No entrance/exit animation and no rendering until
            toolSettingsData has actually loaded — previously every tile
            animated in optimistically "unlocked", and any tile the admin
            had locked would then vanish out from under the user the
            instant the real settings arrived. Waiting for
            toolSettingsLoaded means a locked tool is simply never shown,
            instead of showing then disappearing. */}
        <div className="max-w-5xl mx-auto">
          {!toolSettingsLoaded ? (
            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6 gap-x-1.5 sm:gap-x-3 md:gap-x-5 gap-y-4 sm:gap-y-6">
              {visibleTools.map((tool) => (
                <div key={tool.id} className="flex flex-col items-center w-full p-1.5 sm:p-2.5">
                  <Skeleton className="w-14 h-14 sm:w-16 sm:h-16 md:w-[68px] md:h-[68px] rounded-2xl mb-2" />
                  <Skeleton className="h-3 w-3/4 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6 gap-x-1.5 sm:gap-x-3 md:gap-x-5 gap-y-4 sm:gap-y-6">
              {visibleTools.map((tool, index) => {
                const isLocked = toolSettingsData?.[tool.id]?.locked === true || 
                  (tool.id === 'youtube-thumbnail-downloader' && toolSettingsData?.['thumbnail-generator']?.locked === true);
                if (isLocked && !isAdmin) return null;

                return (
                  <ToolCardNode
                    key={tool.id}
                    tool={tool}
                    isHidden={isLocked && !isAdmin}
                    isLockedForUsers={isLocked && isAdmin}
                    index={index}
                    discount={getDiscountLabel(tool.id)}
                  />
                );
              })}
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
