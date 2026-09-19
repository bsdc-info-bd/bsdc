/**
 * BSDC — src/features/settings/AccountSection.tsx
 * Purpose : Who you are signed in as, and the doors out.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The account id is shown halved, because it is an identifier people paste into support
 *   tickets and it should be recognisable without being a bearer token printed on the screen.
 *   Role and suspension state are read from custom claims, never from a local guess, and the
 *   screen says plainly when a claim has not been refreshed since sign-in.
 *   Closing an account is not offered as a button that does nothing: until the scheduled function
 *   that honours it ships, the route is a written request to a person, and the screen gives the
 *   address. A fake delete button is worse than an honest one that is missing.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Text } from '@/shared/ui';
import { CONTACT } from '@/core/config/app';
import type { Locale } from '@/core/config/app';
import type { Session } from '@/features/auth/session';

/** Props for the account section. */
export interface AccountSectionProps {
  readonly session: Session;
  readonly locale: Locale;
  readonly onSignOut: () => Promise<void>;
  /** Re-reads custom claims from the ID token. */
  readonly onRefreshClaims: () => Promise<unknown>;
}

/**
 * Renders the account settings.
 * @param props component props
 * @returns the section element
 */
export function AccountSection({
  session,
  locale,
  onSignOut,
  onRefreshClaims,
}: AccountSectionProps): React.ReactElement {
  const { t } = useTranslation('settings');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const uid = session.uid ?? '';
  const halved =
    uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid.length > 0 ? uid : '—';

  return (
    <Card as="section" padding="md">
      <CardHeader>
        <CardTitle>{t('account.title')}</CardTitle>
      </CardHeader>
      <CardBody className="bsdc-settings__body">
        <dl className="bsdc-settings__stats">
          <div>
            <dt lang={lang}>{t('account.email')}</dt>
            <dd lang={lang}>{session.email ?? t('account.deviceOnly')}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('account.id')}</dt>
            <dd lang="en">{halved}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('account.role')}</dt>
            <dd lang={lang}>{t(`account.roles.${session.claims.role}`)}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('account.source')}</dt>
            <dd lang={lang}>
              {session.source === 'device' ? t('account.sourceDevice') : t('account.sourceRemote')}
            </dd>
          </div>
        </dl>

        <div className="bsdc-settings__badges">
          <Badge tone={session.emailVerified ? 'success' : 'warning'} variant="outline">
            {session.emailVerified ? t('account.verified') : t('account.unverified')}
          </Badge>
          {session.claims.suspended ? (
            <Badge tone="danger" variant="outline">
              {t('account.suspended')}
            </Badge>
          ) : null}
          {session.claims.root ? (
            <Badge tone="info" variant="outline">
              {t('account.root')}
            </Badge>
          ) : null}
        </div>

        <div className="bsdc-settings__actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void onRefreshClaims();
            }}
          >
            {t('account.refresh')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void onSignOut();
            }}
          >
            {t('account.signOut')}
          </Button>
        </div>

        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('account.closingNote', { email: CONTACT.general })}
        </Text>
      </CardBody>
    </Card>
  );
}
