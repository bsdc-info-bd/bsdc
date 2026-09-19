/**
 * BSDC — src/features/admin/RecoveryBin.tsx
 * Purpose : The recovery bin: what was deleted, what can still come back, and when it stops being
 *   possible to bring it back.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Deleting on BSDC is a soft delete first; thirty days later the nightly purge removes it
 *   for good (LAW-19). The bin states the date the item leaves rather than a countdown, because a
 *   date can be put in a calendar and a countdown has to be recomputed every time it is looked at.
 *   Purging early is possible and irreversible, so it is behind a confirmation that asks for the
 *   item id to be typed back. Asking an operator to type an id they have to look at is the cheapest
 *   way there is to stop a permanent deletion made by the wrong click.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, EmptyState, Input, Modal, Text, showToast } from '@/shared/ui';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import {
  daysLeft,
  isExpiringSoon,
  mayPurge,
  mayRestore,
  recoveryKindLabel,
  type RecoveryEntry,
} from '@/entities/admin/recovery';
import { purgeItem, restoreItem } from '@/entities/admin/repository';

/** Props for the recovery bin. */
export interface RecoveryBinProps {
  readonly entries: readonly RecoveryEntry[];
  readonly viewerUid: string;
  readonly isStaff: boolean;
  readonly locale: Locale;
  readonly onChanged: () => void;
}

/**
 * Renders the recovery bin.
 * @param props component props
 * @returns the bin element
 */
export function RecoveryBin({
  entries,
  viewerUid,
  isStaff,
  locale,
  onChanged,
}: RecoveryBinProps): React.ReactElement {
  const { t } = useTranslation('admin');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [confirming, setConfirming] = useState<RecoveryEntry | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const restore = (entry: RecoveryEntry): void => {
    if (!mayRestore(entry, viewerUid, isStaff) || busy) return;
    setBusy(true);
    void restoreItem(entry.kind, entry.entityId)
      .then(() => {
        showToast(locale, {
          tone: 'success',
          titleBn: t('recovery.restored'),
          titleEn: t('recovery.restored'),
        });
        onChanged();
      })
      .catch((error: unknown) => {
        showToast(locale, {
          tone: 'error',
          titleBn: t(`flags.passkey.error.${codeOf(error)}`, {
            defaultValue: t('flags.passkey.error'),
          }),
          titleEn: t(`flags.passkey.error.${codeOf(error)}`, {
            defaultValue: t('flags.passkey.error'),
          }),
        });
      })
      .finally(() => setBusy(false));
  };

  const purge = (): void => {
    if (confirming === null || busy) return;
    setBusy(true);
    void purgeItem(confirming.kind, confirming.entityId, typed)
      .then(() => {
        showToast(locale, {
          tone: 'success',
          titleBn: t('recovery.purged'),
          titleEn: t('recovery.purged'),
        });
        setConfirming(null);
        setTyped('');
        onChanged();
      })
      .catch((error: unknown) => {
        const code = codeOf(error);
        showToast(locale, {
          tone: 'error',
          titleBn:
            code === 'BSDC-ADMIN-004'
              ? t('recovery.confirm.mismatch')
              : t(`flags.passkey.error.${code}`, { defaultValue: t('flags.passkey.error') }),
          titleEn:
            code === 'BSDC-ADMIN-004'
              ? t('recovery.confirm.mismatch')
              : t(`flags.passkey.error.${code}`, { defaultValue: t('flags.passkey.error') }),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card as="section" className="bsdc-bin" padding="md">
      <Text as="h2" size="lg" weight={700} lang={lang}>
        {t('recovery.title')}
      </Text>
      <Text as="p" size="sm" tone="muted" lang={lang}>
        {t('recovery.subtitle')}
      </Text>

      {entries.length === 0 ? (
        <EmptyState
          illustration="empty-state"
          title={t('recovery.empty')}
          description={t('recovery.ownerNote')}
          lang={lang}
        />
      ) : (
        <ul className="bsdc-bin__list">
          {entries.map((entry) => {
            const left = daysLeft(entry);
            const soon = isExpiringSoon(entry);
            return (
              <li key={entry.id} className="bsdc-bin__row">
                <div className="bsdc-bin__rowMain">
                  <Text as="h3" size="md" weight={600} lang={lang}>
                    {entry.label.length > 0
                      ? entry.label
                      : `${recoveryKindLabel(entry.kind)[lang]} ${entry.entityId}`}
                  </Text>
                  <p className="bsdc-bin__meta">
                    <Badge tone="neutral">{recoveryKindLabel(entry.kind)[lang]}</Badge>
                    <span lang={lang}>
                      {t('recovery.deletedOn')} {formatDate(entry.deletedAt, locale)}
                    </span>
                    <span lang={lang}>
                      {t('recovery.purgeOn')} {formatDate(entry.purgeAt, locale)}
                    </span>
                    {soon ? <Badge tone="warning">{t('recovery.expiring')}</Badge> : null}
                  </p>
                  <Text as="p" size="sm" tone={soon ? 'danger' : 'muted'} lang={lang}>
                    {t('recovery.daysLeft', { count: left })}
                  </Text>
                </div>
                <div className="bsdc-bin__rowActions">
                  <Button
                    variant="secondary"
                    onClick={() => restore(entry)}
                    disabled={busy || !mayRestore(entry, viewerUid, isStaff)}
                  >
                    {busy ? t('recovery.restoring') : t('recovery.restore')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirming(entry);
                      setTyped('');
                    }}
                    disabled={busy || !mayPurge(entry, viewerUid, isStaff)}
                  >
                    {t('recovery.purge')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            setTyped('');
          }
        }}
        title={t('recovery.confirm.title')}
        description={t('recovery.confirm.description')}
        size="sm"
        footer={
          <div className="bsdc-bin__actions">
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(null);
                setTyped('');
              }}
              disabled={busy}
            >
              {t('recovery.confirm.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={purge}
              disabled={busy || typed.trim() !== (confirming?.entityId ?? '')}
              loading={busy}
            >
              {busy ? t('recovery.purging') : t('recovery.confirm.submit')}
            </Button>
          </div>
        }
      >
        {confirming === null ? null : (
          <div className="bsdc-bin__confirm">
            <Text as="p" size="sm" lang={lang}>
              {confirming.label.length > 0 ? confirming.label : confirming.entityId}
            </Text>
            <Input
              label={t('recovery.confirm.label')}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              error={
                typed.length > 0 && typed.trim() !== confirming.entityId
                  ? t('recovery.confirm.mismatch')
                  : undefined
              }
            />
          </div>
        )}
      </Modal>
    </Card>
  );
}

/**
 * Formats a date for the bin, in the viewer's own calendar.
 * @param iso ISO instant
 * @param locale the viewer's locale
 * @returns the formatted date
 */
function formatDate(iso: string, locale: Locale): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'long',
  }).format(at);
}

/**
 * Resolves the error code of a thrown value.
 * @param reason the thrown value
 * @returns an error code
 */
function codeOf(reason: unknown): string {
  if (reason instanceof AppError) return reason.code;
  if (typeof reason === 'object' && reason !== null && 'code' in reason) {
    const code = (reason as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'BSDC-NET-005';
}
