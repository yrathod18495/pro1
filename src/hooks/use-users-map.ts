
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';

interface UsersMap {
  [uid: string]: UserProfile;
}

export function useUsersMap(uids: (string | undefined)[] | undefined) {
  const { user: currentUser } = useAuth();
  const { firestore } = initializeFirebase();
  const [usersMap, setUsersMap] = useState<UsersMap>({});
  const [isLoading, setIsLoading] = useState(false);

  const serializedUids = Array.isArray(uids) ? uids.filter(x => typeof x === 'string').sort().join(',') : '';

  useEffect(() => {
    if (!uids || uids.length === 0 || !firestore || currentUser?.role !== 'admin') {
      return;
    }

    const fetchUsers = async () => {
      setIsLoading(true);
      const newUsersMap: UsersMap = { ...usersMap };
      let hasFetched = false;
      
      const uniqueUidsToFetch = [...new Set(uids.filter(uid => uid && !newUsersMap[uid]))] as string[];
      
      if (uniqueUidsToFetch.length > 0) {
        try {
          await Promise.all(uniqueUidsToFetch.map(async (uid) => {
            const userRef = doc(firestore, 'users', uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              newUsersMap[uid] = userSnap.data() as UserProfile;
              hasFetched = true;
            }
          }));
        } catch (error) {
          console.error(`Failed to fetch some users`, error);
        }
      }

      if (hasFetched) {
        setUsersMap(newUsersMap);
      }
      setIsLoading(false);
    };

    fetchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedUids, firestore, currentUser?.role]);

  return { usersMap, isLoading };
}
