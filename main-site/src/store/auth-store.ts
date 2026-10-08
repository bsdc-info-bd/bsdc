import type { User } from 'firebase/auth';
import { create } from 'zustand';

export type AuthStatus = 'initializing' | 'authenticated' | 'guest' | 'unavailable';

/** Roles are minted as Firebase custom claims by functions/api/auth/claims.ts. */
export type UserRole =
  | 'member'
  | 'creator'
  | 'vendor'
  | 'moderator'
  | 'manager'
  | 'admin'
  | 'owner';

export interface SessionClaims {
  role: UserRole;
  vendor: boolean;
  staff: boolean;
}

export const DEFAULT_CLAIMS: SessionClaims = { role: 'member', vendor: false, staff: false };

interface AuthState {
  status: AuthStatus;
  user: User | null;
  claims: SessionClaims;
  /** True once the Firestore profile document has been loaded at least once. */
  profileLoaded: boolean;
  redirectError: string | null;
  setRedirectError: (error: string | null) => void;
  setSession: (user: User | null, claims: SessionClaims) => void;
  setUnavailable: () => void;
  setProfileLoaded: (loaded: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'initializing',
  user: null,
  claims: DEFAULT_CLAIMS,
  profileLoaded: false,
  redirectError: null,
  setRedirectError: (redirectError) => set({ redirectError }),
  setSession: (user, claims) =>
    set((state) => ({
      user,
      claims,
      status: user ? 'authenticated' : 'guest',
      redirectError: user ? null : state.redirectError,
      profileLoaded: user ? state.user?.uid === user.uid && state.profileLoaded : true,
    })),
  setUnavailable: () => set({ status: 'unavailable', user: null, claims: DEFAULT_CLAIMS }),
  setProfileLoaded: (profileLoaded) => set({ profileLoaded }),
  reset: () =>
    set({
      status: 'guest',
      user: null,
      claims: DEFAULT_CLAIMS,
      profileLoaded: true,
      redirectError: null,
    }),
}));

export const selectIsSignedIn = (state: AuthState): boolean => state.status === 'authenticated';
export const selectIsStaff = (state: AuthState): boolean => state.claims.staff;
