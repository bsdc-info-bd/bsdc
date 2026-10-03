import { create } from 'zustand';
import type { Profile } from '@/lib/profile/profile-service';

interface ProfileState {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  loading: false,
  error: null,
  setProfile: (profile) => set({ profile, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
