/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, Hash, Users, Briefcase, Library, FileText, Clock } from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import { SEOHead } from '@/components/seo/SEOHead';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { itemListSchema } from '@/config/seo';
import type { SearchCategory } from '@/lib/search';

const CATEGORIES: { id: SearchCategory; labelKey: string; icon: typeof FileText }[] = [
  { id: 'all', labelKey: 'common.all', icon: SearchIcon },
  { id: 'posts', labelKey: 'nav.home', icon: FileText },
  { id: 'users', labelKey: 'nav.profile', icon: Users },
  { id: 'tags', labelKey: 'common.tags', icon: Hash },
  { id: 'groups', labelKey: 'nav.groups', icon: Users },
  { id: 'jobs', labelKey: 'nav.jobs', icon: Briefcase },
  { id: 'snippets', labelKey: 'nav.snippets', icon: Library },
];

export default function SearchPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const category = (searchParams.get('type') || 'all') as SearchCategory;
  const [input, setInput] = useState(q);
  const { hits, ready, recent, commitSearch, clearRecent } = useSearch(q, category);

  useEffect(() => {
    setInput(q);
  }, [q]);

  const grouped = useMemo(() => ({
    users: hits.filter((h) => h.kind === 'user'),
    posts: hits.filter((h) => h.kind === 'post'),
    tags: hits.filter((h) => h.kind === 'tag'),
    groups: hits.filter((h) => h.kind === 'group'),
  }), [hits]);

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
        title={q ? `${q} — ${t('common.search')} — BSDC` : `${t('common.search')} — BSDC`}
        description={q ? `Search results for “${q}” on BSDC — the Bangladesh Software Development Community.` : 'Search BSDC: posts, developers, tags, groups, jobs and code snippets.'}
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
            className="bsdc-tap bsdc-input w-full rounded-full py-3.5 pl-12 pr-28 text-base"
            autoFocus
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">
            {t('common.search')}
          </button>
        </form>

        <Tabs value={category} onValueChange={(v) => {
          const next = new URLSearchParams(searchParams);
          next.set('type', v);
          setSearchParams(next);
        }}>
          <div className="bsdc-surface mb-4 p-2">
            <TabsList>
              {CATEGORIES.map((c) => (
                <TabsTrigger key={c.id} value={c.id} icon={<c.icon className="h-4 w-4" aria-hidden />}>
                  {c.id === 'posts' ? 'Posts' : c.id === 'users' ? 'Users' : t(c.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {!q && recent.length > 0 ? (
          <section className="bsdc-surface mb-4 p-4" aria-label="Recent searches">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold">{t('common.search')}</h2>
              <button type="button" onClick={clearRecent} className="text-xs font-semibold text-neutral-400 hover:text-red-500">
                Clear
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <li key={r}>
                  <Link to={`/search?q=${encodeURIComponent(r)}`} className="bsdc-chip gap-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {r}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {q && !ready ? (
          <p className="py-10 text-center text-sm text-neutral-400">{t('common.loading')}</p>
        ) : q && hits.length === 0 ? (
          <EmptyState title={t('common.noResults')} body={t('common.tryDifferent')} icon={<SearchIcon className="h-16 w-16" aria-hidden />} />
        ) : (
          <div className="space-y-4">
            {category === 'all' && grouped.users.length > 0 ? <HitSection title="Users" hits={grouped.users.slice(0, 4)} /> : null}
            {category === 'all' && grouped.tags.length > 0 ? <HitSection title="Tags" hits={grouped.tags.slice(0, 6)} small /> : null}
            {category === 'all' && grouped.groups.length > 0 ? <HitSection title="Groups" hits={grouped.groups.slice(0, 3)} /> : null}
            {hits.length > 0 && (category !== 'all' || grouped.posts.length > 0) ? (
              <section aria-label="Results">
                <ul className="space-y-2">
                  {(category === 'all' ? grouped.posts : hits).map((hit) => (
                    <li key={`${hit.kind}-${hit.id}`}>
                      <Link to={hit.url} className="bsdc-surface flex items-center gap-3 p-3.5 hover:bg-neutral-50 dark:hover:bg-surface-dark-raised/60">
                        {hit.kind === 'user' ? (
                          <Avatar src={hit.image} name={hit.title} size={42} />
                        ) : hit.kind === 'tag' ? (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
                            <Hash className="h-5 w-5" aria-hidden />
                          </span>
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
                            <FileText className="h-5 w-5" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1">
                            <span className="truncate font-semibold">{hit.title}</span>
                            {hit.kind === 'user' ? <VerifiedBadge size={13} /> : null}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">{hit.subtitle}</span>
                        </span>
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

function HitSection({ title, hits, small }: { title: string; hits: { id: string; title: string; subtitle: string; url: string }[]; small?: boolean }) {
  if (small) {
    return (
      <section aria-label={title}>
        <h2 className="mb-2 text-sm font-bold">{title}</h2>
        <ul className="flex flex-wrap gap-2">
          {hits.map((h) => (
            <li key={h.id}>
              <Link to={h.url} className="bsdc-chip bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-300">
                {h.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      <ul className="space-y-1.5">
        {hits.map((h) => (
          <li key={h.id}>
            <Link to={h.url} className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-neutral-100 dark:hover:bg-surface-dark-raised">
              {h.title} <span className="font-normal text-neutral-400">— {h.subtitle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
