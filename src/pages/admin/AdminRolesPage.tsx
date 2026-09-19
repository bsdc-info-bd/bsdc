/**
 * BSDC — src/pages/admin/AdminRolesPage.tsx
 * Purpose : The role assignment screen.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Assigning a role is the most consequential thing an administrator can do to an account,
 *   so this screen is deliberately plain: one account id, one role, one required reason, and the
 *   ladder written out underneath so nobody promotes past a rank they did not mean to.
 *   The assignment itself is decided by the Cloud Function, not here.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Container, Heading, Text } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { AdminScope, RoleAssignment } from '@/features/admin';

/**
 * Renders the role assignment route.
 * @returns the page element
 */
export function AdminRolesPage(): React.ReactElement {
  const { t } = useTranslation('admin');
  const { profile, session, locale } = useSession();
  const lang = locale === 'bn' ? 'bn' : 'en';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('members.title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('members.rootNote')}
        </Text>
      </header>
      <AdminScope role={profile?.role ?? 'guest'} root={session.claims.root} locale={locale}>
        <RoleAssignment locale={locale} onAssigned={() => undefined} />
      </AdminScope>
    </Container>
  );
}
