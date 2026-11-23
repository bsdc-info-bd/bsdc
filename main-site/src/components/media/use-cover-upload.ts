import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { assertUploadable, MediaError } from '@/lib/storage/upload';
import type { MediaPurpose, UploadResult } from '@/lib/storage/upload';
import type { PickedMedia } from '@/lib/media/gallery';
import { DataError } from '@/lib/supabase/errors';

/**
 * What this field holds: a file that has not gone up yet, and the upload that did,
 * kept so a retry does not send the same bytes a second time.
 *
 * A picture taken from the library never comes through here at all. It has no bytes
 * to compress, no percentage to show and no row to write — which is why `picked` is
 * a separate state rather than a fake file: pretending otherwise would upload a
 * member's own picture back to them.
 */
interface PreparedCover {
  file: File;
  result: UploadResult;
  mediaRecorded: boolean;
}

export interface CoverUpload {
  /** The chosen file, or null before one is chosen and after one is removed. */
  readonly file: File | null;
  /**
   * A picture taken from the member's own library, or null.
   *
   * While this is set the field has a cover and has nothing to upload:
   * `ensureUploaded` resolves to its address straight away.
   */
  readonly picked: PickedMedia | null;
  /** A local object URL for the chosen file, revoked when it is replaced. */
  readonly previewUrl: string;
  /** Percentage while the cover uploads, or null when it is not uploading. */
  readonly progress: number | null;
  /** Validates and keeps a chosen picture, or says why it was refused. */
  choose(file: File | null): void;
  /**
   * Keeps a picture from the library as this cover, with no upload at all.
   *
   * The row behind it already says who owns it, and says it to the only reader that
   * matters: `my_gallery` (0132) returns a member's own rows and nothing else, and
   * `media_asset_for_pick` refuses anybody else's id. So the address this stores is
   * one the platform wrote, not one a page invented.
   */
  pick(image: PickedMedia): void;
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
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const prepared = useRef<PreparedCover | null>(null);

  useEffect(() => {
    if (file === null) {
      // A reused picture previews from the host, which already has it; an object URL
      // is only ever for the local bytes of a file that has not gone up yet. The full
      // address stands in when a row has no thumbnail of its own, because a field
      // holding a cover has to show the cover it holds.
      setPreviewUrl(picked === null ? '' : picked.thumbUrl || picked.url);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, picked]);

  const choose = useCallback(
    (next: File | null) => {
      // Whatever was uploaded for the previous file belongs to the previous
      // file. Keeping it would publish a cover the member removed.
      prepared.current = null;
      setProgress(null);
      setPicked(null);

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
        let key = 'media.errors.failed';
        if (error instanceof DataError) {
          key =
            error.messageKey === 'data.errors.signInRequired'
              ? 'media.errors.signInRequired'
              : 'media.errors.recordFailed';
        } else if (error instanceof Error && error.message.startsWith('media.')) {
          key = error.message;
        }
        toast.error(t(key));
      }
    },
    [t],
  );

  const pick = useCallback((image: PickedMedia) => {
    prepared.current = null;
    setProgress(null);
    setFile(null);
    setPicked(image);
  }, []);

  const ensureUploaded = useCallback(
    async (ownerUid: string): Promise<string | null> => {
      // A pick resolves on the spot: the field has its cover, and the address is one
      // the platform stored, so there is nothing to send and nothing to record.
      if (file === null && picked !== null) return picked.url;

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
    [file, picked, purpose],
  );

  const reset = useCallback(() => {
    prepared.current = null;
    setProgress(null);
    setFile(null);
    setPicked(null);
  }, []);

  return { file, picked, previewUrl, progress, choose, pick, ensureUploaded, reset };
}
