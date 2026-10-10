/**
 * What kind of screen this is, decided from signals a browser will actually
 * give us.
 *
 * OAuth on a phone is not OAuth on a laptop. A popup is a new window, and
 * mobile browsers either refuse to open one, open one that cannot come back, or
 * open it inside an in-app browser that has no storage at all — so the same
 * code that works on a tablet fails on a handset with "something went wrong".
 * The honest fix is not to retry the popup harder: it is to take the redirect
 * path first, which is the one mobile browsers are built for.
 *
 * Everything here is a pure function of a plain signals object, so the decision
 * is testable without a browser and without guessing what a user agent will
 * look like next year.
 */
export interface DeviceSignals {
  /** Viewport width in CSS pixels. */
  width: number;
  /** True when the device reports touch as its primary input. */
  touch: boolean;
  userAgent: string;
  /** True when running inside another app's browser, not the user's own. */
  inApp: boolean;
  /** True when installed as a PWA / standalone window. */
  standalone: boolean;
}

/** Below this width a popup is not a window the member can use. */
export const POPUP_MIN_WIDTH = 720;

/**
 * In-app browsers: Facebook, Instagram, Messenger, TikTok, LinkedIn, Telegram,
 * Discord, WeChat, Line and Snapchat all open links inside a webview with no
 * popup support and often no usable storage. Google's own app too.
 */
const IN_APP_PATTERN =
  /\b(fbav|fb_iab|instagram|fban|messenger|tiktok|bytelocale|musical_ly|linkedinapp|telegram|discord|wechat|micromessenger|line\/|snapchat|gsa\/|googleapp|wv)\b/i;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_PATTERN.test(userAgent);
}

/** Touch-first and narrow: a handset, or a small tablet held in portrait. */
export function isPhoneSized(signals: Pick<DeviceSignals, 'width' | 'touch'>): boolean {
  return signals.width > 0 && signals.width < POPUP_MIN_WIDTH && signals.touch;
}

/**
 * Whether sign-in should navigate away instead of opening a popup.
 *
 * An installed PWA is the exception: it has no browser chrome to come back to,
 * and a redirect out of a standalone window often does not return at all, so it
 * keeps the popup and falls back only if the platform refuses it.
 */
export function prefersRedirectFlow(signals: DeviceSignals): boolean {
  if (signals.standalone) return false;
  if (signals.inApp) return true;
  return isPhoneSized(signals);
}

/** Reads the signals from the current browser, or null outside one. */
export function readDeviceSignals(): DeviceSignals | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  const userAgent = navigator.userAgent ?? '';
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari reports it through a navigator property instead.
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const touch =
    navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches === true;
  return {
    width: window.innerWidth || 0,
    touch,
    userAgent,
    inApp: isInAppBrowser(userAgent) && !standalone,
    standalone,
  };
}

/**
 * Whether this browser can keep a session at all.
 *
 * Private-mode Safari, some in-app browsers and any page loaded from a
 * `file://` URL have no usable storage. Sign-in still works for the moment —
 * with an in-memory session — but "keep me signed in" cannot be honoured, and
 * saying so beats failing silently.
 */
export function canPersistSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__bsdc_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
