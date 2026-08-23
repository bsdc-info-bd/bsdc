/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Real browser-permission management for BSDC.
 *
 * Why "permission denied" appeared even when allowed:
 *  1. Embedded preview iframes block microphone/geolocation unless the host page
 *     sets allow="microphone; geolocation" — the API then fails instantly with
 *     NotAllowedError. Detect the iframe and offer "Open in a new tab".
 *  2. iOS Safari requires getUserMedia to START inside a real user gesture;
 *     starting it from a setTimeout (hold-to-record) fails the same way.
 *
 * This module centralizes: live PermissionStatus queries, gesture-safe request
 * helpers, precise error classification, and the standalone-tab escape hatch.
 */

export type PermissionKind = 'microphone' | 'geolocation' | 'notifications';
export type PermissionStateInfo = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'iframe';

/** Are we running inside an iframe (preview/embed) where permissions may be blocked? */
export function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** The iframe blocks the API outright — opening the app standalone fixes it. */
export function openStandalone(): void {
  window.open(window.location.href, '_blank', 'noopener,noreferrer');
}

/** Open standalone with the auto-ask flag so the permission card reappears. */
export function openPermissionsStandalone(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('bsdc-permissions', '1');
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
}

/** Query the current permission state without prompting. */
export async function queryPermission(kind: PermissionKind): Promise<PermissionStateInfo> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
  const name = kind === 'microphone' ? 'microphone' : kind === 'geolocation' ? 'geolocation' : 'notifications';
  try {
    const status = await navigator.permissions.query({ name } as PermissionDescriptor);
    return status.state as PermissionStateInfo;
  } catch {
    return 'unsupported';
  }
}

/** Subscribe to live permission changes (returns unsubscribe). */
export async function watchPermission(
  kind: PermissionKind,
  cb: (state: PermissionStateInfo) => void,
): Promise<() => void> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return () => undefined;
  const name = kind === 'microphone' ? 'microphone' : kind === 'geolocation' ? 'geolocation' : 'notifications';
  try {
    const status = await navigator.permissions.query({ name } as PermissionDescriptor);
    const handler = () => cb(status.state as PermissionStateInfo);
    status.addEventListener('change', handler);
    cb(status.state as PermissionStateInfo);
    return () => status.removeEventListener('change', handler);
  } catch {
    return () => undefined;
  }
}

export interface PermissionAction {
  code: 'iframe' | 'denied-in-settings' | 'no-device' | 'insecure' | 'unsupported' | 'unknown';
  message: string;
  openTab?: boolean;
}

/** Classify a permission error into a precise, actionable result. */
export function describePermissionError(kind: PermissionKind, err: unknown): PermissionAction {
  const name = (err as Error)?.name || '';
  if (inIframe() && (name === 'NotAllowedError' || name === 'PermissionDeniedError')) {
    return {
      code: 'iframe',
      message: `${labelOf(kind)} is blocked inside embedded previews — open BSDC in a new tab to allow it.`,
      openTab: true,
    };
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      code: 'denied-in-settings',
      message: `${labelOf(kind)} is blocked for this site in your browser settings — allow it from the address-bar lock icon, then try again.`,
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { code: 'no-device', message: `No ${kind === 'microphone' ? 'microphone' : 'location device'} was found on this device.` };
  }
  if (name === 'SecurityError' || location.protocol === 'http:') {
    return { code: 'insecure', message: `${labelOf(kind)} requires a secure (https) connection.` };
  }
  if (name === 'TypeError' || name === 'NotSupportedError') {
    return { code: 'unsupported', message: `${labelOf(kind)} is not supported by this browser.` };
  }
  return { code: 'unknown', message: `Could not access ${labelOf(kind).toLowerCase()}. Please try again.` };
}

function labelOf(kind: PermissionKind): string {
  return kind === 'microphone' ? 'Microphone' : kind === 'geolocation' ? 'Location' : 'Notifications';
}

/* ------------------------------------------------------ request helpers */

/**
 * Request microphone access. MUST be called from within a user gesture
 * (click/pointerdown handler) — the getUserMedia call is initiated
 * synchronously so user activation applies on every browser including iOS.
 */
export async function requestMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone API unavailable');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

/** Request a one-shot location fix (gesture-safe, 12s timeout). */
export function requestLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 300000,
    });
  });
}

/** Request browser notification permission (from an explicit user action). */
export async function requestNotifications(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/** Show a desktop notification if (and only if) the user granted permission. */
export function showDesktopNotification(title: string, body: string, options?: { icon?: string; onClick?: () => void }): boolean {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    const n = new Notification(title, { body, icon: options?.icon, tag: 'bsdc-message' });
    n.onclick = () => {
      window.focus();
      options?.onClick?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
