/**
 * BSDC — src/pages/notifications/NotificationsPage.tsx
 * Purpose : The notification centre route.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Noindex by construction: the route table marks it private, and there is nothing here a
 *   crawler could index that would mean anything to anyone else.
 *   The page is deliberately quiet. A notification centre that shouts is one people switch off,
 *   and a platform that cannot reach its members cannot warn them either.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Container } from '@/shared/ui/Container';
import { Heading, Text } from '@/shared/ui/Typography';
import { RequireAuth, useSession } from '@/features/auth';
import { NotificationList } from '@/features/notifications';

/**
 * Renders the notification centre behind the session guard.
 * @returns the notifications page
 */
export function NotificationsPage(): React.ReactElement {
  return (
    <RequireAuth reason="notifications">
      <NotificationsWorkspace />
    </RequireAuth>
  );
}

/**
 * Renders the notification centre for a signed-in person.
 * @returns the workspace
 */
function NotificationsWorkspace(): React.ReactElement {
  const { t } = useTranslation('notifications');
  const { session, locale } = useSession();
  const uid = session.uid ?? '';

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
      <NotificationList uid={uid} locale={locale} />
    </Container>
  );
}
