/**
 * BSDC — src/services/realtime/presence.ts
 * Purpose : Account presence in the Realtime Database (PART 14.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Presence is the canonical ephemeral state: it must disappear when a device dies, which
 *   only `onDisconnect` can guarantee. The record holds no message content and expires with the
 *   connection. Watching someone's presence goes through the listener registry, so a profile
 *   card, a chat header and a member list watching the same account share one subscription.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { presencePath } from '@/core/config/collections';
import { rtdbGet, rtdbOnValue, rtdbSet, rtdbUpdate } from '@/services/firebase/database';
import { acquireListener, type Unsubscribe } from './registry';

/** Presence states. `offline` is also the value written by the disconnect hook. */
export const PRESENCE_STATES = ['online', 'away', 'offline'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/** A presence record as stored in the Realtime Database. */
export interface PresenceRecord {
  readonly state: PresenceState;
  readonly lastChanged: number;
  readonly device?: string;
  readonly locale?: string;
}

/** Options for publishing presence. */
export interface PresenceOptions {
  readonly device?: string;
  readonly locale?: string;
}

/**
 * Publishes a presence state for an account.
 * @param uid account id
 * @param state presence state
 * @param options device and locale metadata
 */
export async function publishPresence(
  uid: string,
  state: PresenceState,
  options: PresenceOptions = {},
): Promise<void> {
  await rtdbUpdate(presencePath(uid), {
    state,
    lastChanged: Date.now(),
    ...(options.device !== undefined ? { device: options.device } : {}),
    ...(options.locale !== undefined ? { locale: options.locale } : {}),
  });
}

/**
 * Reads a presence record once.
 * @param uid account id
 * @returns the record, or null when the account has never been seen
 */
export async function readPresence(uid: string): Promise<PresenceRecord | null> {
  const value = await rtdbGet(presencePath(uid));
  if (value === null || typeof value !== 'object') return null;
  const record = value as Partial<PresenceRecord>;
  const state = PRESENCE_STATES.find((candidate) => candidate === record.state) ?? 'offline';
  return { state, lastChanged: typeof record.lastChanged === 'number' ? record.lastChanged : 0 };
}

/**
 * Watches an account's presence. Reference counted through the listener registry.
 * @param uid account id
 * @param handler receives the current record, or null when unknown
 * @returns a release function
 */
export function watchPresence(
  uid: string,
  handler: (record: PresenceRecord | null) => void,
): Unsubscribe {
  return acquireListener(`presence:${uid}`, 'presence', () =>
    rtdbOnValue(presencePath(uid), (value) => {
      if (value === null || typeof value !== 'object') {
        handler(null);
        return;
      }
      const record = value as Partial<PresenceRecord>;
      const state = PRESENCE_STATES.find((candidate) => candidate === record.state) ?? 'offline';
      handler({
        state,
        lastChanged: typeof record.lastChanged === 'number' ? record.lastChanged : 0,
        ...(typeof record.device === 'string' ? { device: record.device } : {}),
        ...(typeof record.locale === 'string' ? { locale: record.locale } : {}),
      });
    }),
  );
}

/**
 * Starts a self-presence session: publishes `online`, arms the disconnect hook and mirrors
 * document visibility into `away`.
 * @param uid account id
 * @param options device and locale metadata
 * @returns a stop function that publishes `offline` and releases everything
 */
export async function startPresenceSession(
  uid: string,
  options: PresenceOptions = {},
): Promise<Unsubscribe> {
  const { onDisconnect } = await import('firebase/database');
  const { rtdbRef } = await import('@/services/firebase/database');
  const reference = await rtdbRef(presencePath(uid));

  await rtdbSet(presencePath(uid), {
    state: 'online',
    lastChanged: Date.now(),
    ...(options.device !== undefined ? { device: options.device } : {}),
    ...(options.locale !== undefined ? { locale: options.locale } : {}),
  });

  await onDisconnect(reference).update({ state: 'offline', lastChanged: Date.now() });

  const sync = (): void => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    void publishPresence(uid, hidden ? 'away' : 'online', options).catch(() => undefined);
  };

  const heartbeat = setInterval(sync, 25_000);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', sync);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pagehide', sync);
    void publishPresence(uid, 'offline', options).catch(() => undefined);
  };
}
