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
  // Raised by apply_to_job / submit_proposal when the unique key resolves the
  // second request instead of the constraint doing it: a member who submits
  // twice is told they already have, not that a value is "already in use".
  'job/already-applied': 'data.errors.alreadyApplied',
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
