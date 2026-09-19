/**
 * BSDC — src/features/settings/DataSection.tsx
 * Purpose : What this device is holding, an export of it, and a way to let it go.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The offline mirror is a person's own data sitting on their own device, so the screen
 *   says how much of it there is and offers to hand it over as a plain JSON file — not a PDF, not
 *   a screenshot, something they can actually read and move.
 *   Clearing is destructive and is gated by a typed confirmation, because "clear cache" pressed by
 *   accident on a phone with no signal is how work gets lost. Only the device copy is cleared: the
 *   account on the server is untouched, and the screen says so.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Text,
  toastSuccess,
} from '@/shared/ui';
import { formatNumber } from '@/shared/lib/number.bn';
import { formatDateTime } from '@/shared/lib/date';
import type { Locale } from '@/core/config/app';
import { STORES, allRecords, clearStore, isDurable } from '@/services/offline/idb';
import { pendingCount } from '@/services/offline/outbox';

/** Stores whose contents are a person's own words and are worth exporting. */
const EXPORTABLE = ['profiles', 'posts', 'drafts', 'saved', 'comments', 'outbox'] as const;

/** Props for the data section. */
export interface DataSectionProps {
  readonly locale: Locale;
}

/** One store and how many records it holds on this device. */
interface StoreCount {
  readonly store: string;
  readonly count: number;
}

/**
 * Renders the data and storage settings.
 * @param props component props
 * @returns the section element
 */
export function DataSection({ locale }: DataSectionProps): React.ReactElement {
  const { t } = useTranslation('settings');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [counts, setCounts] = useState<readonly StoreCount[]>([]);
  const [pending, setPending] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const next: StoreCount[] = [];
    for (const store of STORES) {
      const records = await allRecords<{ readonly id: string }>(store);
      if (records.length > 0) next.push({ store, count: records.length });
    }
    next.sort((left, right) => right.count - left.count);
    setCounts(next);
    setPending(await pendingCount());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function exportData(): Promise<void> {
    const payload: Record<string, unknown> = {
      brand: 'BSDC',
      generatedAt: new Date().toISOString(),
      note: t('data.exportNote'),
    };
    for (const store of EXPORTABLE) {
      payload[store] = await allRecords(store);
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bsdc-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toastSuccess(locale, t('data.exportedBn'), t('data.exportedEn'));
  }

  async function clearDevice(): Promise<void> {
    for (const store of STORES) await clearStore(store);
    setConfirming(false);
    await refresh();
    toastSuccess(locale, t('data.clearedBn'), t('data.clearedEn'));
  }

  const total = counts.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card as="section" padding="md">
      <CardHeader>
        <CardTitle>{t('data.title')}</CardTitle>
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('data.subtitle')}
        </Text>
      </CardHeader>
      <CardBody className="bsdc-settings__body">
        <dl className="bsdc-settings__stats">
          <div>
            <dt lang={lang}>{t('data.records')}</dt>
            <dd lang={lang}>{formatNumber(total, locale)}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('data.queued')}</dt>
            <dd lang={lang}>{formatNumber(pending, locale)}</dd>
          </div>
          <div>
            <dt lang={lang}>{t('data.storage')}</dt>
            <dd lang={lang}>{isDurable() ? t('data.durable') : t('data.sessionOnly')}</dd>
          </div>
        </dl>

        {counts.length > 0 ? (
          <ul className="bsdc-settings__stores" aria-label={t('data.storesLabel')}>
            {counts.slice(0, 8).map((row) => (
              <li key={row.store}>
                <span lang={lang}>{t(`data.store.${row.store}`, { defaultValue: row.store })}</span>
                <span lang={lang}>{formatNumber(row.count, locale)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Text as="p" size="sm" tone="muted" lang={lang}>
            {t('data.empty')}
          </Text>
        )}

        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('data.checkedAt', { time: formatDateTime(new Date(), locale) })}
        </Text>

        <div className="bsdc-settings__actions">
          <Button type="button" variant="secondary" size="sm" onClick={() => void exportData()}>
            {t('data.export')}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
            {t('data.clear')}
          </Button>
        </div>

        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t('data.clearTitle')}
          description={t('data.clearBody')}
          confirmLabel={t('data.clearConfirm')}
          cancelLabel={t('data.cancel')}
          tone="danger"
          confirmPhrase="BSDC"
          onConfirm={() => {
            void clearDevice();
          }}
        />
      </CardBody>
    </Card>
  );
}
