/**
 * BSDC — src/features/jobs/JobCard.tsx
 * Purpose : One job, in the board: what it is, where it is, what it pays and when it closes.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A salary that was not disclosed says so in words instead of showing a row of zeroes,
 *   because a job board where the money is a mystery is a job board that wastes people's time.
 *   The deadline is rendered as days remaining rather than a date, since "closes in three days" is
 *   the sentence a person acts on, and the exact date is one tap away on the detail screen.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Card, Icon, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import {
  CURRENCY_SYMBOLS,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  SALARY_PERIOD_LABELS,
  WORKPLACE_TYPE_LABELS,
} from '@/core/config/opportunities';
import { daysToDeadline, isJobOpen, salaryLine, type Job } from '@/entities/job/model';

/** Props for the job card. */
export interface JobCardProps {
  readonly job: Job;
  readonly locale: Locale;
  readonly now?: Date | undefined;
  /** True when the viewer has already applied, shown as a quiet confirmation. */
  readonly applied?: boolean | undefined;
}

/**
 * Renders a job card.
 * @param props component props
 * @returns the card element
 */
export function JobCard({ job, locale, now, applied = false }: JobCardProps): React.ReactElement {
  const { t } = useTranslation('jobs');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';
  const open = isJobOpen(job, now);
  const days = daysToDeadline(job, now);
  const pay = salaryLine(job, CURRENCY_SYMBOLS[job.currency]);

  return (
    <Card as="article" className="bsdc-jobCard">
      <Link className="bsdc-jobCard__link" to={`/jobs/${job.id}`}>
        <div className="bsdc-jobCard__head">
          <h3 className="bsdc-jobCard__title" lang={lang}>
            {job.title}
          </h3>
          <Badge tone={open ? 'success' : 'neutral'} variant="outline">
            {open ? t('open') : t('closed')}
          </Badge>
        </div>
        <p className="bsdc-jobCard__company" lang={lang}>
          <Icon name="building" size={15} />
          {job.companyName}
        </p>
        <p className="bsdc-jobCard__place" lang={lang}>
          <Icon name="mapPin" size={15} />
          {job.location.length > 0 ? job.location : t('remoteAnywhere')}
          <span aria-hidden="true"> · </span>
          {WORKPLACE_TYPE_LABELS[job.workplaceType][bn ? 'bn' : 'en']}
        </p>
        <p className="bsdc-jobCard__pay" lang={lang}>
          {pay.length > 0
            ? `${pay} ${SALARY_PERIOD_LABELS[job.salaryPeriod][bn ? 'bn' : 'en']}`
            : t('salaryUndisclosed')}
        </p>
        <div className="bsdc-jobCard__tags">
          <Badge tone="neutral" variant="outline">
            {EMPLOYMENT_TYPE_LABELS[job.employmentType][bn ? 'bn' : 'en']}
          </Badge>
          <Badge tone="neutral" variant="outline">
            {EXPERIENCE_LEVEL_LABELS[job.experienceLevel][bn ? 'bn' : 'en']}
          </Badge>
          {job.skills.slice(0, 3).map((skill) => (
            <Badge key={skill} tone="brand" variant="outline">
              {skill}
            </Badge>
          ))}
        </div>
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {applied
            ? t('applied')
            : days === null
              ? t('noDeadline')
              : days === 0
                ? t('closesToday')
                : t('closesIn', { count: days })}
        </Text>
      </Link>
    </Card>
  );
}
