/**
 * BSDC — src/services/media/transport.ts
 * Purpose : One XMLHttpRequest upload loop with real progress, shared by every media provider.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : `fetch` cannot report upload progress, and an upload without progress is a black box
 *   on a Bangladeshi mobile connection. XHR gives us the fraction and the ability to abort, so
 *   the composer can show an honest percentage and a cancel button. Timeouts are enforced here:
 *   a stalled upload fails with BSDC-MEDIA-008 instead of hanging forever.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result/Result';

/** How long an upload may run before it is aborted. */
export const UPLOAD_TIMEOUT_MS = 90_000;

/** Options for the upload loop. */
export interface UploadTransportOptions {
  /** Fraction between 0 and 1. */
  readonly onProgress?: ((fraction: number) => void) | undefined;
  readonly timeoutMs?: number | undefined;
}

/**
 * Posts a multipart form and reports upload progress.
 * @param url endpoint
 * @param form form payload
 * @param onProgress progress callback
 * @returns Ok with the response text, or Err with an AppError
 */
export function uploadWithProgress(
  url: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<Result<string, AppError>>;
/**
 * Posts a multipart form with full transport options.
 * @param url endpoint
 * @param form form payload
 * @param options progress callback and timeout
 * @returns Ok with the response text, or Err with an AppError
 */
export function uploadWithProgress(
  url: string,
  form: FormData,
  options: UploadTransportOptions,
): Promise<Result<string, AppError>>;
/**
 * Posts a multipart form and reports upload progress.
 * @param url endpoint
 * @param form form payload
 * @param optionsOrCallback progress callback or full options
 * @returns Ok with the response text, or Err with an AppError
 */
export function uploadWithProgress(
  url: string,
  form: FormData,
  optionsOrCallback?: ((fraction: number) => void) | UploadTransportOptions,
): Promise<Result<string, AppError>> {
  const options: UploadTransportOptions =
    typeof optionsOrCallback === 'function'
      ? { onProgress: optionsOrCallback }
      : (optionsOrCallback ?? {});
  const timeoutMs = options.timeoutMs ?? UPLOAD_TIMEOUT_MS;

  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const finish = (result: Result<string, AppError>): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    request.open('POST', url, true);
    request.timeout = timeoutMs;

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0)
        options.onProgress?.(event.loaded / event.total);
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        finish(ok(request.responseText));
        return;
      }
      finish(
        err(
          new AppError('BSDC-MEDIA-008', {
            status: request.status,
            reason: request.status === 0 ? 'network' : 'http-error',
          }),
        ),
      );
    });

    request.addEventListener('error', () => {
      finish(err(new AppError('BSDC-MEDIA-008', { reason: 'network-error' })));
    });

    request.addEventListener('timeout', () => {
      finish(err(new AppError('BSDC-MEDIA-008', { reason: 'timeout' })));
    });

    request.addEventListener('abort', () => {
      finish(err(new AppError('BSDC-MEDIA-008', { reason: 'aborted' })));
    });

    request.send(form);
  });
}
