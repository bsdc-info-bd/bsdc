import { BellOff, CheckCheck, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PushCard } from '@/components/notifications/PushCard';
import { Seo } from '@/components/seo/Seo';
import { Alert, Avatar, Button, EmptyState, PageSkeleton, SectionHeading } from '@/design-system';
import { useNotifications } from '@/hooks/use-interactions';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import { profilePath, ROUTES } from '@/lib/site';

/**
 * The inbox: everything the community did that concerns this member.
 *
 * The shape of a line is the database's decision, not this screen's — `my_inbox`
 * coalesces a thread into one line, resolves the actor in the same row and
 * answers where the line leads. The screen draws what it is given. It used to
 * assemble all four itself, with an embedded join the client had no relationship
 * for, and the render threw before anything was drawn: the boundary caught it and
 * said so, which is the report this was fixed from.
 *
 * Two rules are kept here because they are about this screen and not about the
 * data. Reading happens when a line is opened, not when the page is loaded: an
 * inbox that empties itself of the bold the moment it is looked at is an inbox
 * that cannot be scanned. And a line is only marked read once, however often it
 * is tapped.
 */
export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { notifications, isLoading, isError, markAllRead, markRead, clearRead, isClearing } =
    useNotifications();
  const hasUnread = notifications.some((item) => item.isUnread);
  const hasRead = notifications.some((item) => !item.isUnread);
  const marked = useRef(new Set<string>());

  // A line that is opened is a line that is read. It is recorded here rather
  // than on mount so the list keeps its bold until somebody acts on it.
  const read = (id: string): void => {
    if (marked.current.has(id)) return;
    marked.current.add(id);
    markRead([id]);
  };

  useEffect(() => {
    marked.current.clear();
  }, [notifications]);

  return (
    <>
      <Seo
        title={t('notifications.metaTitle')}
        description={t('notifications.metaDescription')}
        path={ROUTES.notifications}
        noindex
      />
      <div className="fab-container py-6 sm:py-10">
        <SectionHeading
          title={t('notifications.title')}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {hasRead ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearRead}
                  loading={isClearing}
                  title={t('notifications.clearHint')}
                >
                  <Trash2 aria-hidden className="size-4" />
                  {t('notifications.clearRead')}
                </Button>
              ) : null}
              {hasUnread ? (
                <Button variant="ghost" size="sm" onClick={markAllRead}>
                  <CheckCheck aria-hidden className="size-4" />
                  {t('notifications.markAllRead')}
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="mt-4">
          <PushCard variant="prompt" />
        </div>

        {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {isError ? (
          <Alert tone="danger" title={t('notifications.failed')}>
            {t('notifications.failedHint')}
          </Alert>
        ) : null}

        {!isLoading && !isError && notifications.length === 0 ? (
          <EmptyState
            icon={<BellOff size={22} />}
            title={t('notifications.emptyTitle')}
            description={t('notifications.emptyBody')}
          />
        ) : null}

        <ul className="mt-4 flex flex-col gap-2">
          {notifications.map((item) => {
            const actorName = item.actor?.displayName || t('notifications.someone');
            const rowClass = cn(
              'flex items-start gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-green-600',
              item.isUnread && 'border-green-500 bg-green-700/[0.04]',
            );
            const target = item.targetUrl || ROUTES.notifications;
            const content = (
              <>
                {item.actor ? (
                  <Avatar src={item.actor.avatarUrl} name={actorName} size="sm" />
                ) : (
                  <Avatar name={actorName} size="sm" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', item.isUnread && 'font-semibold')}>
                    {t(`notifications.kinds.${item.kind}`, { actor: actorName })}
                    {/* One line for a thread is one line that says how many
                        are behind it, because "nine messages" is the thing the
                        member wants to know. */}
                    {item.occurrences > 1 ? (
                      <span className="ml-1 font-normal text-muted">
                        {t('notifications.andMore', { count: item.occurrences - 1 })}
                      </span>
                    ) : null}
                  </p>
                  {item.body.length > 0 ? (
                    <p className="fab-truncate mt-0.5 text-xs text-muted">{item.body}</p>
                  ) : null}
                  <p className="mt-0.5 text-2xs text-muted">
                    {formatRelativeTime(new Date(item.lastAt), language)}
                  </p>
                </div>
                {item.isUnread ? (
                  <span
                    aria-label={t('notifications.unreadOne')}
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-green-600"
                  />
                ) : null}
              </>
            );

            return (
              <li key={item.id}>
                {/* A message line is about the thread; every other line opens
                    the thing it is about, or the person who did it. The href
                    is a path either way, so the row is a link that a keyboard
                    can reach and a middle-click can open. */}
                {item.kind === 'message' && item.conversationId !== null ? (
                  <Link to={target} className={rowClass} onClick={() => read(item.id)}>
                    {content}
                  </Link>
                ) : item.actor && item.kind === 'follow' ? (
                  <Link
                    to={profilePath(item.actor.username)}
                    className={rowClass}
                    onClick={() => read(item.id)}
                  >
                    {content}
                  </Link>
                ) : (
                  <Link to={target} className={rowClass} onClick={() => read(item.id)}>
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
