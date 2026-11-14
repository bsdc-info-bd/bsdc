import { Search as SearchIcon, TrendingUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AdSlot } from '@/components/ads/AdSlot';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  Chip,
  EmptyState,
  PageSkeleton,
  SectionHeading,
  Tabs,
  TextField,
} from '@/design-system';
import { useRichSuggestions, useSearch, useTrendingSearches } from '@/hooks/use-search';
import { highlight, resultPath, SEARCH_KINDS, type SearchKind } from '@/lib/search/search-types';
import { formatNumber } from '@/lib/format';
import { ROUTES, SITE } from '@/lib/site';

/** Global search across everything the member is allowed to see. */
export default function SearchPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [input, setInput] = useState(initial);
  const [kind, setKind] = useState<SearchKind | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const state = useSearch(input, kind);
  const { suggestions } = useRichSuggestions(input);
  const trending = useTrendingSearches();

  // The address bar follows the box, so a result list can be shared or kept.
  useEffect(() => {
    const trimmed = input.trim();
    const current = params.get('q') ?? '';
    if (trimmed === current) return;
    const next = new URLSearchParams(params);
    if (trimmed.length === 0) next.delete('q');
    else next.set('q', trimmed);
    setParams(next, { replace: true });
  }, [input, params, setParams]);

  const resultsNode = (
    <>
      {state.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
      {state.isError ? <Alert tone="danger" title={t('search.failed')} className="mt-4" /> : null}

      {state.isEmpty ? (
        <div className="mt-4">
          <EmptyState
            icon={<SearchIcon size={22} />}
            title={t('search.emptyTitle')}
            description={t('search.emptyBody')}
          />
        </div>
      ) : null}

      {state.groups.map((group) => (
        <section key={group.kind} className="mt-6" aria-labelledby={`results-${group.kind}`}>
          <h2 id={`results-${group.kind}`} className="text-sm font-semibold">
            {t(`search.kinds.${group.kind}`)}{' '}
            <span className="text-muted">({formatNumber(group.results.length, language)})</span>
          </h2>
          <ul className="mt-2 grid gap-2">
            {group.results.map((result) => (
              <Card as="li" key={`${result.kind}-${result.id}`}>
                <Link to={resultPath(result)} className="fab-link block">
                  <span className="flex items-center gap-2">
                    <Badge tone="neutral">{t(`search.kinds.${result.kind}`)}</Badge>
                    <span className="font-semibold">
                      {highlight(result.title, state.text).map((segment, index) => (
                        <span
                          key={`${segment.text}-${String(index)}`}
                          className={segment.match ? 'bg-green-100 text-green-900' : undefined}
                        >
                          {segment.text}
                        </span>
                      ))}
                    </span>
                  </span>
                </Link>
                {result.subtitle.length > 0 ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{result.subtitle}</p>
                ) : null}
              </Card>
            ))}
          </ul>
        </section>
      ))}
    </>
  );

  const tabs = [
    { id: 'all', label: t('search.all'), content: resultsNode },
    ...SEARCH_KINDS.map((item) => ({
      id: item,
      label: t(`search.kinds.${item}`),
      content: resultsNode,
    })),
  ];

  return (
    <>
      <Seo
        title={t('search.metaTitle')}
        description={t('search.metaDescription')}
        path={ROUTES.search}
        noindex
        jsonLd={[
          {
            '@type': 'SearchResultsPage',
            name: t('search.title'),
            url: `${SITE.url}${ROUTES.search}`,
            isPartOf: { '@id': `${SITE.url}/#website` },
          },
        ]}
      />

      <div className="fab-container max-w-3xl py-6 sm:py-10">
        <SectionHeading title={t('search.title')} description={t('search.description')} />

        <Card className="relative mt-4">
          <div className="relative flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label={t('search.label')}
                hint={t('search.hint')}
                type="search"
                value={input}
                maxLength={120}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  window.setTimeout(() => setShowSuggestions(false), 160);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setShowSuggestions(false);
                }}
                onChange={(event) => {
                  setInput(event.target.value);
                  setShowSuggestions(true);
                }}
              />
            </div>
            {input.length > 0 ? (
              <button
                type="button"
                aria-label={t('search.clear')}
                onClick={() => {
                  setInput('');
                  setShowSuggestions(false);
                }}
                className="fab-tap mb-5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:bg-surface-2 hover:text-text"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {showSuggestions && suggestions.length > 0 && input.trim().length >= 2 ? (
            <ul
              role="listbox"
              aria-label={t('search.suggestions')}
              className="mt-2 divide-y divide-border/70 rounded-xl border border-border bg-bg shadow-raised"
            >
              {suggestions.slice(0, 6).map((item) => {
                const target = resultPath({
                  kind: item.kind,
                  id: item.id,
                  slug: item.slug,
                  title: item.title,
                  subtitle: item.subtitle,
                  imageUrl: item.imageUrl,
                  rank: 0,
                  createdAt: '',
                });
                return (
                  <li key={`${item.kind}-${item.id}-${item.slug}`}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setShowSuggestions(false);
                        navigate(target);
                      }}
                      className="fab-tap flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-surface-2"
                    >
                      <Avatar src={item.imageUrl} name={item.title} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="fab-truncate block text-sm font-medium">{item.title}</span>
                        {item.subtitle.length > 0 ? (
                          <span className="fab-truncate block text-xs text-muted">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <Badge tone="neutral">{t(`search.kinds.${item.kind}`)}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Card>

        <AdSlot
          placement="search"
          topic={state.text.trim().length > 0 ? state.text.trim() : undefined}
          className="mt-4"
        />

        <div className="mt-4">
          <Tabs
            items={tabs}
            activeId={kind ?? 'all'}
            onChange={(value) => {
              setKind(value === 'all' ? null : (value as SearchKind));
            }}
            label={t('search.filterLabel')}
          />
        </div>

        {trending.terms.length > 0 && state.text.length === 0 ? (
          <section className="mt-8" aria-labelledby="trending">
            <h2 id="trending" className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp size={16} aria-hidden="true" />
              {t('search.trending')}
            </h2>
            <p className="mt-1 text-xs text-muted">{t('search.trendingHint')}</p>
            <ul className="mt-2 flex flex-wrap gap-1">
              {trending.terms.map((item) => (
                <li key={item.term}>
                  <Chip
                    onClick={() => {
                      setInput(item.term);
                    }}
                  >
                    {item.term}
                  </Chip>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
