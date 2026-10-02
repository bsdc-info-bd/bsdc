import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  type Unsubscribe,
} from 'firebase/database';
import { getRtdb, RTDB_PATHS } from './rtdb';

export type PresenceState = 'online' | 'away' | 'offline';

export interface PresenceRecord {
  state: PresenceState;
  changedAt: number;
  device: string;
}

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/mobile/i.test(ua)) return 'mobile';
  return 'web';
}

function isPresenceRecord(value: unknown): value is PresenceRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record['state'] === 'online' || record['state'] === 'away' || record['state'] === 'offline') &&
    typeof record['changedAt'] === 'number'
  );
}

/**
 * Publishes presence for the signed-in member and registers the onDisconnect
 * handler, so a closed laptop is reported as offline by the server rather
 * than staying online forever.
 */
export function trackPresence(uid: string): () => void {
  const database = getRtdb();
  const presenceRef = ref(database, RTDB_PATHS.presence(uid));
  const connectedRef = ref(database, '.info/connected');
  const device = deviceLabel();

  const write = (state: PresenceState) =>
    set(presenceRef, { state, changedAt: serverTimestamp(), device });

  const stopConnection: Unsubscribe = onValue(connectedRef, (snapshot) => {
    if (snapshot.val() !== true) return;
    void onDisconnect(presenceRef)
      .set({ state: 'offline', changedAt: serverTimestamp(), device })
      .then(() => write('online'))
      .catch(() => undefined);
  });

  const onVisibility = () => {
    void write(document.visibilityState === 'visible' ? 'online' : 'away');
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    stopConnection();
    void write('offline').catch(() => undefined);
  };
}

/** Subscribes to one member's presence. Returns an unsubscribe function. */
export function subscribeToPresence(
  uid: string,
  listener: (presence: PresenceRecord) => void,
): () => void {
  const presenceRef = ref(getRtdb(), RTDB_PATHS.presence(uid));
  return onValue(presenceRef, (snapshot) => {
    const value: unknown = snapshot.val();
    listener(
      isPresenceRecord(value) ? value : { state: 'offline', changedAt: 0, device: 'unknown' },
    );
  });
}
