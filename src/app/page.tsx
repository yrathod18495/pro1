'use client';

import { useAuth } from '@/context/auth-provider';
import { HeroSection } from '@/components/landing/hero-section';
import { Footer } from '@/components/landing/footer';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { InstallPwaBanner } from '@/components/install-pwa-banner';
import { ProductMarquee } from '@/components/landing/product-marquee';
import { LiveChatWidget } from '@/components/live-chat-widget';

import { FeaturesSection } from '@/components/landing/features-section';
import { DemoSection } from '@/components/landing/demo-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { WhyChooseUsSection } from '@/components/landing/why-choose-us-section';
import { SellerCtaSection } from '@/components/landing/seller-cta-section';
import { FaqSection } from '@/components/landing/faq-section';
import { CommunityCtaSection } from '@/components/landing/community-cta-section';
import { FinalCtaSection } from '@/components/landing/final-cta-section';

import { LazySection } from '@/components/lazy-section';

export default function LandingPage() {
    const { user } = useAuth();

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
                    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
                        <div className="flex flex-col gap-12 md:gap-20">
                            <LazySection minHeight="500px">
                                <FeaturesSection user={user} />
                            </LazySection>
                            <LazySection minHeight="500px">
                                <DemoSection />
                            </LazySection>
                            <LazySection minHeight="400px">
                                <PricingSection />
                            </LazySection>
                            <LazySection minHeight="250px">
                                <CommunityCtaSection />
                            </LazySection>
                            <LazySection minHeight="400px">
                                <WhyChooseUsSection />
                            </LazySection>
                            {(user?.isSeller || user?.role === 'admin') && (
                                <LazySection minHeight="400px">
                                    <SellerCtaSection />
                                </LazySection>
                            )}
                            <LazySection minHeight="300px">
                                <FinalCtaSection user={user} />
                            </LazySection>
                            <LazySection minHeight="400px">
                                <FaqSection />
                            </LazySection>
                        </div>
                    </Suspense>
                </div>
            </main>

            <Footer />
            
            <LiveChatWidget />
            <InstallPwaBanner />
        </div>
    );
}
