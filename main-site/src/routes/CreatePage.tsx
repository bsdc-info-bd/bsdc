import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Briefcase,
  Hammer,
  FolderGit2,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Seo } from '@/components/seo/Seo';
import { ProjectWizard } from '@/components/projects/ProjectWizard';
import {
  Alert,
  Button,
  Card,
  SectionHeading,
  SelectField,
  Switch,
  Tabs,
  TagInput,
  TextField,
  TextareaField,
  type TabItem,
} from '@/design-system';
import {
  CREATE_KINDS,
  CREATE_LIMITS,
  EMPTY_EVENT,
  EMPTY_GIG,
  EMPTY_GROUP,
  EMPTY_JOB,
  EMPTY_PROJECT,
  createdPath,
  validateCreateDraft,
  validateProjectDraftStep,
  type ProjectStep,
  type CreateIssue,
  type CreateKind,
  type EventDraftInput,
  type GigDraftInput,
  type GroupDraftInput,
  type JobDraftInput,
  type ProjectDraftInput,
} from '@/lib/create/create-types';
import { createListing } from '@/lib/create/create-repository';
import { slugify } from '@/lib/content/text';
import { dataErrorKey } from '@/lib/supabase/errors';
import { assertUploadable, MediaError } from '@/lib/storage/upload';
import type { UploadResult } from '@/lib/storage/upload';
import { useAuthStore } from '@/store/auth-store';

interface PreparedProjectCover {
  file: File;
  result: UploadResult;
  mediaRecorded: boolean;
}

function isKind(value: string | null): value is CreateKind {
  return value !== null && (CREATE_KINDS as readonly string[]).includes(value);
}

/**
 * The one place a member can add to a directory.
 *
 * Every listing on the site was already stored in a table with a row level
 * policy for its author, and none of them had a form. This page is that form,
 * five times over: the same header, the same validation, the same way of
 * reporting a refusal, and a field for each column the table actually checks.
 */
export default function CreatePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);

  const requested = params.get('kind');
  const kind: CreateKind = isKind(requested) ? requested : 'event';

  const [event, setEvent] = useState<EventDraftInput>(EMPTY_EVENT);
  const [job, setJob] = useState<JobDraftInput>(EMPTY_JOB);
  const [gig, setGig] = useState<GigDraftInput>(EMPTY_GIG);
  const [project, setProject] = useState<ProjectDraftInput>(EMPTY_PROJECT);
  const [group, setGroup] = useState<GroupDraftInput>({
    ...EMPTY_GROUP,
    language: i18n.language === 'bn' ? 'bn' : 'en',
  });
  const [projectStep, setProjectStep] = useState<ProjectStep>(0);
  const [projectCoverFile, setProjectCoverFile] = useState<File | null>(null);
  const [projectCoverPreviewUrl, setProjectCoverPreviewUrl] = useState('');
  const [projectCoverProgress, setProjectCoverProgress] = useState<number | null>(null);
  const [preparedProjectCover, setPreparedProjectCover] = useState<PreparedProjectCover | null>(
    null,
  );
  const [slugTouched, setSlugTouched] = useState(false);
  const [issues, setIssues] = useState<CreateIssue[]>([]);

  useEffect(() => {
    if (projectCoverFile === null) {
      setProjectCoverPreviewUrl('');
      return;
    }
    const previewUrl = URL.createObjectURL(projectCoverFile);
    setProjectCoverPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [projectCoverFile]);

  const draft = useMemo(() => {
    switch (kind) {
      case 'event':
        return event;
      case 'job':
        return job;
      case 'gig':
        return gig;
      case 'project':
        return project;
      case 'group':
        return group;
    }
  }, [kind, event, job, gig, project, group]);

  // A group's handle is derived from its name until the member edits it, because
  // the column has a pattern and a member should not have to know it.
  useEffect(() => {
    if (kind !== 'group' || slugTouched) return;
    const derived = slugify(group.name, 'group');
    setGroup((current) => (current.slug === derived ? current : { ...current, slug: derived }));
  }, [kind, slugTouched, group.name, group.slug]);

  function chooseKind(next: string) {
    setIssues([]);
    if (!isKind(next)) return;
    const search = new URLSearchParams(params);
    search.set('kind', next);
    setParams(search, { replace: true });
  }

  function chooseProjectCover(file: File | null) {
    if (file === null) {
      setProjectCoverFile(null);
      setPreparedProjectCover(null);
      setProject((current) => ({ ...current, coverUrl: '' }));
      return;
    }

    try {
      const kind = assertUploadable(file);
      if (kind !== 'image') throw new MediaError('media.errors.unsupported');
      setProjectCoverFile(file);
      setPreparedProjectCover(null);
      setProject((current) => ({ ...current, coverUrl: '' }));
    } catch (error) {
      const key =
        error instanceof Error && error.message.startsWith('media.')
          ? error.message
          : 'media.errors.failed';
      toast.error(t(key));
    }
  }

  function nextProjectStep() {
    const found = validateProjectDraftStep(project, projectStep);
    setIssues(found);
    if (found.length > 0) {
      toast.error(t(found[0]!.messageKey));
      return;
    }
    setProjectStep((current) => Math.min(current + 1, 3) as ProjectStep);
  }

  const mutation = useMutation({
    mutationKey: ['create-listing', kind, user?.uid ?? ''],
    mutationFn: async () => {
      const ownerUid = user?.uid ?? '';
      if (kind !== 'project' || projectCoverFile === null) {
        return createListing(kind, ownerUid, draft);
      }

      // Upload once and retain the completed result if recording or the project
      // insert needs retrying. A slow phone must not upload the same cover again
      // just because the database briefly refused the row.
      let prepared = preparedProjectCover?.file === projectCoverFile ? preparedProjectCover : null;
      if (prepared === null) {
        const { uploadMedia } = await import('@/lib/storage/upload');
        const result = await uploadMedia(projectCoverFile, {
          purpose: 'project-cover',
          onProgress: setProjectCoverProgress,
        });
        prepared = { file: projectCoverFile, result, mediaRecorded: false };
        setPreparedProjectCover(prepared);
      }

      if (!prepared.mediaRecorded) {
        const { recordMediaAsset } = await import('@/lib/data/media-repository');
        const row = await recordMediaAsset(ownerUid, prepared.result);
        if (row === null) throw new Error('media.errors.recordFailed');
        prepared = { ...prepared, mediaRecorded: true };
        setPreparedProjectCover(prepared);
      }

      return createListing('project', ownerUid, {
        ...project,
        coverUrl: prepared.result.url,
      });
    },
    onSuccess: (slug) => {
      toast.success(t('create.created'));
      setProjectCoverProgress(null);
      setPreparedProjectCover(null);
      setProjectCoverFile(null);
      if (slug.length > 0) navigate(createdPath(kind, slug));
    },
    onError: (error: unknown) => {
      setProjectCoverProgress(null);
      const messageKey =
        error instanceof Error && error.message.startsWith('media.')
          ? error.message
          : dataErrorKey(error);
      toast.error(t(messageKey));
    },
    onSettled: () => setProjectCoverProgress(null),
  });

  function submit() {
    const found = validateCreateDraft(kind, draft);
    setIssues(found);
    if (found.length > 0) {
      toast.error(t(found[0]!.messageKey));
      return;
    }
    if (user === null) return;
    mutation.mutate();
  }

  function errorFor(field: string): string | undefined {
    const hit = issues.find((issue) => issue.field === field);
    return hit === undefined ? undefined : t(hit.messageKey);
  }

  const items: TabItem[] = [
    {
      id: 'event',
      label: t('create.tab.event'),
      content: <EventForm value={event} onChange={setEvent} errorFor={errorFor} />,
    },
    {
      id: 'job',
      label: t('create.tab.job'),
      content: <JobForm value={job} onChange={setJob} errorFor={errorFor} />,
    },
    {
      id: 'gig',
      label: t('create.tab.gig'),
      content: <GigForm value={gig} onChange={setGig} errorFor={errorFor} />,
    },
    {
      id: 'project',
      label: t('create.tab.project'),
      content: (
        <ProjectWizard
          value={project}
          onChange={setProject}
          step={projectStep}
          coverFile={projectCoverFile}
          coverPreviewUrl={projectCoverPreviewUrl}
          coverUploadProgress={projectCoverProgress}
          onCoverFileChange={(file) => void chooseProjectCover(file)}
          errorFor={errorFor}
        />
      ),
    },
    {
      id: 'group',
      label: t('create.tab.group'),
      content: (
        <GroupForm
          value={group}
          onChange={setGroup}
          onSlugTouched={() => setSlugTouched(true)}
          errorFor={errorFor}
        />
      ),
    },
  ];

  const icons: Record<CreateKind, typeof CalendarPlus> = {
    event: CalendarPlus,
    job: Briefcase,
    gig: Hammer,
    project: FolderGit2,
    group: Users,
  };
  const Icon = icons[kind];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Seo title={t('create.title')} description={t('create.subtitle')} path="/create" noindex />
      <SectionHeading title={t('create.title')} description={t('create.subtitle')} />

      <div className="mt-6">
        <Tabs label={t('create.tabsLabel')} items={items} activeId={kind} onChange={chooseKind} />
      </div>

      {issues.length > 0 ? (
        <div className="mt-5">
          <Alert tone="warning" title={t('create.issuesTitle')}>
            <ul className="list-inside list-disc text-body-sm">
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.messageKey}`}>{t(issue.messageKey)}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      <Card className="mt-5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-body-sm text-ink-2">
            <Icon aria-hidden className="size-4" />
            {t(`create.footnote.${kind}`)}
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:ms-auto">
            {kind === 'project' && projectStep > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                iconStart={<ArrowLeft size={16} />}
                onClick={() => setProjectStep((current) => Math.max(current - 1, 0) as ProjectStep)}
              >
                {t('create.projectSteps.previous')}
              </Button>
            ) : null}
            {kind === 'project' && projectStep < 3 ? (
              <Button
                type="button"
                onClick={nextProjectStep}
                disabled={user === null || mutation.isPending}
                iconEnd={<ArrowRight size={16} />}
              >
                {t('create.projectSteps.next')}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={submit}
                loading={mutation.isPending}
                disabled={user === null}
                iconStart={<Icon aria-hidden className="size-4" />}
              >
                {t(`create.submit.${kind}`)}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

interface FormProps<Value> {
  value: Value;
  onChange: (next: Value) => void;
  errorFor: (field: string) => string | undefined;
}

function EventForm({ value, onChange, errorFor }: FormProps<EventDraftInput>) {
  const { t } = useTranslation();
  const set = (patch: Partial<EventDraftInput>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label={t('create.fields.title')}
        value={value.title}
        maxLength={CREATE_LIMITS.titleMax}
        error={errorFor('title')}
        onChange={(event) => set({ title: event.target.value })}
        className="sm:col-span-2"
      />
      <TextareaField
        label={t('create.fields.description')}
        value={value.description}
        rows={5}
        counterMax={CREATE_LIMITS.eventDescriptionMax}
        error={errorFor('description')}
        onChange={(event) => set({ description: event.target.value })}
        className="sm:col-span-2"
      />
      <SelectField
        label={t('create.fields.mode')}
        value={value.mode}
        error={errorFor('mode')}
        onChange={(event) => set({ mode: event.target.value as EventDraftInput['mode'] })}
        options={[
          { value: 'in_person', label: t('create.options.mode.in_person') },
          { value: 'online', label: t('create.options.mode.online') },
          { value: 'hybrid', label: t('create.options.mode.hybrid') },
        ]}
      />
      <TextField
        label={t('create.fields.timezone')}
        value={value.timezone}
        hint={t('create.hints.timezone')}
        onChange={(event) => set({ timezone: event.target.value })}
      />
      <TextField
        label={t('create.fields.startsAt')}
        type="datetime-local"
        value={value.startsAt}
        error={errorFor('startsAt')}
        onChange={(event) => set({ startsAt: event.target.value })}
      />
      <TextField
        label={t('create.fields.endsAt')}
        type="datetime-local"
        value={value.endsAt}
        error={errorFor('endsAt')}
        onChange={(event) => set({ endsAt: event.target.value })}
      />
      <TextField
        label={t('create.fields.venue')}
        value={value.venue}
        maxLength={CREATE_LIMITS.venueMax}
        error={errorFor('venue')}
        onChange={(event) => set({ venue: event.target.value })}
      />
      <TextField
        label={t('create.fields.city')}
        value={value.city}
        maxLength={CREATE_LIMITS.cityMax}
        error={errorFor('city')}
        onChange={(event) => set({ city: event.target.value })}
      />
      <TextField
        label={t('create.fields.joinUrl')}
        type="url"
        value={value.joinUrl}
        error={errorFor('joinUrl')}
        onChange={(event) => set({ joinUrl: event.target.value })}
        className="sm:col-span-2"
      />
      <TextField
        label={t('create.fields.capacity')}
        type="number"
        min={1}
        hint={t('create.hints.capacity')}
        value={value.capacity === null ? '' : String(value.capacity)}
        error={errorFor('capacity')}
        onChange={(event) =>
          set({ capacity: event.target.value === '' ? null : Number(event.target.value) })
        }
      />
      <TextField
        label={t('create.fields.coverUrl')}
        type="url"
        value={value.coverUrl}
        error={errorFor('coverUrl')}
        onChange={(event) => set({ coverUrl: event.target.value })}
      />
    </div>
  );
}

function JobForm({ value, onChange, errorFor }: FormProps<JobDraftInput>) {
  const { t } = useTranslation();
  const set = (patch: Partial<JobDraftInput>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label={t('create.fields.title')}
        value={value.title}
        maxLength={CREATE_LIMITS.titleMax}
        error={errorFor('title')}
        onChange={(event) => set({ title: event.target.value })}
      />
      <TextField
        label={t('create.fields.company')}
        value={value.company}
        maxLength={CREATE_LIMITS.companyMax}
        error={errorFor('company')}
        onChange={(event) => set({ company: event.target.value })}
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
      <SelectField
        label={t('create.fields.jobType')}
        value={value.jobType}
        onChange={(event) => set({ jobType: event.target.value as JobDraftInput['jobType'] })}
        options={[
          { value: 'full_time', label: t('create.options.jobType.full_time') },
          { value: 'part_time', label: t('create.options.jobType.part_time') },
          { value: 'contract', label: t('create.options.jobType.contract') },
          { value: 'internship', label: t('create.options.jobType.internship') },
        ]}
      />
      <SelectField
        label={t('create.fields.workMode')}
        value={value.workMode}
        onChange={(event) => set({ workMode: event.target.value as JobDraftInput['workMode'] })}
        options={[
          { value: 'onsite', label: t('create.options.workMode.onsite') },
          { value: 'remote', label: t('create.options.workMode.remote') },
          { value: 'hybrid', label: t('create.options.workMode.hybrid') },
        ]}
      />
      <SelectField
        label={t('create.fields.level')}
        value={value.level}
        onChange={(event) => set({ level: event.target.value as JobDraftInput['level'] })}
        options={[
          { value: 'entry', label: t('create.options.level.entry') },
          { value: 'junior', label: t('create.options.level.junior') },
          { value: 'mid', label: t('create.options.level.mid') },
          { value: 'senior', label: t('create.options.level.senior') },
          { value: 'lead', label: t('create.options.level.lead') },
        ]}
      />
      <TextField
        label={t('create.fields.city')}
        value={value.city}
        maxLength={CREATE_LIMITS.cityMax}
        hint={t('create.hints.city')}
        error={errorFor('city')}
        onChange={(event) => set({ city: event.target.value })}
      />
      <TextField
        label={t('create.fields.salaryMin')}
        type="number"
        min={0}
        value={value.salaryMin === null ? '' : String(value.salaryMin)}
        error={errorFor('salaryMin')}
        onChange={(event) =>
          set({ salaryMin: event.target.value === '' ? null : Number(event.target.value) })
        }
      />
      <TextField
        label={t('create.fields.salaryMax')}
        type="number"
        min={0}
        value={value.salaryMax === null ? '' : String(value.salaryMax)}
        error={errorFor('salaryMax')}
        onChange={(event) =>
          set({ salaryMax: event.target.value === '' ? null : Number(event.target.value) })
        }
      />
      <SelectField
        label={t('create.fields.salaryPeriod')}
        value={value.salaryPeriod}
        onChange={(event) =>
          set({ salaryPeriod: event.target.value as JobDraftInput['salaryPeriod'] })
        }
        options={[
          { value: 'month', label: t('create.options.period.month') },
          { value: 'hour', label: t('create.options.period.hour') },
          { value: 'year', label: t('create.options.period.year') },
        ]}
      />
      <TextField
        label={t('create.fields.expiresAt')}
        type="datetime-local"
        hint={t('create.hints.expiresAt')}
        value={value.expiresAt ?? ''}
        onChange={(event) =>
          set({ expiresAt: event.target.value === '' ? null : event.target.value })
        }
      />
      <TextField
        label={t('create.fields.applyUrl')}
        type="url"
        hint={t('create.hints.applyUrl')}
        value={value.applyUrl}
        error={errorFor('applyUrl')}
        onChange={(event) => set({ applyUrl: event.target.value })}
        className="sm:col-span-2"
      />
      <div className="sm:col-span-2">
        <TagInput
          label={t('create.fields.skills')}
          hint={t('create.hints.skills')}
          value={value.skills}
          max={CREATE_LIMITS.skillsMax}
          onChange={(skills) => set({ skills })}
        />
      </div>
    </div>
  );
}

function GigForm({ value, onChange, errorFor }: FormProps<GigDraftInput>) {
  const { t } = useTranslation();
  const set = (patch: Partial<GigDraftInput>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label={t('create.fields.title')}
        value={value.title}
        maxLength={CREATE_LIMITS.titleMax}
        error={errorFor('title')}
        onChange={(event) => set({ title: event.target.value })}
        className="sm:col-span-2"
      />
      <TextareaField
        label={t('create.fields.description')}
        value={value.description}
        rows={6}
        counterMax={CREATE_LIMITS.descriptionMax}
        error={errorFor('description')}
        onChange={(event) => set({ description: event.target.value })}
        className="sm:col-span-2"
      />
      <TextField
        label={t('create.fields.budgetMin')}
        type="number"
        min={0}
        value={value.budgetMin === null ? '' : String(value.budgetMin)}
        error={errorFor('budgetMin')}
        onChange={(event) =>
          set({ budgetMin: event.target.value === '' ? null : Number(event.target.value) })
        }
      />
      <TextField
        label={t('create.fields.budgetMax')}
        type="number"
        min={0}
        value={value.budgetMax === null ? '' : String(value.budgetMax)}
        error={errorFor('budgetMax')}
        onChange={(event) =>
          set({ budgetMax: event.target.value === '' ? null : Number(event.target.value) })
        }
      />
      <TextField
        label={t('create.fields.durationDays')}
        type="number"
        min={1}
        max={CREATE_LIMITS.durationDaysMax}
        value={value.durationDays === null ? '' : String(value.durationDays)}
        error={errorFor('durationDays')}
        onChange={(event) =>
          set({ durationDays: event.target.value === '' ? null : Number(event.target.value) })
        }
      />
      <div className="flex items-end pb-1">
        <Switch
          checked={value.isHourly}
          onCheckedChange={(isHourly) => set({ isHourly })}
          label={t('create.fields.isHourly')}
          description={t('create.hints.isHourly')}
        />
      </div>
      <div className="sm:col-span-2">
        <TagInput
          label={t('create.fields.skills')}
          hint={t('create.hints.skills')}
          value={value.skills}
          max={CREATE_LIMITS.skillsMax}
          onChange={(skills) => set({ skills })}
        />
      </div>
    </div>
  );
}

function GroupForm({
  value,
  onChange,
  onSlugTouched,
  errorFor,
}: FormProps<GroupDraftInput> & { onSlugTouched: () => void }) {
  const { t } = useTranslation();
  const set = (patch: Partial<GroupDraftInput>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label={t('create.fields.groupName')}
        value={value.name}
        maxLength={CREATE_LIMITS.groupNameMax}
        error={errorFor('name')}
        onChange={(event) => set({ name: event.target.value })}
        className="sm:col-span-2"
      />
      <TextField
        label={t('create.fields.slug')}
        value={value.slug}
        hint={t('create.hints.slug')}
        error={errorFor('slug')}
        onChange={(event) => {
          onSlugTouched();
          set({ slug: event.target.value });
        }}
        className="sm:col-span-2"
      />
      <TextareaField
        label={t('create.fields.description')}
        value={value.description}
        rows={4}
        counterMax={CREATE_LIMITS.groupDescriptionMax}
        error={errorFor('description')}
        onChange={(event) => set({ description: event.target.value })}
        className="sm:col-span-2"
      />
      <SelectField
        label={t('create.fields.privacy')}
        value={value.privacy}
        onChange={(event) => set({ privacy: event.target.value as GroupDraftInput['privacy'] })}
        options={[
          { value: 'public', label: t('create.options.privacy.public') },
          { value: 'private', label: t('create.options.privacy.private') },
          { value: 'secret', label: t('create.options.privacy.secret') },
        ]}
      />
      <SelectField
        label={t('create.fields.language')}
        value={value.language}
        onChange={(event) => set({ language: event.target.value as GroupDraftInput['language'] })}
        options={[
          { value: 'bn', label: t('create.options.language.bn') },
          { value: 'en', label: t('create.options.language.en') },
        ]}
      />
    </div>
  );
}
