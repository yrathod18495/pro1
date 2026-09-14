'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function InstallPwaBanner() {
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
      // Show the install button if the app is not already installed.
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    // Show the browser's install prompt.
    (installPrompt as any).prompt();

    // Wait for the user to respond to the prompt.
    const { outcome } = await (installPrompt as any).userChoice;

    if (outcome === 'accepted') {
    } else {
    }

    // We can only use the install prompt once.
    setInstallPrompt(null);
    setIsVisible(false);
  };
  
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg animate-in fade-in-50 slide-in-from-bottom-10">
        <Card className="bg-background/80 backdrop-blur-sm shadow-lg border-primary/30">
            <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-grow">
                    <p className="font-bold">Get the 12Labs App!</p>
                    <p className="text-sm text-muted-foreground">For a faster, full-screen experience, add our app to your home screen.</p>
                </div>
                <Button onClick={handleInstallClick}>
                    <Download className="mr-2 h-4 w-4" />
                    Install
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}
