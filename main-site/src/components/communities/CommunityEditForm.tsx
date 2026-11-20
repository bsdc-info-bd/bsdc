import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MediaImage } from '@/components/media/MediaImage';
import { Button, Modal, SelectField, TextareaField, TextField } from '@/design-system';
import { CREATE_LIMITS } from '@/lib/create/create-types';
import type { EventUpdate } from '@/lib/communities/community-repository';
import type { Group, GroupPrivacy } from '@/lib/communities/community-types';
import type { EventDetail } from '@/lib/communities/community-types';
import { localDateTimeValue } from '@/lib/datetime-local';

/**
 * The group and event edit dialogs.
 *
 * The group dialog never offers the slug. `update_group` does not take one, and
 * a group's address is the only thing a stranger may have written down — so the
 * field is shown read-only, as a fact about the group rather than a setting.
 *
 * The event dialog shows the host's own timezone as a free-text field instead of
 * a picker, because the routine stores an IANA name and a list of every zone is
 * a dependency this site does not carry. It is prefilled with the event's zone
 * and left alone unless the host deliberately changes it.
 */

export interface GroupEditDialogProps {
  open: boolean;
  group: Group;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: {
    name: string;
    description: string;
    rules: string | null;
    privacy: GroupPrivacy | null;
    language: string | null;
    avatarUrl: string | null;
    coverUrl: string | null;
  }) => Promise<void>;
}

export function GroupEditDialog({ open, group, isSaving, onClose, onSave }: GroupEditDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [rules, setRules] = useState(group.rules);
  const [privacy, setPrivacy] = useState<GroupPrivacy>(group.privacy);
  const [language, setLanguage] = useState(group.language);
  const [avatarUrl, setAvatarUrl] = useState(group.avatarUrl);
  const [coverUrl, setCoverUrl] = useState(group.coverUrl);

  const nameTooShort = name.trim().length < CREATE_LIMITS.groupNameMin;
  const nameTooLong = name.trim().length > CREATE_LIMITS.groupNameMax;
  const descriptionTooLong = description.length > CREATE_LIMITS.groupDescriptionMax;
  const invalid = nameTooShort || nameTooLong || descriptionTooLong;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('groups.manage.editTitle')}
      closeLabel={t('common.close')}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('groups.manage.cancel')}
          </Button>
          <Button
            loading={isSaving}
            disabled={invalid}
            onClick={() => {
              void onSave({
                name: name.trim(),
                description: description.trim(),
                rules: rules.trim().length > 0 ? rules.trim() : null,
                privacy,
                language,
                avatarUrl: avatarUrl.trim().length > 0 ? avatarUrl.trim() : null,
                coverUrl: coverUrl.trim(),
              });
            }}
          >
            {t('groups.manage.save')}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('groups.manage.editLead')}</p>
      <div className="grid gap-4">
        <div>
          <TextField
            label={t('groups.manage.nameLabel')}
            value={name}
            maxLength={CREATE_LIMITS.groupNameMax}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <p className="mt-1 text-xs text-muted">
            {t('groups.manage.slugLabel')}: <span className="font-mono">{group.slug}</span>
          </p>
        </div>
        <TextareaField
          label={t('groups.manage.descriptionLabel')}
          value={description}
          rows={4}
          counterMax={CREATE_LIMITS.groupDescriptionMax}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
        <TextareaField
          label={t('groups.manage.rulesLabel')}
          value={rules}
          rows={5}
          onChange={(event) => {
            setRules(event.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('groups.manage.privacyLabel')}
            value={privacy}
            onChange={(event) => {
              setPrivacy(event.target.value as GroupPrivacy);
            }}
            options={[
              { value: 'public', label: t('groups.privacy.public') },
              { value: 'private', label: t('groups.privacy.private') },
              { value: 'secret', label: t('groups.privacy.secret') },
            ]}
          />
          <SelectField
            label={t('groups.manage.languageLabel')}
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value);
            }}
            options={[
              { value: 'bn', label: 'বাংলা' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
        <TextField
          label={t('groups.manage.avatarLabel')}
          type="url"
          value={avatarUrl}
          onChange={(event) => {
            setAvatarUrl(event.target.value);
          }}
        />
        <TextField
          label={t('groups.manage.coverLabel')}
          hint={t('groups.manage.coverHint')}
          type="url"
          value={coverUrl}
          onChange={(event) => {
            setCoverUrl(event.target.value);
          }}
        />
        {coverUrl.trim().length > 0 ? (
          <div className="aspect-[16/6] w-full overflow-hidden rounded-card bg-surface-2">
            <MediaImage
              src={coverUrl.trim()}
              alt=""
              slotWidth={480}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}
        {nameTooShort ? (
          <p className="text-sm text-danger">{t('create.errors.groupNameShort')}</p>
        ) : null}
        {nameTooLong ? (
          <p className="text-sm text-danger">{t('create.errors.groupNameLong')}</p>
        ) : null}
        {descriptionTooLong ? (
          <p className="text-sm text-danger">{t('create.errors.descriptionLong')}</p>
        ) : null}
      </div>
    </Modal>
  );
}

export interface EventEditDialogProps {
  open: boolean;
  event: EventDetail;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: EventUpdate) => Promise<void>;
}

export function EventEditDialog({ open, event, isSaving, onClose, onSave }: EventEditDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [startsAt, setStartsAt] = useState(localDateTimeValue(event.startsAt));
  const [endsAt, setEndsAt] = useState(localDateTimeValue(event.endsAt));
  const [mode, setMode] = useState(event.mode);
  const [venue, setVenue] = useState(event.venue);
  const [city, setCity] = useState(event.city);
  const [joinUrl, setJoinUrl] = useState(event.joinUrl);
  const [capacity, setCapacity] = useState<string>(
    event.capacity === null ? '' : String(event.capacity),
  );
  const [coverUrl, setCoverUrl] = useState(event.coverUrl);

  const endsBeforeStarts =
    startsAt.length > 0 && endsAt.length > 0 && Date.parse(endsAt) <= Date.parse(startsAt);
  const invalid = title.trim().length < CREATE_LIMITS.titleMin || endsBeforeStarts;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('events.manage.editTitle')}
      closeLabel={t('common.close')}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('events.manage.cancel')}
          </Button>
          <Button
            loading={isSaving}
            disabled={invalid}
            onClick={() => {
              void onSave({
                title: title.trim(),
                description: description.trim(),
                startsAt: new Date(startsAt).toISOString(),
                endsAt: new Date(endsAt).toISOString(),
                mode,
                venue: venue.trim(),
                city: city.trim(),
                joinUrl: joinUrl.trim(),
                capacity: capacity.trim().length === 0 ? null : Number(capacity),
                coverUrl: coverUrl.trim(),
                timezone: event.timezone,
              });
            }}
          >
            {t('events.manage.save')}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('events.manage.editLead')}</p>
      <div className="grid gap-4">
        <TextField
          label={t('events.manage.titleLabel')}
          value={title}
          maxLength={CREATE_LIMITS.titleMax}
          onChange={(input) => {
            setTitle(input.target.value);
          }}
        />
        <TextareaField
          label={t('events.manage.descriptionLabel')}
          value={description}
          rows={5}
          counterMax={CREATE_LIMITS.descriptionMax}
          onChange={(input) => {
            setDescription(input.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('events.manage.startsLabel')}
            type="datetime-local"
            value={startsAt}
            onChange={(input) => {
              setStartsAt(input.target.value);
            }}
          />
          <TextField
            label={t('events.manage.endsLabel')}
            type="datetime-local"
            value={endsAt}
            onChange={(input) => {
              setEndsAt(input.target.value);
            }}
          />
          <SelectField
            label={t('events.manage.modeLabel')}
            value={mode}
            onChange={(input) => {
              setMode(input.target.value as EventDetail['mode']);
            }}
            options={[
              { value: 'in_person', label: t('create.options.mode.in_person') },
              { value: 'online', label: t('create.options.mode.online') },
              { value: 'hybrid', label: t('create.options.mode.hybrid') },
            ]}
          />
          <TextField
            label={t('events.manage.capacityLabel')}
            type="number"
            inputMode="numeric"
            min={1}
            value={capacity}
            onChange={(input) => {
              setCapacity(input.target.value);
            }}
          />
          <TextField
            label={t('events.manage.venueLabel')}
            value={venue}
            maxLength={CREATE_LIMITS.venueMax}
            onChange={(input) => {
              setVenue(input.target.value);
            }}
          />
          <TextField
            label={t('events.manage.cityLabel')}
            value={city}
            maxLength={CREATE_LIMITS.cityMax}
            onChange={(input) => {
              setCity(input.target.value);
            }}
          />
        </div>
        <TextField
          label={t('events.manage.joinLabel')}
          type="url"
          value={joinUrl}
          onChange={(input) => {
            setJoinUrl(input.target.value);
          }}
        />
        <TextField
          label={t('events.manage.coverLabel')}
          hint={t('events.manage.coverHint')}
          type="url"
          value={coverUrl}
          onChange={(input) => {
            setCoverUrl(input.target.value);
          }}
        />
        {coverUrl.trim().length > 0 ? (
          <div className="aspect-[16/6] w-full overflow-hidden rounded-card bg-surface-2">
            <MediaImage
              src={coverUrl.trim()}
              alt=""
              slotWidth={480}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}
        {endsBeforeStarts ? (
          <p className="text-sm text-danger">{t('create.errors.endsAfterStarts')}</p>
        ) : null}
      </div>
    </Modal>
  );
}
