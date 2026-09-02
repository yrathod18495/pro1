'use client';

import { useAuth } from '@/context/auth-provider';
import { Button } from '@/components/ui/button';
import { UserMinus, User, ShieldAlert } from 'lucide-react';

export function ImpersonationBar() {
  const { isImpersonating, impersonatedUser, stopImpersonating } = useAuth();

  if (!isImpersonating || !impersonatedUser) return null;

  return (
    <div className="bg-orange-600 text-white py-2 px-4 flex items-center justify-between shadow-lg sticky top-0 z-[60] animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 animate-pulse" />
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="hidden sm:inline uppercase tracking-widest opacity-80">Impersonation Mode:</span>
          <span className="flex items-center gap-1.5 bg-white/20 px-2 py-0.5 rounded-md">
            <User className="h-3.5 w-3.5" />
            {impersonatedUser.name} ({impersonatedUser.email})
          </span>
        </div>
      </div>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => stopImpersonating()}
        className="bg-white text-orange-600 hover:bg-orange-50 hover:text-orange-700 border-none h-8 font-bold"
      >
        <UserMinus className="mr-2 h-4 w-4" />
        Exit Mode
      </Button>
    </div>
  );
}
