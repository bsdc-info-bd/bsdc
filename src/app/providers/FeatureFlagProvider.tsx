/**
 * BSDC — src/app/providers/FeatureFlagProvider.tsx
 * Purpose : Publishes flag state to React and re-evaluates scheduled windows (PART 04 LAW-11).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Flags are read through `useFlag`, so a scheduled enable or disable takes effect on the
 *           next minute boundary without a redeploy (ADR-016).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isEnabled, setFlagPersistence, type FlagState } from '@/core/flags/flagClient';
import { readJson, writeJson } from '@/shared/lib/storage';
import { useInterval } from '@/shared/hooks';

const FLAG_STORAGE_KEY = 'flags';

/** Storage-backed flag overlay, injected once at provider mount (ADR-003). */
const flagPersistence = {
  read: (): readonly FlagState[] => readJson<FlagState[]>(FLAG_STORAGE_KEY, []),
  write: (states: readonly FlagState[]): void => {
    writeJson(FLAG_STORAGE_KEY, states);
  },
};

setFlagPersistence(flagPersistence);

/** Flag context value. */
export interface FlagContextValue {
  /** Monotonic counter that changes whenever any flag flips. */
  readonly version: number;
  readonly isEnabled: (key: string) => boolean;
}

const FlagContext = createContext<FlagContextValue>({ version: 0, isEnabled });

/**
 * Provides feature-flag state.
 * @param children application tree
 * @returns children wrapped in the flag context
 */
export function FeatureFlagProvider({ children }: { children: ReactNode }): ReactNode {
  const [version, setVersion] = useState(0);

  // Flags scheduled to change mid-session are re-evaluated on the minute boundary.
  useInterval(() => setVersion((value) => value + 1), 60_000, false);

  useEffect(() => {
    setVersion((value) => value + 1);
  }, []);

  return <FlagContext.Provider value={{ version, isEnabled }}>{children}</FlagContext.Provider>;
}

/**
 * Reads a feature flag reactively.
 * @param key flag key
 * @returns true when the feature is enabled
 */
export function useFlag(key: string): boolean {
  const { version, isEnabled: check } = useContext(FlagContext);
  // `version` participates in the dependency list so scheduled flips re-render consumers.
  return version >= 0 ? check(key) : false;
}
