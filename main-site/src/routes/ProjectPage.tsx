import {
  ArrowLeft,
  CalendarDays,
  Github,
  Globe2,
  Pencil,
  Rocket,
  Star,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MediaImage } from '@/components/media/MediaImage';
import { MediaGallery } from '@/components/media/MediaGallery';
import { toGalleryItems } from '@/lib/media/gallery-items';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  LinkButton,
  Modal,
  PageSkeleton,
} from '@/design-system';
import { useProject, useProjectOwnerActions } from '@/hooks/use-opportunities';
import { formatAbsoluteDate, formatNumber } from '@/lib/format';
import { cloudinaryWide } from '@/lib/storage/upload';
import { profilePath, projectEditPath, projectPath, ROUTES, SITE } from '@/lib/site';
import { isConfigured } from '@/lib/env';
import { useAuthStore, selectIsSignedIn } from '@/store/auth-store';

/** Public permalink for one project, independent of the directory's page size. */
export default function ProjectPage() {
  const { t, i18n } = useTranslation();
  const { slug: rawSlug = '' } = useParams();
  const slug = rawSlug.trim().toLowerCase();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const detail = useProject(slug);
  const navigate = useNavigate();
  const ownerActions = useProjectOwnerActions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function takeDown(projectId: string) {
    try {
      await ownerActions.remove(projectId);
      setConfirmingDelete(false);
      toast.success(t('projects.deleted'));
      navigate(ROUTES.projects);
    } catch {
      // Ownership is enforced by the database, so a refusal means this project
      // is not the caller's or is already gone. Either way the member is told
      // plainly and the page is re-read rather than left showing a project that
      // is no longer theirs.
      setConfirmingDelete(false);
      toast.error(t('projects.errors.notYours'));
      void detail.refetch();
    }
  }

  if (!isConfigured.supabase) {
    return (
      <div className="fab-container py-10">
        <Alert tone="danger" title={t('data.errors.notConfigured')} />
      </div>
    );
  }

  if (detail.isLoading) return <PageSkeleton label={t('common.loading')} />;

  if (detail.isError) {
    return (
      <div className="fab-container py-10">
        <Alert tone="danger" title={t('projects.failed')} />
      </div>
    );
  }

  const project = detail.project;
  if (!project) {
    return (
      <div className="fab-container py-10">
        <EmptyState
          icon={<Rocket size={30} />}
          title={t('projects.notFoundTitle')}
          description={t('projects.notFoundBody')}
          action={
            <LinkButton to={ROUTES.projects} variant="secondary" size="sm">
              {t('projects.backToDirectory')}
            </LinkButton>
          }
        />
      </div>
    );
  }

  const description = project.tagline || project.description;
  const path = projectPath(project.slug);

  return (
    <>
      <Seo
        title={`${project.name} — ${t('projects.metaTitle')}`}
        description={description}
        path={path}
        type="website"
        {...(project.coverUrl.length > 0 ? { image: project.coverUrl } : {})}
        jsonLd={[
          {
            '@type': 'SoftwareSourceCode',
            name: project.name,
            description: project.description,
            url: `${SITE.url}${path}`,
            ...(project.repoUrl.length > 0 ? { codeRepository: project.repoUrl } : {}),
            ...(project.tech.length > 0 ? { programmingLanguage: project.tech } : {}),
            ...(project.license.length > 0 ? { license: project.license } : {}),
          },
        ]}
      />

      <article className="fab-container py-5 sm:py-8">
        <div className="mx-auto grid w-full max-w-4xl gap-4">
          <LinkButton
            to={ROUTES.projects}
            variant="ghost"
            size="sm"
            iconStart={<ArrowLeft size={16} />}
            className="w-fit"
          >
            {t('projects.backToDirectory')}
          </LinkButton>

          <Card padded={false} className="overflow-hidden">
            <div className="relative aspect-[16/7] w-full bg-gradient-to-br from-green-950 to-green-700">
              {project.coverUrl.length > 0 ? (
                <MediaImage
                  src={cloudinaryWide(project.coverUrl, 1440)}
                  fallbackSrc={project.coverUrl}
                  alt={project.name}
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-white/90">
                  <Rocket size={42} aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="grid gap-5 p-4 sm:p-6">
              <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="break-words text-2xl font-bold sm:text-3xl">{project.name}</h1>
                    {project.lookingForContributors ? (
                      <Badge tone="green">{t('projects.wantsContributors')}</Badge>
                    ) : null}
                  </div>
                  {project.tagline.length > 0 ? (
                    <p className="mt-2 text-base leading-6 text-muted">{project.tagline}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    variant={project.starred ? 'secondary' : 'outline'}
                    size="md"
                    disabled={!isSignedIn || detail.isStarring}
                    aria-pressed={project.starred}
                    aria-label={t(project.starred ? 'projects.unstar' : 'projects.star')}
                    iconStart={
                      <Star
                        size={16}
                        aria-hidden="true"
                        className={project.starred ? 'fill-current text-green-700' : undefined}
                      />
                    }
                    onClick={detail.star}
                  >
                    {formatNumber(project.stars, language)}
                  </Button>

                  {/* Offered only to the owner. The database refuses anybody
                      else regardless; not showing the control means a stranger
                      is never invited to press something that will fail. */}
                  {project.isOwner ? (
                    <>
                      <LinkButton
                        to={projectEditPath(project.slug)}
                        variant="outline"
                        size="md"
                        iconStart={<Pencil size={16} />}
                      >
                        {t('projects.edit')}
                      </LinkButton>
                      <Button
                        variant="ghost"
                        size="md"
                        iconStart={<Trash2 size={16} />}
                        onClick={() => {
                          setConfirmingDelete(true);
                        }}
                      >
                        {t('projects.delete')}
                      </Button>
                    </>
                  ) : null}
                </div>
              </header>

              {project.owner ? (
                <div className="flex items-center gap-3 border-y border-border py-3">
                  {project.owner.username ? (
                    <Link to={profilePath(project.owner.username)} className="shrink-0">
                      <Avatar
                        src={project.owner.avatarUrl}
                        name={project.owner.displayName}
                        size="md"
                      />
                    </Link>
                  ) : (
                    <Avatar
                      src={project.owner.avatarUrl}
                      name={project.owner.displayName}
                      size="md"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-muted">{t('projects.owner')}</p>
                    {project.owner.username ? (
                      <Link
                        to={profilePath(project.owner.username)}
                        className="fab-truncate block font-semibold hover:underline"
                      >
                        {project.owner.displayName}
                      </Link>
                    ) : (
                      <p className="fab-truncate font-semibold">{project.owner.displayName}</p>
                    )}
                  </div>
                </div>
              ) : null}

              <section aria-labelledby="project-about">
                <h2 id="project-about" className="text-lg font-semibold">
                  {t('projects.descriptionHeading')}
                </h2>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-text">
                  {project.description}
                </p>
              </section>

              {project.screenshots.length > 0 ? (
                <section aria-labelledby="project-screenshots">
                  <h2 id="project-screenshots" className="text-lg font-semibold">
                    {t('projects.screenshotsHeading')}
                  </h2>
                  {/* The same gallery a post uses, so a project's pictures get
                      the same arrangement, the same lightbox and the same
                      accessible failure state when one cannot be fetched. */}
                  <MediaGallery
                    items={toGalleryItems(project.screenshots)}
                    label={t('projects.screenshotsHeading')}
                    className="mt-3"
                  />
                </section>
              ) : null}

              {project.tech.length > 0 ? (
                <section aria-labelledby="project-tech">
                  <h2 id="project-tech" className="text-sm font-semibold text-muted">
                    {t('projects.technologyHeading')}
                  </h2>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {project.tech.map((technology) => (
                      <li key={technology}>
                        <Badge tone="neutral">{technology}</Badge>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {project.repoUrl.length > 0 ? (
                  <ExternalLink
                    href={project.repoUrl}
                    userGenerated
                    className="rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white no-underline hover:bg-green-600"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Github size={14} aria-hidden="true" />
                      {t('projects.repository')}
                    </span>
                  </ExternalLink>
                ) : null}
                {project.demoUrl.length > 0 ? (
                  <ExternalLink
                    href={project.demoUrl}
                    userGenerated
                    className="rounded-lg border border-border px-3 py-2 text-xs font-semibold no-underline hover:bg-surface-2"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Globe2 size={14} aria-hidden="true" />
                      {t('projects.demo')}
                    </span>
                  </ExternalLink>
                ) : null}
                {project.license.length > 0 ? (
                  <Badge tone="neutral">{project.license}</Badge>
                ) : null}
              </div>

              {project.lookingForContributors && project.repoUrl.length > 0 ? (
                <aside className="rounded-xl border border-green-700/20 bg-green-700/5 p-4">
                  <div className="flex items-start gap-3">
                    <UsersRound
                      size={18}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-green-700"
                    />
                    <div>
                      <h2 className="font-semibold">{t('projects.contributionHeading')}</h2>
                      <p className="mt-1 text-sm text-muted">{t('projects.contributionBody')}</p>
                      <div className="mt-3">
                        <ExternalLink href={project.repoUrl} userGenerated>
                          {t('projects.viewContributionGuide')}
                        </ExternalLink>
                      </div>
                    </div>
                  </div>
                </aside>
              ) : null}

              <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} aria-hidden="true" />
                  {t('projects.published')}:{' '}
                  {formatAbsoluteDate(new Date(project.createdAt), language)}
                </span>
                {project.updatedAt !== project.createdAt ? (
                  <span>
                    {t('projects.updated')}:{' '}
                    {formatAbsoluteDate(new Date(project.updatedAt), language)}
                  </span>
                ) : null}
              </footer>
            </div>
          </Card>
        </div>
      </article>

      <Modal
        open={confirmingDelete}
        onClose={() => {
          setConfirmingDelete(false);
        }}
        title={t('projects.deleteTitle')}
        closeLabel={t('common.close')}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmingDelete(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={ownerActions.isRemoving}
              onClick={() => {
                void takeDown(project.id);
              }}
            >
              {t('projects.deleteConfirm')}
            </Button>
          </div>
        }
      >
        <p className="text-sm">{t('projects.deleteBody')}</p>
      </Modal>
    </>
  );
}
