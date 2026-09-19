/**
 * BSDC — src/features/groups/CreateGroupDialog.tsx
 * Purpose : Creating a group: name, description, privacy, category and place.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Only the fields the rules accept are collected, and the privacy choice is explained in
 *   plain language because it is the one setting a person cannot fix later without asking a
 *   moderator. Submission is write-through; the new group appears at the top of the list at once.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/Input';
import { Select, type SelectOption } from '@/shared/ui/Select';
import { Text } from '@/shared/ui/Typography';
import { DISTRICTS, DIVISIONS } from '@/core/config/regions';
import { newGroup, GROUP_PRIVACIES, type GroupPrivacy } from '@/entities/group/model';
import { createGroup } from '@/entities/group/repository';

/** Props for the create dialog. */
export interface CreateGroupDialogProps {
  readonly ownerUid: string;
  readonly locale: 'bn' | 'en';
  readonly onCreated?: (() => void) | undefined;
  readonly onCancel?: (() => void) | undefined;
}

/**
 * Renders the group creation form.
 * @param props dialog props
 * @returns the form
 */
export function CreateGroupDialog({
  ownerUid,
  locale,
  onCreated,
  onCancel,
}: CreateGroupDialogProps): React.ReactElement {
  const { t } = useTranslation('groups');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<GroupPrivacy>('public');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const privacyOptions: readonly SelectOption<GroupPrivacy>[] = GROUP_PRIVACIES.map((value) => ({
    value,
    label: t(`privacy.${value}`),
  }));
  const bn = locale === 'bn';
  const regionOptions: readonly SelectOption<string>[] = DIVISIONS.map((division) => ({
    value: division.id,
    label: bn ? division.bn : division.en,
  }));
  const districtOptions: readonly SelectOption<string>[] = DISTRICTS.filter(
    (entry) => entry.division === region,
  ).map((entry) => ({ value: entry.id, label: bn ? entry.bn : entry.en }));

  /**
   * Creates the group.
   * @param event form submit event
   */
  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (name.trim().length < 3) {
      setError(t('errors.shortName'));
      return;
    }
    setBusy(true);
    setError(null);
    const group = newGroup({
      name,
      description,
      privacy,
      ownerUid,
      ...(region.length > 0 ? { region } : {}),
      ...(district.length > 0 ? { district } : {}),
    });
    await createGroup(group);
    setBusy(false);
    setName('');
    setDescription('');
    onCreated?.();
  }

  return (
    <form
      className="bsdc-form"
      onSubmit={(submitEvent) => {
        void submit(submitEvent);
      }}
    >
      <Input
        label={t('fields.name')}
        value={name}
        required
        counter={{ value: name.length, max: 80 }}
        onChange={(event) => setName(event.target.value)}
      />
      <Textarea
        label={t('fields.description')}
        value={description}
        rows={3}
        counter={{ value: description.length, max: 2000 }}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Select
        label={t('fields.privacy')}
        options={privacyOptions}
        value={privacy}
        onValueChange={setPrivacy}
      />
      <Select
        label={t('fields.region')}
        options={regionOptions}
        value={region}
        placeholder={t('fields.regionOptional')}
        onValueChange={(value) => {
          setRegion(value);
          setDistrict('');
        }}
      />
      {region.length > 0 ? (
        <Select
          label={t('fields.district')}
          options={districtOptions}
          value={district}
          placeholder={t('fields.districtOptional')}
          onValueChange={setDistrict}
        />
      ) : null}

      {error !== null ? (
        <Text as="p" role="alert" className="bsdc-form__error">
          {error}
        </Text>
      ) : null}

      <div className="bsdc-form__actions">
        {onCancel !== undefined ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
        <Button type="submit" loading={busy}>
          {t('create')}
        </Button>
      </div>
    </form>
  );
}
