'use client';

import { Lock, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function LockedToolPage({ toolName, message }: { toolName: string, message?: string }) {
  const defaultMessage = 'This tool is not yet available for your account. We are working on bringing more features to all users soon!';
  const displayMessage = message || defaultMessage;
  const isPremiumLock = displayMessage.toLowerCase().includes('purchase credits');

  return (
    <div className="container mx-auto flex items-center justify-center min-h-[calc(100vh-200px)]">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto bg-yellow-100 dark:bg-yellow-900/30 p-3 rounded-full w-fit">
            <Lock className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
          </div>
          <CardTitle className="mt-4">{toolName} is Currently Locked</CardTitle>
          <CardDescription>
            {displayMessage}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPremiumLock ? (
            <Button asChild>
              <Link href="/buy-credits">
                <CreditCard className="mr-2 h-4 w-4" />
                Purchase Credits
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/#tools">
                Back to All Tools
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
