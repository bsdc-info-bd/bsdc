import { useEffect } from 'react';
import { onAuthChange } from '@/lib/firebase/auth';
import { getDocument, setDocument } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/stores/authStore';
import { setExternalUserId, removeExternalUserId } from '@/lib/onesignal';
import { config } from '@/config';
import type { User, UserProfile } from '@/types';

export function useAuthListener() {
  const { setUser, setProfile, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (!firebaseUser) {
        logout();
        removeExternalUserId();
        setLoading(false);
        return;
      }

      try {
        // Get or create user document
        const userDoc = await getDocument<User>(config.collections.users, firebaseUser.uid);

        let user: User;
        if (userDoc) {
          user = {
            ...userDoc,
            lastLoginAt: Date.now(),
          };
          await setDocument(config.collections.users, firebaseUser.uid, {
            lastLoginAt: Date.now(),
            email: firebaseUser.email,
            emailVerified: firebaseUser.emailVerified,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          }, true);
        } else {
          // New user — create user document
          const providerId = firebaseUser.providerData[0]?.providerId || 'password';
          user = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            emailVerified: firebaseUser.emailVerified,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            providerId,
            role: 'USER',
            permissions: ['content:create', 'content:edit_own', 'content:delete_own', 'messaging:use'],
            username: null,
            isBanned: false,
            isSuspended: false,
            suspendedUntil: null,
            isDeactivated: false,
            mfaEnabled: false,
            lastLoginAt: Date.now(),
            loginCount: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await setDocument(config.collections.users, firebaseUser.uid, user, false);
        }

        setUser(user);

        // Get profile
        const profileDoc = await getDocument<UserProfile>(
          config.collections.userProfiles,
          firebaseUser.uid
        );
        if (profileDoc) {
          setProfile(profileDoc);
        }

        // Set OneSignal external user ID
        setExternalUserId(firebaseUser.uid);
      } catch (error) {
        console.error('[BSDC] Auth listener error:', error);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [setUser, setProfile, setLoading, logout]);
}
