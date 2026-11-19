import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Database failures are translated into the same bilingual key space the rest
 * of the app uses. Postgres messages, constraint names and SQL state codes are
 * never shown to a member.
 */
const MESSAGE_MAP: Record<string, string> = {
  'profile/username-taken': 'auth.errors.usernameTaken',
  'profile/username-invalid': 'auth.validation.usernameInvalid',
  'profile/username-reserved': 'auth.validation.usernameReserved',
  'profile/username-cooldown': 'handle.errors.cooldown',
  'profile/not-found': 'data.errors.notFound',
  'profile/missing': 'data.errors.profileMissing',
  'auth/required': 'data.errors.signInRequired',
  'push/auth-required': 'data.errors.signInRequired',
  'push/account-inactive': 'data.errors.forbidden',
  'push/invalid-endpoint': 'push.errors.failed',
  'push/invalid-key': 'push.errors.failed',
  'push/invalid-token': 'push.errors.failed',
  // Raised by apply_to_job / submit_proposal when the unique key resolves the
  // second request instead of the constraint doing it: a member who submits
  // twice is told they already have, not that a value is "already in use".
  'job/already-applied': 'data.errors.alreadyApplied',
  // Raised by 0121 and by the composer's own check: a poll somebody voted on
  // keeps its options, so an edit that rewrites them is refused with a sentence
  // that says why rather than a constraint name.
  'poll/options-locked': 'compose.errors.pollLocked',
  // Raised by `prepare_comment` (0120). Without these the refusal arrived as
  // `42501` and the member read "your role does not allow this action" — which is
  // true of the code and false of the situation: their role was fine, the picture
  // simply was not in `media_assets` yet, and the comment box has no way to say
  // so. Both sentences now name what actually happened.
  'that picture was not uploaded by this member': 'media.errors.notRecorded',
  'comments are closed on this post': 'post.commentsClosed',
  'gig/already-proposed': 'data.errors.alreadyProposed',
};

const CODE_MAP: Record<string, string> = {
  // 23505 unique_violation: a value that must be unique is already taken.
  '23505': 'data.errors.conflict',
  // 23503 foreign_key_violation: the row being pointed at does not exist —
  // the honest reading is "that record no longer exists", never "already in
  // use". Mapping it to conflict is what told a member their missing profile
  // was a duplicate.
  '23503': 'data.errors.notFound',
  '23514': 'data.errors.invalid',
  '22023': 'data.errors.invalid',
  '28000': 'data.errors.signInRequired',
  '42501': 'data.errors.forbidden',
  P0002: 'data.errors.notFound',
  PGRST301: 'data.errors.signInRequired',
  PGRST116: 'data.errors.notFound',
};

function isPostgrestError(value: unknown): value is PostgrestError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    'code' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}

/**
 * Postgrest returns plain objects, not Errors. Wrapping them keeps stack
 * traces, lets `instanceof` work and satisfies the "only throw errors" rule.
 */
export class DataError extends Error {
  readonly code: string;
  readonly messageKey: string;

  constructor(cause: unknown) {
    const postgrest = isPostgrestError(cause) ? cause : null;
    super(postgrest?.message ?? (cause instanceof Error ? cause.message : 'data/unknown'));
    this.name = 'DataError';
    this.code = postgrest?.code ?? '';
    this.messageKey = dataErrorKey(cause);
    if (cause instanceof Error && cause.stack !== undefined) this.stack = cause.stack;
  }
}

/**
 * supabase-js returns a PostgREST error as a plain object, not an `Error`, and
 * `if (error) throw error` then throws that object. A catch that asks
 * `instanceof Error` does not see the message and shows a generic line instead
 * of the reason. This keeps the message and code and returns a real `Error`.
 */
export function asDatabaseError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : 'data/unknown';
  return Object.assign(new Error(message || 'data/unknown'), {
    code:
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code ?? '')
        : '',
    details:
      typeof error === 'object' && error !== null && 'details' in error
        ? (error as { details: unknown }).details
        : null,
    hint:
      typeof error === 'object' && error !== null && 'hint' in error
        ? (error as { hint: unknown }).hint
        : null,
  });
}

/** Normalises anything thrown by the database layer into a DataError. */
export function toDataError(cause: unknown): DataError {
  return cause instanceof DataError ? cause : new DataError(cause);
}

/** Translation key for any database failure. Always returns a usable key. */
export function dataErrorKey(error: unknown): string {
  if (error instanceof DataError) return error.messageKey;
  if (isPostgrestError(error)) {
    for (const [needle, key] of Object.entries(MESSAGE_MAP)) {
      if (error.message.includes(needle)) return key;
    }
    return CODE_MAP[error.code] ?? 'data.errors.generic';
  }
  if (error instanceof Error) {
    const mapped = MESSAGE_MAP[error.message];
    if (mapped) return mapped;
    if (error.name === 'DataAccessBootstrapError') return 'data.errors.accessUnavailable';
    if (error.name === 'SupabaseNotConfiguredError') return 'data.errors.notConfigured';
    if (
      error.name === 'InvalidStateError' ||
      error.name === 'InvalidAccessError' ||
      error.name === 'AbortError' ||
      error.name === 'NotSupportedError'
    ) {
      return 'push.errors.failed';
    }
    if (error.name === 'NotAllowedError') return 'push.errors.permissionDenied';
    if (error.name === 'TypeError') return 'data.errors.offline';
  }
  return 'data.errors.generic';
}

/** True when the failure is worth retrying automatically. */
export function isRetryableDataError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (isPostgrestError(error)) return error.code === '57014' || error.code === '08006';
  return false;
}
