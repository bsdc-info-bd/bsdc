/**
 * BSDC — src/shared/lib/validators.ts
 * Purpose : Small, dependency-free validators used before a Zod schema or a Firestore rule runs,
 *           so the UI can give instant feedback (PART 11.03, F-021).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : These mirror the server-side constraints exactly; the authoritative check is always
 *           the Firestore Security Rule, never this file (LAW-18).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { USERNAME } from '@/core/config/limits';

/**
 * Validates a username shape and reserved-word usage.
 * @param value candidate username
 * @returns null when valid, otherwise a translation key fragment
 */
export function validateUsername(
  value: string,
): 'too-short' | 'too-long' | 'invalid' | 'reserved' | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length < USERNAME.minLength) return 'too-short';
  if (trimmed.length > USERNAME.maxLength) return 'too-long';
  if (!USERNAME.pattern.test(trimmed)) return 'invalid';
  if ((USERNAME.reserved as readonly string[]).includes(trimmed)) return 'reserved';
  return null;
}

/**
 * Validates an e-mail address shape.
 * @param value candidate e-mail
 * @returns true when the shape is acceptable
 */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/**
 * Validates a Bangladesh mobile number (01XXXXXXXXX, optional +88).
 * @param value candidate number
 * @returns true when the number matches the national format
 */
export function isBdPhone(value: string): boolean {
  return /^(?:\+?88)?01[3-9]\d{8}$/.test(value.replace(/[\s-]/g, ''));
}

/**
 * Validates a bKash transaction id shape (alphanumeric, 8-20 characters).
 * @param value transaction id entered by a vendor
 * @returns true when the shape is acceptable
 */
export function isBkashTxnId(value: string): boolean {
  return /^[A-Za-z0-9]{8,20}$/.test(value.trim());
}

/**
 * Checks a URL for a supported, non-javascript scheme.
 * @param value candidate URL
 * @returns true when the URL is safe to render as a link
 */
export function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://www.bsdc.info.bd');
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * Checks whether a file looks like a video, which BSDC never accepts (PART 29.1 STEP 1).
 * @param file file selected by the user
 * @returns true when the file must be refused
 */
export function isVideoFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
}
