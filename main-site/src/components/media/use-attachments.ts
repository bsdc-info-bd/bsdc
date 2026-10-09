import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isConfigured } from '@/lib/env';
import { decodeImage, type EditState } from '@/lib/media/edit';
import {
  assertUploadable,
  MediaError,
  type MediaPurpose,
  type UploadResult,
} from '@/lib/storage/upload';

export type AttachmentStatus = 'queued' | 'uploading' | 'attached' | 'failed';

export interface Attachment {
  /** Local identity, stable through reordering. Never the mediaId. */
  id: string;
  /** The bytes that will be sent — replaced by the edited file after an edit. */
  file: File | null;
  /** Object URL for the instant preview. Empty for attachments seeded from a saved post. */
  previewUrl: string;
  /** What the picture is of, in the member's own words. Stored with the post. */
  altText: string;
  status: AttachmentStatus;
  /** 0–100 while uploading. */
  progress: number;
  /** An i18n key, because the reason has to be readable to be useful. */
  errorKey: string | null;
  /** The edit this picture carries, so reopening the editor shows it. */
  edit: EditState | null;
  width: number | null;
  height: number | null;
  /** Present once the upload is recorded — this is what `post_media` references. */
  mediaId: string;
  /** A successful external upload reused if the metadata write is retried. */
  uploadResult: UploadResult | null;
  url: string;
  thumbUrl: string;
}

/** A picture already on the post, when the composer opens in edit mode. */
export interface SeededAttachment {
  mediaId: string;
  url: string;
  thumbUrl: string;
  altText: string;
  position: number;
  width?: number | null;
  height?: number | null;
}

export interface UseAttachmentsOptions {
  purpose: MediaPurpose;
  /** The member doing the uploading. Uploads cannot be anonymous. */
  uid: string | null;
  max?: number;
  /** Called with the pictures that are ready to be saved, in the member's order. */
  onChange?: (ready: Attachment[]) => void;
}

let sequence = 0;
function newId(): string {
  sequence += 1;
  return `attachment-${sequence}`;
}

function keyOf(error: unknown): string {
  if (error instanceof MediaError) return error.messageKey;
  if (error instanceof Error && error.message.startsWith('media.')) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return 'media.errors.cancelled';
  return 'media.errors.failed';
}

/**
 * The queue of pictures a member is attaching.
 *
 * This is the part that was missing: attaching a picture used to be a single
 * awaited call whose result either appeared or did not, with nothing on screen
 * in between. A member on a phone watching a button do nothing for eight
 * seconds has no way to tell an upload from a broken page.
 *
 * Every file gets a preview the moment it is chosen — from the local bytes, not
 * from the network — then a visible percentage, then a place in the post. A
 * failure keeps the preview and offers a retry instead of discarding the
 * picture. Uploads run one at a time: they share a radio, and five parallel
 * requests on a mobile connection are slower than five sequential ones.
 */
export function useAttachments({ purpose, uid, max = 10, onChange }: UseAttachmentsOptions) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const listRef = useRef<Attachment[]>([]);
  listRef.current = attachments;
  const running = useRef(false);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((id: string, changes: Partial<Attachment>) => {
    setAttachments((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }, []);

  const release = useCallback((id: string) => {
    const controller = controllers.current.get(id);
    controller?.abort();
    controllers.current.delete(id);
  }, []);

  // ------------------------------------------------------------- one upload ---
  const runUpload = useCallback(
    async (id: string) => {
      const item = listRef.current.find((entry) => entry.id === id);
      if (!item || item.file === null) return;
      if (uid === null) {
        patch(id, { status: 'failed', errorKey: 'media.errors.signInRequired', progress: 0 });
        return;
      }
      // Post images must have a media_assets row before post_media can refer to
      // them. Refuse before uploading bytes when the database is unavailable;
      // an upload that cannot be linked must never look attached.
      if (!isConfigured.supabase) {
        patch(id, { status: 'failed', errorKey: 'media.errors.recordFailed', progress: 0 });
        return;
      }

      // Claimed before the first await, so the effect that picks the next
      // upload cannot pick this one a second time.
      running.current = true;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      patch(id, { status: 'uploading', progress: 0, errorKey: null });

      try {
        const [{ uploadMedia }, { recordMediaAsset }] = await Promise.all([
          import('@/lib/storage/upload'),
          import('@/lib/data/media-repository'),
        ]);

        let result = item.uploadResult;
        if (result === null) {
          result = await uploadMedia(item.file, {
            purpose,
            signal: controller.signal,
            onProgress: (percent) => patch(id, { progress: Math.round(percent) }),
          });
          // Keep the hosted object so a database hiccup retries only the row
          // insert; retrying the whole operation would upload duplicate images.
          patch(id, {
            uploadResult: result,
            url: result.url,
            thumbUrl: result.thumbUrl.length > 0 ? result.thumbUrl : result.url,
            width: result.width ?? item.width,
            height: result.height ?? item.height,
          });
        }

        // `post_media` points at `media_assets`, so an upload that was never
        // recorded cannot be attached to anything — the row comes first.
        const record = await recordMediaAsset(uid, result);
        if (record === null) throw new MediaError('media.errors.recordFailed');

        patch(id, {
          status: 'attached',
          progress: 100,
          errorKey: null,
          mediaId: record.id,
          uploadResult: result,
          url: result.url,
          thumbUrl: result.thumbUrl.length > 0 ? result.thumbUrl : result.url,
          width: result.width ?? item.width,
          height: result.height ?? item.height,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        patch(id, { status: 'failed', progress: 0, errorKey: keyOf(error) });
      } finally {
        controllers.current.delete(id);
        running.current = false;
      }
    },
    [patch, purpose, uid],
  );

  /**
   * One upload at a time, taken from the list itself.
   *
   * The queue is the state, not a ref beside it: a picture added in the same
   * tick as the one being uploaded has to be seen by whatever decides what to
   * send next, and a side list can fall a render behind. Sequential rather than
   * parallel because they share one radio — five concurrent uploads on a mobile
   * connection finish later than the same five in turn, and a member watching
   * five percentages move is watching none of them.
   */
  useEffect(() => {
    if (running.current) return;
    const next = attachments.find((item) => item.status === 'queued');
    if (!next) return;
    void runUpload(next.id);
  }, [attachments, runUpload]);

  // ------------------------------------------------------------------- add ---
  const add = useCallback(
    (files: readonly File[]) => {
      const room = Math.max(0, max - listRef.current.length);
      if (room === 0) {
        setNotice('media.errors.tooMany');
        return;
      }
      if (files.length > room) setNotice('media.errors.tooMany');

      const accepted: Attachment[] = [];
      const rejected: string[] = [];
      for (const file of files.slice(0, room)) {
        try {
          // Validated here, before a preview exists, so the reason can be given
          // at once instead of after a failed round trip.
          assertUploadable(file);
        } catch (error) {
          rejected.push(keyOf(error));
          continue;
        }
        accepted.push({
          id: newId(),
          file,
          previewUrl: URL.createObjectURL(file),
          altText: '',
          status: 'queued',
          progress: 0,
          errorKey: null,
          edit: null,
          width: null,
          height: null,
          mediaId: '',
          uploadResult: null,
          url: '',
          thumbUrl: '',
        });
      }
      if (rejected.length > 0) setNotice(rejected[0] ?? 'media.errors.failed');
      if (accepted.length === 0) return;

      setAttachments((current) => [...current, ...accepted]);
      for (const item of accepted) {
        // Measured from the local bytes so the layout is right before the
        // upload finishes; a failure here costs nothing but a default shape.
        const file = item.file;
        if (file === null) continue;
        void decodeImage(file)
          .then((decoded) => patch(item.id, { width: decoded.width, height: decoded.height }))
          .catch(() => undefined);
      }
    },
    [max, patch],
  );

  /** Pictures already on the post, shown as attached with nothing to upload. */
  const seed = useCallback((items: readonly SeededAttachment[]) => {
    setAttachments((current) => {
      if (current.length > 0) return current;
      return [...items]
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
          id: newId(),
          file: null,
          previewUrl: '',
          altText: item.altText,
          status: 'attached' as const,
          progress: 100,
          errorKey: null,
          edit: null,
          width: item.width ?? null,
          height: item.height ?? null,
          mediaId: item.mediaId,
          uploadResult: null,
          url: item.url,
          thumbUrl: item.thumbUrl.length > 0 ? item.thumbUrl : item.url,
        }));
    });
  }, []);

  // ---------------------------------------------------------------- actions ---
  const remove = useCallback(
    (id: string) => {
      release(id);
      setAttachments((current) => {
        const gone = current.find((item) => item.id === id);
        if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
        return current.filter((item) => item.id !== id);
      });
    },
    [release],
  );

  const retry = useCallback(
    (id: string) => {
      const item = listRef.current.find((entry) => entry.id === id);
      if (!item || item.status === 'attached' || item.file === null) return;
      patch(id, { status: 'queued', errorKey: null, progress: 0 });
    },
    [patch],
  );

  const retryAll = useCallback(() => {
    for (const item of listRef.current) {
      if (item.status === 'failed') retry(item.id);
    }
  }, [retry]);

  function swap(from: number, to: number) {
    setAttachments((current) => {
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (!moved) return current;
      next.splice(to, 0, moved);
      return next;
    });
  }

  const move = useCallback(
    (id: string, delta: number) => {
      const from = listRef.current.findIndex((item) => item.id === id);
      if (from < 0) return;
      swap(from, Math.min(Math.max(from + delta, 0), listRef.current.length - 1));
    },
    // swap is a pure state updater; keeping it out of the dependency list
    // avoids a new identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const moveTo = useCallback(
    (id: string, to: number) => {
      const from = listRef.current.findIndex((item) => item.id === id);
      if (from < 0) return;
      swap(from, to);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const setAltText = useCallback((id: string, altText: string) => patch(id, { altText }), [patch]);

  /**
   * Replace the bytes with the edited picture.
   *
   * `edited` is null when the member opened the editor and changed nothing —
   * in that case the original stays exactly as it was, and an upload already
   * finished is not thrown away for a look.
   */
  const applyEdit = useCallback(
    (id: string, edited: File | null, edit: EditState) => {
      const item = listRef.current.find((entry) => entry.id === id);
      if (!item) return;
      patch(id, { edit });
      if (edited === null) return;

      const wasAttached = item.status === 'attached';
      if (wasAttached) release(id);
      const previewUrl = URL.createObjectURL(edited);
      setAttachments((current) =>
        current.map((entry) => {
          if (entry.id !== id) return entry;
          if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
          return {
            ...entry,
            file: edited,
            previewUrl,
            status: 'queued' as const,
            progress: 0,
            errorKey: null,
            mediaId: wasAttached ? entry.mediaId : '',
            uploadResult: null,
            width: null,
            height: null,
          };
        }),
      );
      void decodeImage(edited)
        .then((decoded) => patch(id, { width: decoded.width, height: decoded.height }))
        .catch(() => undefined);
    },
    [patch, release],
  );

  /** Drop everything — used when the post is published or the composer closes. */
  const clear = useCallback(() => {
    for (const item of listRef.current) release(item.id);
    setAttachments((current) => {
      for (const item of current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      return [];
    });
  }, [release]);

  // Object URLs are ours, so they are ours to release.
  useEffect(
    () => () => {
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
      for (const item of listRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    },
    [],
  );

  const ready = useMemo(
    () => attachments.filter((item) => item.status === 'attached' && item.mediaId.length > 0),
    [attachments],
  );
  const pending = useMemo(
    () => attachments.filter((item) => item.status === 'queued' || item.status === 'uploading'),
    [attachments],
  );
  const failed = useMemo(
    () => attachments.filter((item) => item.status === 'failed'),
    [attachments],
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(ready);
  }, [ready]);

  return {
    attachments,
    ready,
    pending,
    failed,
    notice,
    dismissNotice: () => setNotice(null),
    busy: pending.length > 0,
    canAdd: attachments.length < max,
    room: Math.max(0, max - attachments.length),
    add,
    seed,
    remove,
    retry,
    retryAll,
    move,
    moveTo,
    setAltText,
    applyEdit,
    clear,
  };
}

export type AttachmentsController = ReturnType<typeof useAttachments>;
