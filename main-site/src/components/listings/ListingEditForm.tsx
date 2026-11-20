import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MediaImage } from '@/components/media/MediaImage';
import {
  Button,
  Modal,
  SelectField,
  Switch,
  TagInput,
  TextareaField,
  TextField,
} from '@/design-system';
import { CREATE_LIMITS } from '@/lib/create/create-types';
import type { GigUpdate, JobUpdate } from '@/lib/opportunities/opportunity-types';
import { localDateTimeValue } from '@/lib/datetime-local';

/**
 * The edit forms for a gig and a job.
 *
 * Deliberately the same controls, the same counters and the same limits as
 * `CreatePage`'s `GigForm`/`JobForm`, because a listing that could be published
 * with one set of rules and then corrected under another is how a saved value
 * ends up outside what the form would have accepted. What differs is the
 * mechanism: the create page keeps a draft in a wizard, and these two dialogs
 * keep the values in local state seeded from the published row, sending the
 * whole record on save — the same shape `update_gig`/`update_job` take.
 *
 * The cover is a URL field rather than an uploader on purpose: editing an
 * existing listing must not require re-uploading a picture that is already on
 * it, and the routines validate the address against the same ImgBB host family
 * the image renderer and the Android allowlist use. A member who wants a new
 * picture uploads it through the create flow and pastes the address here.
 */

export interface GigEditDialogProps {
  open: boolean;
  initial: GigUpdate;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: GigUpdate) => Promise<void>;
}

function gigIssues(draft: GigUpdate): string[] {
  const issues: string[] = [];
  if (draft.title.trim().length < CREATE_LIMITS.titleMin) issues.push('create.errors.titleShort');
  if (draft.title.trim().length > CREATE_LIMITS.titleMax) issues.push('create.errors.titleLong');
  if (draft.description.trim().length < CREATE_LIMITS.descriptionMin) {
    issues.push('create.errors.descriptionShort');
  }
  if (draft.description.length > CREATE_LIMITS.descriptionMax) {
    issues.push('create.errors.descriptionLong');
  }
  if (draft.budgetMin !== null && draft.budgetMin < 0) issues.push('create.errors.negative');
  if (draft.budgetMin !== null && draft.budgetMax !== null && draft.budgetMax < draft.budgetMin) {
    issues.push('create.errors.budgetOrder');
  }
  if (
    draft.durationDays !== null &&
    (draft.durationDays < 1 || draft.durationDays > CREATE_LIMITS.durationDaysMax)
  ) {
    issues.push('create.errors.duration');
  }
  return issues;
}

export function GigEditDialog({ open, initial, isSaving, onClose, onSave }: GigEditDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<GigUpdate>(initial);
  const [issues, setIssues] = useState<string[]>([]);

  const set = (patch: Partial<GigUpdate>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  async function submit() {
    const found = gigIssues(draft);
    setIssues(found);
    if (found.length > 0) return;
    await onSave({
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim(),
      coverUrl: draft.coverUrl?.trim() ?? '',
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('freelance.manage.editTitle')}
      closeLabel={t('common.close')}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('freelance.manage.cancel')}
          </Button>
          <Button
            loading={isSaving}
            onClick={() => {
              void submit();
            }}
          >
            {t('freelance.manage.saveChanges')}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('freelance.manage.editLead')}</p>
      <div className="grid gap-4">
        <TextField
          label={t('freelance.manage.titleLabel')}
          value={draft.title}
          maxLength={CREATE_LIMITS.titleMax}
          onChange={(event) => {
            set({ title: event.target.value });
          }}
        />
        <TextareaField
          label={t('freelance.manage.descriptionLabel')}
          value={draft.description}
          rows={6}
          counterMax={CREATE_LIMITS.descriptionMax}
          onChange={(event) => {
            set({ description: event.target.value });
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('freelance.manage.budgetMinLabel')}
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.budgetMin === null ? '' : String(draft.budgetMin)}
            onChange={(event) => {
              set({ budgetMin: event.target.value === '' ? null : Number(event.target.value) });
            }}
          />
          <TextField
            label={t('freelance.manage.budgetMaxLabel')}
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.budgetMax === null ? '' : String(draft.budgetMax)}
            onChange={(event) => {
              set({ budgetMax: event.target.value === '' ? null : Number(event.target.value) });
            }}
          />
          <TextField
            label={t('freelance.manage.durationLabel')}
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.durationDays === null ? '' : String(draft.durationDays)}
            onChange={(event) => {
              set({ durationDays: event.target.value === '' ? null : Number(event.target.value) });
            }}
          />
          <div className="flex items-end pb-1">
            <Switch
              checked={draft.isHourly}
              onCheckedChange={(isHourly) => {
                set({ isHourly });
              }}
              label={t('freelance.manage.hourlyLabel')}
            />
          </div>
        </div>
        <TagInput
          label={t('freelance.manage.skillsLabel')}
          value={draft.skills}
          max={CREATE_LIMITS.skillsMax}
          onChange={(skills) => {
            set({ skills });
          }}
        />
        <div>
          <TextField
            label={t('freelance.manage.coverLabel')}
            hint={t('freelance.manage.coverHint')}
            type="url"
            value={draft.coverUrl ?? ''}
            onChange={(event) => {
              set({ coverUrl: event.target.value });
            }}
          />
          {(draft.coverUrl ?? '').trim().length > 0 ? (
            <div className="mt-2 aspect-[16/6] w-full overflow-hidden rounded-card bg-surface-2">
              <MediaImage
                src={(draft.coverUrl ?? '').trim()}
                alt=""
                slotWidth={480}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
        </div>
        {issues.length > 0 ? (
          <ul className="list-inside list-disc text-sm text-danger">
            {issues.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}

export interface JobEditDialogProps {
  open: boolean;
  initial: JobUpdate;
  isSaving: boolean;
  onClose: () => void;
  onSave: (draft: JobUpdate) => Promise<void>;
}

function jobIssues(draft: JobUpdate): string[] {
  const issues: string[] = [];
  if (draft.title.trim().length < CREATE_LIMITS.titleMin) issues.push('create.errors.titleShort');
  if (draft.title.trim().length > CREATE_LIMITS.titleMax) issues.push('create.errors.titleLong');
  if (draft.company.trim().length < CREATE_LIMITS.companyMin) {
    issues.push('create.errors.companyShort');
  }
  if (draft.description.trim().length < CREATE_LIMITS.descriptionMin) {
    issues.push('create.errors.descriptionShort');
  }
  if (draft.description.length > CREATE_LIMITS.descriptionMax) {
    issues.push('create.errors.descriptionLong');
  }
  if (draft.workMode !== 'remote' && draft.city.trim().length === 0) {
    issues.push('create.errors.cityRequired');
  }
  if (draft.salaryMin !== null && draft.salaryMin < 0) issues.push('create.errors.negative');
  if (draft.salaryMin !== null && draft.salaryMax !== null && draft.salaryMax < draft.salaryMin) {
    issues.push('create.errors.salaryOrder');
  }
  return issues;
}

export function JobEditDialog({ open, initial, isSaving, onClose, onSave }: JobEditDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<JobUpdate>(initial);
  const [issues, setIssues] = useState<string[]>([]);

  const set = (patch: Partial<JobUpdate>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  async function submit() {
    const found = jobIssues(draft);
    setIssues(found);
    if (found.length > 0) return;
    await onSave({
      ...draft,
      title: draft.title.trim(),
      company: draft.company.trim(),
      description: draft.description.trim(),
      city: draft.city.trim(),
      applyUrl: draft.applyUrl.trim(),
      coverUrl: draft.coverUrl?.trim() ?? '',
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('jobs.manage.editTitle')}
      closeLabel={t('common.close')}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('jobs.manage.cancel')}
          </Button>
          <Button
            loading={isSaving}
            onClick={() => {
              void submit();
            }}
          >
            {t('jobs.manage.saveChanges')}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('jobs.manage.editLead')}</p>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('create.fields.title')}
            value={draft.title}
            maxLength={CREATE_LIMITS.titleMax}
            onChange={(event) => {
              set({ title: event.target.value });
            }}
          />
          <TextField
            label={t('create.fields.company')}
            value={draft.company}
            maxLength={CREATE_LIMITS.companyMax}
            onChange={(event) => {
              set({ company: event.target.value });
            }}
          />
        </div>
        <TextareaField
          label={t('create.fields.description')}
          value={draft.description}
          rows={7}
          counterMax={CREATE_LIMITS.descriptionMax}
          onChange={(event) => {
            set({ description: event.target.value });
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('create.fields.jobType')}
            value={draft.jobType}
            onChange={(event) => {
              set({ jobType: event.target.value as JobUpdate['jobType'] });
            }}
            options={[
              { value: 'full_time', label: t('create.options.jobType.full_time') },
              { value: 'part_time', label: t('create.options.jobType.part_time') },
              { value: 'contract', label: t('create.options.jobType.contract') },
              { value: 'internship', label: t('create.options.jobType.internship') },
            ]}
          />
          <SelectField
            label={t('create.fields.workMode')}
            value={draft.workMode}
            onChange={(event) => {
              set({ workMode: event.target.value as JobUpdate['workMode'] });
            }}
            options={[
              { value: 'onsite', label: t('create.options.workMode.onsite') },
              { value: 'remote', label: t('create.options.workMode.remote') },
              { value: 'hybrid', label: t('create.options.workMode.hybrid') },
            ]}
          />
          <SelectField
            label={t('create.fields.level')}
            value={draft.level}
            onChange={(event) => {
              set({ level: event.target.value as JobUpdate['level'] });
            }}
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
            value={draft.city}
            maxLength={CREATE_LIMITS.cityMax}
            hint={t('create.hints.city')}
            onChange={(event) => {
              set({ city: event.target.value });
            }}
          />
          <TextField
            label={t('create.fields.salaryMin')}
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.salaryMin === null ? '' : String(draft.salaryMin)}
            onChange={(event) => {
              set({ salaryMin: event.target.value === '' ? null : Number(event.target.value) });
            }}
          />
          <TextField
            label={t('create.fields.salaryMax')}
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.salaryMax === null ? '' : String(draft.salaryMax)}
            onChange={(event) => {
              set({ salaryMax: event.target.value === '' ? null : Number(event.target.value) });
            }}
          />
          <SelectField
            label={t('create.fields.salaryPeriod')}
            value={draft.salaryPeriod}
            onChange={(event) => {
              set({ salaryPeriod: event.target.value });
            }}
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
            value={draft.expiresAt === null ? '' : localDateTimeValue(draft.expiresAt)}
            onChange={(event) => {
              set({
                expiresAt:
                  event.target.value === '' ? null : new Date(event.target.value).toISOString(),
              });
            }}
          />
        </div>
        <TextField
          label={t('create.fields.applyUrl')}
          type="url"
          hint={t('create.hints.applyUrl')}
          value={draft.applyUrl}
          onChange={(event) => {
            set({ applyUrl: event.target.value });
          }}
        />
        <TagInput
          label={t('create.fields.skills')}
          hint={t('create.hints.skills')}
          value={draft.skills}
          max={CREATE_LIMITS.skillsMax}
          onChange={(skills) => {
            set({ skills });
          }}
        />
        <div>
          <TextField
            label={t('jobs.manage.coverLabel')}
            hint={t('jobs.manage.coverHint')}
            type="url"
            value={draft.coverUrl ?? ''}
            onChange={(event) => {
              set({ coverUrl: event.target.value });
            }}
          />
          {(draft.coverUrl ?? '').trim().length > 0 ? (
            <div className="mt-2 aspect-[16/6] w-full overflow-hidden rounded-card bg-surface-2">
              <MediaImage
                src={(draft.coverUrl ?? '').trim()}
                alt=""
                slotWidth={480}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
        </div>
        {issues.length > 0 ? (
          <ul className="list-inside list-disc text-sm text-danger">
            {issues.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}
