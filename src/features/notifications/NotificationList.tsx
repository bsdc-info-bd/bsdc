/**
 * BSDC — src/features/notifications/NotificationList.tsx
 * Purpose : The notification centre: what happened, who did it, and where it opens.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Unread items are visually separated rather than merely tinted, because a tint is
 *   invisible in high-contrast and monochrome themes. Each row is a real link to the thing it is
 *   about, and opening it marks it read.
 *   The list keeps its own optimistic read state so the badge and the row agree within a frame,
 *   while the write-through queue guarantees the server hears about it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Avatar } from '@/shared/ui/Avatar';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Icon } from '@/shared/ui/Icon';
import { Spinner } from '@/shared/ui/Spinner';
import { Text } from '@/shared/ui/Typography';
import { cn } from '@/shared/lib/cn';
import { fromNow } from '@/shared/lib/date';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  watchNotifications,
} from '@/entities/notification/repository';
import {
  notificationIcon,
  sortNotifications,
  unreadCount,
  type BsdcNotification,
} from '@/entities/notification/model';

/** Props for the notification list. */
export interface NotificationListProps {
  readonly uid: string;
  readonly locale: 'bn' | 'en';
}

/**
 * Renders the notification centre.
 * @param props list props
 * @returns the list element
 */
export function NotificationList({ uid, locale }: NotificationListProps): React.ReactElement {
  const { t } = useTranslation('notifications');
  const [items, setItems] = useState<readonly BsdcNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void listNotifications(uid).then((page) => {
      if (!active) return;
      setItems(page.items);
      setOffline(page.source === 'local');
      setLoading(false);
    });
    const release = watchNotifications(uid, (next) => {
      if (!active) return;
      setItems(next);
      setOffline(false);
      setLoading(false);
    });
    return () => {
      active = false;
      release();
    };
  }, [uid]);

  /**
   * Marks one notification read and navigates to its target.
   * @param notification the notification
   */
  const open = useCallback(
    (notification: BsdcNotification): void => {
      if (notification.read) return;
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read: true, readAt: new Date().toISOString() }
            : item,
        ),
      );
      void markNotificationRead(uid, notification.id);
    },
    [uid],
  );

  /**
   * Marks everything read.
   */
  const readAll = useCallback(async (): Promise<void> => {
    setBusy(true);
    const nowIso = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read: true, readAt: nowIso })));
    await markAllNotificationsRead(uid);
    setBusy(false);
  }, [uid]);

  const ordered = sortNotifications(items);
  const unread = unreadCount(items);

  if (loading) {
    return (
      <div className="bsdc-notifications__loading" role="status">
        <Spinner size={20} label={t('loading')} />
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <EmptyState illustration="empty-state" title={t('emptyTitle')} description={t('emptyBody')} />
    );
  }

  return (
    <section className="bsdc-notifications" aria-label={t('title')}>
      <header className="bsdc-notifications__head">
        <Text as="span" size="sm" tone="muted" numeric>
          {t('unread', { count: unread })}
        </Text>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void readAll()}
          disabled={unread === 0 || busy}
        >
          {t('markAllRead')}
        </Button>
      </header>

      {offline ? (
        <Text as="p" role="status" className="bsdc-notifications__offline">
          {t('deviceOnly')}
        </Text>
      ) : null}

      <ul className="bsdc-notifications__list">
        {ordered.map((notification) => (
          <li key={notification.id}>
            <article
              className={cn('bsdc-notification', notification.read && 'is-read')}
              data-type={notification.type}
            >
              <Avatar
                name={notification.actorName}
                src={notification.actorPhotoUrl === '' ? null : notification.actorPhotoUrl}
                size="sm"
                decorative
              />
              <div className="bsdc-notification__body">
                <p className="bsdc-notification__text" lang={locale === 'bn' ? 'bn' : 'en'}>
                  {locale === 'bn' ? notification.bodyBn : notification.bodyEn}
                </p>
                <time className="bsdc-notification__time" dateTime={notification.createdAt}>
                  {fromNow(notification.createdAt, locale)}
                </time>
              </div>
              <div className="bsdc-notification__actions">
                <span className="bsdc-notification__icon" aria-hidden="true">
                  <Icon name={notificationIcon(notification.type)} size={18} />
                </span>
                {notification.targetPath.length > 0 ? (
                  <Link
                    to={notification.targetPath}
                    className="bsdc-notification__link"
                    onClick={() => open(notification)}
                  >
                    {t('open')}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="bsdc-notification__link"
                    onClick={() => open(notification)}
                    disabled={notification.read}
                  >
                    {notification.read ? t('read') : t('markRead')}
                  </button>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
