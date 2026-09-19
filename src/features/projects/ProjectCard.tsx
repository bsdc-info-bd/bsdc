/**
 * BSDC — src/features/projects/ProjectCard.tsx
 * Purpose : One project: what it is, what it is built with, and whether it wants help.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A project that is recruiting says so on the card and names the open roles, because
 *   "we need help" without saying what kind is how a builder ends up with four designers and no
 *   back end. `shipped` is a state a person claims rather than a badge the platform hands out, and
 *   the card never inflates a project into something it is not.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useTranslation } from 'react-i18next';
import { Badge, Card, Icon, Text } from '@/shared/ui';
import { PROJECT_STATUS_LABELS } from '@/core/config/opportunities';
import type { Locale } from '@/core/config/app';
import { isRecruiting, openRoleCount, type Project } from '@/entities/project/model';

/** Props for the project card. */
export interface ProjectCardProps {
  readonly project: Project;
  readonly locale: Locale;
  readonly onOpen: (project: Project) => void;
}

/**
 * Renders a project card.
 * @param props component props
 * @returns the card element
 */
export function ProjectCard({ project, locale, onOpen }: ProjectCardProps): React.ReactElement {
  const { t } = useTranslation('projects');
  const lang = locale === 'bn' ? 'bn' : 'en';
  const bn = locale === 'bn';
  const recruiting = isRecruiting(project);
  const openRoles = openRoleCount(project);

  return (
    <Card as="article" className="bsdc-projectCard" onPress={() => onOpen(project)}>
      <div className="bsdc-projectCard__head">
        <h3 className="bsdc-projectCard__title" lang={lang}>
          {project.title}
        </h3>
        <Badge tone={project.status === 'shipped' ? 'success' : 'neutral'} variant="outline">
          {PROJECT_STATUS_LABELS[project.status][bn ? 'bn' : 'en']}
        </Badge>
      </div>
      <Text as="p" size="sm" lang={lang} className="bsdc-projectCard__summary">
        {project.summary}
      </Text>
      {project.stack.length > 0 ? (
        <ul className="bsdc-projectCard__stack">
          {project.stack.slice(0, 5).map((entry) => (
            <li key={entry}>
              <Badge tone="brand" variant="outline">
                {entry}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="bsdc-projectCard__foot">
        {recruiting ? (
          <span className="bsdc-projectCard__recruiting" lang={lang}>
            <Icon name="users" size={14} />
            {t('card.recruiting', { count: openRoles })}
          </span>
        ) : (
          <Text as="span" size="sm" tone="muted" lang={lang}>
            {t('card.notRecruiting')}
          </Text>
        )}
        <span className="bsdc-projectCard__links">
          {project.repoUrl.length > 0 ? (
            <a href={project.repoUrl} target="_blank" rel="noopener noreferrer nofollow">
              <Icon name="code" size={14} label={t('card.repo')} />
            </a>
          ) : null}
          {project.demoUrl.length > 0 ? (
            <a href={project.demoUrl} target="_blank" rel="noopener noreferrer nofollow">
              <Icon name="externalLink" size={14} label={t('card.demo')} />
            </a>
          ) : null}
        </span>
      </div>
    </Card>
  );
}
