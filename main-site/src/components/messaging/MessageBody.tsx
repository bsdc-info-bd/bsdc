import { FileText, Film, Image as ImageIcon, Mail, Music, Package, Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { attachmentKind, highlightMatches, parseMessageBody } from '@/lib/messaging/message-text';
import type { Message } from '@/lib/messaging/message-types';
import { profilePath } from '@/lib/site';

export interface MessageBodyProps {
  message: Message;
  /** The search term to mark inside the text, if the thread is searching. */
  highlight?: string;
  /** A bubble the viewer sent: links and code invert for contrast. */
  mine?: boolean;
}

function iconFor(kind: ReturnType<typeof attachmentKind>) {
  switch (kind) {
    case 'video':
      return Film;
    case 'audio':
      return Music;
    case 'pdf':
    case 'document':
      return FileText;
    case 'archive':
      return Package;
    default:
      return Paperclip;
  }
}

function Marked({ text, query }: { text: string; query: string }) {
  if (query.trim().length === 0) return <>{text}</>;
  return (
    <>
      {highlightMatches(text, query).map((span, index) =>
        span.hit ? (
          <mark key={index} className="rounded bg-amber-300/70 px-0.5 text-inherit">
            {span.text}
          </mark>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </>
  );
}

/**
 * One message's content: text with links, mentions and code; an image in the
 * bubble; any other attachment as a card. Search hits are marked in place.
 */
export function MessageBody({ message, highlight = '', mine = false }: MessageBodyProps) {
  const { t } = useTranslation();

  if (message.deletedAt !== null) {
    return <span className="italic opacity-80">{t('messages.deleted')}</span>;
  }

  const hasMedia = message.mediaUrl.length > 0;
  const kind = hasMedia ? attachmentKind(message.mediaName, message.mediaUrl) : 'file';
  const Icon = iconFor(kind);

  return (
    <span className="flex flex-col gap-2">
      {hasMedia && kind === 'image' ? (
        <a
          href={message.mediaUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="block overflow-hidden rounded-xl"
        >
          <img
            src={message.mediaUrl}
            alt={message.mediaName.length > 0 ? message.mediaName : t('chat.image')}
            loading="lazy"
            className="max-h-72 w-full max-w-sm object-cover"
          />
        </a>
      ) : null}

      {hasMedia && kind === 'audio' ? (
        <audio controls src={message.mediaUrl} className="max-w-xs">
          <track kind="captions" />
        </audio>
      ) : null}

      {hasMedia && kind !== 'image' && kind !== 'audio' ? (
        <a
          href={message.mediaUrl}
          target="_blank"
          rel="noreferrer noopener"
          download={message.mediaName.length > 0 ? message.mediaName : undefined}
          aria-label={t('chat.download', {
            name: message.mediaName.length > 0 ? message.mediaName : t('chat.file'),
          })}
          className={cn(
            'fab-tap flex max-w-xs items-center gap-2 rounded-xl border px-3 py-2 text-sm',
            mine ? 'border-white/30 bg-white/10' : 'border-line bg-surface',
          )}
        >
          <Icon size={18} aria-hidden="true" />
          <span className="fab-truncate">{message.mediaName || t('chat.file')}</span>
          <span className="ms-auto text-2xs opacity-80">{t('chat.downloadShort')}</span>
        </a>
      ) : null}

      {message.body.trim().length > 0 ? (
        <span className="whitespace-pre-wrap break-words">
          {parseMessageBody(message.body).map((segment, index) => {
            if (segment.type === 'link') {
              return (
                <a
                  key={index}
                  href={segment.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2"
                >
                  {segment.value}
                </a>
              );
            }
            if (segment.type === 'mention') {
              return (
                <Link
                  key={index}
                  to={profilePath(segment.handle)}
                  className="font-semibold underline underline-offset-2"
                >
                  {segment.value}
                </Link>
              );
            }
            if (segment.type === 'code') {
              return (
                <span
                  key={index}
                  className={cn(
                    'my-1 block overflow-x-auto rounded-lg p-2 font-mono text-xs',
                    mine ? 'bg-black/25' : 'bg-surface-3',
                  )}
                >
                  {segment.language.length > 0 ? (
                    <span className="mb-1 block text-2xs uppercase opacity-70">
                      {segment.language}
                    </span>
                  ) : null}
                  <code>{segment.value}</code>
                </span>
              );
            }
            return (
              <span key={index}>
                <Marked text={segment.value} query={highlight} />
              </span>
            );
          })}
        </span>
      ) : null}

      {message.kind === 'snippet' && message.body.trim().length === 0 ? (
        <span className="flex items-center gap-2 text-xs opacity-80">
          <Mail size={14} aria-hidden="true" />
          {t('chat.snippet')}
        </span>
      ) : null}

      {!hasMedia && message.body.trim().length === 0 && message.kind !== 'snippet' ? (
        <span className="flex items-center gap-2 text-xs opacity-80">
          <ImageIcon size={14} aria-hidden="true" />
          {t('chat.emptyMessage')}
        </span>
      ) : null}
    </span>
  );
}
