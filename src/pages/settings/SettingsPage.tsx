/**
 * BSDC — src/pages/settings/SettingsPage.tsx
 * Purpose : The Settings route: appearance, notifications, privacy, data and account.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Noindex by construction — there is no such thing as somebody else's settings page.
 *   Signed-out visitors get the sign-in surface rather than a redirect, so the URL they asked for
 *   survives the detour.
 *   The page is a stack of sections rather than tabs: a phone at 250px scrolls one column far more
 *   comfortably than it swipes between four, and every section is reachable by a single landmark
 *   link at the top for screen-reader and keyboard travel.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Container, Heading, Text } from '@/shared/ui';
import { RequireAuth, useSession } from '@/features/auth';
import {
  AccountSection,
  AppearanceSection,
  DataSection,
  NotificationSection,
  PrivacySection,
} from '@/features/settings';
import { saveProfile } from '@/entities/profile/repository';

/**
 * Renders the Settings route behind the session guard.
 * @returns the page
 */
export function SettingsPage(): React.ReactElement {
  return (
    <RequireAuth reason="settings">
      <SettingsWorkspace />
    </RequireAuth>
  );
}

/**
 * Renders the settings workspace for a signed-in person.
 * @returns the workspace
 */
function SettingsWorkspace(): React.ReactElement {
  const { t } = useTranslation('settings');
  const { session, profile, locale, signOut, refreshClaims, updateProfile } = useSession();
  const uid = session.uid ?? '';
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
        <nav className="bsdc-settings__jump" aria-label={t('jumpLabel')}>
          <a href="#appearance" lang={lang}>
            {t('appearance.title')}
          </a>
          <a href="#notifications" lang={lang}>
            {t('notifications.title')}
          </a>
          <a href="#privacy" lang={lang}>
            {t('privacy.title')}
          </a>
          <a href="#data" lang={lang}>
            {t('data.title')}
          </a>
          <a href="#account" lang={lang}>
            {t('account.title')}
          </a>
        </nav>
      </header>

      <div className="bsdc-settings">
        <div id="appearance">
          <AppearanceSection />
        </div>
        <div id="notifications">
          <NotificationSection uid={uid} locale={locale} />
        </div>
        <div id="privacy">
          <PrivacySection
            uid={uid}
            profile={profile}
            locale={locale}
            onPatch={async (patch) => {
              await saveProfile(uid, patch);
              await updateProfile(patch);
            }}
          />
        </div>
        <div id="data">
          <DataSection locale={locale} />
        </div>
        <div id="account">
          <AccountSection
            session={session}
            locale={locale}
            onSignOut={signOut}
            onRefreshClaims={refreshClaims}
          />
        </div>
      </div>
    </Container>
  );
}
