/**
 * BSDC — src/features/projects/ProjectList.tsx
 * Purpose : The project directory, filtered by status and by whether help is wanted.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : "Looking for collaborators" is the default view, because the directory exists to connect
 *   people who are building with people who want to build, not to be a hall of finished things.
 *   Everything else is one chip away, and the count line always says how many projects are being
 *   hidden so nobody concludes the community stopped shipping.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Chip, ChipRail, EmptyState, Text, VirtualList } from '@/shared/ui';
import { FEED_BUDGETS } from '@/core/config/limits';
import type { Locale } from '@/core/config/app';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '@/core/config/opportunities';
import { isRecruiting, sortProjects, type Project } from '@/entities/project/model';
import { ProjectCard } from './ProjectCard';

/** Props for the project list. */
export interface ProjectListProps {
  readonly projects: readonly Project[];
  readonly locale: Locale;
  readonly activeStatus: ProjectStatus | null;
  readonly recruitingOnly: boolean;
  readonly onStatusChange: (status: ProjectStatus | null) => void;
  readonly onRecruitingChange: (recruitingOnly: boolean) => void;
  readonly onOpen: (project: Project) => void;
  readonly height?: (number | string) | undefined;
}

/**
 * Renders the project directory.
 * @param props component props
 * @returns the list element
 */
export function ProjectList({
  projects,
  locale,
  activeStatus,
  recruitingOnly,
  onStatusChange,
  onRecruitingChange,
  onOpen,
  height = 720,
}: ProjectListProps): React.ReactElement {
  const { t } = useTranslation('projects');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';

  const filtered = projects.filter(
    (project) =>
      (activeStatus === null || project.status === activeStatus) &&
      (!recruitingOnly || isRecruiting(project)),
  );
  const ordered = sortProjects(filtered);

  if (ordered.length === 0) {
    return (
      <EmptyState
        illustration="empty-state"
        title={t('list.empty.title')}
        description={t('list.empty.description')}
        lang={lang}
      />
    );
  }

  return (
    <div className="bsdc-projectList">
      <ChipRail label={t('list.filterLabel')}>
        <Chip selected={activeStatus === null} onToggle={() => onStatusChange(null)}>
          {t('list.all')}
        </Chip>
        {PROJECT_STATUSES.map((status) => (
          <Chip
            key={status}
            selected={activeStatus === status}
            onToggle={() => onStatusChange(activeStatus === status ? null : status)}
          >
            {PROJECT_STATUS_LABELS[status][bn ? 'bn' : 'en']}
          </Chip>
        ))}
        <Chip selected={recruitingOnly} onToggle={() => onRecruitingChange(!recruitingOnly)}>
          {t('list.recruitingOnly')}
        </Chip>
      </ChipRail>

      <Text as="p" size="sm" tone="muted" lang={lang}>
        {t('list.count', { shown: ordered.length, total: projects.length })}
      </Text>

      {ordered.length > FEED_BUDGETS.virtualizationThreshold ? (
        <VirtualList
          items={ordered}
          itemHeight={172}
          height={height}
          label={t('list.label')}
          renderItem={(project) => (
            <ProjectCard project={project} locale={locale} onOpen={onOpen} />
          )}
        />
      ) : (
        <ul className="bsdc-projectList__grid">
          {ordered.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} locale={locale} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
