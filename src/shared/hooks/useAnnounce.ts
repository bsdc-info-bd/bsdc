/**
 * BSDC — src/shared/hooks/useAnnounce.ts
 * Purpose : Screen-reader announcements for route and state changes (PART 04 LAW-14, F-457).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Wraps @react-aria/live-announcer, which manages the two polite/assertive live regions
 *           for us. Announcements are opt-in per user setting and never used for decoration.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback } from 'react';
import { announce } from '@react-aria/live-announcer';

/**
 * Returns an announce function.
 * @returns a callback that announces a message politely or assertively
 */
export function useAnnounce(): (message: string, assertive?: boolean) => void {
  return useCallback((message: string, assertive = false): void => {
    if (message.trim().length === 0) return;
    announce(message, assertive ? 'assertive' : 'polite');
  }, []);
}
