import { FilePlus2, ImagePlus, Mic, Send, Smile, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, IconButton, TextareaField } from '@/design-system';
import { cn } from '@/lib/cn';
import { previewLine } from '@/lib/messaging/message-text';
import type { Message } from '@/lib/messaging/message-types';
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

export interface AttachmentInput {
  body: string;
  mediaUrl: string;
  mediaName: string;
  kind: 'image' | 'file';
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

/**
 * The composer: text with a draft that follows the member across devices,
 * attachments, a voice note, an emoji tray, and a reply or edit context bar.
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
  const [recording, setRecording] = useState(false);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing !== null) textarea.current?.focus();
  }, [editing]);

  async function uploadAndSend(file: File, kind: 'image' | 'file'): Promise<void> {
    setBusy(true);
    try {
      const { uploadMedia } = await import('@/lib/storage/upload');
      const result = await uploadMedia(file, {
        purpose: kind === 'image' ? 'comment-image' : 'chat-document',
      });
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

  async function startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: media.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type });
        void uploadAndSend(file, 'file');
      };
      recorder.current = media;
      media.start();
      setRecording(true);
    } catch {
      toast.error(t('media.errors.failed'));
    }
  }

  function stopRecording(): void {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  }

  return (
    <div className="border-t border-line p-3">
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
          disabled={disabled}
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
          {typeof navigator !== 'undefined' && 'mediaDevices' in navigator ? (
            <IconButton
              label={recording ? t('chat.stopRecording') : t('chat.recordVoice')}
              icon={recording ? <Square size={16} /> : <Mic size={16} />}
              disabled={busy}
              onClick={() => (recording ? stopRecording() : void startRecording())}
            />
          ) : null}
          <Button type="submit" disabled={busy || draft.trim().length === 0}>
            <Send size={16} />
            <span className="fab-sr-only">{t('messages.send')}</span>
          </Button>
        </div>
      </form>

      <p
        className={cn(
          'mt-1 text-end text-2xs text-muted',
          draft.length > MAX_LENGTH * 0.9 && 'text-danger',
        )}
      >
        {recording
          ? t('chat.recording')
          : draft.length > MAX_LENGTH * 0.8
            ? t('chat.characterCount', { count: draft.length, max: MAX_LENGTH })
            : ''}
      </p>

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
