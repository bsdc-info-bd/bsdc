/**
 * BSDC — src/app/providers/OfflineProvider.tsx
 * Purpose : Connectivity context that drives the offline banner and the queued-action indicator
 *           (PART 16.1, PART 26, BSDC-NET-001).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The provider renders no chrome itself; widgets read the context so the banner appears
 *           exactly once, at the shell level.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useOnline } from '@/shared/hooks';

/** Connectivity context value. */
export interface OfflineContextValue {
  readonly online: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({ online: true });

/**
 * Provides connectivity state.
 * @param children application tree
 * @returns children wrapped in the offline context
 */
export function OfflineProvider({ children }: { children: ReactNode }): ReactNode {
  const online = useOnline();
  const value = useMemo<OfflineContextValue>(() => ({ online }), [online]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/**
 * Reads connectivity state.
 * @returns whether the browser reports a connection
 */
export function useOfflineStatus(): OfflineContextValue {
  return useContext(OfflineContext);
}
