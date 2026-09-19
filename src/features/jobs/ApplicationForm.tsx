/**
 * BSDC — src/features/jobs/ApplicationForm.tsx
 * Purpose : Applying to a job, with enough words to be worth reading.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The cover letter has a floor, not just a ceiling. "Interested, please consider" tells
 *   an employer nothing, and a board that accepts one-line applications is a board where the
 *   serious candidates are buried under the fast ones. The counter says how many more characters
 *   are needed rather than simply refusing the submit, because a person who has written something
 *   deserves to be told how to finish it.
 *   Withdrawing is offered beside the form once an application exists: changing your mind is a
 *   normal thing to do and should not require finding a support address.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea, showToast } from '@/shared/ui';
import { findError } from '@/core/errors/taxonomy';
import type { Locale } from '@/core/config/app';
import type { Profile } from '@/entities/profile/model';
import {
  MIN_COVER_LETTER_CHARS,
  isWithdrawable,
  validateApplication,
  type Application,
  type Job,
} from '@/entities/job/model';
import { submitApplication, withdrawApplication } from '@/entities/job/repository';
import { buildApplication } from '@/entities/job/repository';

/** Props for the application form. */
export interface ApplicationFormProps {
  readonly job: Job;
  readonly applicant: Profile;
  readonly existing: Application | null | undefined;
  readonly locale: Locale;
  readonly onSubmitted: (application: Application | null) => void;
}

/**
 * Renders the application form, or the withdrawal panel when one already exists.
 * @param props component props
 * @returns the form element
 */
export function ApplicationForm({
  job,
  applicant,
  existing,
  locale,
  onSubmitted,
}: ApplicationFormProps): React.ReactElement {
  const { t } = useTranslation('jobs');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const [coverLetter, setCoverLetter] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [expectedSalary, setExpectedSalary] = useState(0);
  const [noticeDays, setNoticeDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (existing !== null && existing !== undefined) {
    return (
      <section
        className="bsdc-application bsdc-application--sent"
        aria-label={t('apply.sentLabel')}
      >
        <p lang={lang}>{t('apply.sent', { status: t(`status.${existing.status}`) })}</p>
        {existing.employerNote.length > 0 ? (
          <p className="bsdc-application__note" lang={lang}>
            {existing.employerNote}
          </p>
        ) : null}
        {isWithdrawable(existing) ? (
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => {
              setBusy(true);
              void withdrawApplication(job.id, applicant.uid)
                .then(() => {
                  onSubmitted(null);
                  showToast(locale, {
                    titleBn: t('withdraw.done.bn'),
                    titleEn: t('withdraw.done.en'),
                    tone: 'success',
                  });
                })
                .finally(() => setBusy(false));
            }}
          >
            {t('withdraw.action')}
          </Button>
        ) : null}
      </section>
    );
  }

  const remaining = MIN_COVER_LETTER_CHARS - coverLetter.trim().length;

  const submit = (): void => {
    const application = buildApplication(
      job,
      applicant.uid,
      {
        displayName: applicant.displayName,
        headline: applicant.headline,
        photoUrl: applicant.photoUrl,
      },
      coverLetter,
      {
        portfolioUrl,
        resumeUrl,
        expectedSalary,
        noticeDays,
      },
    );
    const validation = validateApplication(
      {
        jobId: job.id,
        uid: applicant.uid,
        applicantName: applicant.displayName,
        applicantHeadline: applicant.headline,
        applicantPhotoUrl: applicant.photoUrl,
        coverLetter,
      },
      job,
    );
    if (validation !== null) {
      setProblem(validation);
      return;
    }
    setProblem(null);
    setBusy(true);
    void submitApplication(application, job)
      .then((outcome) => {
        if (!outcome.synced && !outcome.queued) {
          const code = outcome.error?.code ?? 'BSDC-DATA-007';
          const definition = findError(code);
          showToast(locale, {
            tone: 'error',
            titleBn: definition?.bn ?? code,
            titleEn: definition?.en ?? code,
          });
          return;
        }
        onSubmitted(application);
        showToast(locale, {
          titleBn: t('apply.sentToast.bn'),
          titleEn: t('apply.sentToast.en'),
          tone: 'success',
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <form
      className="bsdc-application"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        label={t('apply.coverLetter')}
        value={coverLetter}
        onChange={(event) => setCoverLetter(event.target.value)}
        maxLength={4000}
        hint={remaining > 0 ? t('apply.needMore', { count: remaining }) : undefined}
        required
      />
      <div className="bsdc-application__row">
        <Input
          label={t('apply.portfolio')}
          value={portfolioUrl}
          onChange={(event) => setPortfolioUrl(event.target.value)}
          type="url"
          inputMode="url"
          maxLength={300}
        />
        <Input
          label={t('apply.resume')}
          value={resumeUrl}
          onChange={(event) => setResumeUrl(event.target.value)}
          type="url"
          inputMode="url"
          maxLength={300}
        />
      </div>
      <div className="bsdc-application__row">
        <Input
          label={t('apply.expectedSalary')}
          value={String(expectedSalary)}
          onChange={(event) =>
            setExpectedSalary(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)
          }
          inputMode="numeric"
          maxLength={12}
        />
        <Input
          label={t('apply.noticeDays')}
          value={String(noticeDays)}
          onChange={(event) =>
            setNoticeDays(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)
          }
          type="number"
          inputMode="numeric"
          min={0}
          max={180}
        />
      </div>
      {problem !== null ? (
        <p className="bsdc-application__error" role="alert" lang={lang}>
          {t(`error.${problem}.${locale === 'bn' ? 'bn' : 'en'}`)}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={busy} disabled={remaining > 0}>
        {t('apply.submit')}
      </Button>
    </form>
  );
}
