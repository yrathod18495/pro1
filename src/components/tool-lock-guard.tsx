'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import LockedToolPage from '@/components/locked-tool-page';
import type { ToolSetting } from '@/lib/types';

interface ToolLockGuardProps {
  toolId: string;
  toolName: string;
  children: React.ReactNode;
}

export default function ToolLockGuard({
  toolId,
  toolName,
  children,
}: ToolLockGuardProps) {
  const { user } = useAuth();
  const { database } = initializeFirebase();
  const [toolStatus, setToolStatus] = useState<ToolSetting | null>(null);
  // Global "tools-off" maintenance: locks EVERY tool at once while the rest
  // of the site stays open, so users can still reach their history and
  // download past work. This is separate from full maintenance (which
  // redirects the whole site to /maintenance).
  const [toolsOffMode, setToolsOffMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!database) {
      setIsLoading(false);
      return;
    }
    const toolLockRef = ref(database, `toolSettings/${toolId}`);
    const unsubscribe = onRtdbValue(toolLockRef, (snapshot) => {
      setToolStatus(snapshot.val() || null);
      setIsLoading(false);
    });

    // settings/maintenance.mode === 'toolsOnly' locks all tools.
    const maintRef = ref(database, 'settings/maintenance');
    const unsubMaint = onRtdbValue(maintRef, (snapshot) => {
      const m = snapshot.val();
      setToolsOffMode(m?.enabled === true && m?.mode === 'toolsOnly');
    });

    return () => {
      unsubscribe();
      unsubMaint();
    };
  }, [database, toolId]);

  if (isLoading) {
    return <>{children}</>;
  }

  // Admin bypasses every lock
  if (user?.role !== 'admin') {
    const isLocked = toolStatus?.locked === true || toolsOffMode;
    if (isLocked) {
      return (
        <LockedToolPage
          toolName={toolName}
          message={
            toolsOffMode
              ? "All studio tools are temporarily paused for maintenance. Your projects and history are safe — you can still open and download your past work from your library."
              : "This studio tool is currently under maintenance or turned off by the system administrator. Please try again later."
          }
        />
      );
    }
  }

  return <>{children}</>;
}
