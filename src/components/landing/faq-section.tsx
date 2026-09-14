'use client';

import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { HelpCircle } from 'lucide-react';
import { Reveal } from '@/components/landing/reveal';

const faqItems = [
  {
    question: "What is 12Labs and how do credits work?",
    answer: "12Labs is an all-in-one AI content creation studio for Indian creators, offering tools for voice generation, script writing, SEO, video tools, and more. The platform operates on a credit system. You get 2,000 free credits on signup, which you use to power the AI tools. When you need more, you can easily purchase credit packs using all major Indian payment methods like UPI and cards via Razorpay."
  },
  {
    question: "What tools are available in 12Labs?",
    answer: "We offer a comprehensive suite: AI Voice Studio (both Fast and Pro HQ modes), Script Generator, PDF Tools, YouTube SEO Kit, Thumbnail Generator, Sound Search, and YouTube Transcript Downloader. We're constantly adding new tools to help creators streamline their workflow."
  },
  {
    question: "What's the difference between Fast and Pro Voice Studio?",
    answer: "'Fast Voice Studio' is perfect for quick projects, previews, and drafting. It happens live in your browser in seconds. 'Pro Studio' is for professional-grade results with superior emotional tone, multi-character support, and pacing controls. This intensive process runs on our neural backend servers."
  },
  {
    question: "Can I use generated audio for commercial projects?",
    answer: "Yes, absolutely! All audio you generate with your credits is yours to use for any commercial purpose, including monetized YouTube videos, podcasts, and ads. If a 'Pro Studio' generation fails on our end, the credits for that task are automatically refunded."
  },
  {
    question: "What is the Digital Store and what can I find there?",
    answer: "The 12Labs Digital Store is a marketplace for creators. You can find high-quality digital assets made by other talented creators, including PC and green screen characters, premium video backgrounds, hand-written scripts, and unique real voice packs."
  },
  {
    question: "How can I become a seller or affiliate?",
    answer: "We encourage creators to earn! You can start selling digital goods via the 'Seller Panel'. We also have a lucrative Affiliate Program where you can generate promo codes and earn commissions on sales. You can request payouts directly to your UPI ID once you have a withdrawable balance."
  },
  {
    question: "How do purchases work for 'Exclusive' items?",
    answer: "You can buy any product from the store and access it immediately in your account's 'History' section. Some items are marked as 'One-Time Purchase'. These are unique assets. When you buy an exclusive item, it's permanently removed from the store and becomes yours alone."
  },
  {
    question: "How can I get support?",
    answer: "For any questions or support, the best way to get help is to use the Live Chat widget on the site or join our official Telegram community, where you can connect with our team and other creators."
  }
];

export function FaqSection() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <section className="relative z-10 w-full py-16 md:py-24 bg-background border-t border-border/50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="container px-4 md:px-6 max-w-4xl mx-auto">
        <div className="text-center mb-12 space-y-4">
          <Reveal animation="anim-in-scale">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide mx-auto">
              <HelpCircle className="w-3.5 h-3.5 anim-pulse-soft" /> Help centre
            </div>
          </Reveal>

          <Reveal animation="anim-in-blur-rise" delay={2}>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground font-headline">
              Frequently asked questions
            </h2>
          </Reveal>

          <Reveal animation="anim-in-rise" delay={4}>
            <p className="text-muted-foreground text-base sm:text-lg font-medium">
              Everything you need to know about credits, voice models, and commercial licensing.
            </p>
          </Reveal>
        </div>

        <Reveal animation="anim-in-rise-lg">
          <div className="bg-card/80 dark:bg-zinc-900/60 backdrop-blur-xl rounded-3xl border border-border/80 dark:border-white/10 p-4 sm:p-8 shadow-xl">
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-b border-border/40 last:border-0 px-2 sm:px-4">
                <AccordionTrigger className="text-base sm:text-lg font-bold text-left text-foreground hover:text-primary transition-colors py-5 anim-surface-focus">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm sm:text-base text-muted-foreground leading-relaxed pb-5 font-medium">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
