import { isConfigured } from '@/lib/env';
import { toDataError } from '@/lib/supabase/errors';

/**
 * Every feature on BSDC ships as a plugin that can be switched off. Flags
 * live in Postgres; when the database is unreachable the built-in defaults
 * below keep the product working rather than blanking the UI.
 */
export type FlagAudience = 'all' | 'staff' | 'vendor' | 'beta';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  audience: FlagAudience;
  description: string;
}

export const DEFAULT_FLAGS: Readonly<Record<string, boolean>> = {
  'auth.oauth.google': true,
  'auth.oauth.github': true,
  'auth.oauth.yahoo': true,
  'profile.public': true,
  'media.cloudinary': true,
  'media.imgbb': true,
  'realtime.presence': true,
};

export async function fetchFeatureFlags(): Promise<FeatureFlag[]> {
  if (!isConfigured.supabase) {
    return Object.entries(DEFAULT_FLAGS).map(([key, enabled]) => ({
      key,
      enabled,
      audience: 'all' as const,
      description: '',
    }));
  }

  const { getSupabase } = await import('@/lib/supabase/client');
  const { data, error } = await getSupabase()
    .from('feature_flags')
    .select('key, enabled, audience, description');
  if (error) throw toDataError(error);

  return (data ?? []).map((row) => ({
    key: row.key,
    enabled: row.enabled,
    audience: row.audience,
    description: row.description,
  }));
}

/** Resolves a flag for a given viewer, honouring its audience. */
export function isFlagEnabled(
  flags: readonly FeatureFlag[],
  key: string,
  viewer: { staff: boolean; vendor: boolean },
): boolean {
  const flag = flags.find((candidate) => candidate.key === key);
  if (!flag) return DEFAULT_FLAGS[key] ?? false;
  if (!flag.enabled) return false;
  if (flag.audience === 'staff') return viewer.staff;
  if (flag.audience === 'vendor') return viewer.vendor || viewer.staff;
  if (flag.audience === 'beta') return viewer.staff;
  return true;
}
