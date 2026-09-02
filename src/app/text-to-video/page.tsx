'use client';

import LockedToolPage from '@/components/locked-tool-page';
import React from 'react';

export default function DeprecatedTextToVideoPage() {

  return (
    <LockedToolPage 
        toolName="Text to Video"
        message="This tool is currently undergoing maintenance and has been temporarily disabled."
    />
  );
}
