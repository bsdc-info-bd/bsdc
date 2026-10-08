import { authErrorKey } from '@/lib/auth/errors';
import { dataErrorKey } from '@/lib/supabase/errors';

/**
 * Profile changes can touch Firebase identity and the Postgres profile row in
 * the same user action. Keep the useful database message (for example a
 * handle conflict or denied write) rather than flattening it into the
 * authentication fallback; use the Firebase mapper only when this is not a
 * data-layer error.
 */
export function profileErrorKey(error: unknown): string {
  // A save that matched no row: the member's profile is missing or unreadable.
  if (error instanceof Error && error.message === 'profile/not-found') {
    return 'profile.errors.notFound';
  }
  const dataKey = dataErrorKey(error);
  return dataKey === 'data.errors.generic' ? authErrorKey(error) : dataKey;
}
