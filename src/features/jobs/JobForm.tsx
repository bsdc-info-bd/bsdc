/**
 * BSDC — src/features/jobs/JobForm.tsx
 * Purpose : Posting a job that a person can actually decide about.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The form asks for the salary and then makes leaving it out an explicit, visible choice
 *   rather than a gap in the layout. It refuses a maximum below the minimum instead of silently
 *   swapping them, because a range the employer did not type is not a range the employer agreed to.
 *   The description is the one field that carries the job, so its counter is live and the limit is
 *   stated in words rather than discovered at the end.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select, Textarea, showToast, Switch } from '@/shared/ui';
import { TEXT_LIMITS } from '@/core/config/limits';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import {
  BANGLADESH_DIVISIONS,
  CURRENCIES,
  DIVISION_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  SALARY_PERIODS,
  SALARY_PERIOD_LABELS,
  WORKPLACE_TYPES,
  WORKPLACE_TYPE_LABELS,
  type Currency,
  type Division,
  type EmploymentType,
  type ExperienceLevel,
  type SalaryPeriod,
  type WorkplaceType,
} from '@/core/config/opportunities';
import { newJob, validateJob, type Job } from '@/entities/job/model';

/** Props for the job form. */
export interface JobFormProps {
  readonly employerUid: string;
  readonly locale: Locale;
  readonly onSubmit: (job: Job) => Promise<void>;
  readonly onCancel: () => void;
}

/**
 * Renders the job form.
 * @param props component props
 * @returns the form element
 */
export function JobForm({
  employerUid,
  locale,
  onSubmit,
  onCancel,
}: JobFormProps): React.ReactElement {
  const { t } = useTranslation('jobs');
  const bn = locale === 'bn';
  const [companyName, setCompanyName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full-time');
  const [workplaceType, setWorkplaceType] = useState<WorkplaceType>('onsite');
  const [location, setLocation] = useState('');
  const [division, setDivision] = useState<Division>('dhaka');
  const [salaryMin, setSalaryMin] = useState(0);
  const [salaryMax, setSalaryMax] = useState(0);
  const [currency, setCurrency] = useState<Currency>('BDT');
  const [salaryPeriod, setSalaryPeriod] = useState<SalaryPeriod>('monthly');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('junior');
  const [skills, setSkills] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [externalApplyUrl, setExternalApplyUrl] = useState('');
  const [discloseSalary, setDiscloseSalary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const numbers = (value: string): number => Number(value.replace(/[^0-9]/g, '')) || 0;

  const submit = (): void => {
    const draft = {
      employerUid,
      companyName,
      title,
      description,
      employmentType,
      workplaceType,
      location,
      division,
      salaryMin: discloseSalary ? salaryMin : 0,
      salaryMax: discloseSalary ? salaryMax : 0,
      currency,
      salaryPeriod,
      skills: skills
        .split(',')
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0)
        .slice(0, 20),
      experienceLevel,
      deadlineAt:
        deadlineAt.length > 0 ? new Date(`${deadlineAt}T23:59:00+06:00`).toISOString() : null,
      externalApplyUrl,
    };
    const validation = validateJob(draft);
    if (validation !== null) {
      setProblem(validation);
      return;
    }
    setProblem(null);
    setBusy(true);
    void onSubmit(newJob(draft))
      .then(() =>
        showToast(locale, { titleBn: t('posted.bn'), titleEn: t('posted.en'), tone: 'success' }),
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
      className="bsdc-jobForm"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        label={t('form.company')}
        value={companyName}
        onChange={(event) => setCompanyName(event.target.value)}
        required
        maxLength={80}
      />
      <Input
        label={t('form.title')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
        maxLength={120}
      />
      <Textarea
        label={t('form.description')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={TEXT_LIMITS.productDescription}
        counter={{ value: description.length, max: TEXT_LIMITS.productDescription }}
      />
      <div className="bsdc-jobForm__row">
        <Select<EmploymentType>
          label={t('form.employmentType')}
          value={employmentType}
          onValueChange={setEmploymentType}
          options={EMPLOYMENT_TYPES.map((entry) => ({
            value: entry,
            label: EMPLOYMENT_TYPE_LABELS[entry][bn ? 'bn' : 'en'],
          }))}
        />
        <Select<WorkplaceType>
          label={t('form.workplace')}
          value={workplaceType}
          onValueChange={setWorkplaceType}
          options={WORKPLACE_TYPES.map((entry) => ({
            value: entry,
            label: WORKPLACE_TYPE_LABELS[entry][bn ? 'bn' : 'en'],
          }))}
        />
      </div>
      <div className="bsdc-jobForm__row">
        <Input
          label={t('form.location')}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          maxLength={120}
        />
        <Select<Division>
          label={t('form.division')}
          value={division}
          onValueChange={setDivision}
          options={BANGLADESH_DIVISIONS.map((entry) => ({
            value: entry,
            label: DIVISION_LABELS[entry][bn ? 'bn' : 'en'],
          }))}
        />
      </div>
      <div className="bsdc-jobForm__row">
        <Select<ExperienceLevel>
          label={t('form.experience')}
          value={experienceLevel}
          onValueChange={setExperienceLevel}
          options={EXPERIENCE_LEVELS.map((entry) => ({
            value: entry,
            label: EXPERIENCE_LEVEL_LABELS[entry][bn ? 'bn' : 'en'],
          }))}
        />
        <Input
          label={t('form.deadline')}
          value={deadlineAt}
          onChange={(event) => setDeadlineAt(event.target.value)}
          type="date"
        />
      </div>

      <div className="bsdc-jobForm__salary">
        <Switch
          checked={discloseSalary}
          onCheckedChange={setDiscloseSalary}
          label={t('form.discloseSalary')}
        />
        {discloseSalary ? (
          <div className="bsdc-jobForm__row">
            <Input
              label={t('form.salaryMin')}
              value={String(salaryMin)}
              onChange={(event) => setSalaryMin(numbers(event.target.value))}
              inputMode="numeric"
              maxLength={12}
            />
            <Input
              label={t('form.salaryMax')}
              value={String(salaryMax)}
              onChange={(event) => setSalaryMax(numbers(event.target.value))}
              inputMode="numeric"
              maxLength={12}
            />
            <Select<Currency>
              label={t('form.currency')}
              value={currency}
              onValueChange={setCurrency}
              options={CURRENCIES.map((entry) => ({ value: entry, label: entry }))}
            />
            <Select<SalaryPeriod>
              label={t('form.period')}
              value={salaryPeriod}
              onValueChange={setSalaryPeriod}
              options={SALARY_PERIODS.map((entry) => ({
                value: entry,
                label: SALARY_PERIOD_LABELS[entry][bn ? 'bn' : 'en'],
              }))}
            />
          </div>
        ) : (
          <p className="bsdc-jobForm__note" lang={locale === 'bn' ? 'bn' : 'en'}>
            {t('form.salaryHiddenNote')}
          </p>
        )}
      </div>

      <Input
        label={t('form.skills')}
        value={skills}
        onChange={(event) => setSkills(event.target.value)}
        hint={t('form.skillsHint')}
        maxLength={300}
      />
      <Input
        label={t('form.externalUrl')}
        value={externalApplyUrl}
        onChange={(event) => setExternalApplyUrl(event.target.value)}
        type="url"
        inputMode="url"
        hint={t('form.externalUrlHint')}
        maxLength={300}
      />

      {problem !== null ? (
        <p className="bsdc-jobForm__error" role="alert" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t(`error.${problem}.${locale === 'bn' ? 'bn' : 'en'}`)}
        </p>
      ) : null}

      <div className="bsdc-jobForm__actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t('form.post')}
        </Button>
      </div>
    </form>
  );
}
