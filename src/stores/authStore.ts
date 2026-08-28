import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserProfile, UserRole } from '@/types';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  hasRole: (role: UserRole) => boolean;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setProfile: (profile) => set({ profile }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      logout: () =>
        set({
          user: null,
          profile: null,
          isAuthenticated: false,
          error: null,
        }),

      hasRole: (role) => {
        const { user } = get();
        if (!user) return false;
        const roleHierarchy: UserRole[] = [
          'OWNER',
          'SUPER_ADMIN',
          'ADMIN',
          'MANAGEMENT',
          'MANAGER',
          'MODERATOR',
          'EDITOR',
          'SUPPORT',
          'VERIFIED_CREATOR',
          'VERIFIED_ORGANIZATION',
          'USER',
        ];
        const userIndex = roleHierarchy.indexOf(user.role);
        const targetIndex = roleHierarchy.indexOf(role);
        return userIndex !== -1 && userIndex <= targetIndex;
      },

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') return true;
        return user.permissions.includes(permission as any);
      },
    }),
    {
      name: 'bsdc-auth',
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
