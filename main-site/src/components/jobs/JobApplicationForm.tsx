import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  TagInput,
  TextField,
  TextareaField,
} from '@/design-system';
import { MediaImage } from '@/components/media/MediaImage';
import {
  isValidApplicationImgBbUrl,
  toJobApplicationSubmission,
  validateJobApplicationDraft,
  type JobApplicationDraft,
  type JobApplicationSubmission,
} from '@/lib/opportunities/job-application';
import { normaliseSkills } from '@/lib/opportunities/skills';
import { formatTaka } from '@/lib/mk/mk-logic';
import { dataErrorKey } from '@/lib/supabase/errors';
import { ROUTES } from '@/lib/site';
import type { JobApplicationPrefill } from './use-job-application-prefill';
export type { JobApplicationPrefill } from './use-job-application-prefill';

interface JobApplicationFormProps {
  open: boolean;
  jobTitle: string;
  initial: JobApplicationPrefill;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (application: JobApplicationSubmission) => Promise<void>;
}

function emptyDraft(initial: JobApplicationPrefill): JobApplicationDraft {
  return {
    applicantName: initial.applicantName ?? '',
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    location: initial.location ?? '',
    yearsExperience: '',
    education: '',
    expectedSalaryTaka: '',
    portfolioUrl: '',
    linkedinUrl: '',
    noticePeriod: '',
    skills: normaliseSkills(initial.skills ?? []),
    certificationImageUrls: [],
    coverLetter: '',
    resumeUrl: '',
  };
}

function displayOr(value: string, fallback: string): string {
  return value.trim() || fallback;
}

/** A two-step application sheet: edit the snapshot, review it, then submit. */
export function JobApplicationForm({
  open,
  jobTitle,
  initial,
  isSubmitting,
  onClose,
  onSubmit,
}: JobApplicationFormProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const navigate = useNavigate();
  const [draft, setDraft] = useState<JobApplicationDraft>(() => emptyDraft(initial));
  const [step, setStep] = useState<'edit' | 'review' | 'success'>('edit');
  const [errors, setErrors] = useState<ReturnType<typeof validateJobApplicationDraft>>({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft(initial));
    setStep('edit');
    setErrors({});
    setSubmitError('');
  }, [open, initial]);

  const submission = useMemo(() => toJobApplicationSubmission(draft), [draft]);
  const imageSlots = Array.from({ length: 3 }, (_, index) => index);

  function update<K extends keyof JobApplicationDraft>(key: K, value: JobApplicationDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError('');
  }

  function validate(): boolean {
    const next = validateJobApplicationDraft(draft);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) {
      setStep('edit');
      return;
    }
    setSubmitError('');
    try {
      await onSubmit(submission);
      setStep('success');
    } catch (error) {
      setSubmitError(t(dataErrorKey(error)));
      setStep('edit');
    }
  }

  const footer =
    step === 'success' ? (
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
        <Button
          type="button"
          onClick={() => {
            onClose();
            navigate(ROUTES.myJobApplications);
          }}
        >
          {t('jobs.application.myApplications')}
        </Button>
      </div>
    ) : step === 'review' ? (
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => setStep('edit')}
        >
          {t('jobs.application.editApplication')}
        </Button>
        <Button
          type="button"
          loading={isSubmitting}
          disabled={isSubmitting}
          onClick={() => void submit()}
        >
          {t('jobs.application.submit')}
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={() => (validate() ? setStep('review') : undefined)}
        >
          {t('jobs.application.reviewApplication')}
        </Button>
      </div>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('jobs.applyTo', { title: jobTitle })}
      closeLabel={t('common.close')}
      footer={footer}
    >
      {step === 'success' ? (
        <div className="space-y-4" role="status">
          <Alert tone="success" title={t('jobs.application.successTitle')}>
            {t('jobs.application.successBody')}
          </Alert>
          <p className="text-sm text-muted">{t('jobs.application.successPrivacy')}</p>
          <Link
            to={ROUTES.myJobApplications}
            onClick={onClose}
            className="text-sm font-semibold text-green-700 underline"
          >
            {t('jobs.application.myApplications')}
          </Link>
        </div>
      ) : step === 'review' ? (
        <div className="space-y-3">
          <div>
            <Badge tone="blue">{t('jobs.application.reviewStep')}</Badge>
            <h3 className="mt-2 text-lg font-semibold">{t('jobs.application.reviewTitle')}</h3>
            <p className="text-sm text-muted">{t('jobs.application.reviewHint')}</p>
          </div>
          <Card className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t('jobs.application.section.contact')}
              </p>
              <p className="mt-1 font-semibold">
                {displayOr(draft.applicantName, t('jobs.application.notProvided'))}
              </p>
              <p className="text-sm text-muted">
                {[draft.email, draft.phone, draft.location]
                  .filter((item) => item.trim())
                  .join(' · ') || t('jobs.application.notProvided')}
              </p>
            </div>
            <SummaryRow
              label={t('jobs.application.section.experience')}
              value={
                draft.yearsExperience.trim()
                  ? t('jobs.application.years', { count: Number(draft.yearsExperience) })
                  : ''
              }
              fallback={t('jobs.application.notProvided')}
            />
            <SummaryRow
              label={t('jobs.application.education')}
              value={draft.education}
              fallback={t('jobs.application.notProvided')}
            />
            <SummaryRow
              label={t('jobs.application.expectedSalary')}
              value={
                submission.expectedSalaryPoisha === null
                  ? ''
                  : formatTaka(submission.expectedSalaryPoisha, language)
              }
              fallback={t('jobs.application.notProvided')}
            />
            <SummaryRow
              label={t('jobs.application.resume')}
              value={draft.resumeUrl}
              fallback={t('jobs.application.notProvided')}
            />
            <SummaryRow
              label={t('jobs.application.portfolio')}
              value={draft.portfolioUrl}
              fallback={t('jobs.application.notProvided')}
            />
            <SummaryRow
              label={t('jobs.application.linkedin')}
              value={draft.linkedinUrl}
              fallback={t('jobs.application.notProvided')}
            />
            <SummaryRow
              label={t('jobs.application.noticePeriod')}
              value={draft.noticePeriod}
              fallback={t('jobs.application.notProvided')}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t('jobs.application.skills')}
              </p>
              <p className="mt-1 text-sm">
                {draft.skills.join(', ') || t('jobs.application.notProvided')}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t('jobs.coverLetter')}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-6">
                {draft.coverLetter.trim()}
              </p>
            </div>
            {draft.certificationImageUrls.some(Boolean) ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t('jobs.application.certifications')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {draft.certificationImageUrls.filter(Boolean).map((url) => (
                    <MediaImage
                      key={url}
                      src={url}
                      alt={t('jobs.application.certificationImageAlt')}
                      width={96}
                      height={72}
                      loading="lazy"
                      className="h-20 w-24 rounded-lg border border-border object-cover"
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
          {submitError ? (
            <Alert tone="danger" title={t('jobs.application.submitFailed')}>
              {submitError}
            </Alert>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Badge tone="blue">{t('jobs.application.editStep')}</Badge>
            <h3 className="mt-2 text-lg font-semibold">{t('jobs.application.formTitle')}</h3>
            <p className="text-sm text-muted">{t('jobs.application.formHint')}</p>
          </div>

          <section className="space-y-3" aria-labelledby="application-contact-heading">
            <h4 id="application-contact-heading" className="font-semibold">
              {t('jobs.application.section.contact')}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={t('jobs.application.name')}
                autoComplete="name"
                maxLength={60}
                value={draft.applicantName}
                onChange={(event) => update('applicantName', event.target.value)}
                error={errors.applicantName ? t(errors.applicantName) : undefined}
              />
              <TextField
                label={t('jobs.application.phone')}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                maxLength={20}
                value={draft.phone}
                onChange={(event) => update('phone', event.target.value)}
                error={errors.phone ? t(errors.phone) : undefined}
              />
              <TextField
                label={t('jobs.application.email')}
                type="email"
                autoComplete="email"
                inputMode="email"
                maxLength={320}
                value={draft.email}
                onChange={(event) => update('email', event.target.value)}
                error={errors.email ? t(errors.email) : undefined}
              />
              <TextField
                label={t('jobs.application.location')}
                autoComplete="address-level2"
                maxLength={80}
                value={draft.location}
                onChange={(event) => update('location', event.target.value)}
                error={errors.location ? t(errors.location) : undefined}
              />
            </div>
            {errors.contact ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {t(errors.contact)}
              </p>
            ) : null}
          </section>

          <section className="space-y-3" aria-labelledby="application-background-heading">
            <h4 id="application-background-heading" className="font-semibold">
              {t('jobs.application.section.background')}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={t('jobs.application.yearsExperience')}
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                value={draft.yearsExperience}
                onChange={(event) => update('yearsExperience', event.target.value)}
                error={errors.yearsExperience ? t(errors.yearsExperience) : undefined}
              />
              <TextField
                label={t('jobs.application.education')}
                maxLength={200}
                value={draft.education}
                onChange={(event) => update('education', event.target.value)}
                error={errors.education ? t(errors.education) : undefined}
              />
              <TextField
                label={t('jobs.application.expectedSalary')}
                type="text"
                inputMode="decimal"
                placeholder="50000"
                hint={t('jobs.application.salaryHint')}
                value={draft.expectedSalaryTaka}
                onChange={(event) => update('expectedSalaryTaka', event.target.value)}
                error={errors.expectedSalaryTaka ? t(errors.expectedSalaryTaka) : undefined}
              />
              <TextField
                label={t('jobs.application.noticePeriod')}
                maxLength={60}
                value={draft.noticePeriod}
                onChange={(event) => update('noticePeriod', event.target.value)}
                error={errors.noticePeriod ? t(errors.noticePeriod) : undefined}
              />
            </div>
            <TagInput
              label={t('jobs.application.skills')}
              hint={t('jobs.application.skillsHint')}
              value={draft.skills}
              onChange={(skills) => update('skills', normaliseSkills(skills))}
              max={30}
              maxLength={64}
            />
            {errors.skills ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {t(errors.skills)}
              </p>
            ) : null}
          </section>

          <section className="space-y-3" aria-labelledby="application-links-heading">
            <h4 id="application-links-heading" className="font-semibold">
              {t('jobs.application.section.links')}
            </h4>
            <TextField
              label={t('jobs.application.resume')}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://..."
              hint={t('jobs.application.httpsHint')}
              value={draft.resumeUrl}
              onChange={(event) => update('resumeUrl', event.target.value)}
              error={errors.resumeUrl ? t(errors.resumeUrl) : undefined}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={t('jobs.application.portfolio')}
                type="url"
                inputMode="url"
                placeholder="https://..."
                value={draft.portfolioUrl}
                onChange={(event) => update('portfolioUrl', event.target.value)}
                error={errors.portfolioUrl ? t(errors.portfolioUrl) : undefined}
              />
              <TextField
                label={t('jobs.application.linkedin')}
                type="url"
                inputMode="url"
                placeholder="https://www.linkedin.com/in/..."
                value={draft.linkedinUrl}
                onChange={(event) => update('linkedinUrl', event.target.value)}
                error={errors.linkedinUrl ? t(errors.linkedinUrl) : undefined}
              />
            </div>
            <div>
              <p className="text-sm font-medium">{t('jobs.application.certifications')}</p>
              <p className="mt-1 text-xs text-muted">{t('jobs.application.certificationHint')}</p>
              <div className="mt-2 space-y-3">
                {imageSlots.map((index) => {
                  const value = draft.certificationImageUrls[index] ?? '';
                  const valid = isValidApplicationImgBbUrl(value);
                  return (
                    <div key={index} className="space-y-2">
                      <TextField
                        label={t('jobs.application.certificationLink', { count: index + 1 })}
                        type="url"
                        inputMode="url"
                        placeholder="https://i.ibb.co/..."
                        value={value}
                        onChange={(event) => {
                          const next = [...draft.certificationImageUrls];
                          next[index] = event.target.value;
                          update('certificationImageUrls', next);
                        }}
                        error={
                          value.trim() && !valid
                            ? t('jobs.application.validation.image')
                            : undefined
                        }
                      />
                      {value.trim() && valid ? (
                        <MediaImage
                          src={value.trim()}
                          alt={t('jobs.application.certificationImageAlt')}
                          width={120}
                          height={88}
                          loading="lazy"
                          className="h-22 w-30 rounded-lg border border-border object-cover"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {errors.certificationImageUrls ? (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  {t(errors.certificationImageUrls)}
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="application-letter-heading">
            <h4 id="application-letter-heading" className="font-semibold">
              {t('jobs.application.section.statement')}
            </h4>
            <TextareaField
              label={t('jobs.coverLetter')}
              hint={t('jobs.coverLetterHint')}
              rows={6}
              maxLength={6000}
              counterMax={6000}
              value={draft.coverLetter}
              onChange={(event) => update('coverLetter', event.target.value)}
              error={errors.coverLetter ? t(errors.coverLetter) : undefined}
            />
          </section>
          {submitError ? (
            <Alert tone="danger" title={t('jobs.application.submitFailed')}>
              {submitError}
            </Alert>
          ) : null}
          <p className="text-xs text-muted">{t('jobs.application.privateNotice')}</p>
        </div>
      )}
    </Modal>
  );
}

function SummaryRow({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string;
  fallback: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 break-words text-sm">{value.trim() || fallback}</p>
    </div>
  );
}
