/**
 * BSDC — src/features/composer/useComposer.ts
 * Purpose : Composer state: body, attachments, visibility, schedule and submission.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The hook owns the whole draft, including the upload lifecycle of every attachment,
 *   because an attachment that is still uploading must block submission and an attachment that
 *   failed must say so next to its own thumbnail, not in a corner of the screen.
 *   Draft text is autosaved to the device after a short debounce, so a dropped tab or a phone
 *   call never costs someone what they wrote.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEXT_LIMITS } from '@/core/config/limits';
import { AppError } from '@/core/errors/AppError';
import type { MediaContext } from '@/services/media/validate';
import { uploadMedia } from '@/services/media';
import { createLocalPreview, releasePreview, type LocalPreview } from '@/services/media/preview';
import { newMediaAsset, type MediaAsset } from '@/entities/media/model';
import { newPost, type Post, type PostVisibility } from '@/entities/post/model';
import { clampBody } from '@/entities/post/model';
import { readJson, writeJson } from '@/shared/lib/storage';
import { useDebounce } from '@/shared/hooks';

/** Draft autosave key. */
const DRAFT_KEY = 'composer-draft';

/** One attachment in the composer. */
export interface ComposerAttachment {
  readonly id: string;
  readonly file: File;
  readonly preview: LocalPreview | null;
  readonly status: 'uploading' | 'ready' | 'failed';
  readonly progress: number;
  readonly asset: MediaAsset | null;
  readonly error: AppError | null;
  readonly alt: string;
}

/** Visibility options offered by the composer. */
export const VISIBILITY_OPTIONS: readonly PostVisibility[] = [
  'public',
  'followers',
  'group',
  'private',
];

/** State returned by the composer hook. */
export interface ComposerState {
  readonly body: string;
  readonly attachments: readonly ComposerAttachment[];
  readonly visibility: PostVisibility;
  readonly groupId: string;
  readonly scheduledFor: string | null;
  readonly charCount: number;
  readonly limit: number;
  readonly canSubmit: boolean;
  readonly uploading: boolean;
  readonly error: AppError | null;
}

/** Actions returned by the composer hook. */
export interface ComposerActions {
  readonly setBody: (body: string) => void;
  readonly setVisibility: (visibility: PostVisibility) => void;
  readonly setGroupId: (groupId: string) => void;
  readonly setScheduledFor: (iso: string | null) => void;
  readonly attach: (files: readonly File[]) => Promise<void>;
  readonly detach: (id: string) => void;
  readonly setAlt: (id: string, alt: string) => void;
  readonly retry: (id: string) => Promise<void>;
  readonly reset: () => void;
  readonly build: () => Post | null;
}

/** Options for the composer hook. */
export interface UseComposerOptions {
  readonly authorUid: string;
  readonly mediaContext?: MediaContext | undefined;
  readonly maxAttachments?: number | undefined;
  readonly onPublished?: ((post: Post) => void) | undefined;
}

/** Maximum attachments per post. */
export const MAX_ATTACHMENTS = 10;

/**
 * Owns the composer draft.
 * @param options author, media context and limits
 * @returns the composer state and actions
 */
export function useComposer(options: UseComposerOptions): {
  readonly state: ComposerState;
  readonly actions: ComposerActions;
} {
  const context = options.mediaContext ?? 'feedImage';
  const maxAttachments = options.maxAttachments ?? MAX_ATTACHMENTS;
  const [body, setBodyRaw] = useState('');
  const [attachments, setAttachments] = useState<readonly ComposerAttachment[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [groupId, setGroupId] = useState('');
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const objectUrls = useRef<Set<string>>(new Set());
  const debouncedBody = useDebounce(body, 600);

  useEffect(() => {
    const saved = readJson<{ body: string } | null>(DRAFT_KEY, null);
    if (saved !== null && saved.body.length > 0) setBodyRaw(saved.body);
  }, []);

  useEffect(() => {
    if (debouncedBody.trim().length === 0) return;
    writeJson(DRAFT_KEY, { body: debouncedBody });
  }, [debouncedBody]);

  useEffect(
    () => () => {
      for (const url of objectUrls.current) releasePreview(url);
      objectUrls.current.clear();
    },
    [],
  );

  /**
   * Uploads one attachment and records its outcome.
   * @param id attachment id
   * @param file the file
   * @param preview local preview
   */
  const upload = useCallback(
    async (id: string, file: File, preview: LocalPreview | null): Promise<void> => {
      const result = await uploadMedia(file, context, {
        onProgress: (fraction) => {
          setAttachments((current) =>
            current.map((item) => (item.id === id ? { ...item, progress: fraction } : item)),
          );
        },
      });

      if (result.ok) {
        setAttachments((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'ready',
                  progress: 1,
                  error: null,
                  asset: newMediaAsset({
                    upload: result.value,
                    ownerUid: options.authorUid,
                    alt: item.alt,
                    preview,
                  }),
                }
              : item,
          ),
        );
        return;
      }

      setAttachments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: 'failed', error: result.error } : item,
        ),
      );
    },
    [context, options.authorUid],
  );

  const attach = useCallback(
    async (files: readonly File[]): Promise<void> => {
      setError(null);
      const room = maxAttachments - attachments.length;
      if (room <= 0) {
        setError(new AppError('BSDC-MEDIA-005', { reason: 'attachment-limit' }));
        return;
      }

      for (const file of files.slice(0, room)) {
        if (file.type.startsWith('video/')) {
          setError(new AppError('BSDC-MEDIA-003', { name: file.name }));
          continue;
        }
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const preview = file.type.startsWith('image/') ? await createLocalPreview(file) : null;
        if (preview !== null) objectUrls.current.add(preview.objectUrl);
        const entry: ComposerAttachment = {
          id,
          file,
          preview,
          status: 'uploading',
          progress: 0,
          asset: null,
          error: null,
          alt: '',
        };
        setAttachments((current) => [...current, entry]);
        void upload(id, file, preview);
      }
    },
    [attachments.length, maxAttachments, upload],
  );

  const detach = useCallback((id: string): void => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.preview !== null && target?.preview !== undefined) {
        releasePreview(target.preview.objectUrl);
        objectUrls.current.delete(target.preview.objectUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const setAlt = useCallback((id: string, alt: string): void => {
    setAttachments((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const asset = item.asset === null ? null : { ...item.asset, alt: alt.trim() };
        return { ...item, alt, ...(asset !== null ? { asset } : {}) };
      }),
    );
  }, []);

  const retry = useCallback(
    async (id: string): Promise<void> => {
      const target = attachments.find((item) => item.id === id);
      if (target === undefined) return;
      setAttachments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: 'uploading', progress: 0, error: null } : item,
        ),
      );
      await upload(id, target.file, target.preview);
    },
    [attachments, upload],
  );

  const reset = useCallback((): void => {
    setBodyRaw('');
    setAttachments([]);
    setScheduledFor(null);
    setError(null);
    writeJson(DRAFT_KEY, null);
  }, []);

  const build = useCallback((): Post | null => {
    const trimmed = body.trim();
    const ready = attachments.filter((item) => item.status === 'ready' && item.asset !== null);
    if (trimmed.length === 0 && ready.length === 0) return null;
    return newPost({
      authorUid: options.authorUid,
      body: trimBody(trimmed),
      visibility,
      ...(groupId.length > 0 ? { groupId } : {}),
      ...(scheduledFor !== null ? { scheduledFor } : {}),
      media: ready.map((item) => ({
        kind: item.asset?.context === 'chatPdf' ? ('document' as const) : ('image' as const),
        url: item.asset?.url ?? '',
        provider: item.asset?.provider ?? 'imgbb',
        remoteId: item.asset?.remoteId ?? '',
        width: item.asset?.width ?? 0,
        height: item.asset?.height ?? 0,
        bytes: item.asset?.bytes ?? 0,
        alt: item.alt.trim(),
        blurPreview: item.asset?.blurPreview ?? '',
        dominantColor: item.asset?.dominantColor ?? '#1b2436',
      })),
    });
  }, [attachments, body, groupId, options.authorUid, scheduledFor, visibility]);

  const uploading = attachments.some((item) => item.status === 'uploading');
  const failed = attachments.some((item) => item.status === 'failed');
  const hasContent = body.trim().length > 0 || attachments.some((item) => item.status === 'ready');

  const state = useMemo<ComposerState>(
    () => ({
      body,
      attachments,
      visibility,
      groupId,
      scheduledFor,
      charCount: Array.from(body).length,
      limit: TEXT_LIMITS.shortPost,
      canSubmit: hasContent && !uploading && !failed,
      uploading,
      error,
    }),
    [attachments, body, error, failed, groupId, hasContent, scheduledFor, uploading, visibility],
  );

  return {
    state,
    actions: {
      setBody: (next) => setBodyRaw(clampBody(next)),
      setVisibility,
      setGroupId,
      setScheduledFor,
      attach,
      detach,
      setAlt,
      retry,
      reset,
      build,
    },
  };
}

/**
 * Trims the body to the post ceiling by code points, not UTF-16 units.
 * @param body raw body
 * @returns the trimmed body
 */
function trimBody(body: string): string {
  const chars = Array.from(body);
  if (chars.length <= TEXT_LIMITS.shortPost) return body;
  return chars.slice(0, TEXT_LIMITS.shortPost).join('');
}
