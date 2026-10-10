/**
 * Handles: what one looks like, and what it costs to change one.
 *
 * The shape here is the shape the database enforces in `claim_username`, written
 * out again so a member is told in the field rather than in a toast after a round
 * trip. Both have to agree, and the proof that they do is t33, which puts every
 * one of these refusals to the real function.
 *
 * A handle is an address other people hold — in a link, a mention, a bookmark, a
 * search result — so changing one is not free. The change waits thirty days, the
 * old address keeps working as a permanent redirect, and the handle that is let go
 * becomes anybody's, at which point the redirect that pointed away from it is
 * taken down. None of that is the client's doing; it is what the routine does.
 */
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type { ProfileRow } from '@/lib/supabase/types';

export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;
export const HANDLE_LIMITS = { min: 3, max: 24 } as const;

/** How long a change waits. The database holds the same thirty days. */
export const HANDLE_COOLDOWN_DAYS = 30;

export type HandleIssue = 'empty' | 'tooShort' | 'tooLong' | 'characters' | 'underscore' | 'same';

export const HANDLE_ISSUE_KEYS: Record<HandleIssue, string> = {
  empty: 'handle.issues.empty',
  tooShort: 'handle.issues.tooShort',
  tooLong: 'handle.issues.tooLong',
  characters: 'handle.issues.characters',
  underscore: 'handle.issues.underscore',
  same: 'handle.issues.same',
};

/** Lower case, no spaces: what a member meant when they typed something close. */
export function normaliseHandle(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

/** The reason a draft handle cannot be used, or null when it can. */
export function handleIssue(draft: string, current?: string | null): HandleIssue | null {
  const handle = normaliseHandle(draft);
  if (handle.length === 0) return 'empty';
  if (handle.length < HANDLE_LIMITS.min) return 'tooShort';
  if (handle.length > HANDLE_LIMITS.max) return 'tooLong';
  if (!/^[a-z0-9_]+$/.test(handle)) return 'characters';
  if (handle.startsWith('_') || handle.endsWith('_')) return 'underscore';
  if (current !== undefined && current !== null && normaliseHandle(current) === handle)
    return 'same';
  return null;
}

/**
 * Takes or changes the caller's own handle. Throws with the database's own
 * message, which `errors.ts` turns into a sentence — including the cooldown,
 * which is the one refusal a member cannot fix by editing what they typed.
 */
export async function changeUsername(handle: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('claim_username', {
    p_username: normaliseHandle(handle),
  });
  if (error) throw toDataError(error);
  const row = data as ProfileRow | null;
  return row?.username ?? normaliseHandle(handle);
}

/**
 * When the handle may next be changed. `null` means now, which is what the
 * routine returns for a member with no handle yet and for one whose thirty days
 * have passed.
 */
export async function fetchNextUsernameChange(): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('next_username_change');
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : null;
}
