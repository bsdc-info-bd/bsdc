import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/client';
import { TRENDING_LIMIT, rankTags, tagPath, type TagRow } from '@/lib/tags/trending';
import { ROUTES } from '@/lib/site';

/**
 * Where a member can go, in the order they go there.
 *
 * This list is deliberately short. dev.to is readable because its rail is eight
 * destinations, not eighty: a member who is halfway through a post can see, in
 * peripheral vision, the four places they might want next. Everything else stays
 * in the header and the footer, one deliberate click away.
 *
 * The read/section split is a judgement about which four are used. Feeds first,
 * then the things a developer keeps coming back to — questions, jobs, the
 * marketplace — and writing, apart, at the bottom, because it is an action rather
 * than a destination.
 */
const PRIMARY = [
  { to: ROUTES.home, labelKey: 'rail.home', fallback: 'Home' },
  { to: ROUTES.groups, labelKey: 'rail.groups', fallback: 'Groups' },
  // Tags has no index page of its own; the tag cloud lives on the home rail and
  // in the search overlay, so linking to a bare `/tag` would be a 404 with a
  // friendly label on it.
  { to: ROUTES.shop, labelKey: 'rail.market', fallback: 'Marketplace' },
  { to: ROUTES.jobs, labelKey: 'rail.jobs', fallback: 'Jobs' },
  { to: ROUTES.projects, labelKey: 'rail.projects', fallback: 'Projects' },
] as const;

/**
 * The rail.
 *
 * It scrolls with the page on a phone (nothing is hidden behind a drawer nobody
 * opens) and sticks on a wide screen, where there is room for it beside the
 * column. It is rendered once, by the layout, and not by the page: a rail that
 * re-mounts on navigation is a rail that flickers, and a member reads a flicker as
 * a page reload.
 */
export function FeedRail({ className }: { className?: string }): ReactNode {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('rail.label', { defaultValue: 'Main' })}
      className={cn('flex flex-col gap-1', className)}
    >
      {PRIMARY.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === ROUTES.home}
          className={({ isActive }) =>
            cn(
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-app',
              isActive
                ? 'bg-green-50 font-semibold text-green-800 dark:bg-green-950 dark:text-green-200'
                : 'text-foreground hover:bg-surface-2',
            )
          }
        >
          <span>{t(item.labelKey, { defaultValue: item.fallback })}</span>
        </NavLink>
      ))}
      <Link
        to={ROUTES.compose}
        className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-green-700 px-3 py-2 text-sm font-semibold text-green-800 transition-colors duration-150 ease-app hover:bg-green-50 dark:border-green-500 dark:text-green-200 dark:hover:bg-green-950"
      >
        <PenLine size={16} aria-hidden="true" />
        {t('rail.write', { defaultValue: 'Create post' })}
      </Link>
    </nav>
  );
}

/**
 * Trending tags.
 *
 * The rail is on every page, so this is the one request on the site that has to
 * justify itself: it is cached for ten minutes, keyed by language, and it fails
 * quietly into a sentence rather than into an error box — a widget nobody asked
 * for must never be the reason a page looks broken.
 */
export function TrendingTags({ className }: { className?: string }): ReactNode {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'bn' ? 'bn' : 'en';

  const { data } = useQuery({
    queryKey: ['tags', 'trending'],
    enabled: isConfigured.supabase,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: rows, error } = await getSupabase()
        .from('tags')
        .select('slug,label_en,label_bn,posts_count')
        .gt('posts_count', 0)
        .order('posts_count', { ascending: false })
        .limit(TRENDING_LIMIT * 3);
      if (error) throw error;
      return (rows ?? []) as TagRow[];
    },
  });

  const tags = rankTags(data ?? [], language);

  return (
    <section aria-labelledby="rail-trending" className={cn('flex flex-col gap-2', className)}>
      <h2 id="rail-trending" className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t('rail.trending', { defaultValue: 'Trending tags' })}
      </h2>
      {tags.length === 0 ? (
        <p className="text-xs text-muted">
          {t('rail.trendingEmpty', {
            defaultValue: 'Tags appear here once people start using them.',
          })}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tags.map((tag) => (
            <li key={tag.slug}>
              <Link
                to={tagPath(tag.slug)}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm transition-colors duration-150 ease-app hover:bg-surface-2"
              >
                <span className="truncate">
                  #{tag.label}
                  {tag.fresh ? (
                    <span
                      aria-hidden="true"
                      className="ms-1 inline-block size-1.5 rounded-full bg-green-600 align-middle"
                    />
                  ) : null}
                </span>
                <span className="text-2xs text-muted">{tag.posts}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
