
'use server';

import { initializeFirebase } from '@/firebase/server';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { reportServerError } from '@/lib/report-error';

/**
 * Toggles the follow status between a user and a seller.
 * Atomically updates follower/following counts and relationships in Firestore.
 * Also updates the denormalized follower count in Realtime Database.
 */
export async function toggleFollowSeller(
  sellerId: string,
  userId: string
): Promise<{ success: boolean; isFollowing: boolean; error?: string }> {
  if (!userId) {
    return { success: false, isFollowing: false, error: 'User not logged in.' };
  }
  if (sellerId === userId) {
      return { success: false, isFollowing: false, error: 'You cannot follow yourself.' };
  }

  const { firestore, database } = initializeFirebase();
  const userFollowingRef = firestore.collection('users').doc(userId).collection('following').doc(sellerId);
  const sellerFollowerRef = firestore.collection('sellers').doc(sellerId).collection('followers').doc(userId);
  const userProfileRef = firestore.collection('users').doc(userId);
  const sellerRtdbRef = database.ref(`sellerProfiles/${sellerId}`);
  
  let isCurrentlyFollowing = false;

  try {
    await firestore.runTransaction(async (transaction: any) => {
      const userFollowingDoc = await transaction.get(userFollowingRef);
      isCurrentlyFollowing = userFollowingDoc.exists;

      if (isCurrentlyFollowing) {
        // Unfollow
        transaction.delete(userFollowingRef);
        transaction.delete(sellerFollowerRef);
        transaction.update(userProfileRef, { followingCount: FieldValue.increment(-1) });
      } else {
        // Follow
        transaction.set(userFollowingRef, { followedAt: new Date().toISOString() });
        transaction.set(sellerFollowerRef, { followedAt: new Date().toISOString() });
        transaction.update(userProfileRef, { followingCount: FieldValue.increment(1) });
      }
    });

    // After transaction, update RTDB follower count
    await sellerRtdbRef.child('followerCount').transaction((currentValue: any) => {
      if (isCurrentlyFollowing) {
        return (currentValue || 1) - 1; // Decrement
      } else {
        return (currentValue || 0) + 1; // Increment
      }
    });

    revalidatePath(`/seller/${sellerId}`);

    return { success: true, isFollowing: !isCurrentlyFollowing };
  } catch (error: any) {
    reportServerError('src/app/seller/actions.ts#1', error);
    console.error('Failed to toggle follow:', error);
    return { success: false, isFollowing: isCurrentlyFollowing, error: error.message };
  }
}

/**
 * Checks if a given user is following a seller.
 */
export async function checkFollowStatus(
  sellerId: string,
  userId: string
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { firestore } = initializeFirebase();
    const followDoc = await firestore.collection('users').doc(userId).collection('following').doc(sellerId).get();
    return followDoc.exists;
  } catch (error) {
    reportServerError('src/app/seller/actions.ts#2', error);
    console.error('Failed to check follow status:', error);
    return false;
  }
}
