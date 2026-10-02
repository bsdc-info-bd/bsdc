import { Github, Rocket, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ExternalLink,
  PageSkeleton,
  SectionHeading,
} from '@/design-system';
import { useProjects } from '@/hooks/use-opportunities';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** Project showcase: what the community is building, and who needs help. */
export default function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const showcase = useProjects();

  return (
    <>
      <Seo
        title={t('projects.metaTitle')}
        description={t('projects.metaDescription')}
        path={ROUTES.projects}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('projects.title')} description={t('projects.description')} />

        {showcase.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {showcase.isError ? (
          <Alert tone="danger" title={t('projects.failed')} className="mt-4" />
        ) : null}

        {!showcase.isLoading && !showcase.isError && showcase.projects.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Rocket size={22} />}
              title={t('projects.emptyTitle')}
              description={t('projects.emptyBody')}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {showcase.projects.map((project) => (
            <Card as="li" key={project.id}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="fab-truncate text-lg font-semibold">{project.name}</h2>
                  {project.tagline.length > 0 ? (
                    <p className="mt-1 text-sm text-muted">{project.tagline}</p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!isSignedIn}
                  aria-pressed={project.starred}
                  onClick={() => {
                    showcase.star(project.id);
                  }}
                >
                  <Star
                    size={14}
                    className={cn(project.starred && 'fill-current text-green-700')}
                  />
                  <span>{formatNumber(project.stars, language)}</span>
                  <span className="fab-sr-only">{t('projects.star')}</span>
                </Button>
              </div>

              {project.tech.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1">
                  {project.tech.slice(0, 6).map((item) => (
                    <li key={item}>
                      <Chip>{item}</Chip>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                {project.repoUrl.length > 0 ? (
                  <ExternalLink href={project.repoUrl}>
                    <Github size={13} aria-hidden="true" />
                    {t('projects.repository')}
                  </ExternalLink>
                ) : null}
                {project.demoUrl.length > 0 ? (
                  <ExternalLink href={project.demoUrl}>{t('projects.demo')}</ExternalLink>
                ) : null}
                {project.license.length > 0 ? (
                  <Badge tone="neutral">{project.license}</Badge>
                ) : null}
                {project.lookingForContributors ? (
                  <Badge tone="green">{t('projects.wantsContributors')}</Badge>
                ) : null}
              </div>
            </Card>
          ))}
        </ul>
      </div>
    </>
  );
}
