/**
 * BSDC — src/shared/hooks/useFlag.ts
 * Purpose : Reads a feature flag reactively, from any layer that is allowed to ask.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The flag store lives in core (ADR-003), the provider lives in app, and a feature lives
 *   below both — so a feature that imported the provider's hook would be importing upwards, which
 *   the layering rule forbids. This hook sits in shared instead and listens on the event bus for
 *   `flag:changed`, which the flag client emits whenever an administrator flips one.
 *   The result is the same reactivity without an upward import: turn a flag off in the
 *   administration panel and every surface that asked about it stops the same second.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { isEnabled, onFlagChange } from '@/core/flags/flagClient';

/**
 * Reads a feature flag and re-reads it whenever it changes.
 * @param key flag key, from FLAG_KEYS
 * @returns true when the feature is on
 */
export function useFlag(key: string): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => isEnabled(key));

  useEffect(() => {
    setEnabled(isEnabled(key));
    return onFlagChange(() => setEnabled(isEnabled(key)));
  }, [key]);

  return enabled;
}
