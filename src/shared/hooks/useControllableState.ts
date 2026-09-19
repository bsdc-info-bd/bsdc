/**
 * BSDC — src/shared/hooks/useControllableState.ts
 * Purpose : Controlled/uncontrolled state for every primitive (PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every BSDC primitive supports both modes, which is what makes the design-system lab
 *           able to drive them and product code able to own the state.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * State that can be controlled from outside or managed internally.
 * @param controlled externally supplied value (undefined means uncontrolled)
 * @param defaultValue initial internal value
 * @param onChange notified on every change
 * @returns a [value, setValue] tuple
 */
export function useControllableState<T>(
  controlled: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, Dispatch<SetStateAction<T>>] {
  const [internal, setInternal] = useState<T>(defaultValue);
  const value = controlled ?? internal;

  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (next) => {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(value) : next;
      if (controlled === undefined) setInternal(resolved);
      onChange?.(resolved);
    },
    [controlled, onChange, value],
  );

  return [value, setValue];
}
