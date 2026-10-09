import { Github, ImagePlus, Rocket, Upload, X } from 'lucide-react';
import { useId, useRef } from 'react';
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
import { CREATE_LIMITS, type ProjectDraftInput, type ProjectStep } from '@/lib/create/create-types';
import { MediaImage } from '@/components/media/MediaImage';

export interface ProjectWizardProps {
  value: ProjectDraftInput;
  onChange: (next: ProjectDraftInput) => void;
  step: ProjectStep;
  coverFile: File | null;
  coverPreviewUrl: string;
  coverUploadProgress: number | null;
  onCoverFileChange: (file: File | null) => void;
  errorFor: (field: string) => string | undefined;
}

/** The project composer is a four-step, reviewable publishing flow. */
export function ProjectWizard({
  value,
  onChange,
  step,
  coverFile,
  coverPreviewUrl,
  coverUploadProgress,
  onCoverFileChange,
  errorFor,
}: ProjectWizardProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<ProjectDraftInput>) => onChange({ ...value, ...patch });
  const steps = [
    t('create.projectSteps.basics'),
    t('create.projectSteps.build'),
    t('create.projectSteps.cover'),
    t('create.projectSteps.review'),
  ];

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
        </section>
      ) : null}
    </div>
  );
}
