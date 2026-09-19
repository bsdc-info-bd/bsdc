/**
 * BSDC — src/pages/search/SearchPage.tsx
 * Purpose : The full search route: everything the platform found, grouped by kind.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The route is noindex by construction — a search result page has nothing to offer a
 *   crawler, and indexing one is how a site ends up with ten thousand thin pages.
 *   The query lives in the URL, so a search is shareable and the back button behaves. That is also
 *   why the input is a controlled field driven by the query string rather than local state nobody
 *   else can see.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Heading, Input, Text } from '@/shared/ui';
import { SEARCH_KINDS } from '@/core/config/search';
import { useSession } from '@/features/auth';
import { SearchResults, rememberSearch, useSearch } from '@/features/search';

/**
 * Renders the search route.
 * @returns the search page
 */
export function SearchPage(): React.ReactElement {
  const { t } = useTranslation('search');
  const { locale } = useSession();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const query = params.get('q') ?? '';
  const [draft, setDraft] = useState(query);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (draft.trim().length === 0) next.delete('q');
      else next.set('q', draft.trim());
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, query, params, setParams]);

  const { result, loading } = useSearch(query, SEARCH_KINDS);

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('subtitle')}
        </Text>
      </header>

      <form
        className="bsdc-search__form"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <Input
          label={t('field.label')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          type="search"
          placeholder={t('field.hint')}
        />
      </form>

      <SearchResults
        result={result}
        loading={loading}
        locale={locale}
        onSelect={(path, remembered) => {
          if (remembered.trim().length > 0) rememberSearch(remembered);
          void navigate(path);
        }}
      />

      <Text as="p" size="xs" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
        {t('kindsHint', { count: SEARCH_KINDS.length })}
      </Text>
    </Container>
  );
}
