/**
 * BSDC — src/features/profile/ProfileEditor.tsx
 * Purpose : Editing your own profile: the presentation fields, and only those.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A person may change how they are presented; they may not change their role, their
 *   verification, their points or their handle from here. The handle is a separate, deliberate
 *   action because it breaks every link anybody has ever shared to you, and the platform makes you
 *   ask for that in its own screen rather than as a side effect of fixing a typo in your bio.
 *   Skills are entered as a comma list and stored as a clean array: a tag cloud is data, and data
 *   should not carry the punctuation somebody happened to type.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea, showToast } from '@/shared/ui';
import { TEXT_LIMITS } from '@/core/config/limits';
import type { Locale } from '@/core/config/app';
import type { Profile } from '@/entities/profile/model';

/** Props for the profile editor. */
export interface ProfileEditorProps {
  readonly profile: Profile;
  readonly locale: Locale;
  readonly onSave: (patch: Partial<Profile>) => Promise<void>;
  readonly onCancel: () => void;
}

/**
 * Renders the profile editor.
 * @param props component props
 * @returns the form element
 */
export function ProfileEditor({
  profile,
  locale,
  onSave,
  onCancel,
}: ProfileEditorProps): React.ReactElement {
  const { t } = useTranslation('profile');
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [displayNameBn, setDisplayNameBn] = useState(profile.displayNameBn);
  const [headline, setHeadline] = useState(profile.headline);
  const [bio, setBio] = useState(profile.bio);
  const [district, setDistrict] = useState(profile.district);
  const [region, setRegion] = useState(profile.region);
  const [website, setWebsite] = useState(profile.website);
  const [skills, setSkills] = useState(profile.skills.join(', '));
  const [saving, setSaving] = useState(false);

  const nameValid = displayName.trim().length >= 2;

  const submit = (): void => {
    if (!nameValid) return;
    setSaving(true);
    void onSave({
      displayName: displayName.trim(),
      displayNameBn: displayNameBn.trim(),
      headline: headline.trim(),
      bio: bio.trim(),
      district: district.trim(),
      region: region.trim(),
      website: website.trim(),
      skills: skills
        .split(',')
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0)
        .slice(0, 20),
    })
      .then(() => {
        showToast(locale, { titleBn: t('saved.bn'), titleEn: t('saved.en'), tone: 'success' });
        onCancel();
      })
      .catch(() => {
        showToast(locale, {
          titleBn: t('saveFailed.bn'),
          titleEn: t('saveFailed.en'),
          tone: 'error',
        });
      })
      .finally(() => setSaving(false));
  };

  return (
    <form
      className="bsdc-profile__editor"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        label={t('field.name')}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        required
        maxLength={60}
        error={nameValid ? undefined : t('field.nameError')}
      />
      <Input
        label={t('field.nameBn')}
        value={displayNameBn}
        onChange={(event) => setDisplayNameBn(event.target.value)}
        maxLength={60}
        lang="bn"
      />
      <Input
        label={t('field.headline')}
        value={headline}
        onChange={(event) => setHeadline(event.target.value)}
        maxLength={TEXT_LIMITS.headline}
        counter={{ value: headline.length, max: TEXT_LIMITS.headline }}
      />
      <Textarea
        label={t('field.bio')}
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        maxLength={TEXT_LIMITS.bio}
        counter={{ value: bio.length, max: TEXT_LIMITS.bio }}
      />
      <div className="bsdc-profile__editorRow">
        <Input
          label={t('field.district')}
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
          maxLength={60}
        />
        <Input
          label={t('field.region')}
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          maxLength={60}
        />
      </div>
      <Input
        label={t('field.website')}
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        type="url"
        inputMode="url"
        maxLength={200}
      />
      <Input
        label={t('field.skills')}
        value={skills}
        onChange={(event) => setSkills(event.target.value)}
        hint={t('field.skillsHint')}
        maxLength={300}
      />
      <div className="bsdc-profile__editorActions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!nameValid}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
