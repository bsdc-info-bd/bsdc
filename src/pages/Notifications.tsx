/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell, CheckCheck, Heart, MessageSquare, Reply, AtSign, UserPlus, Zap, Megaphone,
  Star, FileBadge, ShieldAlert, Eye, Share2, Users, Gift,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/stores/authStore';
import { SEOHead } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { NotificationType } from '@/types/domain';
import { cn, timeAgo } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';

const ICONS: Partial<Record<NotificationType, LucideIcon | ComponentType<{ className?: string }>>> = {
  new_follower: UserPlus,
  post_reaction: Heart,
  comment: MessageSquare,
  reply: Reply,
  mention: AtSign,
  message: MessageSquare,
  group_invite: Users,
  post_shared: Share2,
  points_received: Gift,
  admin_announcement: Megaphone,
  creator_status: Star,
  license_status: FileBadge,
  job_application: BriefcaseIcon,
  moderation_action: ShieldAlert,
  story_view: Eye,
};

function BriefcaseIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className} aria-hidden>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    </svg>
  );
}

export default function Notifications() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const language = useUIStore((s) => s.language);
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications(profile?.uid || null);

  return (
    <>
      <SEOHead title={`${t('notifications.title')} — BSDC`} description="Your BSDC notifications." path="/notifications" noindex />
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
            <Bell className="h-6 w-6 text-brand-600" aria-hidden />
            {t('notifications.title')}
            {unreadCount > 0 ? (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{unreadCount}</span>
            ) : null}
          </h1>
          {unreadCount > 0 ? (
            <Button size="sm" variant="subtle" icon={<CheckCheck className="h-4 w-4" aria-hidden />} onClick={() => void markAllRead()}>
              <span className="hidden min-[420px]:inline">{t('notifications.markAllRead')}</span>
            </Button>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={t('notifications.empty')} body={t('notifications.emptyBody')} icon={<Bell className="h-16 w-16" aria-hidden />} />
        ) : (
          <ul className="space-y-1.5">
            {items.map((n) => {
              const Icon = ICONS[n.type] || Zap;
              return (
                <li key={n.id}>
                  <Link
                    to={n.link || '/'}
                    onClick={() => void markRead(n.id)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3.5 transition-colors sm:items-center',
                      n.read
                        ? 'border-surface-light-border bg-white hover:bg-neutral-50 dark:border-surface-dark-border dark:bg-surface-dark-muted dark:hover:bg-surface-dark-raised/60'
                        : 'border-brand-200 bg-brand-50/60 hover:bg-brand-50 dark:border-brand-900 dark:bg-brand-950/30 dark:hover:bg-brand-950/50',
                    )}
                  >
                    <span className="relative shrink-0">
                      <Avatar src={n.actorAvatar} name={n.actorName} size={42} />
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white dark:border-surface-dark-muted">
                        <Icon className="h-3 w-3" aria-hidden />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {n.actorName} {t(`notifications.${n.type}`)}
                      </span>
                      {n.body ? <span className="line-clamp-2 block text-xs text-neutral-500 dark:text-neutral-400">{n.body}</span> : null}
                      <span className="mt-0.5 block text-[11px] text-neutral-400">{timeAgo(n.createdAt, language)}</span>
                    </span>
                    {!n.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
