/**
 * BSDC — src/features/messenger/MessageBubble.tsx
 * Purpose : One chat message: body, attachment, time and delivery state.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Receipts are shown only on the sender's own messages, and only as words ("Sent",
 *   "Delivered", "Read") because a double-tick glyph is a convention that does not survive
 *   translation. Voice notes render as a real audio element with a duration, not a decorative bar.
 *   Long messages wrap rather than scroll sideways, which is what keeps a Bangla paragraph legible
 *   on a 250px screen.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Icon } from '@/shared/ui/Icon';
import { Text } from '@/shared/ui/Typography';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/date';
import type { ChatMessage } from '@/entities/conversation/model';

/** Props for a message bubble. */
export interface MessageBubbleProps {
  readonly message: ChatMessage;
  readonly own: boolean;
  readonly locale: 'bn' | 'en';
  readonly delivered: boolean;
  readonly read: boolean;
  readonly showAvatar: boolean;
}

/**
 * Renders one chat message.
 * @param props bubble props
 * @returns the bubble element
 */
export function MessageBubble({
  message,
  own,
  locale,
  delivered,
  read,
  showAvatar,
}: MessageBubbleProps): React.ReactElement {
  const { t } = useTranslation('messenger');

  const status = own ? (read ? t('read') : delivered ? t('delivered') : t('sent')) : null;

  return (
    <div className={cn('bsdc-bubble', own && 'is-own')} data-kind={message.kind}>
      {showAvatar && !own ? (
        <Avatar
          name={message.senderName}
          src={message.senderPhotoUrl === '' ? null : message.senderPhotoUrl}
          size="xs"
          decorative
        />
      ) : null}

      <div className="bsdc-bubble__body">
        {!own && showAvatar ? (
          <span className="bsdc-bubble__sender">{message.senderName}</span>
        ) : null}

        {message.kind === 'image' && message.attachment !== null ? (
          <img
            className="bsdc-bubble__image"
            src={message.attachment.url}
            alt={message.attachment.alt}
            width={message.attachment.width}
            height={message.attachment.height}
            loading="lazy"
            decoding="async"
          />
        ) : null}

        {message.kind === 'voice' && message.attachment !== null ? (
          <div className="bsdc-bubble__voice">
            <audio controls preload="metadata" src={message.attachment.url}>
              <track kind="captions" />
            </audio>
            <Text as="span" size="sm" tone="muted">
              {`${message.attachment.durationSeconds}s`}
            </Text>
          </div>
        ) : null}

        {message.kind === 'document' && message.attachment !== null ? (
          <a
            className="bsdc-bubble__document"
            href={message.attachment.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="externalLink" size={16} />
            <span>
              {message.attachment.alt.length > 0 ? message.attachment.alt : t('document')}
            </span>
          </a>
        ) : null}

        {message.body.length > 0 ? (
          <Text as="p" className="bsdc-bubble__text" lang={locale === 'bn' ? 'bn' : 'en'}>
            {message.body}
          </Text>
        ) : null}

        <div className="bsdc-bubble__meta">
          <time dateTime={message.createdAt}>{formatDate(message.createdAt, locale)}</time>
          {message.editedAt !== null ? <span>{t('edited')}</span> : null}
          {status !== null ? <span>{status}</span> : null}
        </div>
      </div>
    </div>
  );
}
