import { Github, ImagePlus, Images, Rocket, Upload, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  ExternalLink,
  ProgressBar,
  Stepper,
  Switch,
  TagInput,
  TextField,
  TextareaField,
} from '@/design-system';
import {
  CREATE_LIMITS,
  PROJECT_SCREENSHOT_MAX,
  type ProjectDraftInput,
  type ProjectStep,
} from '@/lib/create/create-types';
import { MediaImage } from '@/components/media/MediaImage';
import { ImageEditorDialog } from '@/components/media/ImageEditorDialog';
import { MediaTray } from '@/components/media/MediaTray';
import { MediaGallery } from '@/components/media/MediaGallery';
import type { Attachment, AttachmentsController } from '@/components/media/use-attachments';

export interface ProjectWizardProps {
  value: ProjectDraftInput;
  onChange: (next: ProjectDraftInput) => void;
  step: ProjectStep;
  coverFile: File | null;
  coverPreviewUrl: string;
  coverUploadProgress: number | null;
  onCoverFileChange: (file: File | null) => void;
  errorFor: (field: string) => string | undefined;
  /**
   * The gallery queue. It is owned by the page, not by this component, because
   * the uploads have to survive a step change: a member who adds eight pictures
   * and then steps back to fix the tagline must not find the queue empty when
   * they return, and the publish handler has to read the finished list from the
   * same controller the queue was filling.
   */
  screenshots: AttachmentsController;
}

/** The project composer is a five-step, reviewable publishing flow. */
export function ProjectWizard({
  value,
  onChange,
  step,
  coverFile,
  coverPreviewUrl,
  coverUploadProgress,
  onCoverFileChange,
  errorFor,
  screenshots,
}: ProjectWizardProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const shotsInputRef = useRef<HTMLInputElement>(null);
  const [editingShot, setEditingShot] = useState<Attachment | null>(null);
  const set = (patch: Partial<ProjectDraftInput>) => onChange({ ...value, ...patch });
  const steps = [
    t('create.projectSteps.basics'),
    t('create.projectSteps.build'),
    t('create.projectSteps.cover'),
    t('create.projectSteps.screenshots'),
    t('create.projectSteps.review'),
  ];

  const shotItems = screenshots.ready.map((shot) => ({
    id: shot.id,
    url: shot.url,
    thumbUrl: shot.thumbUrl.length > 0 ? shot.thumbUrl : shot.url,
    altText: shot.altText,
    width: shot.width,
    height: shot.height,
  }));

  return (
    <div className="grid gap-5">
      <Stepper
        steps={steps}
        current={step}
        label={t('create.projectSteps.label')}
        className="rounded-xl bg-surface-2/60 px-3 py-3"
      />

      {step === 0 ? (
        <section aria-labelledby="project-step-basics" className="grid gap-4 sm:grid-cols-2">
          <h2 id="project-step-basics" className="fab-sr-only">
            {t('create.projectSteps.basics')}
          </h2>
          <TextField
            label={t('create.fields.name')}
            value={value.name}
            maxLength={CREATE_LIMITS.projectNameMax}
            error={errorFor('name')}
            onChange={(event) => set({ name: event.target.value })}
          />
          <TextField
            label={t('create.fields.tagline')}
            value={value.tagline}
            maxLength={CREATE_LIMITS.taglineMax}
            error={errorFor('tagline')}
            onChange={(event) => set({ tagline: event.target.value })}
          />
          <TextareaField
            label={t('create.fields.description')}
            value={value.description}
            rows={7}
            counterMax={CREATE_LIMITS.descriptionMax}
            error={errorFor('description')}
            onChange={(event) => set({ description: event.target.value })}
            className="sm:col-span-2"
          />
        </section>
      ) : null}

      {step === 1 ? (
        <section aria-labelledby="project-step-build" className="grid gap-4 sm:grid-cols-2">
          <h2 id="project-step-build" className="fab-sr-only">
            {t('create.projectSteps.build')}
          </h2>
          <TextField
            label={t('create.fields.repoUrl')}
            type="url"
            value={value.repoUrl}
            error={errorFor('repoUrl')}
            onChange={(event) => set({ repoUrl: event.target.value })}
            iconStart={<Github size={16} />}
          />
          <TextField
            label={t('create.fields.demoUrl')}
            type="url"
            value={value.demoUrl}
            error={errorFor('demoUrl')}
            onChange={(event) => set({ demoUrl: event.target.value })}
          />
          <TextField
            label={t('create.fields.license')}
            value={value.license}
            hint={t('create.hints.license')}
            onChange={(event) => set({ license: event.target.value })}
          />
          <TagInput
            label={t('create.fields.tech')}
            hint={t('create.hints.skills')}
            value={value.tech}
            max={CREATE_LIMITS.skillsMax}
            onChange={(tech) => set({ tech })}
          />
          <div className="sm:col-span-2">
            <Switch
              checked={value.lookingForContributors}
              onCheckedChange={(lookingForContributors) => set({ lookingForContributors })}
              label={t('create.fields.lookingForContributors')}
              description={t('create.hints.lookingForContributors')}
            />
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-labelledby="project-step-cover" className="grid gap-4">
          <div>
            <h2 id="project-step-cover" className="text-base font-semibold">
              {t('create.projectSteps.cover')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('create.projectSteps.coverHint')}</p>
          </div>

          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            aria-label={t('create.projectSteps.chooseCover')}
            className="fab-sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = '';
              onCoverFileChange(file);
            }}
          />

          {coverPreviewUrl.length > 0 ? (
            <figure className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="relative aspect-[16/7] w-full bg-surface-2">
                <MediaImage
                  src={coverPreviewUrl}
                  alt={t('create.projectSteps.coverPreview')}
                  className="h-full w-full object-cover"
                />
              </div>
              {coverFile ? (
                <figcaption className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="fab-truncate text-sm font-medium">{coverFile.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconStart={<X size={14} />}
                    onClick={() => onCoverFileChange(null)}
                  >
                    {t('create.projectSteps.removeCover')}
                  </Button>
                </figcaption>
              ) : null}
            </figure>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="fab-tap flex min-h-48 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-2/40 px-4 text-center hover:bg-surface-2"
            >
              <ImagePlus size={28} aria-hidden="true" className="text-green-700" />
              <span className="font-semibold">{t('create.projectSteps.chooseCover')}</span>
              <span className="text-xs text-muted">{t('create.projectSteps.coverHint')}</span>
            </button>
          )}

          {coverPreviewUrl.length > 0 && coverFile ? (
            <Button
              variant="secondary"
              size="sm"
              iconStart={<Upload size={15} />}
              onClick={() => inputRef.current?.click()}
              className="w-fit"
            >
              {t('create.projectSteps.replaceCover')}
            </Button>
          ) : null}

          {coverUploadProgress !== null ? (
            <ProgressBar
              value={coverUploadProgress}
              label={t('create.projectSteps.coverUploading')}
            />
          ) : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-labelledby="project-step-screenshots" className="grid gap-4">
          <div>
            <h2 id="project-step-screenshots" className="text-base font-semibold">
              {t('create.projectSteps.screenshots')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('create.projectSteps.screenshotsHint')}</p>
          </div>

          <input
            ref={shotsInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            aria-label={t('create.projectSteps.addScreenshots')}
            className="fab-sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length > 0) screenshots.add(files);
            }}
          />

          {screenshots.attachments.length > 0 ? (
            <MediaTray
              controller={screenshots}
              onEdit={setEditingShot}
              noun={t('create.projectSteps.screenshots')}
            />
          ) : null}

          {screenshots.canAdd ? (
            <button
              type="button"
              onClick={() => shotsInputRef.current?.click()}
              className="fab-tap flex min-h-32 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-2/40 px-4 text-center hover:bg-surface-2"
            >
              <Images size={26} aria-hidden="true" className="text-green-700" />
              <span className="font-semibold">{t('create.projectSteps.addScreenshots')}</span>
              <span className="text-xs text-muted">{t('create.projectSteps.screenshotsHint')}</span>
            </button>
          ) : null}

          {screenshots.busy ? (
            <p className="text-xs text-muted" aria-live="polite">
              {t('create.projectSteps.screenshotsUploading')}
            </p>
          ) : null}

          {/* The limit is said out loud rather than discovered by a refusal. */}
          <p className="text-xs text-muted">
            {t('create.projectSteps.screenshotsRemaining', {
              count: Math.max(0, PROJECT_SCREENSHOT_MAX - screenshots.attachments.length),
            })}
          </p>
        </section>
      ) : null}

      {step === 4 ? (
        <section aria-labelledby="project-step-review" className="grid gap-4">
          <div>
            <h2 id="project-step-review" className="text-lg font-semibold">
              {t('create.projectSteps.reviewTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted">{t('create.projectSteps.reviewDescription')}</p>
          </div>

          <article className="overflow-hidden rounded-card border border-border bg-surface">
            {coverPreviewUrl.length > 0 ? (
              <div className="aspect-[16/7] w-full bg-surface-2">
                <MediaImage
                  src={coverPreviewUrl}
                  alt={t('create.projectSteps.coverPreview')}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex aspect-[16/7] items-center justify-center bg-gradient-to-br from-green-900 to-green-700 text-white">
                <Rocket size={34} aria-hidden="true" />
              </div>
            )}
            <div className="grid gap-3 p-4">
              <div>
                <h3 className="text-xl font-bold">{value.name || t('create.fields.name')}</h3>
                {value.tagline.length > 0 ? (
                  <p className="mt-1 text-sm text-muted">{value.tagline}</p>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-text">{value.description}</p>
              {value.tech.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label={t('create.fields.tech')}>
                  {value.tech.map((technology) => (
                    <li key={technology}>
                      <Badge tone="neutral">{technology}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-3 text-sm">
                {value.repoUrl.length > 0 ? (
                  <ExternalLink href={value.repoUrl} userGenerated>
                    {t('projects.repository')}
                  </ExternalLink>
                ) : (
                  <span className="text-muted">{t('create.projectSteps.noRepository')}</span>
                )}
                {value.demoUrl.length > 0 ? (
                  <ExternalLink href={value.demoUrl} userGenerated>
                    {t('projects.demo')}
                  </ExternalLink>
                ) : (
                  <span className="text-muted">{t('create.projectSteps.noDemo')}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {value.license.length > 0 ? (
                  <Badge tone="neutral">{value.license}</Badge>
                ) : (
                  <span className="text-xs text-muted">{t('create.projectSteps.noLicense')}</span>
                )}
                {value.lookingForContributors ? (
                  <Badge tone="green">{t('projects.wantsContributors')}</Badge>
                ) : null}
                {value.tech.length === 0 ? (
                  <span className="text-xs text-muted">
                    {t('create.projectSteps.noTechnology')}
                  </span>
                ) : null}
              </div>
            </div>
          </article>

          {/* The gallery as the reader will see it, not as a list of files. */}
          {shotItems.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold text-muted">
                {t('projects.screenshotsHeading')}
              </h3>
              <MediaGallery items={shotItems} label={t('create.projectSteps.screenshotsPreview')} />
            </div>
          ) : (
            <p className="text-xs text-muted">{t('create.projectSteps.noScreenshots')}</p>
          )}
        </section>
      ) : null}

      <ImageEditorDialog
        open={editingShot !== null}
        file={editingShot?.file ?? null}
        initial={editingShot?.edit ?? undefined}
        onClose={() => setEditingShot(null)}
        onApply={(edited, edit) => {
          if (editingShot !== null) screenshots.applyEdit(editingShot.id, edited, edit);
          setEditingShot(null);
        }}
      />
    </div>
  );
}
