/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { create } from 'zustand';
import type { User as FirebaseUser } from 'firebase/auth';
import type { UserProfile } from '@/types/user';

export type AuthStage = 'loading' | 'signedOut' | 'needsVerification' | 'ready' | 'banned';

export interface AuthState {
  authUser: FirebaseUser | null;
  profile: UserProfile | null;
  stage: AuthStage;
  authError: string;
  setAuth: (user: FirebaseUser | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setStage: (stage: AuthStage) => void;
  setAuthError: (error: string) => void;
  patchProfile: (patch: Partial<UserProfile>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  authUser: null,
  profile: null,
  stage: 'loading',
  authError: '',
  setAuth: (authUser) => set({ authUser }),
  setProfile: (profile) => set({ profile }),
  setStage: (stage) => set({ stage }),
  setAuthError: (authError) => set({ authError }),
  patchProfile: (patch) =>
    set((s) => (s.profile ? { profile: { ...s.profile, ...patch } } : s)),
  logout: () => set({ authUser: null, profile: null, stage: 'signedOut', authError: '' }),
}));
