import { Image as ImageIcon, Mail } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Lightbox } from '@/components/media/Lightbox';
import { MediaImage } from '@/components/media/MediaImage';
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
 * One message's content: text with links, mentions and code, plus ImgBB image
 * attachments that open full-size in the inline Lightbox.
 */
export function MessageBody({ message, highlight = '', mine = false }: MessageBodyProps) {
  const { t } = useTranslation();
  const [enlarged, setEnlarged] = useState(false);

  if (message.deletedAt !== null) {
    return <span className="italic opacity-80">{t('messages.deleted')}</span>;
  }

  const hasMedia = message.mediaUrl.length > 0;
  const isImage =
    hasMedia &&
    (message.kind === 'image' || attachmentKind(message.mediaName, message.mediaUrl) === 'image');

  return (
    <span className="flex flex-col gap-2">
      {isImage ? (
        <>
          <button
            type="button"
            onClick={() => setEnlarged(true)}
            className="fab-tap block overflow-hidden rounded-xl"
            aria-label={t('chat.enlarge', {
              name: message.mediaName.length > 0 ? message.mediaName : t('chat.image'),
            })}
          >
            <MediaImage
              src={message.mediaUrl}
              alt={message.mediaName.length > 0 ? message.mediaName : t('chat.image')}
              slotWidth={384}
              loading="lazy"
              decoding="async"
              className="max-h-72 w-full max-w-sm object-cover transition-transform duration-200 ease-app hover:scale-[1.01]"
            />
          </button>
          {enlarged ? (
            <Lightbox
              items={[
                {
                  id: message.id,
                  url: message.mediaUrl,
                  thumbUrl: message.mediaUrl,
                  altText: message.mediaName,
                  width: null,
                  height: null,
                },
              ]}
              index={0}
              label={t('chat.image')}
              onChange={() => undefined}
              onClose={() => setEnlarged(false)}
            />
          ) : null}
        </>
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

      {!isImage && message.body.trim().length === 0 && message.kind !== 'snippet' ? (
        <span className="flex items-center gap-2 text-xs opacity-80">
          <ImageIcon size={14} aria-hidden="true" />
          {t('chat.emptyMessage')}
        </span>
      ) : null}
    </span>
  );
}
