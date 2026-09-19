/**
 * BSDC — src/features/settings/PrivacySection.tsx
 * Purpose : Who may see a person's profile, contact details, region and last-seen time.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : These values live on the profile, which the rules already protect, and the patch is
 *   applied through the profile repository so a change here is the same write a change on the
 *   profile screen makes. There is one code path and one set of rules, not two.
 *   Every switch starts from what the account already says: a settings screen that shows a state
 *   the account does not have is a settings screen that silently resets people.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Card, CardBody, CardHeader, CardTitle, RadioGroup, Switch, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import type { Profile, ProfilePrivacy } from '@/entities/profile/model';
import { saveProfile } from '@/entities/profile/repository';

/** Choices for who may open a profile. */
const VISIBILITY = ['public', 'members', 'private'] as const;
type Visibility = (typeof VISIBILITY)[number];

/** Props for the privacy section. */
export interface PrivacySectionProps {
  readonly uid: string;
  readonly profile: Profile | null;
  readonly locale: Locale;
  /** Applies the patch to the session profile as well, so the shell updates at once. */
  readonly onPatch: (patch: Partial<Profile>) => Promise<void>;
}

/**
 * Renders the privacy settings.
 * @param props component props
 * @returns the section element
 */
export function PrivacySection({
  uid,
  profile,
  locale,
  onPatch,
}: PrivacySectionProps): React.ReactElement {
  const { t } = useTranslation('settings');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const privacy: ProfilePrivacy = profile?.privacy ?? {
    profileVisibility: 'public',
    showEmail: false,
    showRegion: true,
    showLastSeen: true,
  };

  async function apply(patch: Partial<ProfilePrivacy>): Promise<void> {
    const next: ProfilePrivacy = { ...privacy, ...patch };
    await saveProfile(uid, { privacy: next });
    await onPatch({ privacy: next });
  }

  return (
    <Card as="section" padding="md">
      <CardHeader>
        <CardTitle>{t('privacy.title')}</CardTitle>
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('privacy.subtitle')}
        </Text>
      </CardHeader>
      <CardBody className="bsdc-settings__body">
        <RadioGroup<Visibility>
          label={t('privacy.visibilityLabel')}
          value={privacy.profileVisibility}
          onValueChange={(value) => {
            void apply({ profileVisibility: value });
          }}
          options={VISIBILITY.map((value) => ({
            value,
            label: t(`privacy.visibility.${value}`),
          }))}
        />
        <Switch
          checked={privacy.showEmail}
          onCheckedChange={(checked) => {
            void apply({ showEmail: checked });
          }}
          label={t('privacy.showEmail')}
          description={t('privacy.showEmailNote')}
        />
        <Switch
          checked={privacy.showRegion}
          onCheckedChange={(checked) => {
            void apply({ showRegion: checked });
          }}
          label={t('privacy.showRegion')}
          description={t('privacy.showRegionNote')}
        />
        <Switch
          checked={privacy.showLastSeen}
          onCheckedChange={(checked) => {
            void apply({ showLastSeen: checked });
          }}
          label={t('privacy.showLastSeen')}
          description={t('privacy.showLastSeenNote')}
        />
      </CardBody>
    </Card>
  );
}
