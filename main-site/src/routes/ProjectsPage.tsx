import { Github, Rocket, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MediaImage } from '@/components/media/MediaImage';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  LinkButton,
  PageSkeleton,
  SectionHeading,
  SelectField,
  Switch,
  TextField,
} from '@/design-system';
import { useProjects } from '@/hooks/use-opportunities';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { cloudinaryWide } from '@/lib/storage/upload';
import { filterProjects } from '@/lib/opportunities/project-filters';
import { projectPath, ROUTES } from '@/lib/site';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

/** A searchable, cover-led directory of what the community is building. */
export default function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const showcase = useProjects();
  const [search, setSearch] = useState('');
  const [contributorsOnly, setContributorsOnly] = useState(false);
  const projects = useMemo(
    () => filterProjects(showcase.projects, search, contributorsOnly),
    [showcase.projects, search, contributorsOnly],
  );

  return (
    <>
      <Seo
        title={t('projects.metaTitle')}
        description={t('projects.metaDescription')}
        path={ROUTES.projects}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading
          title={t('projects.title')}
          description={t('projects.description')}
          action={
            <LinkButton
              to={`${ROUTES.create}?kind=project`}
              variant="outline"
              size="sm"
              iconStart={<Rocket size={14} />}
            >
              {t('create.submit.project')}
            </LinkButton>
          }
        />

        <div className="mt-5 grid gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <TextField
            label={t('projects.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            iconStart={<Search size={16} />}
            type="search"
          />
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <SelectField
              label={t('projects.sortLabel')}
              value={showcase.sort}
              onChange={(event) =>
                showcase.setSort(event.target.value === 'recent' ? 'recent' : 'popular')
              }
              options={[
                { value: 'popular', label: t('projects.sortPopular') },
                { value: 'recent', label: t('projects.sortRecent') },
              ]}
            />
            <Switch
              checked={contributorsOnly}
              onCheckedChange={setContributorsOnly}
              label={t('projects.contributorsOnly')}
              className="rounded-xl px-1 py-2"
            />
          </div>
        </div>

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
              action={
                <LinkButton to={`${ROUTES.create}?kind=project`} variant="primary" size="sm">
                  {t('create.submit.project')}
                </LinkButton>
              }
            />
          </div>
        ) : null}

        {!showcase.isLoading &&
        !showcase.isError &&
        showcase.projects.length > 0 &&
        projects.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Search size={22} />}
              title={t('projects.noMatchesTitle')}
              description={t('projects.noMatchesBody')}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setContributorsOnly(false);
                  }}
                >
                  {t('projects.clearFilters')}
                </Button>
              }
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card as="li" padded={false} key={project.id} className="overflow-hidden">
              <Link
                to={projectPath(project.slug)}
                className="group relative block aspect-[16/8] overflow-hidden bg-gradient-to-br from-green-950 to-green-700"
                aria-label={project.name}
              >
                {project.coverUrl.length > 0 ? (
                  <MediaImage
                    src={cloudinaryWide(project.coverUrl, 960)}
                    fallbackSrc={project.coverUrl}
                    alt={project.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 ease-app group-hover:scale-[1.02]"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-white/90">
                    <Rocket size={32} aria-hidden="true" />
                  </span>
                )}
              </Link>

              <div className="grid gap-3 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link to={projectPath(project.slug)} className="hover:underline">
                      <h2 className="fab-truncate text-lg font-semibold">{project.name}</h2>
                    </Link>
                    {project.tagline.length > 0 ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{project.tagline}</p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!isSignedIn}
                    aria-pressed={project.starred}
                    aria-label={t(project.starred ? 'projects.unstar' : 'projects.star')}
                    onClick={() => showcase.star(project.id)}
                  >
                    <Star
                      size={14}
                      aria-hidden="true"
                      className={cn(project.starred && 'fill-current text-green-700')}
                    />
                    <span>{formatNumber(project.stars, language)}</span>
                  </Button>
                </div>

                <p className="line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-muted">
                  {project.description}
                </p>

                {project.tech.length > 0 ? (
                  <ul
                    className="flex flex-wrap gap-1.5"
                    aria-label={t('projects.technologyHeading')}
                  >
                    {project.tech.slice(0, 5).map((item) => (
                      <li key={item}>
                        <Badge tone="neutral">{item}</Badge>
                      </li>
                    ))}
                    {project.tech.length > 5 ? (
                      <li>
                        <Badge tone="neutral">+{project.tech.length - 5}</Badge>
                      </li>
                    ) : null}
                  </ul>
                ) : null}

                <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                  {project.lookingForContributors ? (
                    <Badge tone="green">{t('projects.wantsContributors')}</Badge>
                  ) : null}
                  {project.repoUrl.length > 0 ? (
                    <ExternalLink href={project.repoUrl} userGenerated>
                      <Github size={13} aria-hidden="true" />
                      {t('projects.repository')}
                    </ExternalLink>
                  ) : null}
                  {project.license.length > 0 ? (
                    <Badge tone="neutral">{project.license}</Badge>
                  ) : null}
                </div>

                <LinkButton to={projectPath(project.slug)} variant="secondary" size="sm" block>
                  {t('projects.openProject')}
                </LinkButton>
              </div>
            </Card>
          ))}
        </ul>
      </div>
    </>
  );
}
