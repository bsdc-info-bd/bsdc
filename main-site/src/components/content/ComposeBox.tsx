import { ImagePlus, PenLine } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/design-system';
import { selectUser, useAuthStore } from '@/store/auth-store';
import { ROUTES } from '@/lib/site';

/**
 * The "write a post" bar at the top of the feed.
 *
 * dev.to has one and it does a job that is easy to miss: it puts writing in the
 * same column as reading, so the next action after reading somebody's post is
 * visible without a navigation. The bar is not an editor — a full editor inline
 * in a feed is a textarea that eats the fold on a phone and loses a half-written
 * post when the tab is closed. It is two links to the real composer, one of which
 * says what it is for.
 *
 * It renders nothing when nobody is signed in, because a visitor cannot post and
 * a button that leads to a sign-in wall is worse than no button.
 */
export function ComposeBox(): ReactElement | null {
  const { t } = useTranslation();
  const user = useAuthStore(selectUser);
  if (user === null) return null;

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-2 ps-3">
      <Avatar src={user.photoURL ?? undefined} name={user.displayName ?? ''} size="sm" />
      <Link
        to={ROUTES.compose}
        className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-muted transition-colors duration-150 ease-app hover:bg-surface-2 hover:text-foreground"
      >
        {t('feed.composePrompt', {
          defaultValue: 'Write a post, ask a question, share a snippet…',
        })}
      </Link>
      <Link
        to={ROUTES.compose}
        aria-label={t('rail.write', { defaultValue: 'Create post' })}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-green-700 transition-colors duration-150 ease-app hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950"
      >
        <PenLine size={17} aria-hidden="true" />
      </Link>
      <Link
        to={ROUTES.compose}
        aria-label={t('feed.composeImage', { defaultValue: 'Add a picture' })}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-green-700 transition-colors duration-150 ease-app hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950"
      >
        <ImagePlus size={17} aria-hidden="true" />
      </Link>
    </div>
  );
}
