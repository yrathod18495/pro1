'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie, ChevronDown, ChevronUp, ShieldCheck, X } from 'lucide-react';
import { setCookie, getCookie } from '@/lib/utils';

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Check both document.cookie and localStorage to handle iframe / sandbox storage persistence
    const cookieConsent = getCookie('12labs_consent_given');
    const localConsent = typeof window !== 'undefined' ? localStorage.getItem('12labs_consent_given') : null;

    if (!cookieConsent && !localConsent) {
      const timer = setTimeout(() => setIsVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    setCookie('12labs_consent_given', 'true', 365);
    if (typeof window !== 'undefined') {
      localStorage.setItem('12labs_consent_given', 'true');
    }
    setIsVisible(false);
  };

  const handleEssentialOnly = () => {
    setCookie('12labs_consent_given', 'essential', 30);
    if (typeof window !== 'undefined') {
      localStorage.setItem('12labs_consent_given', 'essential');
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 z-[1000] max-w-lg w-full sm:w-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl bg-card/95 dark:bg-zinc-900/95 border border-border shadow-xl backdrop-blur-md p-3.5 text-xs text-foreground space-y-2.5 transition-all">
        {/* Main Header Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
              <Cookie className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xs font-medium leading-tight">
              We use cookies for session login, theme preferences, and studio security.
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
              title="View details"
            >
              <span>{isExpanded ? 'Less' : 'Details'}</span>
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            <Button
              onClick={handleAccept}
              size="sm"
              className="h-7 px-3 text-[11px] font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            >
              Accept
            </Button>

            <button
              onClick={handleEssentialOnly}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              title="Close / Essential only"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Expandable Details Area */}
        {isExpanded && (
          <div className="pt-2 border-t border-border/60 space-y-2 text-[11px] text-muted-foreground animate-in fade-in duration-200">
            <div className="grid grid-cols-1 gap-1.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Essential Session:</strong> Keeps you logged in securely and saves your studio voice projects.</span>
              </div>
              <div className="flex items-start gap-2">
                <Cookie className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Preferences:</strong> Remembers your dark/light theme choice and sidebar layout settings.</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handleEssentialOnly}
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Allow Essential Only
              </button>
              <span className="text-[10px] opacity-70">Studio 12 Labs Privacy</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


