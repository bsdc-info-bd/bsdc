/**
 * BSDC — src/shared/lib/device.ts
 * Purpose : Device, capability and network-quality detection used to degrade gracefully
 *           (PART 08.07, PART 12.02 context features, PART 25 low-end profile).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : All detection is feature-based, never user-agent sniffing. Results are cheap and are
 *           read once per session by the providers that need them.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Device class buckets used by analytics and performance budgets. */
export type DeviceClass = 'low-end' | 'mid-tier' | 'high-end' | 'unknown';

/**
 * Classifies the device by hardware concurrency and device memory.
 * @returns a device class bucket
 */
export function deviceClass(): DeviceClass {
  if (typeof navigator === 'undefined') return 'unknown';
  const cores = navigator.hardwareConcurrency ?? 0;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  if (cores === 0 && memory === 0) return 'unknown';
  if (cores <= 4 || (memory > 0 && memory <= 2)) return 'low-end';
  if (cores <= 8 || (memory > 0 && memory <= 6)) return 'mid-tier';
  return 'high-end';
}

/**
 * Effective connection type when the Network Information API is available.
 * @returns a coarse connection label
 */
export function networkQuality(): 'slow-2g' | '2g' | '3g' | '4g' | 'unknown' {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } })
    .connection;
  const type = connection?.effectiveType;
  if (type === 'slow-2g' || type === '2g' || type === '3g' || type === '4g') return type;
  return 'unknown';
}

/**
 * True when the user asked the operating system to save data.
 * @returns save-data preference
 */
export function prefersDataSaver(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * True when the viewport is a coarse-pointer touch device.
 * @returns coarse pointer detection
 */
export function isTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/**
 * True when the app is running inside the Capacitor Android WebView.
 * @returns native container detection
 */
export function isNativeAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (
      window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.() === true
  );
}

/**
 * Reduced-motion preference.
 * @returns true when motion should be suppressed
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
