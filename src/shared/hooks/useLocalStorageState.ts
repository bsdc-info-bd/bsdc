/**
 * BSDC — src/shared/hooks/useLocalStorageState.ts
 * Purpose : Persistent React state backed by the guarded storage wrapper (PART 26).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Failures are silent: a blocked storage must never break a render or a form.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useState } from 'react';
import { readJson, writeJson } from '@/shared/lib/storage';

/**
 * State that survives reloads.
 * @param key storage key
 * @param initial initial value
 * @returns a [value, setValue] tuple
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readJson<T>(key, initial));

  const update = useCallback(
    (next: T | ((previous: T) => T)): void => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(previous) : next;
        writeJson(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}
