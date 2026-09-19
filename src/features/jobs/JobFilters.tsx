/**
 * BSDC — src/features/jobs/JobFilters.tsx
 * Purpose : Narrowing the board down to the jobs that fit.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every filter is a rail of removable chips rather than a dropdown farm, because on a
 *   phone a filter you can see is a filter you will use. The active set is always summarised in one
 *   line with a single "clear" control, so a person who narrowed themselves into an empty list can
 *   get out in one tap instead of hunting for the three chips they set.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Button, Chip, ChipRail, Text } from '@/shared/ui';
import type { Locale } from '@/core/config/app';
import {
  BANGLADESH_DIVISIONS,
  DIVISION_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  WORKPLACE_TYPES,
  WORKPLACE_TYPE_LABELS,
  type Division,
  type EmploymentType,
  type ExperienceLevel,
  type WorkplaceType,
} from '@/core/config/opportunities';

/** The active filter set. */
export interface JobFilterState {
  readonly employmentType: EmploymentType | null;
  readonly workplaceType: WorkplaceType | null;
  readonly division: Division | null;
  readonly experienceLevel: ExperienceLevel | null;
}

/** An empty filter set. */
export const NO_JOB_FILTERS: JobFilterState = {
  employmentType: null,
  workplaceType: null,
  division: null,
  experienceLevel: null,
};

/** Props for the job filters. */
export interface JobFiltersProps {
  readonly value: JobFilterState;
  readonly onChange: (next: JobFilterState) => void;
  readonly locale: Locale;
  readonly resultCount: number;
}

/**
 * Renders the job filters.
 * @param props component props
 * @returns the filters element
 */
export function JobFilters({
  value,
  onChange,
  locale,
  resultCount,
}: JobFiltersProps): React.ReactElement {
  const { t } = useTranslation('jobs');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';
  const activeCount = [
    value.employmentType,
    value.workplaceType,
    value.division,
    value.experienceLevel,
  ].filter((entry) => entry !== null).length;

  return (
    <section className="bsdc-jobFilters" aria-label={t('filters.label')}>
      <ChipRail label={t('filters.type')}>
        {EMPLOYMENT_TYPES.map((entry) => (
          <Chip
            key={entry}
            selected={value.employmentType === entry}
            onToggle={() =>
              onChange({ ...value, employmentType: value.employmentType === entry ? null : entry })
            }
          >
            {EMPLOYMENT_TYPE_LABELS[entry][bn ? 'bn' : 'en']}
          </Chip>
        ))}
      </ChipRail>
      <ChipRail label={t('filters.workplace')}>
        {WORKPLACE_TYPES.map((entry) => (
          <Chip
            key={entry}
            selected={value.workplaceType === entry}
            onToggle={() =>
              onChange({ ...value, workplaceType: value.workplaceType === entry ? null : entry })
            }
          >
            {WORKPLACE_TYPE_LABELS[entry][bn ? 'bn' : 'en']}
          </Chip>
        ))}
      </ChipRail>
      <ChipRail label={t('filters.experience')}>
        {EXPERIENCE_LEVELS.map((entry) => (
          <Chip
            key={entry}
            selected={value.experienceLevel === entry}
            onToggle={() =>
              onChange({
                ...value,
                experienceLevel: value.experienceLevel === entry ? null : entry,
              })
            }
          >
            {EXPERIENCE_LEVEL_LABELS[entry][bn ? 'bn' : 'en']}
          </Chip>
        ))}
      </ChipRail>
      <ChipRail label={t('filters.division')}>
        {BANGLADESH_DIVISIONS.map((entry) => (
          <Chip
            key={entry}
            selected={value.division === entry}
            onToggle={() =>
              onChange({ ...value, division: value.division === entry ? null : entry })
            }
          >
            {DIVISION_LABELS[entry][bn ? 'bn' : 'en']}
          </Chip>
        ))}
      </ChipRail>
      <div className="bsdc-jobFilters__summary">
        <Text as="p" size="sm" tone="muted" lang={lang}>
          {t('filters.results', { count: resultCount })}
        </Text>
        {activeCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(NO_JOB_FILTERS)}>
            {t('filters.clear', { count: activeCount })}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
