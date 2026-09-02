'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import {
  getAuth,
  onIdTokenChanged,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification as firebaseSendEmailVerification,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { ref, onValue, onDisconnect, update, serverTimestamp } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { doc, onSnapshot } from 'firebase/firestore';
import type { User, UserProfile } from '@/lib/types';
import { initializeFirebase } from '@/firebase';
import { plans } from '@/lib/plans';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { createNewUserProfileOnServer, getUserProfileFromServer, syncUserSubscriptionInstallments } from '@/app/actions';
import { getDeviceFingerprint } from '@/lib/device-fingerprint';
import { safeJsonStringify } from '@/lib/utils';
import { reportClientError } from '@/lib/report-client-error';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isOnline: boolean;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<FirebaseUser>;
  sendPasswordReset: (email: string) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  
  isImpersonating: boolean;
  impersonatedUser: UserProfile | null;
  impersonateUser: (userProfile: UserProfile) => void;
  stopImpersonating: (silent?: boolean) => void;
  activeUid: string | undefined;
  activeUser: User | UserProfile | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_KEY = '12labs_auth_node_v3';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<UserProfile | null>(null);

  const { auth, database, firestore } = initializeFirebase();
  const { toast } = useToast();
  const router = useRouter();

  // Helper function to check if a user is banned or suspended
  const checkIfUserIsBlocked = useCallback((profile: UserProfile): { isBlocked: boolean; reason?: string } => {
    if (profile.status === 'banned' || (profile as any).isBanned === true) {
      return { isBlocked: true, reason: 'This account has been terminated/banned.' };
    }
    if (profile.status === 'suspended' && profile.suspensionEndDate) {
      const endDate = new Date(profile.suspensionEndDate);
      if (endDate > new Date()) {
        return { isBlocked: true, reason: `This account is suspended until ${endDate.toLocaleDateString()}.` };
      }
    }
    return { isBlocked: false };
  }, []);

  // Initialize Native Google Auth
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      const gAuth = (window as any).GoogleAuth;
      if (gAuth?.initialize) {
        gAuth.initialize({
          clientId: "46583278192-pn9ftdkj98rdvgldrmhbj2dvidh1qk7l.apps.googleusercontent.com",
          scopes: ["profile", "email"],
          grantOfflineAccess: true,
        });
      }
    }
  }, []);

  // Presence Tracking
  useEffect(() => {
    if (!user || !database) return;

    const myPresenceRef = ref(database, `onlineUsers/${user.uid}`);
    const connectedRef = ref(database, '.info/connected');

    const updatePresence = (status: 'online' | 'offline') => {
        update(myPresenceRef, {
            name: user.name || user.email || 'Anonymous',
            email: user.email || '',
            status: status,
            lastSeen: serverTimestamp(),
        }).catch(() => null);
    };

    const unsubscribe = onRtdbValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        updatePresence('online');
        onDisconnect(myPresenceRef).update({
          status: 'offline',
          lastSeen: serverTimestamp(),
        });
      }
    });

    return () => {
        unsubscribe();
        if (user) updatePresence('offline');
    };
  }, [user, database]);

  // Subscription Sync (runs for logged in user or impersonated user)
  useEffect(() => {
    const targetUser = impersonatedUser || user;
    if (targetUser && targetUser.subscription && (targetUser.subscription.planId === 'autopay_pro' || targetUser.subscription.planId === 'test_sub')) {
        const now = new Date();
        const nextGrant = new Date(targetUser.subscription.nextWeeklyGrantDate);
        
        const subMaxGrants = plans.find(p => p.id === targetUser.subscription!.planId)?.maxGrants ?? 4;
        if (now >= nextGrant && (targetUser.subscription.weeklyGrantCount || 0) < subMaxGrants) {
            syncUserSubscriptionInstallments(targetUser.uid).then(res => {
                if (res.success && res.updatedProfile) {
                    if (isImpersonating) {
                        setImpersonatedUser(res.updatedProfile);
                        localStorage.setItem('impersonated_user', safeJsonStringify(res.updatedProfile));
                    } else {
                        const merged = { ...user, ...res.updatedProfile };
                        setUser(merged as User);
                        localStorage.setItem(CACHE_KEY, safeJsonStringify(res.updatedProfile));
                    }
                }
            });
        }
    }
  }, [user, impersonatedUser, isImpersonating]);

  useEffect(() => {
    const saved = localStorage.getItem('impersonated_user');
    if (saved) {
      setImpersonatedUser(JSON.parse(saved));
      setIsImpersonating(true);
    }
  }, []);

  const impersonateUser = (profile: UserProfile) => {
    setImpersonatedUser(profile);
    setIsImpersonating(true);
    localStorage.setItem('impersonated_user', safeJsonStringify(profile));
    toast({ title: `Viewing as ${profile.name}` });
  };

  const stopImpersonating = useCallback((silent = false) => {
    setImpersonatedUser(null);
    setIsImpersonating(false);
    localStorage.removeItem('impersonated_user');
    if (!silent) toast({ title: "Impersonation Ended" });
  }, [toast]);

  const activeUid = impersonatedUser?.uid || user?.uid;
  const activeUser = impersonatedUser || user;

  const logout = useCallback(async (): Promise<void> => {
    if (!auth) return;
    stopImpersonating(true); 
    
    // --- 🧹 CACHE PURGE NODE ---
    localStorage.removeItem(CACHE_KEY);
    
    await signOut(auth);
    router.push('/login');
  }, [auth, router, stopImpersonating]);

  useEffect(() => {
    if (!auth) {
        setLoading(false);
        return;
    }

    // Tracks whether we've already done the full profile sync for this uid,
    // so a token refresh for the SAME already-signed-in user never re-runs
    // it — see the uid-check below.
    let syncedUid: string | null = null;

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        syncedUid = null;
        setUser(null);
        setLoading(false);
        return;
      }

      // `onIdTokenChanged` fires for TWO very different situations: (1) an
      // actual sign-in/out, and (2) a routine background token refresh for
      // the user who is already signed in (Firebase does this automatically
      // ~hourly, and we also force one after the app returns from being
      // backgrounded — see client-provider.tsx). Case (2) must never show a
      // loading screen or re-fetch the whole profile from the server: the
      // user is already fully loaded and just switched tabs for a second.
      // MaintenanceGuard gates the entire app behind `loading`, so treating
      // a token refresh like a fresh sign-in was showing a full-screen
      // spinner every single time the app regained focus.
      if (firebaseUser.uid === syncedUid) {
        setUser((prev) => (prev ? ({ ...prev, ...firebaseUser, getIdToken: firebaseUser.getIdToken.bind(firebaseUser) } as User) : (firebaseUser as any)));
        return;
      }

      setLoading(true);

      // 1. Check local cache first for instant UI response & offline resilience
      let cachedProfile: UserProfile | null = null;
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.uid === firebaseUser.uid || parsed.id === firebaseUser.uid)) {
            cachedProfile = parsed;
            setUser({ ...firebaseUser, ...cachedProfile, getIdToken: firebaseUser.getIdToken.bind(firebaseUser) } as User);
          }
        }
      } catch (e) {
            reportClientError('src/context/auth-provider.tsx:209', e);
        // Ignore cache parse issue
      }

      try {
        const deviceId = await getDeviceFingerprint().catch(() => 'unknown_device');

        // 2. Fetch fresh profile from server
        let profile: UserProfile | null = null;
        try {
          profile = await getUserProfileFromServer(firebaseUser.uid, deviceId);
        } catch (serverErr) {
          console.warn("Server profile sync non-fatal error:", serverErr);
        }
        
        // 3. Fallback to client-side Firestore if server action is temporarily unavailable
        if (!profile && firestore) {
          try {
            const { getDoc, doc: fsDoc } = await import('firebase/firestore');
            const snap = await getDoc(fsDoc(firestore, 'users', firebaseUser.uid));
            if (snap.exists()) {
              profile = snap.data() as UserProfile;
            }
          } catch (clientFsErr) {
            console.warn("Client firestore sync fallback:", clientFsErr);
          }
        }

        // 4. Fallback to cached profile if available
        if (!profile && cachedProfile) {
          profile = cachedProfile;
        }

        // 5. Create new profile if user definitely does not exist
        if (!profile) {
          try {
            const creationResult = await createNewUserProfileOnServer({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL
            }, deviceId);

            if (creationResult?.success && creationResult?.profile) {
                profile = creationResult.profile;
            }
          } catch (createErr) {
            console.warn("Profile creation non-fatal error:", createErr);
          }
        }

        if (profile) {
          const blockCheck = checkIfUserIsBlocked(profile);
          if (blockCheck.isBlocked) {
              await signOut(auth);
              setUser(null);
              localStorage.removeItem(CACHE_KEY);
              toast({ variant: 'destructive', title: 'Access Denied', description: blockCheck.reason });
              router.push('/login');
          } else {
              localStorage.setItem(CACHE_KEY, safeJsonStringify(profile));
              setUser({ ...firebaseUser, ...profile, getIdToken: firebaseUser.getIdToken.bind(firebaseUser) } as User);
          }
        } else {
          // Keep base firebase user authenticated so the user is never kicked out on network glitches
          setUser(firebaseUser as any);
        }
      } catch (error) {
        console.warn("Auth Sync Non-Fatal Warning:", error);
        if (firebaseUser) {
          setUser(firebaseUser as any);
        }
      } finally {
        syncedUid = firebaseUser.uid;
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, firestore, toast, checkIfUserIsBlocked, router]);

  // Real-time listener for user status changes (instantly kicks user if banned/suspended while active)
  useEffect(() => {
    if (!user?.uid || !firestore || isImpersonating) return;

    // Guards against setState firing after this effect has torn down (e.g. user?.uid
    // changing again quickly, or unmount). Calling setState from a snapshot callback
    // after the listener is logically "stale" is a known trigger for the Firestore JS
    // SDK's "INTERNAL ASSERTION FAILED: Unexpected state" crash.
    let isActive = true;

    const userDocRef = doc(firestore, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, async (snap) => {
      if (!isActive) return;
      if (!snap.exists()) return;
      const liveProfile = snap.data() as UserProfile;
      const blockCheck = checkIfUserIsBlocked(liveProfile);

      if (blockCheck.isBlocked) {
        console.warn("[Auth] Account terminated/suspended in real-time. Revoking session...");
        localStorage.removeItem(CACHE_KEY);
        setUser(null);
        if (auth) await signOut(auth);
        if (!isActive) return;
        toast({
          variant: 'destructive',
          title: 'Access Revoked',
          description: blockCheck.reason,
        });
        router.push('/login');
      } else {
        // Update user state with fresh profile data (credits, subscription, etc.)
        setUser(prev => {
          if (!prev) return null;
          // Only update if there's a meaningful change to avoid unnecessary re-renders
          if (prev.credits !== liveProfile.credits || 
              prev.status !== liveProfile.status || 
              safeJsonStringify(prev.subscription) !== safeJsonStringify(liveProfile.subscription)) {
            
            const updatedUser = { ...prev, ...liveProfile } as User;
            // Also sync to localStorage for persistence across reloads
            localStorage.setItem(CACHE_KEY, safeJsonStringify(liveProfile));
            return updatedUser;
          }
          return prev;
        });
      }
    }, (err) => {
      if (!isActive) return;
      console.error("User status listener error:", err);
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [user?.uid, firestore, auth, router, toast, isImpersonating, checkIfUserIsBlocked]);

  const loginWithGoogle = async () => {
    if (!auth) return;
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Google Login Error:", error);
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: error.message || 'An unknown error occurred.',
      });
      setLoading(false);
    }
  };
  
  const loginWithEmail = async (email: string, pass: string) => {
    if (!auth) return;
    setLoading(true);
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    if (!auth) throw new Error("Auth service unavailable");
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await firebaseSendEmailVerification(userCredential.user);
    return userCredential.user;
  };

  const sendPasswordReset = async (email: string) => {
    if (auth) await sendPasswordResetEmail(auth, email);
  };

  const sendEmailVerification = async () => {
    if (auth?.currentUser) await firebaseSendEmailVerification(auth.currentUser);
  };

  return (
    <AuthContext.Provider value={{ 
        user, loading, isOnline, logout, loginWithGoogle, loginWithEmail, signUpWithEmail, 
        sendPasswordReset, sendEmailVerification, setUser,
        isImpersonating, impersonatedUser, impersonateUser, stopImpersonating, activeUid, activeUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
