import { DataError, dataErrorKey } from '@/lib/supabase/errors';
import { PROFILE_MISSING_MESSAGE } from './post-repository';

/**
 * Decides what a failed save should do, kept separate from the draft
 * validation issues so a database error never appears under the "This cannot
 * be published yet" heading. Draft validation uses compose.errors.*; a failed
 * write uses data.errors.*; a missing profile routes to onboarding.
 */
export type ComposeSaveError =
  | { kind: 'onboarding'; messageKey: string }
  | { kind: 'data'; messageKey: string };

export function classifyComposeSaveError(error: unknown): ComposeSaveError {
  if (error instanceof DataError && error.message === PROFILE_MISSING_MESSAGE) {
    return { kind: 'onboarding', messageKey: dataErrorKey(error) };
  }
  return { kind: 'data', messageKey: dataErrorKey(error) };
}
