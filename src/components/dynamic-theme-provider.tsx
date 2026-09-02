'use client';

import React, { useEffect, useState } from 'react';

export function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted) {
      // Define the theme color
      const theme = { primary: '221 83% 53%' }; // Blue
      
      const root = document.documentElement;
      root.style.setProperty('--primary', theme.primary);
      root.style.setProperty('--ring', theme.primary);
    }
  }, [isMounted]);

  // Render children immediately to prevent layout shifts.
  // The color change will happen client-side after mount.
  return <>{children}</>;
}
