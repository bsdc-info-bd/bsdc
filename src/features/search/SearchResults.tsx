/**
 * BSDC — src/features/search/SearchResults.tsx
 * Purpose : The rendered result list: one group per kind, one row per hit.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every row says what kind of thing it is before it says what it is called, because
 *   "Habib" is a person, a group and a job at the same time and only one of those is what the
 *   person meant. When the results came from this device alone the panel says so above the list
 *   rather than letting the empty space imply the platform had nothing.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Avatar, EmptyState, Skeleton, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import type { SearchResultSet } from '@/entities/search/model';

/** Props for the results list. */
export interface SearchResultsProps {
  readonly result: SearchResultSet;
  readonly loading: boolean;
  readonly locale: Locale;
  /** Called when a person chooses a hit. */
  readonly onSelect: (path: string, query: string) => void;
}

/**
 * Renders the search results.
 * @param props component props
 * @returns the results element
 */
export function SearchResults({
  result,
  loading,
  locale,
  onSelect,
}: SearchResultsProps): React.ReactElement {
  const { t } = useTranslation('search');

  if (loading) {
    return (
      <div className="bsdc-search__loading" aria-busy="true" aria-live="polite">
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  if (result.total === 0) {
    if (result.query.trim().length === 0) return <></>;
    return (
      <EmptyState
        illustration="empty-state"
        title={t('noResults.title')}
        description={t('noResults.description')}
      />
    );
  }

  return (
    <div className="bsdc-search__results">
      {result.source === 'local' ? (
        <Text as="p" size="sm" tone="muted" className="bsdc-search__source" role="status">
          {t('source.deviceOnly')}
        </Text>
      ) : null}
      {result.groups.map((group) => (
        <section
          key={group.kind}
          className="bsdc-search__group"
          aria-label={t(`kind.${group.kind}`)}
        >
          <h3 className="bsdc-search__groupTitle" lang={locale === 'bn' ? 'bn' : 'en'}>
            {t(`kind.${group.kind}`)}
          </h3>
          <ul className="bsdc-search__list">
            {group.hits.map((hit) => (
              <li key={`${hit.doc.kind}:${hit.doc.id}`}>
                <button
                  type="button"
                  className="bsdc-search__hit"
                  onClick={() => onSelect(hit.doc.path, result.query)}
                >
                  <Avatar
                    name={hit.doc.title}
                    src={hit.doc.kind === 'people' ? null : null}
                    size="sm"
                    decorative
                  />
                  <span className="bsdc-search__hitText">
                    <span className="bsdc-search__hitTitle" lang={locale === 'bn' ? 'bn' : 'en'}>
                      {hit.doc.title}
                    </span>
                    {hit.doc.subtitle.length > 0 ? (
                      <span
                        className="bsdc-search__hitSubtitle"
                        lang={locale === 'bn' ? 'bn' : 'en'}
                      >
                        {hit.doc.subtitle}
                      </span>
                    ) : null}
                  </span>
                  {hit.doc.badge !== undefined ? (
                    <span className="bsdc-search__hitBadge">{hit.doc.badge}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
