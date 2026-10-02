/**
 * Client-side attempt throttling with a visible lockout timer. The server-side
 * limits inside Pages Functions remain the real control; this stops a member
 * from hammering Firebase and gives honest feedback.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

interface AttemptState {
  attempts: number[];
  lockedUntil: number;
}

const STORAGE_PREFIX = 'bsdc.attempts.';

function read(key: string): AttemptState {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return { attempts: [], lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<AttemptState>;
    return {
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
    };
  } catch {
    return { attempts: [], lockedUntil: 0 };
  }
}

function write(key: string, state: AttemptState): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch {
    // Throttling is best-effort when storage is unavailable.
  }
}

/** Seconds remaining in the current lockout, or 0 when the action is allowed. */
export function lockoutSecondsRemaining(key: string, now = Date.now()): number {
  const state = read(key);
  return state.lockedUntil > now ? Math.ceil((state.lockedUntil - now) / 1000) : 0;
}

export function registerFailedAttempt(key: string, now = Date.now()): number {
  const state = read(key);
  const attempts = [...state.attempts.filter((time) => now - time < WINDOW_MS), now];
  const lockedUntil = attempts.length >= MAX_ATTEMPTS ? now + LOCKOUT_MS : state.lockedUntil;
  write(key, { attempts: lockedUntil > now ? [] : attempts, lockedUntil });
  return lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;
}

export function clearAttempts(key: string): void {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
