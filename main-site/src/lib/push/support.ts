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
  | 'unconfigured'
  /** iOS, in a browser tab. Web push is only delivered to an installed web app there. */
  | 'ios-install';

export interface PushEnvironment {
  secureContext: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  vapidPublicKey: string;
  /** iOS, including an iPad reporting itself as a Mac, which is what Safari 13+ does. */
  ios: boolean;
  /** Running from the home-screen icon rather than a tab. */
  standalone: boolean;
}

/** The i18n key for each reason, and the one for "it works". */
export const PUSH_BLOCK_KEYS: Record<PushBlock, string> = {
  ok: 'push.ready',
  insecure: 'push.blocked.insecure',
  'no-worker': 'push.blocked.noWorker',
  'no-push': 'push.blocked.noPush',
  'no-notification': 'push.blocked.noNotification',
  unconfigured: 'push.blocked.unconfigured',
  'ios-install': 'push.blocked.iosInstall',
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

  // Every other reason here is a browser that cannot do push. This one is a browser
  // that can but will not: iOS 16.4+ delivers a web push only to a web app the member
  // added to the home screen, and says nothing at all to the tab. Saying "supported"
  // and then never notifying is the worse answer, so the card asks for the install
  // instead of offering a switch that lies.
  let block: PushBlock = 'ok';
  if (!env.secureContext) block = 'insecure';
  else if (!env.serviceWorker) block = 'no-worker';
  else if (!env.pushManager) block = 'no-push';
  else if (!env.notification) block = 'no-notification';
  else if (!configured) block = 'unconfigured';
  else if (env.ios && !env.standalone) block = 'ios-install';

  return { block, supported: block === 'ok', blockKey: PUSH_BLOCK_KEYS[block] };
}

/** Reads the environment this page is actually running in. */
export function readPushEnvironment(vapidPublicKey: string): PushEnvironment {
  const navigation = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  const agent = navigation?.userAgent ?? '';
  return {
    secureContext: globalThis.isSecureContext === true,
    serviceWorker: typeof navigation?.serviceWorker?.register === 'function',
    pushManager: typeof navigation?.serviceWorker?.ready === 'object',
    notification: typeof globalThis.Notification === 'function',
    vapidPublicKey,
    ios:
      /(?:iPhone|iPod|iPad)/.test(agent) ||
      (/Macintosh/.test(agent) && (navigation?.maxTouchPoints ?? 0) > 1),
    standalone: runningStandalone(),
  };
}

/**
 * Whether this is the installed app rather than a tab.
 *
 * `display-mode` is the standard answer and `navigator.standalone` is iOS's own,
 * because Safari reports the display mode of a home-screen web app as `browser` in
 * some versions. Either one is enough, and no `matchMedia` at all (an old browser,
 * or a worker context) means a tab.
 */
export function runningStandalone(): boolean {
  try {
    const media = globalThis.matchMedia;
    if (typeof media === 'function' && media('(display-mode: standalone)').matches) return true;
    return (
      (globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined)?.standalone ===
      true
    );
  } catch {
    return false;
  }
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

/**
 * Whether a recorded device can still be woken, in the words the list uses.
 *
 * `state` is what `my_push_devices()` says (0072). `live` is the only one that
 * means a notification will arrive; the other two are shown rather than hidden,
 * because a member looking at "3 devices" and getting no notifications deserves
 * to be told that two of the three stopped being reachable.
 */
export type PushDeviceState = 'live' | 'invalid' | 'dead';

export interface DeviceStateWords {
  /** A short label for the row, or empty for a live device. */
  label: string;
  /** The i18n key of the sentence that explains the state. */
  key: string;
  /** `dead` and `invalid` are worth a warning tone; `live` is not. */
  tone: 'quiet' | 'warn';
}

export const PUSH_DEVICE_STATE_KEYS: Record<PushDeviceState, string> = {
  live: 'push.state.live',
  invalid: 'push.state.invalid',
  dead: 'push.state.dead',
};

export function describeDeviceState(state: PushDeviceState, language: string): DeviceStateWords {
  if (state === 'dead') {
    return {
      label: language === 'en' ? 'Stopped' : 'বন্ধ',
      key: PUSH_DEVICE_STATE_KEYS.dead,
      tone: 'warn',
    };
  }
  if (state === 'invalid') {
    return {
      label: language === 'en' ? 'Needs a visit' : 'খুলুন',
      key: PUSH_DEVICE_STATE_KEYS.invalid,
      tone: 'warn',
    };
  }
  return { label: '', key: PUSH_DEVICE_STATE_KEYS.live, tone: 'quiet' };
}

/**
 * The one sentence a member needs when some of their devices cannot be woken.
 *
 * Returns `null` when every device is live, which is the common case and should
 * cost the card no vertical space at all.
 */
export function staleDevicesNote(
  states: readonly PushDeviceState[],
  language: string,
): string | null {
  const dead = states.filter((state) => state === 'dead').length;
  const invalid = states.filter((state) => state === 'invalid').length;
  if (dead === 0 && invalid === 0) return null;

  const parts: string[] = [];
  if (dead > 0) {
    parts.push(
      language === 'en'
        ? `${count(dead, 'device')} stopped answering`
        : `${toBanglaDigits(dead)}টি ডিভাইস আর সাড়া দিচ্ছে না`,
    );
  }
  if (invalid > 0) {
    parts.push(
      language === 'en'
        ? `${count(invalid, 'device')} needs to be opened once`
        : `${toBanglaDigits(invalid)}টি ডিভাইস একবার খুলতে হবে`,
    );
  }
  const joined = parts.join(language === 'en' ? ', ' : ', ');
  return language === 'en'
    ? `${joined}. Notifications are not reaching those. Open the browser once and it re-registers.`
    : `${joined}। ওগুলোতে নোটিফিকেশন পৌঁছাচ্ছে না। ব্রাউজারটি একবার খুললেই আবার যুক্ত হবে।`;
}

function count(value: number, noun: string): string {
  return value === 1 ? `1 ${noun}` : `${value} ${noun}s`;
}
