/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search as SearchIcon, Hash, Users, Briefcase, Library, FileText, Clock, TrendingUp,
  Sparkles,
} from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import type { SearchHit } from '@/lib/search';
import { SEOHead } from '@/components/seo/SEOHead';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { itemListSchema } from '@/config/seo';
import type { SearchCategory } from '@/lib/search';

const CATEGORIES: { id: SearchCategory; label: string; icon: typeof FileText }[] = [
  { id: 'all', label: 'All', icon: SearchIcon },
  { id: 'posts', label: 'Posts', icon: FileText },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'tags', label: 'Tags', icon: Hash },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'snippets', label: 'Snippets', icon: Library },
];

export default function SearchPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const category = (searchParams.get('type') || 'all') as SearchCategory;
  const [input, setInput] = useState(q);
  const { hits, grouped, trending, recent, commitSearch, clearRecent } = useSearch(q, category);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const sortedByCategory = useMemo(() => hits, [hits]);

  function submit(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value);
    else next.delete('q');
    commitSearch(value);
    setSearchParams(next);
  }

  return (
    <>
      <SEOHead
        title={q ? `${q} — Search — BSDC` : `Search — BSDC`}
        description={q ? `Search results for “${q}” on BSDC — ranked by relevance, popularity and your interests.` : 'Search BSDC: posts, developers, tags, groups, jobs and code snippets.'}
        path={`/search?q=${encodeURIComponent(q)}`}
        noindex
        jsonLd={q ? [itemListSchema(`Search: ${q}`, hits.map((h) => ({ name: h.title, url: h.url })))] : undefined}
      />
      <div className="mx-auto max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="relative mb-4"
          role="search"
        >
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('common.searchPlaceholder')}
            aria-label={t('common.search')}
            className="bsdc-tap bsdc-input w-full rounded-full py-3.5 pl-12 pr-16 text-base sm:pr-24"
            autoFocus
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 sm:px-5">
            <span className="hidden sm:inline">{t('common.search')}</span>
            <SearchIcon className="h-4 w-4 sm:hidden" aria-hidden />
          </button>
        </form>

        <Tabs
          value={category}
          onValueChange={(v) => {
            const next = new URLSearchParams(searchParams);
            next.set('type', v);
            setSearchParams(next);
          }}
        >
          <div className="bsdc-surface mb-4 p-2">
            <TabsList>
              {CATEGORIES.map((c) => (
                <TabsTrigger key={c.id} value={c.id} icon={<c.icon className="h-4 w-4" aria-hidden />}>
                  {c.id === 'all' ? t('common.all') : c.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {!q ? (
          <div className="space-y-4">
            {trending.length > 0 ? (
              <section className="bsdc-surface p-4" aria-label={t('feed.trendingTags')}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <TrendingUp className="h-4 w-4 text-brand-600" aria-hidden />
                  {t('feed.trendingTags')} — <span className="font-normal text-neutral-400">live from real posts</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {trending.map((tr) => (
                    <Link key={tr.tag} to={`/tag/${encodeURIComponent(tr.tag)}`} className="bsdc-chip gap-1 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-300">
                      <Hash className="h-3 w-3" aria-hidden />
                      {tr.tag}
                      <span className="text-neutral-400">· {tr.count}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            {recent.length > 0 ? (
              <section className="bsdc-surface p-4" aria-label="Recent searches">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <Clock className="h-4 w-4 text-neutral-400" aria-hidden />
                    {t('common.search')}
                  </h2>
                  <button type="button" onClick={clearRecent} className="text-xs font-semibold text-neutral-400 hover:text-red-500">
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <Link key={r} to={`/search?q=${encodeURIComponent(r)}`} className="bsdc-chip bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700">
                      <Clock className="h-3 w-3" aria-hidden />
                      {r}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            <EmptyState
              title={t('common.search')}
              body="Start typing — results rank by relevance, popularity, recency and your interests."
              icon={<SearchIcon className="h-16 w-16" aria-hidden />}
            />
          </div>
        ) : hits.length === 0 ? (
          <EmptyState title={t('common.noResults')} body={t('common.tryDifferent')} icon={<SearchIcon className="h-16 w-16" aria-hidden />} />
        ) : (
          <div className="space-y-5">
            {q ? (
              <p className="flex items-center gap-2 px-1 text-xs text-neutral-400">
                <Sparkles className="h-3.5 w-3.5 text-brand-500" aria-hidden />
                {hits.length} results — smart ranked (relevance · popularity · recency · personalization)
              </p>
            ) : null}

            {grouped.users.length > 0 && category === 'all' ? <HitSection title="Users" hits={grouped.users.slice(0, 4)} /> : null}
            {grouped.tags.length > 0 && category === 'all' ? <TagChips hits={grouped.tags.slice(0, 8)} /> : null}
            {grouped.groups.length > 0 && category === 'all' ? <HitSection title="Groups" hits={grouped.groups.slice(0, 3)} /> : null}

            {(category !== 'all' || grouped.posts.length > 0) && sortedByCategory.length > 0 ? (
              <section aria-label="Results">
                <ul className="space-y-2">
                  {(category === 'all' ? grouped.posts : sortedByCategory).map((hit) => (
                    <li key={`${hit.kind}-${hit.id}`}>
                      <Link to={hit.url} className="bsdc-surface bsdc-fabric-card-hover flex items-center gap-3 p-3.5">
                        {hit.kind === 'user' ? (
                          <Avatar src={hit.image} name={hit.title} size={44} />
                        ) : hit.kind === 'tag' ? (
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                            <Hash className="h-5 w-5" aria-hidden />
                          </span>
                        ) : (
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
                            <FileText className="h-5 w-5" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span className="truncate font-semibold">
                              <Highlighted title={hit.title} ranges={hit.highlight} />
                            </span>
                            {hit.kind === 'user' ? <VerifiedBadge size={13} /> : null}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">{hit.subtitle}</span>
                          {hit.reason ? (
                            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                              <Sparkles className="h-3 w-3" aria-hidden />
                              {hit.reason}
                            </span>
                          ) : null}
                        </span>
                        <Badge className="hidden shrink-0 sm:inline-flex">{Math.round(hit.score)}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function Highlighted({ title, ranges }: { title: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return <>{title}</>;
  const [start, end] = ranges[0];
  return (
    <>
      {title.slice(0, start)}
      <mark className="rounded bg-brand-100 px-0.5 text-brand-800 dark:bg-brand-950 dark:text-brand-200">{title.slice(start, end)}</mark>
      {title.slice(end)}
    </>
  );
}

function HitSection({ title, hits }: { title: string; hits: SearchHit[] }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 px-1 text-sm font-bold">{title}</h2>
      <ul className="space-y-1.5">
        {hits.map((h) => (
          <li key={`${h.kind}-${h.id}`}>
            <Link to={h.url} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-neutral-100 dark:hover:bg-surface-dark-raised">
              {h.kind === 'user' ? <Avatar src={h.image} name={h.title} size={30} /> : null}
              <span className="min-w-0 flex-1 truncate">
                <Highlighted title={h.title} ranges={h.highlight} />
              </span>
              <span className="hidden shrink-0 font-normal text-neutral-400 sm:inline">{h.subtitle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TagChips({ hits }: { hits: SearchHit[] }) {
  return (
    <section aria-label="Tags">
      <h2 className="mb-2 px-1 text-sm font-bold">Tags</h2>
      <div className="flex flex-wrap gap-2">
        {hits.map((h) => (
          <Link key={h.id} to={h.url} className="bsdc-chip gap-1 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-300">
            <Hash className="h-3 w-3" aria-hidden />
            {h.title.replace('#', '')}
            <span className="text-neutral-400">· {h.subtitle}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
