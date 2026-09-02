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

    return () => unsubscribe();
  }, [database, toolId]);

  if (isLoading) {
    return <>{children}</>;
  }

  // Admin bypasses the lock
  if (user?.role !== 'admin') {
    const isLocked = toolStatus?.locked === true;
    if (isLocked) {
      return (
        <LockedToolPage
          toolName={toolName}
          message="This studio tool is currently under maintenance or turned off by the system administrator. Please try again later."
        />
      );
    }
  }

  return <>{children}</>;
}
