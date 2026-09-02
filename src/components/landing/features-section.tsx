'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Lock,
  EyeOff,
  Sparkles,
  Mic,
  Music,
  FileText,
  Video,
  ShoppingBag
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { initializeFirebase } from '@/firebase';
import { onValue, ref } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useAuth } from '@/context/auth-provider';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

export type ToolCategory = 'all' | 'voice' | 'content' | 'visual' | 'store';

export interface ToolItem {
  id: string;
  iconUrl: string;
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
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Scroll/3D/scroll_3d.png',
    title: 'SCRIPT AI',
    desc: 'Multi-scene scripts & viral stories',
    category: 'content',
    link: '/script-generator',
  },
  {
    id: 'ai-voice-studio',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Studio%20microphone/3D/studio_microphone_3d.png',
    title: 'VOICE STUDIO',
    desc: 'HQ multi-character voice dubbing',
    category: 'voice',
    link: '/studio',
  },
  {
    id: 'pro-studio',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Star/3D/star_3d.png',
    title: 'PRO STUDIO',
    desc: 'Ultra expressiveness & custom pacing',
    category: 'voice',
    link: '/pro-studio',
  },
  {
    id: 'thumbnail-generator',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Framed%20picture/3D/framed_picture_3d.png',
    title: 'THUMBNAIL AI',
    desc: 'High-CTR YouTube thumbnail generator',
    category: 'visual',
    link: '/thumbnail-generator',
    badge: 'NEW',
  },
  {
    id: 'music-studio',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Musical%20note/3D/musical_note_3d.png',
    title: 'MUSIC AI',
    desc: 'Original AI tracks & soundscapes',
    category: 'voice',
    link: '/music-studio',
  },
  {
    id: 'voice-cloning',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Speaker%20high%20volume/3D/speaker_high_volume_3d.png',
    title: 'VOICE CLONE',
    desc: 'Instant voice persona cloning',
    category: 'voice',
    link: '/voice-cloning',
  },
  {
    id: 'music-library',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Closed%20book/3D/closed_book_3d.png',
    title: 'MUSIC LIB',
    desc: 'Royalty-free background tracks',
    category: 'voice',
    link: '/music-library',
  },
  {
    id: 'sound-effect-search',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Megaphone/3D/megaphone_3d.png',
    title: 'SFX LIB',
    desc: 'Instant cinematic sound effects',
    category: 'voice',
    link: '/sound-search',
  },
  {
    id: 'youtube-seo-kit',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Magnifying%20glass%20tilted%20right/3D/magnifying_glass_tilted_right_3d.png',
    title: 'SEO KIT',
    desc: 'Tags, keywords & ranking tools',
    category: 'content',
    link: '/seo-kit',
  },
  {
    id: 'chatterbox-studio',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Brain/3D/brain_3d.png',
    title: 'NEW AI STUDIO',
    desc: 'Expressive synthesis & dialogue flow',
    category: 'voice',
    link: '/new-ai-studio',
  },
  {
    id: 'store',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Shopping%20cart/3D/shopping_cart_3d.png',
    title: 'STORE',
    desc: 'Creator digital marketplace',
    category: 'store',
    link: '/store',
  },
  {
    id: 'seller-hub',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Convenience%20store/3D/convenience_store_3d.png',
    title: 'SELLER HUB',
    desc: 'Monetize scripts & voice packs',
    category: 'store',
    link: '/seller',
  },
  {
    id: 'youtube-transcript',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Rolled-up%20newspaper/3D/rolled-up_newspaper_3d.png',
    title: 'TRANSCRIPT',
    desc: 'Instant video subtitle extractor',
    category: 'content',
    link: '/youtube-transcript',
  },
  {
    id: 'text-to-video',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Film%20frames/3D/film_frames_3d.png',
    title: 'TEXT TO VIDEO',
    desc: 'AI visual scene & storyboard',
    category: 'visual',
    link: '/text-to-video',
  },
  {
    id: 'pdf-tools',
    iconUrl: 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Page%20facing%20up/3D/page_facing_up_3d.png',
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
  chatterboxNormal: number;
  chatterboxDiscounted: number;
  proStudioNormal: number;
  proStudioDiscounted: number;
  seoNormal: number;
  seoDiscounted: number;
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
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25, delay: index * 0.015 }}
      className="flex flex-col items-center w-full"
    >
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

        {/* 3D Icon Container - Balanced compact sizing for 4-in-a-row */}
        <motion.div 
          whileHover={{ scale: 1.08, y: -2 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="relative w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 flex items-center justify-center mb-1.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={tool.iconUrl} 
            alt={tool.title || 'Tool'}
            className={cn(
              "w-full h-full object-contain drop-shadow-sm group-hover:drop-shadow-md transition-all duration-200",
              isLockedForUsers && "opacity-80"
            )}
            loading="eager"
            decoding="async"
          />

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
    </motion.div>
  );
}

export function FeaturesSection() {
  const { user } = useAuth();
  const [toolSettingsData, setToolSettingsData] = useState<Record<string, { hidden?: boolean; locked?: boolean }>>({});
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
        },
        (err) => {
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
    } else if (toolId === 'pro-studio') {
      const { proStudioNormal, proStudioDiscounted } = pricingData;
      if (proStudioNormal && proStudioDiscounted && proStudioDiscounted < proStudioNormal) {
        const percent = Math.round(((proStudioNormal - proStudioDiscounted) / proStudioNormal) * 100);
        return `${percent}% OFF`;
      }
      return null;
    } else if (toolId === 'chatterbox-studio') {
      const { chatterboxNormal, chatterboxDiscounted } = pricingData;
      if (chatterboxNormal && chatterboxDiscounted && chatterboxDiscounted < chatterboxNormal) {
        const percent = Math.round(((chatterboxNormal - chatterboxDiscounted) / chatterboxNormal) * 100);
        return `${percent}% OFF`;
      }
    } else if (toolId === 'youtube-seo-kit') {
      const { seoNormal, seoDiscounted } = pricingData;
      if (seoNormal && seoDiscounted && seoDiscounted < seoNormal) {
        const percent = Math.round(((seoNormal - seoDiscounted) / seoNormal) * 100);
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
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-3 mx-auto"
          >
            <Sparkles className="w-3.5 h-3.5" /> Complete Creator Suite
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.05 }}
            className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground font-headline"
          >
            Explore All Studio <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Powerhouses</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
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

        {/* Studio Tools Grid - 4 per row */}
        <div className="max-w-5xl mx-auto">
          <motion.div 
            layout
            className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6 gap-x-1.5 sm:gap-x-3 md:gap-x-5 gap-y-4 sm:gap-y-6"
          >
            <AnimatePresence mode="popLayout">
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
            </AnimatePresence>
          </motion.div>
        </div>

      </div>
    </section>
  );
}
