import { useMemo } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { useProfileStore } from '@/store/profile-store';

export interface JobApplicationPrefill {
  applicantName?: string;
  phone?: string;
  email?: string;
  location?: string;
  skills?: string[];
}

/** Safe defaults only: the member can edit every value before submitting. */
export function useJobApplicationPrefill(): JobApplicationPrefill {
  const user = useAuthStore((state) => state.user);
  const profile = useProfileStore((state) => state.profile);
  return useMemo(
    () => ({
      applicantName: profile?.displayName ?? user?.displayName ?? '',
      // The profile has no phone column. Do not infer one from unrelated data.
      phone: '',
      // Account email is only suggested when the member opted into showing it.
      email: profile?.privacy.showEmail ? (user?.email ?? '') : '',
      location: profile?.location ?? '',
      skills: profile?.skills ?? [],
    }),
    [profile, user],
  );
}
