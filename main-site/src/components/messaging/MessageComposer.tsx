import { ImagePlus, Send, Smile, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, ProgressBar } from '@/design-system';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth-store';
import { isConfigured } from '@/lib/env';
import type { UploadResult } from '@/lib/storage/upload';
import { previewLine } from '@/lib/messaging/message-text';
import type { Message } from '@/lib/messaging/message-types';
import { dataErrorKey } from '@/lib/supabase/errors';

/**
 * Records an uploaded image against the member who uploaded it.
 *
 * A failure here is not a failure to send. The bytes are already at ImgBB and
 * the message is about to reference them, so refusing to send would lose the
 * message and leave the image orphaned anyway.
 */
async function recordIfSignedIn(result: UploadResult): Promise<void> {
  const ownerUid = useAuthStore.getState().user?.uid ?? '';
  if (ownerUid.length === 0) return;
  if (!isConfigured.supabase) return;
  try {
    const { recordMediaAsset } = await import('@/lib/data/media-repository');
    await recordMediaAsset(ownerUid, result);
  } catch {
    console.warn('a chat image attachment was not recorded, so it cannot be swept later');
  }
}

/** The emoji the tray inserts; reactions have their own set. */
const EMOJI = [
  '😀',
  '😄',
  '😂',
  '🥹',
  '😊',
  '😍',
  '🤔',
  '😅',
  '👍',
  '🙏',
  '👏',
  '🎉',
  '❤️',
  '🔥',
  '✅',
  '🚀',
  '💡',
  '📌',
  '📎',
  '⏰',
  '🇧🇩',
  '💚',
  '🙌',
  '🤝',
];

/** What can leave this composer as an attachment: images only (hosted on ImgBB). */
export type AttachmentKind = 'image';

export interface AttachmentInput {
  body: string;
  mediaUrl: string;
  mediaName: string;
  kind: AttachmentKind;
}

export interface MessageComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (body: string, replyTo: string | null) => Promise<void>;
  onSendAttachment: (input: AttachmentInput) => Promise<void>;
  onTyping: () => void;
  replyTo: Message | null;
  onCancelReply: () => void;
  editing: Message | null;
  onCancelEdit: () => void;
  onSaveEdit: (body: string) => Promise<void>;
  memberName: (uid: string | null) => string;
  disabled?: boolean;
}

const MAX_LENGTH = 8_000;

function sendErrorKey(error: unknown): string {
  if (
    error instanceof Error &&
    error.name === 'MediaError' &&
    error.message.startsWith('media.errors.')
  )
    return error.message;
  return dataErrorKey(error);
}

interface SendingState {
  name: string;
  percent: number;
}

/**
 * The composer: text with a draft that follows the member across devices,
 * image attachments hosted on ImgBB, an emoji tray, and a reply or edit context bar.
 */
export function MessageComposer({
  draft,
  onDraftChange,
  onSend,
  onSendAttachment,
  onTyping,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
  onSaveEdit,
  memberName,
  disabled = false,
}: MessageComposerProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [tray, setTray] = useState(false);
  const [sending, setSending] = useState<SendingState | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    if (editing !== null || replyTo !== null) textarea.current?.focus();
  }, [editing, replyTo]);

  useEffect(() => {
    const input = textarea.current;
    if (input === null) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
  }, [draft]);

  async function uploadAndSend(file: File): Promise<void> {
    if (disabled || submitLock.current || editing !== null) return;
    submitLock.current = true;
    setBusy(true);
    setSending({ name: file.name, percent: 0 });
    try {
      const { uploadMedia } = await import('@/lib/storage/upload');
      const result = await uploadMedia(file, {
        purpose: 'comment-image',
        onProgress: (percent) =>
          setSending((current) =>
            current === null ? current : { ...current, percent: Math.round(percent) },
          ),
      });
      setSending((current) => (current === null ? current : { ...current, percent: 100 }));

      await recordIfSignedIn(result);
      const delivery = onSendAttachment({
        body: draft.trim(),
        mediaUrl: result.url,
        mediaName: file.name,
        kind: 'image',
      });
      onDraftChange('');
      onCancelReply();
      void delivery.catch((error: unknown) => toast.error(t(sendErrorKey(error))));
    } catch (error) {
      toast.error(t(sendErrorKey(error)));
    } finally {
      setSending(null);
      setBusy(false);
      submitLock.current = false;
    }
  }

  async function submit(): Promise<void> {
    const body = draft.trim();
    if (disabled || submitLock.current || body.length === 0 || body.length > MAX_LENGTH) return;
    submitLock.current = true;
    if (editing !== null) {
      setBusy(true);
      try {
        await onSaveEdit(body);
        onCancelEdit();
      } catch (error) {
        toast.error(t(dataErrorKey(error)));
      } finally {
        setBusy(false);
        submitLock.current = false;
      }
      return;
    }

    try {
      const delivery = onSend(body, replyTo?.id ?? null);
      onDraftChange('');
      onCancelReply();
      setTray(false);
      void delivery.catch((error: unknown) => toast.error(t(dataErrorKey(error))));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    } finally {
      queueMicrotask(() => {
        submitLock.current = false;
      });
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-3">
      {editing !== null ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1 text-xs">
          <span className="font-semibold">{t('chat.editing')}</span>
          <span className="fab-truncate flex-1 text-muted">{previewLine(editing.body, 60)}</span>
          <IconButton
            label={t('chat.cancelEdit')}
            size="sm"
            icon={<X size={14} />}
            onClick={onCancelEdit}
          />
        </div>
      ) : replyTo !== null ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1 text-xs">
          <span className="font-semibold">
            {t('chat.replyingTo', { name: memberName(replyTo.senderUid) })}
          </span>
          <span className="fab-truncate flex-1 text-muted">{previewLine(replyTo.body, 60)}</span>
          <IconButton
            label={t('chat.cancelReply')}
            size="sm"
            icon={<X size={14} />}
            onClick={onCancelReply}
          />
        </div>
      ) : null}

      {sending !== null ? (
        <div className="mb-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
          <p className="mb-1 flex items-center justify-between gap-2 text-2xs text-muted">
            <span className="fab-truncate">{t('chat.sendingAttachment')}</span>
            <span className="tabular-nums">{sending.percent}%</span>
          </p>
          <ProgressBar value={sending.percent} label={t('chat.sendingAttachment')} />
        </div>
      ) : null}

      {tray ? (
        <div className="motion-safe:animate-fade-up mb-2 flex max-h-36 flex-wrap gap-1 overflow-y-auto rounded-2xl border border-border bg-bg p-2 shadow-card">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="fab-tap rounded-lg px-1.5 py-1 text-lg hover:bg-surface-2"
              onClick={() => {
                const start = textarea.current?.selectionStart ?? draft.length;
                const end = textarea.current?.selectionEnd ?? start;
                onDraftChange(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
                setTray(false);
                textarea.current?.focus();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="rounded-2xl border border-border bg-bg p-1 shadow-card transition-[border-color,box-shadow] duration-200 focus-within:border-green-500 focus-within:shadow-raised"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="sr-only" htmlFor="message-composer">
          {t('messages.composerLabel')}
        </label>
        <textarea
          ref={textarea}
          id="message-composer"
          aria-describedby="message-composer-hint"
          className="block min-h-[48px] max-h-36 w-full resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-base leading-6 text-text outline-none placeholder:text-muted sm:text-sm"
          rows={1}
          value={draft}
          maxLength={MAX_LENGTH}
          disabled={disabled || busy}
          placeholder={t('messages.composerPlaceholder')}
          onChange={(event) => {
            onDraftChange(event.target.value);
            if (editing === null) onTyping();
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229 &&
              !event.repeat
            ) {
              event.preventDefault();
              void submit();
            }
            if (event.key === 'Escape') {
              if (tray) setTray(false);
              else if (editing !== null) onCancelEdit();
              else if (replyTo !== null) onCancelReply();
            }
          }}
        />
        <span id="message-composer-hint" className="sr-only">
          {t('messages.composerHint')}
        </span>
        <div className="flex items-center justify-between gap-1 border-t border-border/60 pt-1">
          <div className="flex items-center">
            <IconButton
              label={t('chat.emojiHint')}
              icon={<Smile size={18} />}
              size="sm"
              aria-expanded={tray}
              disabled={busy || disabled}
              onClick={() => setTray((open) => !open)}
            />
            <IconButton
              label={t('chat.attachImage')}
              icon={<ImagePlus size={18} />}
              size="sm"
              disabled={busy || disabled || editing !== null}
              onClick={() => imageInput.current?.click()}
            />
          </div>
          <button
            type="submit"
            aria-label={editing !== null ? t('chat.saveEdit') : t('messages.send')}
            disabled={disabled || busy || draft.trim().length === 0}
            className="fab-tap inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-chat-outgoing px-3 text-sm font-semibold text-white shadow-card transition-[transform,background-color,box-shadow] duration-200 hover:bg-chat-outgoing-hover hover:shadow-raised active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <Send size={17} aria-hidden="true" />
            <span className="hidden sm:inline">
              {editing !== null ? t('chat.saveEdit') : t('messages.send')}
            </span>
          </button>
        </div>
      </form>

      <p
        className={cn(
          'mt-1 text-end text-2xs text-muted',
          draft.length > MAX_LENGTH * 0.9 && 'text-danger',
        )}
      >
        {draft.length > MAX_LENGTH * 0.8
          ? t('chat.characterCount', { count: draft.length, max: MAX_LENGTH })
          : ''}
      </p>

      <input
        ref={imageInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) void uploadAndSend(file);
        }}
      />
    </div>
  );
}
