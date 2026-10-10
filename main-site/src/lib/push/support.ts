/**
 * Whether this browser can be woken at all, and if not, which of the reasons it
 * is.
 *
 * Four things have to line up for push, and each one fails differently: a secure
 * context, a service worker, the push manager behind it, and a VAPID key on this
 * deployment. A member who is told "notifications are not supported" on a phone
 * that simply opened the site over http on a local network is told nothing; the
 * reason is the thing worth showing, because two of the four are fixable.
 *
 * Pure, so it can be tested without a browser that happens to have one of them.
 */

import { toBanglaDigits } from '@/lib/notifications/copy';

export type PushBlock =
  | 'ok'
  | 'insecure'
  | 'no-worker'
  | 'no-push'
  | 'no-notification'
  | 'unconfigured';

export interface PushEnvironment {
  secureContext: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  vapidPublicKey: string;
}

/** The i18n key for each reason, and the one for "it works". */
export const PUSH_BLOCK_KEYS: Record<PushBlock, string> = {
  ok: 'push.ready',
  insecure: 'push.blocked.insecure',
  'no-worker': 'push.blocked.noWorker',
  'no-push': 'push.blocked.noPush',
  'no-notification': 'push.blocked.noNotification',
  unconfigured: 'push.blocked.unconfigured',
};

export function describePushEnvironment(env: PushEnvironment): {
  block: PushBlock;
  supported: boolean;
  blockKey: string;
} {
  // A key that is not base64url of a P-256 point cannot sign anything, and a
  // subscription asked for with a malformed one fails in a way no member can
  // act on. Check its shape before offering the button.
  const configured = /^[A-Za-z0-9_-]{80,140}$/.test(env.vapidPublicKey.trim());

  let block: PushBlock = 'ok';
  if (!env.secureContext) block = 'insecure';
  else if (!env.serviceWorker) block = 'no-worker';
  else if (!env.pushManager) block = 'no-push';
  else if (!env.notification) block = 'no-notification';
  else if (!configured) block = 'unconfigured';

  return { block, supported: block === 'ok', blockKey: PUSH_BLOCK_KEYS[block] };
}

/** Reads the environment this page is actually running in. */
export function readPushEnvironment(vapidPublicKey: string): PushEnvironment {
  const navigation = globalThis.navigator as Navigator | undefined;
  return {
    secureContext: globalThis.isSecureContext === true,
    serviceWorker: typeof navigation?.serviceWorker?.register === 'function',
    pushManager: typeof navigation?.serviceWorker?.ready === 'object',
    notification: typeof globalThis.Notification === 'function',
    vapidPublicKey,
  };
}

/**
 * How many devices this member has. Shown so that turning push off has a number
 * attached to it: "off on three devices" is a fact, "off" is a hope.
 */
export function deviceCountLabel(count: number, language: string): string {
  if (count === 0) return language === 'en' ? 'no devices' : 'কোনো ডিভাইস নেই';
  if (language === 'en') return count === 1 ? '1 device' : `${count} devices`;
  return `${toBanglaDigits(count)}টি ডিভাইস`;
}

/**
 * A device list is only useful if a member can tell their phone from their
 * laptop, and the only thing recorded about either is a user agent. Two facts out
 * of it — the browser and the system — are enough, and a string that says neither
 * is shown as what it is rather than dressed up.
 */
export function describeUserAgent(userAgent: string): string {
  const agent = userAgent.trim();
  if (agent.length === 0) return '';

  const browsers: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\//, 'Edge'],
    [/OPR\/|Opera/, 'Opera'],
    [/SamsungBrowser\//, 'Samsung Internet'],
    [/Firefox\/|FxiOS\//, 'Firefox'],
    [/Chrome\/|CriOS\//, 'Chrome'],
    [/Safari\//, 'Safari'],
  ];
  const systems: [RegExp, string][] = [
    [/Android/, 'Android'],
    [/(iPhone|iPad|iPod)|iOS/, 'iOS'],
    [/Windows NT/, 'Windows'],
    [/Mac OS X|Macintosh/, 'macOS'],
    [/CrOS/, 'ChromeOS'],
    [/Linux/, 'Linux'],
  ];

  const browser = browsers.find(([pattern]) => pattern.test(agent))?.[1] ?? '';
  const system = systems.find(([pattern]) => pattern.test(agent))?.[1] ?? '';
  return [browser, system].filter((part) => part.length > 0).join(' · ');
}
