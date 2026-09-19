/**
 * BSDC — src/features/moderation/ReportDialog.tsx
 * Purpose : Filing a report: what happened, and enough words for a human to act on it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The category list is ordered by severity and every category carries a hint in both
 *   languages, because "which of these is it" is the question that decides whether a report gets
 *   handled in an hour or in a week. The self-harm and violence categories say plainly that a human
 *   reviewer sees them first — a person in crisis should not have to guess that.
 *   The minimum length on the reason is enforced before submission with a live counter, not after,
 *   and the dialog never asks for evidence a person does not have.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, RadioGroup, Textarea, showToast, type RadioOption } from '@/shared/ui';
import {
  MIN_REASON_CHARS,
  REPORT_CATEGORY_DEFINITIONS,
  type ReportCategory,
} from '@/core/config/moderation';
import type { Locale } from '@/core/config/app';
import { type REPORT_TARGETS, newReport, type Report } from '@/entities/moderation/model';
import { fileReport } from '@/entities/moderation/repository';

/** Props for the report dialog. */
export interface ReportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly targetType: (typeof REPORT_TARGETS)[number];
  readonly targetId: string;
  readonly targetLabelBn: string;
  readonly targetLabelEn: string;
  readonly targetAuthorUid: string;
  readonly reporterUid: string;
  readonly locale: Locale;
  readonly onFiled: (report: Report) => void;
}

/**
 * Renders the report dialog.
 * @param props component props
 * @returns the dialog element
 */
export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetLabelBn,
  targetLabelEn,
  targetAuthorUid,
  reporterUid,
  locale,
  onFiled,
}: ReportDialogProps): React.ReactElement {
  const { t } = useTranslation('moderation');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';
  const [category, setCategory] = useState<ReportCategory>('spam');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const options: readonly RadioOption<ReportCategory>[] = REPORT_CATEGORY_DEFINITIONS.map(
    (definition) => ({
      value: definition.id,
      label: bn ? definition.labelBn : definition.labelEn,
      description: bn ? definition.hintBn : definition.hintEn,
    }),
  );

  const remaining = MIN_REASON_CHARS - reason.trim().length;

  const submit = (): void => {
    if (remaining > 0) return;
    setBusy(true);
    const report = newReport({
      targetType,
      targetId,
      targetLabelBn,
      targetLabelEn,
      targetAuthorUid,
      reporterUid,
      category,
      reasonText: reason,
    });
    void fileReport(report)
      .then((outcome) => {
        if (!outcome.synced && !outcome.queued) {
          showToast(locale, {
            tone: 'error',
            titleBn: t('file.failed.bn'),
            titleEn: t('file.failed.en'),
          });
          return;
        }
        onFiled(report);
        onOpenChange(false);
        setReason('');
        showToast(locale, {
          titleBn: t('file.done.bn'),
          titleEn: t('file.done.en'),
          tone: 'success',
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('file.title')}
      description={t('file.description')}
      size="md"
      closeLabel={t('file.close')}
      footer={
        <div className="bsdc-reportDialog__actions">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('file.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={remaining > 0} onClick={submit}>
            {t('file.submit')}
          </Button>
        </div>
      }
    >
      <div className="bsdc-reportDialog" lang={lang}>
        <RadioGroup
          label={t('file.category')}
          value={category}
          onValueChange={(next) => setCategory(next)}
          options={options}
          variant="card"
        />
        <Textarea
          label={t('file.reason')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          hint={remaining > 0 ? t('file.needMore', { count: remaining }) : undefined}
          required
        />
        <p className="bsdc-reportDialog__note" lang={lang}>
          {t('file.privacyNote')}
        </p>
      </div>
    </Modal>
  );
}
