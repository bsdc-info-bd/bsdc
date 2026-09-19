/**
 * BSDC — src/features/moderation/AppealForm.tsx
 * Purpose : Asking a different human to look again.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : One appeal per decision, and it goes to somebody who did not make the call. Both rules
 *   are enforced in the Cloud Function; this form states them before a person writes a word, because
 *   the worst outcome is somebody spending ten minutes on an appeal the system was always going to
 *   refuse.
 *   When an appeal is not available the form says exactly why instead of vanishing, since a missing
 *   button with no explanation reads as a bug and a bug in the appeals path is the kind of thing
 *   people stop trusting a platform over.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Textarea, showToast } from '@/shared/ui';
import { APPEAL_WINDOW_DAYS } from '@/core/config/moderation';
import type { Locale } from '@/core/config/app';
import { isDecided, type Appeal, type Report } from '@/entities/moderation/model';
import { appealRefusal } from '@/entities/moderation/state';
import { fileAppeal } from '@/entities/moderation/repository';

/** Props for the appeal form. */
export interface AppealFormProps {
  readonly report: Report;
  readonly appeals: readonly Appeal[];
  readonly locale: Locale;
  readonly onFiled: (appealId: string) => void;
}

/**
 * Renders the appeal form, or the reason an appeal is not available.
 * @param props component props
 * @returns the form element
 */
export function AppealForm({
  report,
  appeals,
  locale,
  onFiled,
}: AppealFormProps): React.ReactElement {
  const { t } = useTranslation('moderation');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const refusal = appealRefusal(report, appeals);

  if (refusal !== null) {
    return (
      <p className="bsdc-appeal bsdc-appeal--refused" lang={lang} role="status">
        {refusal === 'not-decided' ? t('appeal.notDecided') : t('appeal.alreadyUsed')}
      </p>
    );
  }

  const submit = (): void => {
    if (reason.trim().length < 12) return;
    setBusy(true);
    void fileAppeal(report.id, reason)
      .then((appealId) => {
        onFiled(appealId);
        setReason('');
        showToast(locale, {
          titleBn: t('appeal.done.bn'),
          titleEn: t('appeal.done.en'),
          tone: 'success',
        });
      })
      .catch(() => {
        showToast(locale, {
          tone: 'error',
          titleBn: t('appeal.failed.bn'),
          titleEn: t('appeal.failed.en'),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <form
      className="bsdc-appeal"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="bsdc-appeal__note" lang={lang}>
        {isDecided(report) ? t('appeal.explainer', { days: APPEAL_WINDOW_DAYS }) : ''}
      </p>
      <Textarea
        label={t('appeal.reason')}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        required
      />
      <Button type="submit" variant="primary" loading={busy} disabled={reason.trim().length < 12}>
        {t('appeal.submit')}
      </Button>
    </form>
  );
}
