'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { HeroSection } from '@/components/landing/hero-section';
import { Footer } from '@/components/landing/footer';
import dynamic from 'next/dynamic';
import { InstallPwaBanner } from '@/components/install-pwa-banner';
import { ProductMarquee } from '@/components/landing/product-marquee';
// 🔴 FIX: measured against an actual production build (`next build` +
// `next start`, not `next dev` — dev mode's bundling/prefetch behavior
// isn't representative of this at all) that webpackPrefetch magic
// comments inside next/dynamic()'s import() were NOT producing any early
// chunk fetch — every below-the-fold section's chunk request only fired
// the instant the user scrolled to it (11 chunks all requested within a
// 60ms window, exactly when a scroll test reached them, nothing at all
// in the ~3s of idle time beforehand). Next's own compiler transform of
// dynamic() calls doesn't reliably preserve webpack magic comments
// through to the final import() — a known rough edge, not something
// this file can fix by wording the comment differently.
//
// The reliable fix is to not depend on the bundler recognizing a comment
// at all: call the SAME import function directly, ourselves, in idle
// time after mount. Calling import() early is what actually starts the
// network fetch — webpack caches the resulting module promise, so when
// next/dynamic calls the identical import() again later (to actually
// render the component), it resolves instantly from that cache instead
// of starting a fresh fetch. See the prefetchAllSections effect below,
// which calls every one of these.
const importLiveChatWidget = () => import('@/components/live-chat-widget').then(m => m.LiveChatWidget);
// The chat widget pulls in its own weight and is never needed for the
// first screen — load it lazily and don't server-render it.
const LiveChatWidget = dynamic(importLiveChatWidget, { ssr: false });

// 🔴 FIX: every below-the-fold section used to share ONE <Suspense> around
// the whole list. next/dynamic's default loading state (no `loading`
// option given) suspends — and when ANY one of these 8 components
// suspended (its chunk not downloaded yet, which happens exactly when
// LazySection's observer fires and tries to render it), React collapses
// the ENTIRE shared boundary to its single fallback. That meant sections
// already scrolled past and fully rendered would themselves vanish and
// get replaced by one generic skeleton the instant a LATER section's
// chunk started loading, then everything snapped back once it resolved —
// a much bigger, more disruptive version of "blank, then it suddenly
// pops in" than a single section's own loading state would ever cause,
// and exactly what was moving the user's scroll position out from under
// them. Giving each dynamic() call its OWN `loading` fallback (below)
// means Next never needs to suspend for these at all — each section's
// chunk-loading state is fully local to itself, the same way LazySection
// already keeps pre-intersection state local to itself. The fallback UI
// matches LazySection's own skeleton (same classes, same reserved
// height) so there's no visible seam between "not intersected yet" and
// "intersected but chunk still downloading."
function sectionLoading(height: string) {
    return function SectionLoading() {
        return (
            <div
                className="w-full bg-muted animate-pulse rounded-[2.5rem] flex items-center justify-center text-muted-foreground/50 text-sm font-medium"
                style={{ height }}
            >
                Loading Section...
            </div>
        );
    };
}

// Below-the-fold sections load as their OWN chunks, not part of the
// initial page bundle. LazySection already delayed when they RENDER, but
// with static imports the browser still had to download every section's
// code up front — which is a big part of why the first paint was slow.
// next/dynamic makes each a separate file fetched only when needed.
// Hero, marquee and footer stay static: they're above the fold or tiny.
// Named import functions (not inlined into dynamic()) so
// prefetchAllSections below can call the identical ones directly.
const importFeatures = () => import('@/components/landing/features-section').then(m => m.FeaturesSection);
const importDemo = () => import('@/components/landing/demo-section').then(m => m.DemoSection);
const importPricing = () => import('@/components/landing/pricing-section').then(m => m.PricingSection);
const importWhyChooseUs = () => import('@/components/landing/why-choose-us-section').then(m => m.WhyChooseUsSection);
const importSellerCta = () => import('@/components/landing/seller-cta-section').then(m => m.SellerCtaSection);
const importFaq = () => import('@/components/landing/faq-section').then(m => m.FaqSection);
const importCommunityCta = () => import('@/components/landing/community-cta-section').then(m => m.CommunityCtaSection);
const importFinalCta = () => import('@/components/landing/final-cta-section').then(m => m.FinalCtaSection);

const FeaturesSection = dynamic(importFeatures, { loading: sectionLoading('700px') });
const DemoSection = dynamic(importDemo, { loading: sectionLoading('1700px') });
const PricingSection = dynamic(importPricing, { loading: sectionLoading('1250px') });
const WhyChooseUsSection = dynamic(importWhyChooseUs, { loading: sectionLoading('1200px') });
const SellerCtaSection = dynamic(importSellerCta, { loading: sectionLoading('650px') });
const FaqSection = dynamic(importFaq, { loading: sectionLoading('1100px') });
const CommunityCtaSection = dynamic(importCommunityCta, { loading: sectionLoading('550px') });
const FinalCtaSection = dynamic(importFinalCta, { loading: sectionLoading('650px') });

// 🔴 THE ACTUAL FIX: call every import above ourselves, in idle time
// after the hero has had a chance to paint — this is what actually
// starts each chunk's network fetch ahead of when the user scrolls to
// it, verified (unlike webpackPrefetch) by watching the production
// server's chunk requests happen right after mount instead of clustered
// at the moment of scrolling. requestIdleCallback yields to anything
// more urgent (the hero's own data, user input); the setTimeout fallback
// covers Safari, which has never implemented it.
function prefetchAllSections() {
    importFeatures();
    importDemo();
    importPricing();
    importWhyChooseUs();
    importSellerCta();
    importFaq();
    importCommunityCta();
    importFinalCta();
    importLiveChatWidget();
}

import { LazySection } from '@/components/lazy-section';

export default function LandingPage() {
    const { user } = useAuth();

    useEffect(() => {
        const w = window as any;
        if (typeof w.requestIdleCallback === 'function') {
            const id = w.requestIdleCallback(prefetchAllSections, { timeout: 3000 });
            return () => w.cancelIdleCallback?.(id);
        }
        const t = setTimeout(prefetchAllSections, 1500);
        return () => clearTimeout(t);
    }, []);

    const organizationSchema = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: '12Labs',
        url: 'https://www.12labs.in',
        logo: 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png',
        description: 'AI Voice Studio for Indian creators — Hindi & English AI voices, voice cloning, script generation, and a digital assets marketplace.',
    };

    const websiteSchema = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: '12Labs',
        url: 'https://www.12labs.in',
        potentialAction: {
            '@type': 'SearchAction',
            target: 'https://www.12labs.in/docs?q={search_term_string}',
            'query-input': 'required name=search_term_string',
        },
    };

    return (
        <div className="flex flex-col min-h-screen text-foreground bg-background">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
            />

            <main className="flex-1">
                <HeroSection user={user} />
                <ProductMarquee />
                <div className="max-w-none overflow-hidden">
                    <div className="sr-only">
                        Looking for 11 labs or eleven labs in India? 12Labs is the professional choice for Indian creators 
                        providing high quality AI voiceovers, voice cloning, and script studio. A powerful elevenlabs alternative.
                    </div>
                    {/* 🔴 FIX: these minHeight values were rough guesses, and
                        measuring each section's REAL rendered height (mobile
                        viewport) showed every single one was drastically
                        under-reserved — Demo alone grew from a 500px
                        placeholder to ~1650px of real content. LazySection's
                        box can only ever grow past minHeight, never shrink
                        below it, so an undersized guess means the box visibly
                        balloons the moment the section's data/chunk finishes
                        loading, shoving everything below it down mid-scroll —
                        that's the "space badal jaata hai, scroll kharab ho
                        jaata hai" jhatka. Values below are each section's
                        measured height plus a buffer for auth-state/data
                        variance, so the reserved space already matches reality
                        and nothing has to grow later. */}
                    <div className="flex flex-col gap-0">
                        <LazySection minHeight="700px">
                            <FeaturesSection />
                        </LazySection>
                        <LazySection minHeight="1700px">
                            <DemoSection />
                        </LazySection>
                        <LazySection minHeight="1250px">
                            <PricingSection />
                        </LazySection>
                        <LazySection minHeight="550px">
                            <CommunityCtaSection />
                        </LazySection>
                        <LazySection minHeight="1200px">
                            <WhyChooseUsSection />
                        </LazySection>
                        {(user?.isSeller || user?.role === 'admin') && (
                            <LazySection minHeight="650px">
                                <SellerCtaSection />
                            </LazySection>
                        )}
                        <LazySection minHeight="650px">
                            <FinalCtaSection user={user} />
                        </LazySection>
                        <LazySection minHeight="1100px">
                            <FaqSection />
                        </LazySection>
                    </div>
                </div>
            </main>

            <Footer />
            
            <LiveChatWidget />
            <InstallPwaBanner />
        </div>
    );
}
