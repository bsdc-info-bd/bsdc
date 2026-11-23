/**
 * Which transport this browser should be woken through, and why.
 *
 * Two transports can reach a browser tab and they are not interchangeable:
 *
 * - **webpush** is the site's own VAPID key. The browser subscribes to whatever
 *   push service it likes, this site signs the request with `PUSH_VAPID_PRIVATE_KEY`,
 *   and `/sw.js` — a worker this repository owns — receives the message and asks
 *   `/api/push/content` what the member missed. Nothing outside this deployment is
 *   in the loop.
 * - **fcm** hands the subscription to Firebase Cloud Messaging instead. It is the
 *   transport the Android app uses, and it is the one that fails on the web in a
 *   way no member can fix: the key is not this site's VAPID key but the *Web Push
 *   certificate* uploaded to the Firebase project, and FCM frames a push in its own
 *   format, so only a worker that imports `firebase/messaging` can decode it. A
 *   subscription registered against a worker without that code either cannot be
 *   created at all — which is the "Firebase could not issue a token" the settings
 *   page used to end on — or is created and then deaf.
 *
 * So the site's own transport is the default, and FCM is only chosen when an
 * operator asked for it by name *and* every one of its four preconditions holds.
 * Declining is not an error to show a member: when FCM is asked for and cannot
 * work, this returns the fallback and the reason, and the reason is what support reads.
 *
 * Pure, and it has to stay that way: it is the whole decision, so it can be
 * exhausted in a test instead of discovered in a browser.
 */

export type PushTransport = 'webpush' | 'fcm';

/**
 * Why the choice is what it is. Stable strings: they are recorded in
 * `recordPushAttempt`, printed by the diagnostics probe, named in the runbook and
 * asserted by `transport.test.ts`, so renaming one is a deliberate act.
 */
export type TransportReason =
  /** This site's key is available, so nothing else has to be true. */
  | 'site-key'
  /** The operator asked for plain web push and the key is there. */
  | 'requested-webpush'
  /** Asked for, configured, and the deployed worker can decode an FCM message. */
  | 'requested-fcm'
  /** Asked for, but `/sw.js` has no Firebase code, so an FCM push would never be read. */
  | 'requested-fcm-deaf-worker'
  /** Asked for, but the Firebase web config or the certificate is missing. */
  | 'requested-fcm-unconfigured'
  /** No site key, but FCM is configured end to end, so it beats nothing. */
  | 'fcm-only'
  /** Neither transport can be offered; the settings card says what to set. */
  | 'no-key'
  /** Chosen only after the first transport threw, or was marked broken in this browser. */
  | 'fallback-site-key';

export interface TransportInput {
  /** `VITE_PUSH_VAPID_PUBLIC_KEY`, or the same key read from the deployment. */
  siteKey: string;
  /** `VITE_FIREBASE_VAPID_PUBLIC_KEY` — Firebase's Web Push certificate, not a VAPID twin. */
  firebaseKey: string;
  /** `isConfigured.firebase` plus the four values `getToken` sends to FCM with. */
  firebaseReady: boolean;
  /** `firebase/messaging`'s own `isSupported()`, which a browser without push fails. */
  firebaseSupported: boolean;
  /** Whether the registered worker answered the capability ping with `fcm`. */
  firebaseWorker: boolean;
  /** `VITE_PUSH_TRANSPORT`, trimmed and lower-case: `fcm`, `webpush`, or empty. */
  requested: string;
  /**
   * Transports this browser should not offer again right now, because one just
   * refused them. `push-config` fills this from the cooldown marks; leaving it out
   * is the same as an empty list.
   */
  disabled?: readonly PushTransport[];
}

export interface TransportChoice {
  transport: PushTransport | null;
  reason: TransportReason;
}

/**
 * A P-256 public key, uncompressed, base64url without padding: 65 bytes, so 86 or
 * 87 characters, and `support.ts` allows to 140 the way it always has. Anything
 * else cannot be handed to `PushManager.subscribe` — a truncated key copied out of
 * a console is the usual culprit — and the browser's refusal is a `DataError` that
 * names neither the key nor the fix.
 */
export function isVapidPublicKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{80,140}$/.test(value.trim());
}

/** The four Firebase values `getToken` needs; `isConfigured.firebase` only checks two. */
export function firebaseWebConfigReady(values: {
  apiKey: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
}): boolean {
  return (
    values.apiKey.trim().length > 0 &&
    values.projectId.trim().length > 0 &&
    values.messagingSenderId.trim().length > 0 &&
    values.appId.trim().length > 0
  );
}

export function chooseTransport(input: TransportInput): TransportChoice {
  const disabled = new Set(input.disabled ?? []);
  const site = !disabled.has('webpush') && isVapidPublicKey(input.siteKey);
  const firebase =
    !disabled.has('fcm') &&
    isVapidPublicKey(input.firebaseKey) &&
    input.firebaseReady &&
    input.firebaseSupported;

  if (input.requested === 'webpush') {
    return site
      ? { transport: 'webpush', reason: 'requested-webpush' }
      : { transport: null, reason: 'no-key' };
  }

  if (input.requested === 'fcm') {
    // Marked broken in this browser: the request cannot be honoured today, so the
    // reason is the fallback rather than a claim that the configuration is wrong.
    if (disabled.has('fcm')) {
      return site
        ? { transport: 'webpush', reason: 'fallback-site-key' }
        : { transport: null, reason: 'requested-fcm-unconfigured' };
    }
    // Asked for by name and unable to work is still an answer worth giving: the
    // reason names what is missing for support, the transport is whatever the
    // browser can actually be woken through. A member is never left holding a
    // switch that only knows the operator's configuration is half-done.
    const blocked = firebase
      ? input.firebaseWorker
        ? null
        : 'requested-fcm-deaf-worker'
      : 'requested-fcm-unconfigured';
    if (blocked === null) return { transport: 'fcm', reason: 'requested-fcm' };
    return site ? { transport: 'webpush', reason: blocked } : { transport: null, reason: blocked };
  }

  if (site) return { transport: 'webpush', reason: 'site-key' };
  if (firebase && input.firebaseWorker) return { transport: 'fcm', reason: 'fcm-only' };
  return { transport: null, reason: 'no-key' };
}

/**
 * How long a failed transport stays refused, after which the site looks again.
 *
 * Long enough that a member refreshing the settings page is not sent into the same
 * dead end, short enough that an operator who fixes the deployment while a tab
 * sits open is not punished for it: the next morning's load picks the transport up.
 */
export const BROKEN_TRANSPORT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function transportCooldownKey(transport: PushTransport): string {
  return `bsdc.push.transport.${transport}.unavailable`;
}

/** Whether `transport` gave up recently enough that it should not be tried again. */
export function transportInCooldown(
  transport: PushTransport,
  read: (key: string) => string | null,
  now: number,
  window = BROKEN_TRANSPORT_COOLDOWN_MS,
): boolean {
  const raw = read(transportCooldownKey(transport));
  if (raw === null) return false;
  const marked = Number(raw);
  if (!Number.isFinite(marked) || marked <= 0) return false;
  return now - marked < window;
}
