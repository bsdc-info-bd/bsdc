import { dataErrorKey } from '@/lib/supabase/errors';

/**
 * Push registration is the one write in the notification flow that necessarily
 * crosses both browser and database APIs. An unrecognised database/PostgREST
 * refusal used to leak the generic "data service" message in this UI, which
 * gave a member no clue whether their notification permission had failed or the
 * subscription had not been saved. Keep known sign-in/permission errors intact;
 * turn only the generic fallback into the push-specific recovery message.
 */
export function pushRegistrationErrorKey(error: unknown): string {
  const key = dataErrorKey(error);
  return key === 'data.errors.generic' ? 'push.errors.failed' : key;
}
