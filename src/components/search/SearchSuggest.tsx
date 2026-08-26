/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Live search suggestions: debounced as-you-type results with smart ranking,
 * trending tags (real data), recent searches, keyboard navigation and direct
 * navigation — in the header on every screen.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, Hash, Clock, TrendingUp, X, FileText, Users, CornerDownLeft } from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

export function SearchSuggest({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { grouped, hits, trending, recent, clearRecent, commitSearch } = useSearch(query);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Global "/" focuses search, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(url: string, q?: string) {
    setOpen(false);
    if (q) commitSearch(q);
    navigate(url);
    onNavigate?.();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const flat = flatResults();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[activeIndex];
      if (item) go(item.url, query);
      else if (query.trim()) go(`/search?q=${encodeURIComponent(query.trim())}`, query);
    }
  }

  function flatResults() {
    return [...grouped.tags.slice(0, 3), ...grouped.users.slice(0, 4), ...grouped.posts.slice(0, 4), ...grouped.groups.slice(0, 2)];
  }

  const showTrending = !query && trending.length > 0;
  const showRecent = !query && recent.length > 0;
  const flat = flatResults();
  const activeItem = flat[activeIndex];

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('common.searchPlaceholder')}
          aria-label={t('common.search')}
          role="combobox"
          aria-expanded={open}
          aria-controls="bsdc-search-suggest"
          className="bsdc-input h-10 w-full rounded-full pl-10 pr-20 text-sm"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label={t('common.close')}
              className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-surface-dark-raised"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => query.trim() && go(`/search?q=${encodeURIComponent(query.trim())}`, query)}
            className="rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
          >
            {t('common.search')}
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="bsdc-search-suggest"
          role="listbox"
          className="bsdc-animate-slide-up absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-surface-light-border bg-white p-2 shadow-raised dark:border-surface-dark-border dark:bg-surface-dark-raised"
        >
          {showRecent ? (
            <Section title={t('common.search')} icon={<Clock className="h-3 w-3" aria-hidden />}>
              <div className="flex flex-wrap gap-1.5 px-1 pb-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => go(`/search?q=${encodeURIComponent(r)}`, r)}
                    className="bsdc-chip gap-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  >
                    <Clock className="h-3 w-3" aria-hidden />
                    {r}
                  </button>
                ))}
                <button type="button" onClick={clearRecent} className="text-[11px] font-semibold text-neutral-400 hover:text-red-500">
                  Clear
                </button>
              </div>
            </Section>
          ) : null}

          {showTrending ? (
            <Section title={t('feed.trendingTags')} icon={<TrendingUp className="h-3 w-3" aria-hidden />}>
              <div className="flex flex-wrap gap-1.5 px-1 pb-2">
                {trending.map((tr) => (
                  <button
                    key={tr.tag}
                    type="button"
                    onClick={() => go(`/tag/${encodeURIComponent(tr.tag)}`)}
                    className="bsdc-chip gap-1 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-300"
                  >
                    <Hash className="h-3 w-3" aria-hidden />
                    {tr.tag}
                    <span className="text-neutral-400">· {tr.count}</span>
                  </button>
                ))}
              </div>
            </Section>
          ) : null}

          {query && hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-400">
              {t('common.noResults')} — {t('common.tryDifferent')}
            </p>
          ) : null}

          {grouped.users.length > 0 ? (
            <Section title={t('nav.profile')} icon={<Users className="h-3 w-3" aria-hidden />}>
              {grouped.users.slice(0, 4).map((hit) => (
                <ResultRow key={hit.id} hit={hit} active={activeItem?.id === hit.id} onClick={() => go(hit.url, query)} />
              ))}
            </Section>
          ) : null}

          {grouped.tags.length > 0 ? (
            <Section title={t('common.tags')} icon={<Hash className="h-3 w-3" aria-hidden />}>
              {grouped.tags.slice(0, 3).map((hit) => (
                <ResultRow key={hit.id} hit={hit} active={activeItem?.id === hit.id} onClick={() => go(hit.url, query)} />
              ))}
            </Section>
          ) : null}

          {grouped.posts.length > 0 ? (
            <Section title={t('nav.home')} icon={<FileText className="h-3 w-3" aria-hidden />}>
              {grouped.posts.slice(0, 4).map((hit) => (
                <ResultRow key={hit.id} hit={hit} active={activeItem?.id === hit.id} onClick={() => go(hit.url, query)} />
              ))}
            </Section>
          ) : null}

          {query.trim() ? (
            <button
              type="button"
              onClick={() => go(`/search?q=${encodeURIComponent(query.trim())}`, query)}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50"
            >
              <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
              {t('common.viewAll')} “{query.trim()}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-1">
      <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
        {icon}
        {title}
      </p>
      {children}
    </section>
  );
}

function ResultRow({ hit, active, onClick }: { hit: { id: string; kind: string; title: string; subtitle: string; image: string; reason: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
        active ? 'bg-brand-50 dark:bg-brand-950/50' : 'hover:bg-neutral-50 dark:hover:bg-surface-dark',
      )}
    >
      {hit.kind === 'user' ? (
        <Avatar src={hit.image} name={hit.title} size={34} />
      ) : hit.kind === 'tag' ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
          <Hash className="h-4 w-4" aria-hidden />
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{hit.title}</span>
        <span className="block truncate text-xs text-neutral-400">
          {hit.subtitle}
          {hit.reason ? ` · ${hit.reason}` : ''}
        </span>
      </span>
    </button>
  );
}
