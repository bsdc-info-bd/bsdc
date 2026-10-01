import { BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Seo } from '@/components/seo/Seo';
import { Alert, Avatar, Button, EmptyState, PageSkeleton, SectionHeading } from '@/design-system';
import { useNotifications } from '@/hooks/use-interactions';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import { profilePath, ROUTES } from '@/lib/site';

/** The inbox: everything the community did that concerns this member. */
export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const { notifications, isLoading, isError, markAllRead } = useNotifications();
  const hasUnread = notifications.some((item) => item.readAt === null);

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
            hasUnread ? (
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                {t('notifications.markAllRead')}
              </Button>
            ) : undefined
          }
        />

        {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {isError ? <Alert tone="danger" title={t('notifications.failed')} /> : null}

        {!isLoading && !isError && notifications.length === 0 ? (
          <EmptyState
            icon={<BellOff size={22} />}
            title={t('notifications.emptyTitle')}
            description={t('notifications.emptyBody')}
          />
        ) : null}

        <ul className="mt-4 flex flex-col gap-2">
          {notifications.map((item) => {
            const actorName = item.actor?.displayName ?? t('notifications.someone');
            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-start gap-3 rounded-xl border border-line bg-surface p-3',
                  item.readAt === null && 'border-green-500',
                )}
              >
                {item.actor ? (
                  <Link to={profilePath(item.actor.username)} className="shrink-0">
                    <Avatar src={item.actor.avatarUrl} name={actorName} size="sm" />
                  </Link>
                ) : (
                  <Avatar name={actorName} size="sm" />
                )}
                <div className="min-w-0">
                  <p className="text-sm">
                    {t(`notifications.kinds.${item.kind}`, { actor: actorName })}
                  </p>
                  {item.body.length > 0 ? (
                    <p className="fab-truncate mt-0.5 text-xs text-muted">{item.body}</p>
                  ) : null}
                  <p className="mt-0.5 text-2xs text-muted">
                    {formatRelativeTime(new Date(item.createdAt), language)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
