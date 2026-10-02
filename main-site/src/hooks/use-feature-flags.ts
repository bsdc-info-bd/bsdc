import { useQuery } from '@tanstack/react-query';
import { fetchFeatureFlags, isFlagEnabled, type FeatureFlag } from '@/lib/data/feature-flags';
import { useAuthStore } from '@/store/auth-store';

const EMPTY: FeatureFlag[] = [];

/** Reads the plugin registry; falls back to the built-in defaults on error. */
export function useFeatureFlags(): FeatureFlag[] {
  const { data } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFeatureFlags,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return data ?? EMPTY;
}

export function useFeatureFlag(key: string): boolean {
  const flags = useFeatureFlags();
  const claims = useAuthStore((state) => state.claims);
  return isFlagEnabled(flags, key, { staff: claims.staff, vendor: claims.vendor });
}
