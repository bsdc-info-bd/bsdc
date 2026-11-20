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
  const cause = error instanceof PushStageError ? error.cause : error;
  const key = dataErrorKey(cause);
  if (error instanceof PushStageError) {
    if (error.stage === 'subscribeRefused') {
      const name = browserErrorName(cause);
      if (name === 'NotAllowedError') return 'push.errors.subscribeNotAllowed';
      if (name === 'AbortError') return 'push.errors.subscribeAborted';
      if (name === 'InvalidStateError') return 'push.errors.subscribeInvalidState';
    }
    if (key !== 'data.errors.generic' && key !== 'push.errors.failed') return key;
    return `push.errors.${error.stage}`;
  }
  return key === 'data.errors.generic' ? 'push.errors.failed' : key;
}

export class PushStageError extends Error {
  constructor(
    readonly stage: string,
    cause?: unknown,
  ) {
    super(stage, { cause });
  }
}

let lastAttempt: { mode: string; result: string; at: string } | null = null;

export function latestPushAttempt(): typeof lastAttempt {
  return lastAttempt;
}

export function recordPushAttempt(mode: string, result: string, error?: unknown): void {
  lastAttempt = { mode, result, at: new Date().toISOString() };
  try {
    if (localStorage.getItem('bsdc.push.debug') === '1') {
      console.debug('[BSDC push]', lastAttempt, error);
    }
  } catch {
    // Debugging must not interfere with registration.
  }
}

// DOMException is not necessarily an Error from this JavaScript realm.
export function browserErrorName(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
    ? error.name
    : undefined;
}
