/**
 * BSDC — src/shared/lib/storage.ts
 * Purpose : Safe, quota-aware wrappers around localStorage/sessionStorage (PART 26).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Storage is namespaced with `bsdc:` and every call is guarded: private-mode Safari and
 *           locked-down webviews throw on access, and a storage failure must never break render.
 *           Tokens are never stored here (PART 05.04).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

const NAMESPACE = 'bsdc:';

/**
 * Writes a JSON-serialisable value.
 * @param key storage key (without namespace)
 * @param value value to persist
 * @param session whether to use sessionStorage instead of localStorage
 * @returns true when the write succeeded
 */
export function writeJson(key: string, value: unknown, session = false): boolean {
  const storage = session ? safeSession() : safeLocal();
  if (!storage) return false;
  try {
    storage.setItem(`${NAMESPACE}${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads and parses a stored value.
 * @param key storage key (without namespace)
 * @param fallback value returned when missing or unparsable
 * @param session whether to read from sessionStorage
 * @returns the parsed value or the fallback
 */
export function readJson<T>(key: string, fallback: T, session = false): T {
  const storage = session ? safeSession() : safeLocal();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(`${NAMESPACE}${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Removes a stored value.
 * @param key storage key (without namespace)
 * @param session whether to target sessionStorage
 */
export function removeKey(key: string, session = false): void {
  const storage = session ? safeSession() : safeLocal();
  try {
    storage?.removeItem(`${NAMESPACE}${key}`);
  } catch {
    /* Storage is unavailable; nothing to remove. */
  }
}

/**
 * Returns localStorage when it is usable.
 * @returns Storage or null
 */
export function safeLocal(): Storage | null {
  try {
    const probe = '__bsdc_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Returns sessionStorage when it is usable.
 * @returns Storage or null
 */
export function safeSession(): Storage | null {
  try {
    const probe = '__bsdc_probe__';
    window.sessionStorage.setItem(probe, '1');
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return null;
  }
}
