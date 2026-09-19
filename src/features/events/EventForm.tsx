/**
 * BSDC — src/features/events/EventForm.tsx
 * Purpose : Creating or editing an event, including where it happens.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The form has one rule that matters more than its layout: an event must be reachable.
 *   If it is not online-only it needs a coordinate somebody actually picked on the map, and if it is
 *   not on-site-only it needs a link that works. Both are checked before the write, and the message
 *   says which one is missing rather than just refusing.
 *   Times are collected as local wall-clock values and stored as ISO instants with the event's
 *   timezone, so an event at 18:00 in Dhaka is at 18:00 in Dhaka for everybody reading it from
 *   Sylhet, London or San Francisco.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select, Textarea, showToast } from '@/shared/ui';
import { TEXT_LIMITS } from '@/core/config/limits';
import { AppError } from '@/core/errors/AppError';
import { BD_TIMEZONE } from '@/shared/lib/date';
import type { Locale } from '@/core/config/app';
import { EVENT_MODES, EVENT_MODE_LABELS, type EventMode } from '@/core/config/opportunities';
import { newEvent, validateEvent, type BsdcEvent, type EventVenue } from '@/entities/event/model';
import { VenuePicker } from './VenuePicker';

/** Props for the event form. */
export interface EventFormProps {
  readonly ownerUid: string;
  readonly ownerName: string;
  readonly locale: Locale;
  /** Present when editing an existing event. */
  readonly initial?: BsdcEvent | undefined;
  readonly onSubmit: (event: BsdcEvent) => Promise<void>;
  readonly onCancel: () => void;
}

/** Converts an ISO instant into the value a datetime-local input expects, in Dhaka time. */
function toLocalInput(iso: string): string {
  if (iso.length === 0) return '';
  const shifted = new Date(iso).toLocaleString('sv-SE', { timeZone: BD_TIMEZONE });
  return shifted.replace(' ', 'T').slice(0, 16);
}

/** Converts a datetime-local value into an ISO instant, read as Dhaka time. */
function fromLocalInput(value: string): string {
  if (value.length === 0) return '';
  return new Date(`${value}:00+06:00`).toISOString();
}

/**
 * Renders the event form.
 * @param props component props
 * @returns the form element
 */
export function EventForm({
  ownerUid,
  ownerName,
  locale,
  initial,
  onSubmit,
  onCancel,
}: EventFormProps): React.ReactElement {
  const { t } = useTranslation('events');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [titleBn, setTitleBn] = useState(initial?.titleBn ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [mode, setMode] = useState<EventMode>(initial?.mode ?? 'onsite');
  const [venue, setVenue] = useState<EventVenue | null>(initial?.venue ?? null);
  const [onlineUrl, setOnlineUrl] = useState(initial?.onlineUrl ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? ''));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? ''));
  const [capacity, setCapacity] = useState(initial?.capacity ?? 0);
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (): void => {
    const draft = {
      ownerUid,
      ownerName,
      title,
      titleBn,
      description,
      mode,
      venue,
      onlineUrl,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      timezone: BD_TIMEZONE,
      capacity,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 8),
    };
    const validation = validateEvent(draft);
    if (!validation.ok) {
      setProblem(validation.code);
      return;
    }
    setProblem(null);
    setBusy(true);
    const event = newEvent(draft);
    void onSubmit(event)
      .then(() =>
        showToast(locale, { titleBn: t('saved.bn'), titleEn: t('saved.en'), tone: 'success' }),
      )
      .catch((error: unknown) => {
        const code = error instanceof AppError ? error.code : 'BSDC-DATA-007';
        showToast(locale, {
          tone: 'error',
          titleBn: t(`error.${code}.bn`, { defaultValue: t('error.default.bn') }),
          titleEn: t(`error.${code}.en`, { defaultValue: t('error.default.en') }),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <form
      className="bsdc-eventForm"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        label={t('form.title')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
        maxLength={120}
      />
      <Input
        label={t('form.titleBn')}
        value={titleBn}
        onChange={(event) => setTitleBn(event.target.value)}
        maxLength={120}
        lang="bn"
      />
      <Textarea
        label={t('form.description')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={TEXT_LIMITS.productDescription}
        counter={{ value: description.length, max: TEXT_LIMITS.productDescription }}
      />
      <Select<EventMode>
        label={t('form.mode')}
        value={mode}
        onValueChange={setMode}
        options={EVENT_MODES.map((entry) => ({
          value: entry,
          label: EVENT_MODE_LABELS[entry][locale === 'bn' ? 'bn' : 'en'],
        }))}
      />
      {mode !== 'onsite' ? (
        <Input
          label={t('form.onlineUrl')}
          value={onlineUrl}
          onChange={(event) => setOnlineUrl(event.target.value)}
          type="url"
          inputMode="url"
          maxLength={300}
        />
      ) : null}
      {mode !== 'online' ? <VenuePicker value={venue} onChange={setVenue} locale={locale} /> : null}
      <div className="bsdc-eventForm__row">
        <Input
          label={t('form.startsAt')}
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          type="datetime-local"
          required
        />
        <Input
          label={t('form.endsAt')}
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
          type="datetime-local"
          required
        />
      </div>
      <Input
        label={t('form.capacity')}
        value={String(capacity)}
        onChange={(event) => setCapacity(Number(event.target.value.replace(/[^0-9]/g, '')))}
        type="number"
        inputMode="numeric"
        min={0}
        max={100000}
        hint={t('form.capacityHint')}
      />
      <Input
        label={t('form.tags')}
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        hint={t('form.tagsHint')}
        maxLength={160}
      />
      {problem !== null ? (
        <p className="bsdc-eventForm__error" role="alert" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t(`error.${problem}.${locale === 'bn' ? 'bn' : 'en'}`)}
        </p>
      ) : null}
      <div className="bsdc-eventForm__actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t('form.publish')}
        </Button>
      </div>
    </form>
  );
}
