/**
 * BSDC — src/pages/saved/SavedPage.tsx
 * Purpose : The Saved route: everything a person has kept, in one place.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Noindex by construction — the route table marks it private, and one person's bookmarks
 *   are nobody else's business. The page renders the list the whole app shares, so a post unsaved
 *   in the feed is unsaved here in the same frame, with no refetch and no second opinion.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Button, Container, Heading, Text } from '@/shared/ui';
import { RequireAuth, useSession } from '@/features/auth';
import { SavedList, useSavedItems } from '@/features/saved';

/**
 * Renders the Saved route behind the session guard.
 * @returns the page
 */
export function SavedPage(): React.ReactElement {
  return (
    <RequireAuth reason="saved">
      <SavedWorkspace />
    </RequireAuth>
  );
}

/**
 * Renders the Saved workspace for a signed-in person.
 * @returns the workspace
 */
function SavedWorkspace(): React.ReactElement {
  const { t } = useTranslation('saved');
  const { session, locale } = useSession();
  const uid = session.uid;
  const saved = useSavedItems(uid);
  const lang = locale === 'bn' ? 'bn' : 'en';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('subtitle')}
        </Text>
      </header>

      <SavedList uid={uid} locale={locale} saved={saved} />

      {saved.items.length > 0 ? (
        <div className="bsdc-saved__danger">
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              void saved.clear();
            }}
          >
            {t('clearAll')}
          </Button>
          <Text as="p" tone="muted" size="sm" lang={lang}>
            {t('clearAllNote')}
          </Text>
        </div>
      ) : null}
    </Container>
  );
}
