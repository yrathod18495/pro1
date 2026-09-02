
'use client';

import { AuthProvider } from '@/context/auth-provider';
import { Toaster } from '@/components/ui/toaster';
import React, { useEffect, type ReactNode } from 'react';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { GlobalErrorReporter } from '@/components/global-error-reporter';
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { CartProvider } from '@/context/cart-provider';
import { DynamicThemeProvider } from '@/components/dynamic-theme-provider';
import { MaintenanceGuard } from '@/components/maintenance-guard';
import { OnboardingDialog } from '@/components/onboarding-dialog';
import { PushSubscriptionHandler } from '@/components/push-subscription-handler';
import { AltAccountOfferModal } from '@/components/alt-account-offer-modal';
import { CookieConsent } from '@/components/cookie-consent';
import { FirestoreCrashGuard } from '@/components/firestore-crash-guard';

function ConsoleSanitizer() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sanitizeArg = (arg: any): any => {
      if (!arg) return arg;
      if (typeof arg === 'object') {
        if (typeof HTMLElement !== 'undefined' && arg instanceof HTMLElement) {
          return `<${arg.tagName.toLowerCase()}${arg.id ? ` id="${arg.id}"` : ''}${arg.className ? ` class="${arg.className}"` : ''}>`;
        }
        if (typeof Node !== 'undefined' && arg instanceof Node) {
          return `[Node: ${arg.nodeName}]`;
        }
      }
      return arg;
    };

    const patchConsole = (method: 'warn' | 'error' | 'log' | 'info') => {
      const original = console[method];
      if (!original) return;
      console[method] = (...args: any[]) => {
        const sanitized = args.map(sanitizeArg);
        original.apply(console, sanitized);
      };
    };

    patchConsole('warn');
    patchConsole('error');
  }, []);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
      <NextThemesProvider 
        attribute="class" 
        defaultTheme="light" 
        enableSystem={false}
      >
        <ConsoleSanitizer />
        <GlobalErrorReporter />
        <FirestoreCrashGuard>
        <DynamicThemeProvider>
          <FirebaseClientProvider>
            <AuthProvider>
              <CartProvider>
                <MaintenanceGuard>
                    <PushSubscriptionHandler />
                    <FirebaseErrorListener />
                    <OnboardingDialog />
                    <AltAccountOfferModal />
                    {children}
                    <CookieConsent />
                    <Toaster />
                </MaintenanceGuard>
              </CartProvider>
            </AuthProvider>
          </FirebaseClientProvider>
        </DynamicThemeProvider>
        </FirestoreCrashGuard>
      </NextThemesProvider>
  );
}
