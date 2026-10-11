import { ArrowLeft, ArrowRight, FolderGit2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ProjectWizard } from '@/components/projects/ProjectWizard';
import { useAttachments } from '@/components/media/use-attachments';
import { useCoverUpload } from '@/components/media/use-cover-upload';
import { Seo } from '@/components/seo/Seo';
import { Alert, Button, Card, EmptyState, LinkButton, PageSkeleton } from '@/design-system';
import {
  EMPTY_PROJECT,
  PROJECT_LAST_STEP,
  PROJECT_SCREENSHOT_MAX,
  validateProjectDraft,
  validateProjectDraftStep,
  type CreateIssue,
  type ProjectDraftInput,
  type ProjectStep,
} from '@/lib/create/create-types';
import { isConfigured } from '@/lib/env';
import { useProject, useProjectOwnerActions } from '@/hooks/use-opportunities';
import { projectPath, ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { MediaError } from '@/lib/storage/upload';
import { useAuthStore } from '@/store/auth-store';

/**
 * The owner's editor for one published project.
 *
 * Publishing a project used to be the end of the conversation: the database had
 * allowed an owner update since migration 0014 and no screen anywhere offered
 * one, so a typo in a repository URL, a dead demo link or a cover the author
 * regretted could only be fixed by publishing a second project and hoping
 * nobody noticed the first. This page is the same five-step flow that published
 * it, opened on what is already there.
 *
 * Ownership is decided by the database, twice. The read carries `isOwner`, so a
 * stranger arriving from a shared link is told plainly rather than shown a form
 * that would refuse them on submit; and the write itself is guarded by the
 * row-level policy, which is the check that actually counts. A project that is
 * not the caller's cannot be changed by this page even if the page were
 * persuaded to try.
 */
export default function ProjectEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const slug = (params['slug'] ?? '').trim().toLowerCase();
  const uid = useAuthStore((state) => state.user?.uid ?? null);

  const detail = useProject(slug);
  const project = detail.project;
  const actions = useProjectOwnerActions();

  const [step, setStep] = useState<ProjectStep>(0);
  const [draft, setDraft] = useState<ProjectDraftInput>(EMPTY_PROJECT);
  const [issues, setIssues] = useState<CreateIssue[]>([]);
  const cover = useCoverUpload('project-cover');
  /** The project already poured into the form, so a refetch does not overwrite it. */
  const [loadedId, setLoadedId] = useState('');

  const screenshots = useAttachments({
    purpose: 'project-image',
    uid,
    max: PROJECT_SCREENSHOT_MAX,
  });
  const seedScreenshots = screenshots.seed;

  // Fill the form once, from the row that was read. Without the id guard a
  // background refetch — a star from another tab, a window focus — would throw
  // away whatever the member had been typing.
  useEffect(() => {
    if (!project || !project.isOwner || loadedId === project.id) return;
    setLoadedId(project.id);
    setDraft({
      name: project.name,
      tagline: project.tagline,
      description: project.description,
      repoUrl: project.repoUrl,
      demoUrl: project.demoUrl,
      coverUrl: project.coverUrl,
      tech: project.tech,
      license: project.license,
      lookingForContributors: project.lookingForContributors,
    });
    // The pictures already on the project are seeded as attached, so saving
    // keeps them. A gallery written from an empty queue would have deleted
    // every screenshot the author was not re-adding.
    seedScreenshots(
      project.screenshots.map((shot) => ({
        mediaId: shot.mediaId,
        url: shot.url,
        thumbUrl: shot.thumbUrl,
        altText: shot.altText,
        position: shot.position,
        width: shot.width,
        height: shot.height,
      })),
    );
  }, [project, loadedId, seedScreenshots]);

  /**
   * The picture on screen is the one just chosen while there is one, and the
   * cover that is already published while there is not — from the draft rather
   * than the row, so removing a published cover takes it off the screen at once
   * instead of leaving up a picture the save is not going to keep.
   */
  const coverPreview = cover.previewUrl.length > 0 ? cover.previewUrl : draft.coverUrl;

  function nextStep() {
    const found = validateProjectDraftStep(draft, step);
    setIssues(found);
    if (found.length > 0) {
      const first = found[0];
      if (first) toast.error(t(first.messageKey));
      return;
    }
    setStep((current) => Math.min(current + 1, PROJECT_LAST_STEP) as ProjectStep);
  }

  async function save() {
    const found = validateProjectDraft(draft);
    setIssues(found);
    if (found.length > 0) {
      const first = found[0];
      if (first) toast.error(t(first.messageKey));
      return;
    }
    if (!project || !project.isOwner) return;

    const ownerUid = uid ?? '';

    try {
      // Uploaded once and kept, so a retry after a database hiccup does not send
      // the same cover a second time. Null when the author changed nothing, and
      // the draft's own cover is what the save writes then.
      const uploaded = ownerUid.length > 0 ? await cover.ensureUploaded(ownerUid) : null;
      const coverUrl = uploaded ?? draft.coverUrl;

      // Read at save time, not from a trailing effect: the same ordering bug
      // that once published a post without its picture.
      const gallery = screenshots.ready.map((shot) => ({
        mediaId: shot.mediaId,
        altText: shot.altText,
      }));

      const savedSlug = await actions.save(project.id, { ...draft, coverUrl }, gallery);
      toast.success(t('projects.saved'));
      cover.reset();
      navigate(projectPath(savedSlug.length > 0 ? savedSlug : project.slug));
    } catch (error) {
      const key =
        error instanceof MediaError
          ? error.messageKey
          : error instanceof Error && error.message.startsWith('media.')
            ? error.message
            : error instanceof Error && error.message.startsWith('projects.')
              ? error.message
              : dataErrorKey(error);
      toast.error(t(key));
    }
  }

  function errorFor(field: string): string | undefined {
    const hit = issues.find((issue) => issue.field === field);
    return hit === undefined ? undefined : t(hit.messageKey);
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

  if (!project) {
    return (
      <div className="fab-container py-10">
        <EmptyState
          icon={<FolderGit2 size={30} />}
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

  if (!project.isOwner) {
    return (
      <div className="fab-container py-10">
        <Alert tone="warning" title={t('projects.errors.notYours')}>
          <div className="mt-3">
            <LinkButton to={projectPath(project.slug)} variant="secondary" size="sm">
              {t('projects.backToProject')}
            </LinkButton>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <Seo
        title={`${t('projects.editTitle')} — ${project.name}`}
        description={t('projects.editDescription')}
        path={`/projects/${project.slug}/edit`}
        type="website"
        noindex
      />

      <div className="fab-container py-5 sm:py-8">
        <div className="mx-auto w-full max-w-3xl">
          <LinkButton
            to={projectPath(project.slug)}
            variant="ghost"
            size="sm"
            iconStart={<ArrowLeft size={16} />}
            className="mb-3 w-fit"
          >
            {t('projects.backToProject')}
          </LinkButton>

          <h1 className="text-2xl font-bold sm:text-3xl">{t('projects.editTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('projects.editDescription')}</p>

          <Card className="mt-4">
            <ProjectWizard
              value={draft}
              onChange={setDraft}
              step={step}
              coverFile={cover.file}
              coverPreviewUrl={coverPreview}
              coverUploadProgress={cover.progress}
              onCoverFileChange={(file) => cover.choose(file)}
              onCoverRemoveExisting={() => setDraft((current) => ({ ...current, coverUrl: '' }))}
              errorFor={errorFor}
              screenshots={screenshots}
            />
          </Card>

          <Card className="mt-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">{project.name}</p>
              <div className="flex flex-wrap items-center gap-2">
                {step > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={actions.isSaving}
                    iconStart={<ArrowLeft size={16} />}
                    onClick={() => setStep((current) => Math.max(current - 1, 0) as ProjectStep)}
                  >
                    {t('create.projectSteps.previous')}
                  </Button>
                ) : null}
                {step < PROJECT_LAST_STEP ? (
                  <Button
                    type="button"
                    disabled={screenshots.busy}
                    iconEnd={<ArrowRight size={16} />}
                    onClick={nextStep}
                  >
                    {t('create.projectSteps.next')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    loading={actions.isSaving}
                    // A picture still uploading is a picture this save would
                    // drop, and dropping a screenshot on an edit deletes one the
                    // project already had.
                    disabled={screenshots.busy}
                    iconStart={<FolderGit2 size={16} />}
                    onClick={() => void save()}
                  >
                    {t('projects.saveChanges')}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
