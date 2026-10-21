import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { assertUploadable, MediaError } from '@/lib/storage/upload';
import type { MediaPurpose, UploadResult } from '@/lib/storage/upload';

interface PreparedCover {
  file: File;
  result: UploadResult;
  mediaRecorded: boolean;
}

export interface CoverUpload {
  /** The chosen file, or null before one is chosen and after one is removed. */
  readonly file: File | null;
  /** A local object URL for the chosen file, revoked when it is replaced. */
  readonly previewUrl: string;
  /** Percentage while the cover uploads, or null when it is not uploading. */
  readonly progress: number | null;
  /** Validates and keeps a chosen picture, or says why it was refused. */
  choose(file: File | null): void;
  /**
   * Uploads the chosen picture once and records the asset, resolving to its URL.
   * Resolves to null when no picture is chosen, so a caller can write
   * `await cover.ensureUploaded(uid) ?? draft.coverUrl` and be right either way.
   */
  ensureUploaded(ownerUid: string): Promise<string | null>;
  /** Clears the chosen picture and everything uploaded for it. */
  reset(): void;
}

/**
 * One cover picture, chosen now and uploaded when the member commits.
 *
 * Deliberately not the queue in `use-attachments`, which uploads the moment a
 * file is added. A cover belongs to a form that may never be submitted, and a
 * member who abandons half a project should not leave a picture behind at a
 * host they were never told about — so the bytes move on publish, and the
 * completed upload is retained across a retry, because a slow phone whose
 * database briefly refused a row must not send the same picture twice.
 *
 * The routing is not decided here. `purpose` goes to the same contract the
 * browser and the edge both read, so a cover lands where the contract says a
 * cover lands and this hook has no opinion about which host that is.
 */
export function useCoverUpload(purpose: MediaPurpose): CoverUpload {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const prepared = useRef<PreparedCover | null>(null);

  useEffect(() => {
    if (file === null) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = useCallback(
    (next: File | null) => {
      // Whatever was uploaded for the previous file belongs to the previous
      // file. Keeping it would publish a cover the member removed.
      prepared.current = null;
      setProgress(null);

      if (next === null) {
        setFile(null);
        return;
      }

      try {
        const kind = assertUploadable(next);
        if (kind !== 'image') throw new MediaError('media.errors.unsupported');
        setFile(next);
      } catch (error) {
        setFile(null);
        const key =
          error instanceof Error && error.message.startsWith('media.')
            ? error.message
            : 'media.errors.failed';
        toast.error(t(key));
      }
    },
    [t],
  );

  const ensureUploaded = useCallback(
    async (ownerUid: string): Promise<string | null> => {
      const chosen = file;
      if (chosen === null) return null;

      let ready = prepared.current?.file === chosen ? prepared.current : null;
      try {
        if (ready === null) {
          // Imported here rather than at the top of the module: the transport
          // carries the routing contract and both host clients, and a page that
          // is itself loaded on demand has no reason to put that in the bundle a
          // first visit downloads.
          const { uploadMedia } = await import('@/lib/storage/upload');
          const result = await uploadMedia(chosen, {
            purpose,
            onProgress: setProgress,
          });
          ready = { file: chosen, result, mediaRecorded: false };
          prepared.current = ready;
        }

        if (!ready.mediaRecorded) {
          const { recordMediaAsset } = await import('@/lib/data/media-repository');
          const row = await recordMediaAsset(ownerUid, ready.result);
          if (row === null) throw new Error('media.errors.recordFailed');
          ready = { ...ready, mediaRecorded: true };
          prepared.current = ready;
        }

        return ready.result.url;
      } finally {
        setProgress(null);
      }
    },
    [file, purpose],
  );

  const reset = useCallback(() => {
    prepared.current = null;
    setProgress(null);
    setFile(null);
  }, []);

  return { file, previewUrl, progress, choose, ensureUploaded, reset };
}
