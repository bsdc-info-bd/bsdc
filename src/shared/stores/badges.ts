/**
 * BSDC — src/shared/stores/badges.ts
 * Purpose : Shell badge counts, shared by the header, the bottom bar and the rail.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The counts live in a store so the shell can paint without importing the messenger and
 *   notification repositories: the component that knows how to fetch them is loaded after the
 *   first paint, while everything that merely displays them stays in the initial bundle.
 *   That split is what keeps the unread badge from costing the shell its performance budget.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { create } from 'zustand';

/** Badge counts shown across the shell. */
export interface BadgeState {
  readonly messages: number;
  readonly notifications: number;
  readonly setCounts: (next: { messages: number; notifications: number }) => void;
}

/**
 * The badge store.
 */
export const useBadgeStore = create<BadgeState>()((set) => ({
  messages: 0,
  notifications: 0,
  setCounts: (next) => set(next),
}));

/**
 * Reads the current badge counts.
 * @returns the counts
 */
export function readBadges(): { messages: number; notifications: number } {
  const state = useBadgeStore.getState();
  return { messages: state.messages, notifications: state.notifications };
}
