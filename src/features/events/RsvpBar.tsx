/**
 * BSDC — src/features/events/RsvpBar.tsx
 * Purpose : Answering an invitation: going, interested, or not this time.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The bar tells you what your answer will do before you give it. When a room is full it
 *   says the next answer joins a waiting list instead of letting a person believe they have a seat,
 *   and when registration has closed the controls are disabled with the reason beside them rather
 *   than absent with no explanation.
 *   Withdrawing is a first-class answer, not a hidden one: changing your mind should not require
 *   hunting for a menu item.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Text, showToast } from '@/shared/ui';
import { RSVP_STATUSES, RSVP_STATUS_LABELS, type RsvpStatus } from '@/core/config/opportunities';
import type { Locale } from '@/core/config/app';
import { isRsvpOpen, landsOnWaitingList, seatsLeft } from '@/entities/event/model';
import { loadRsvp, setRsvp } from '@/entities/event/repository';
import type { BsdcEvent } from '@/entities/event/model';
import type { Rsvp } from '@/entities/event/model';

/** Props for the RSVP bar. */
export interface RsvpBarProps {
  readonly event: BsdcEvent;
  readonly viewerUid: string;
  readonly rsvp: Rsvp | null | undefined;
  readonly locale: Locale;
  readonly onChanged: (rsvp: Rsvp | null) => void;
}

/**
 * Renders the RSVP controls.
 * @param props component props
 * @returns the bar element
 */
export function RsvpBar({
  event,
  viewerUid,
  rsvp,
  locale,
  onChanged,
}: RsvpBarProps): React.ReactElement | null {
  const { t } = useTranslation('events');
  const [busy, setBusy] = useState(false);
  const lang = locale === 'bn' ? 'bn' : 'en';
  const open = isRsvpOpen(event);
  const left = seatsLeft(event);
  const current = rsvp?.deletedAt === null ? rsvp.status : null;

  if (viewerUid.length === 0) return null;

  const answer = (status: RsvpStatus | null): void => {
    setBusy(true);
    void setRsvp(event, viewerUid, status)
      .then((outcome) => {
        if (!outcome.synced && !outcome.queued) {
          showToast(locale, {
            tone: 'error',
            titleBn: t('rsvp.failed.bn'),
            titleEn: t('rsvp.failed.en'),
          });
          return;
        }
        void loadRsvp(event.id, viewerUid).then((next) => onChanged(next ?? null));
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="bsdc-rsvp" aria-label={t('rsvp.label')}>
      <div className="bsdc-rsvp__buttons" role="group">
        {RSVP_STATUSES.map((status) => (
          <Button
            key={status}
            variant={current === status ? 'primary' : 'secondary'}
            loading={busy}
            disabled={!open}
            aria-pressed={current === status}
            onClick={() => answer(current === status ? null : status)}
          >
            {RSVP_STATUS_LABELS[status][locale === 'bn' ? 'bn' : 'en']}
          </Button>
        ))}
      </div>
      <Text as="p" size="sm" tone="muted" lang={lang}>
        {!open
          ? t('rsvp.closed')
          : current !== null
            ? t('rsvp.answered', {
                answer: RSVP_STATUS_LABELS[current][locale === 'bn' ? 'bn' : 'en'],
              })
            : left === null
              ? t('rsvp.unlimited')
              : left > 0
                ? t('rsvp.seatsLeft', { count: left })
                : landsOnWaitingList(event, 'going')
                  ? t('rsvp.waitlist')
                  : t('rsvp.full')}
      </Text>
    </section>
  );
}
