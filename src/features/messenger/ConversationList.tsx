/**
 * BSDC — src/features/messenger/ConversationList.tsx
 * Purpose : The conversation rail: who you are talking to, the last line, and unread counts.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Threads are sorted by their last message, and the unread badge is a real count rendered
 *   in the reader's numeral system. Presence is shown where it is known, because in a messenger
 *   "are they there" is the first question a person asks.
 *   The list virtualises past one hundred threads, so an account with years of history still opens
 *   instantly on a low-end phone.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Spinner } from '@/shared/ui/Spinner';
import { VirtualList } from '@/shared/ui/VirtualList';
import { cn } from '@/shared/lib/cn';
import { fromNow } from '@/shared/lib/date';
import {
  conversationTitle,
  messagePreview,
  type ChatMessage,
  type Conversation,
} from '@/entities/conversation/model';
import { usePresence } from '@/features/presence';

/** Threads beyond which the list virtualises. */
const VIRTUALISE_AFTER = 100;

/** A conversation with its last message resolved for display. */
export interface ConversationRow {
  readonly conversation: Conversation;
  readonly lastMessage: ChatMessage | null;
}

/** Props for the conversation list. */
export interface ConversationListProps {
  readonly rows: readonly ConversationRow[];
  readonly locale: 'bn' | 'en';
  readonly viewerUid: string;
  readonly activeId: string | null;
  readonly loading?: boolean | undefined;
  readonly onSelect: (conversationId: string) => void;
}

/**
 * Renders the conversation rail.
 * @param props list props
 * @returns the list element
 */
export function ConversationList({
  rows,
  locale,
  viewerUid,
  activeId,
  loading = false,
  onSelect,
}: ConversationListProps): React.ReactElement {
  const { t } = useTranslation('messenger');

  if (loading) {
    return (
      <div className="bsdc-conversations__loading" role="status">
        <Spinner size={20} label={t('loading')} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState illustration="welcome" title={t('emptyTitle')} description={t('emptyBody')} />
    );
  }

  const renderRow = (row: ConversationRow): React.ReactElement => (
    <ConversationRowItem
      row={row}
      locale={locale}
      viewerUid={viewerUid}
      active={row.conversation.id === activeId}
      onSelect={onSelect}
    />
  );

  return (
    <nav className="bsdc-conversations" aria-label={t('conversations')}>
      {rows.length > VIRTUALISE_AFTER ? (
        <VirtualList
          items={rows}
          itemHeight={72}
          height="70vh"
          label={t('conversations')}
          renderItem={renderRow}
        />
      ) : (
        <ul className="bsdc-conversations__list">
          {rows.map((row) => (
            <li key={row.conversation.id}>{renderRow(row)}</li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/** Props for one conversation row. */
interface ConversationRowItemProps {
  readonly row: ConversationRow;
  readonly locale: 'bn' | 'en';
  readonly viewerUid: string;
  readonly active: boolean;
  readonly onSelect: (conversationId: string) => void;
}

/**
 * Renders one conversation row.
 * @param props row props
 * @returns the row element
 */
function ConversationRowItem({
  row,
  locale,
  viewerUid,
  active,
  onSelect,
}: ConversationRowItemProps): React.ReactElement {
  const { conversation, lastMessage } = row;
  const title = conversationTitle(conversation, viewerUid, 'BSDC');
  const unread = conversation.unread[viewerUid] ?? 0;
  const otherUid = conversation.participantUids.find((uid) => uid !== viewerUid) ?? '';
  const presence = usePresence(otherUid);

  return (
    <button
      type="button"
      className={cn('bsdc-conversations__item', active && 'is-active')}
      onClick={() => onSelect(conversation.id)}
      aria-current={active ? 'true' : undefined}
    >
      <Avatar
        name={title}
        src={conversation.avatarUrl === '' ? null : conversation.avatarUrl}
        size="md"
        presence={presence?.state}
        decorative
      />
      <span className="bsdc-conversations__text">
        <span className="bsdc-conversations__title">{title}</span>
        <span className="bsdc-conversations__preview">
          {lastMessage === null ? conversation.lastMessagePreview : messagePreview(lastMessage)}
        </span>
      </span>
      <span className="bsdc-conversations__meta">
        <time dateTime={conversation.lastMessageAt}>
          {fromNow(conversation.lastMessageAt, locale)}
        </time>
        {unread > 0 ? (
          <Badge tone="brand" variant="count" count={unread} banglaNumerals={locale === 'bn'} />
        ) : null}
      </span>
    </button>
  );
}
