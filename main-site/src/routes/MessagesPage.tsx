import { MessagesSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ConversationView } from '@/components/messaging/ConversationView';
import { Seo } from '@/components/seo/Seo';
import { Alert, Avatar, Badge, EmptyState, PageSkeleton, SectionHeading } from '@/design-system';
import { useInbox } from '@/hooks/use-messaging';
import { cn } from '@/lib/cn';
import { conversationName } from '@/lib/messaging/message-types';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { conversationPath, ROUTES } from '@/lib/site';

/**
 * Messenger. On a narrow screen the list and the thread are separate views;
 * from the medium breakpoint up they sit side by side.
 */
export default function MessagesPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { id } = useParams<{ id?: string }>();
  const inbox = useInbox();
  const activeId = id ?? null;

  return (
    <>
      <Seo
        title={t('messages.metaTitle')}
        description={t('messages.metaDescription')}
        path={ROUTES.messages}
        noindex
      />
      <div className="fab-container py-6">
        <SectionHeading title={t('messages.title')} description={t('messages.description')} />

        <div className="mt-4 grid gap-4 md:grid-cols-[320px_1fr]">
          <aside
            aria-label={t('messages.conversations')}
            className={cn('min-w-0', activeId !== null && 'hidden md:block')}
          >
            {inbox.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
            {inbox.isError ? <Alert tone="danger" title={t('messages.inboxFailed')} /> : null}

            {!inbox.isLoading && !inbox.isError && inbox.conversations.length === 0 ? (
              <EmptyState
                icon={<MessagesSquare size={22} />}
                title={t('messages.emptyTitle')}
                description={t('messages.emptyBody')}
              />
            ) : null}

            <ul className="flex flex-col gap-1">
              {inbox.conversations.map((conversation) => {
                const name = conversationName(conversation, t('messages.untitled'));
                return (
                  <li key={conversation.id}>
                    <Link
                      to={conversationPath(conversation.id)}
                      aria-current={conversation.id === activeId ? 'page' : undefined}
                      className={cn(
                        'fab-tap flex items-center gap-2 rounded-xl border border-transparent p-2 hover:bg-surface-2',
                        conversation.id === activeId && 'border-line bg-surface-2',
                      )}
                    >
                      <Avatar
                        src={
                          conversation.kind === 'group'
                            ? conversation.avatarUrl
                            : (conversation.other?.avatarUrl ?? '')
                        }
                        name={name}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="fab-truncate text-sm font-semibold">{name}</span>
                          {conversation.lastMessageAt !== null ? (
                            <span className="ms-auto shrink-0 text-2xs text-muted">
                              {formatRelativeTime(new Date(conversation.lastMessageAt), language)}
                            </span>
                          ) : null}
                        </span>
                        <span className="fab-truncate mt-0.5 block text-xs text-muted">
                          {conversation.preview.length > 0
                            ? conversation.preview
                            : t('messages.noMessagesYet')}
                        </span>
                      </span>
                      {conversation.unread > 0 ? (
                        <Badge tone="green">{formatNumber(conversation.unread, language)}</Badge>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section
            aria-label={t('messages.thread')}
            className={cn('min-w-0', activeId === null && 'hidden md:block')}
          >
            {activeId === null ? (
              <EmptyState
                icon={<MessagesSquare size={22} />}
                title={t('messages.pickTitle')}
                description={t('messages.pickBody')}
              />
            ) : (
              <ConversationView
                conversationId={activeId}
                summary={inbox.conversations.find((item) => item.id === activeId) ?? null}
              />
            )}
          </section>
        </div>
      </div>
    </>
  );
}
