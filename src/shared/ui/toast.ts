/**
 * BSDC — src/shared/ui/toast.ts
 * Purpose : Typed toast helpers over the Sonner host (PART 08.09, F-119).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every toast carries a bilingual title and body plus an optional action. Toasts are for
 *           confirmation and light prompting only — errors also land in the notification centre.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { toast as sonnerToast } from 'sonner';
import { emit } from '@/core/events/bus';

/** Toast tone. */
export type ToastTone = 'success' | 'error' | 'info' | 'warning';

/** Payload for a BSDC toast. */
export interface BsdcToastPayload {
  readonly titleBn: string;
  readonly titleEn: string;
  readonly bodyBn?: string | undefined;
  readonly bodyEn?: string | undefined;
  readonly tone?: ToastTone | undefined;
  /** Duration in milliseconds; errors stay longer by default. */
  readonly duration?: number | undefined;
}

/**
 * Shows a toast in the active locale.
 * @param locale current locale
 * @param payload toast payload
 */
export function showToast(locale: 'bn' | 'en', payload: BsdcToastPayload): void {
  const tone = payload.tone ?? 'info';
  const title = locale === 'bn' ? payload.titleBn : payload.titleEn;
  const description = locale === 'bn' ? payload.bodyBn : payload.bodyEn;
  sonnerToast(title, {
    description,
    duration: payload.duration ?? (tone === 'error' ? 8000 : 4500),
  });
  emit('toast:shown', { tone });
}

/**
 * Convenience success toast.
 * @param locale current locale
 * @param titleBn Bangla title
 * @param titleEn English title
 */
export function toastSuccess(locale: 'bn' | 'en', titleBn: string, titleEn: string): void {
  showToast(locale, { titleBn, titleEn, tone: 'success' });
}

/**
 * Convenience error toast.
 * @param locale current locale
 * @param titleBn Bangla title
 * @param titleEn English title
 * @param bodyBn Bangla detail
 * @param bodyEn English detail
 */
export function toastError(
  locale: 'bn' | 'en',
  titleBn: string,
  titleEn: string,
  bodyBn?: string,
  bodyEn?: string,
): void {
  showToast(locale, {
    titleBn,
    titleEn,
    ...(bodyBn !== undefined ? { bodyBn } : {}),
    ...(bodyEn !== undefined ? { bodyEn } : {}),
    tone: 'error',
  });
}
