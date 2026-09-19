/**
 * BSDC — src/shared/lib/clipboard.ts
 * Purpose : Clipboard and Web Share helpers used by the share sheet (F-148, F-149).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Permissions vary by browser and by secure context: every failure returns a boolean
 *           instead of throwing, so callers can fall back to a select-and-copy hint.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/**
 * Copies text to the clipboard.
 * @param text text to copy
 * @returns true when the copy succeeded
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall through to the legacy path below. */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    // execCommand is deprecated but remains the only copy path on older Android WebViews,
    // which the Capacitor shell targets (PART 27).
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Shares through the native share sheet when available.
 * @param data share payload
 * @returns 'shared' when handled natively, 'unsupported' when the platform has no share sheet,
 *          'cancelled' when the user dismissed it
 */
export async function shareNative(data: {
  title?: string | undefined;
  text?: string | undefined;
  url?: string | undefined;
}): Promise<'shared' | 'unsupported' | 'cancelled'> {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unsupported';
  // ShareData is built conditionally: an explicit undefined breaks the Web Share contract.
  const payload: ShareData = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.text !== undefined) payload.text = data.text;
  if (data.url !== undefined) payload.url = data.url;
  try {
    await navigator.share(payload);
    return 'shared';
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}
