import { FilePlus2, ImagePlus, Mic, Pause, Play, Send, Smile, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, IconButton, ProgressBar, TextareaField } from '@/design-system';
import { cn } from '@/lib/cn';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { previewLine } from '@/lib/messaging/message-text';
import type { Message } from '@/lib/messaging/message-types';
import { MAX_VOICE_MS, recordingProgress } from '@/lib/messaging/voice-recorder';
import { dataErrorKey } from '@/lib/supabase/errors';

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

/** What can leave this composer as an attachment. */
export type AttachmentKind = 'image' | 'file' | 'audio';

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

/** Which storage folder an attachment is filed in, by what it is. */
const PURPOSE: Record<AttachmentKind, 'comment-image' | 'chat-document' | 'voice-note'> = {
  image: 'comment-image',
  file: 'chat-document',
  audio: 'voice-note',
};

interface SendingState {
  name: string;
  percent: number;
  kind: AttachmentKind;
}

/**
 * The composer: text with a draft that follows the member across devices,
 * attachments, a voice note, an emoji tray, and a reply or edit context bar.
 *
 * Everything that leaves this box says what it is doing while it does it. An
 * attachment shows a percentage, because a chat that appears to have swallowed
 * a picture is a chat the member will send the picture to twice; a recording
 * shows a clock and a level meter, because a microphone gives no other proof
 * that it is listening.
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
  const fileInput = useRef<HTMLInputElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  const voice = useVoiceRecorder((file) => {
    void uploadAndSend(file, 'audio');
  });

  useEffect(() => {
    if (editing !== null) textarea.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (voice.errorKey !== null) {
      toast.error(t(voice.errorKey));
      voice.dismissError();
    }
    // Only the key is tracked: dismissing it is the hook's own state change and
    // must not run this effect a second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.errorKey, t]);

  const recording = voice.state === 'recording' || voice.state === 'paused';

  async function uploadAndSend(file: File, kind: AttachmentKind): Promise<void> {
    setBusy(true);
    setSending({ name: file.name, percent: 0, kind });
    try {
      const { uploadMedia } = await import('@/lib/storage/upload');
      const result = await uploadMedia(file, {
        purpose: PURPOSE[kind],
        onProgress: (percent) =>
          setSending((current) =>
            current === null ? current : { ...current, percent: Math.round(percent) },
          ),
      });
      setSending((current) => (current === null ? current : { ...current, percent: 100 }));
      await onSendAttachment({
        body: draft.trim(),
        mediaUrl: result.url,
        mediaName: file.name,
        kind,
      });
      onDraftChange('');
      onCancelReply();
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    } finally {
      setSending(null);
      setBusy(false);
    }
  }

  async function submit(): Promise<void> {
    const body = draft.trim();
    if (editing !== null) {
      if (body.length === 0) return;
      setBusy(true);
      try {
        await onSaveEdit(body);
        onCancelEdit();
      } catch (error) {
        toast.error(t(dataErrorKey(error)));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (body.length === 0 || body.length > MAX_LENGTH) return;
    setBusy(true);
    try {
      await onSend(body, replyTo?.id ?? null);
      onDraftChange('');
      onCancelReply();
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
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
            <span className="fab-truncate">
              {sending.kind === 'audio' ? t('chat.voice.sending') : t('chat.sendingAttachment')}
            </span>
            <span className="tabular-nums">{sending.percent}%</span>
          </p>
          <ProgressBar value={sending.percent} label={t('chat.sendingAttachment')} />
        </div>
      ) : null}

      {tray ? (
        <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-2">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="fab-tap rounded-lg px-1.5 py-1 text-lg hover:bg-surface-2"
              onClick={() => {
                onDraftChange(`${draft}${emoji}`);
                setTray(false);
                textarea.current?.focus();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {recording || voice.state === 'processing' ? (
        <div
          className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/5 px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full bg-danger',
              voice.state === 'recording' && 'animate-pulse',
            )}
          />
          <span className="text-sm font-semibold tabular-nums">{voice.label}</span>

          {/* The meter is the only proof a microphone gives that it is hearing
              somebody; without it a member talks to a page and cannot tell. */}
          <span aria-hidden="true" className="flex h-6 flex-1 items-center gap-0.5">
            {Array.from({ length: 18 }, (_, index) => {
              const threshold = (index + 1) / 18;
              return (
                <span
                  key={index}
                  className={cn(
                    'w-full rounded-full transition-[height,background-color] duration-100 ease-app',
                    voice.level >= threshold ? 'bg-danger' : 'bg-danger/20',
                  )}
                  style={{ height: `${Math.max(12, threshold * 100)}%` }}
                />
              );
            })}
          </span>

          <span className="sr-only">{t('chat.voice.recording', { time: voice.label })}</span>

          {voice.state === 'recording' ? (
            <IconButton
              label={t('chat.voice.pause')}
              icon={<Pause size={16} />}
              variant="outline"
              size="sm"
              onClick={voice.pause}
            />
          ) : voice.state === 'paused' ? (
            <IconButton
              label={t('chat.voice.resume')}
              icon={<Play size={16} />}
              variant="outline"
              size="sm"
              onClick={voice.resume}
            />
          ) : null}
          <IconButton
            label={t('chat.voice.discard')}
            icon={<Trash2 size={16} />}
            variant="outline"
            size="sm"
            onClick={voice.cancel}
          />
          <Button
            size="sm"
            iconStart={<Send size={14} />}
            disabled={voice.state === 'processing'}
            onClick={voice.stop}
          >
            {t('chat.voice.send')}
          </Button>
        </div>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextareaField
            ref={textarea}
            label={t('messages.composerLabel')}
            className="flex-1"
            rows={2}
            value={draft}
            maxLength={MAX_LENGTH}
            disabled={disabled || busy}
            placeholder={t('messages.composerPlaceholder')}
            onChange={(event) => {
              onDraftChange(event.target.value);
              onTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
              if (event.key === 'Escape') {
                if (editing !== null) onCancelEdit();
                else if (replyTo !== null) onCancelReply();
              }
            }}
          />

          <div className="flex items-center gap-1">
            <IconButton
              label={t('chat.emojiHint')}
              icon={<Smile size={16} />}
              aria-expanded={tray}
              disabled={busy}
              onClick={() => setTray((open) => !open)}
            />
            <IconButton
              label={t('chat.attachImage')}
              icon={<ImagePlus size={16} />}
              disabled={busy}
              onClick={() => imageInput.current?.click()}
            />
            <IconButton
              label={t('chat.attachFile')}
              icon={<FilePlus2 size={16} />}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            />
            {voice.state === 'unsupported' ? (
              <IconButton
                label={t(voice.blockKey ?? 'chat.voice.failed')}
                icon={<Mic size={16} />}
                disabled
              />
            ) : (
              <IconButton
                label={t('chat.recordVoice')}
                icon={<Mic size={16} />}
                disabled={busy || disabled}
                onClick={voice.start}
              />
            )}
            <Button type="submit" disabled={busy || draft.trim().length === 0}>
              <Send size={16} />
              <span className="fab-sr-only">{t('messages.send')}</span>
            </Button>
          </div>
        </form>
      )}

      <p
        className={cn(
          'mt-1 text-end text-2xs text-muted',
          draft.length > MAX_LENGTH * 0.9 && 'text-danger',
        )}
      >
        {recording
          ? t('chat.voice.limit', { minutes: Math.round(MAX_VOICE_MS / 60_000) })
          : draft.length > MAX_LENGTH * 0.8
            ? t('chat.characterCount', { count: draft.length, max: MAX_LENGTH })
            : ''}
      </p>

      {recording ? (
        <ProgressBar
          value={recordingProgress(voice.elapsedMs) * 100}
          label={t('chat.voice.limitProgress')}
          className="mt-1 bg-danger/15 [&>div]:bg-danger"
        />
      ) : null}

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) void uploadAndSend(file, 'image');
        }}
      />
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) void uploadAndSend(file, 'file');
        }}
      />
    </div>
  );
}
