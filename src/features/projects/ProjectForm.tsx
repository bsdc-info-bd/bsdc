/**
 * BSDC — src/features/projects/ProjectForm.tsx
 * Purpose : Starting a project, and saying what kind of help would be useful.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Roles are added one at a time with a commitment level each, because "we need people"
 *   is not a role and a list of roles is the difference between a project that attracts help and a
 *   project that attracts questions. A project starts in `planning` and the builder moves it when
 *   the thing is real; the platform does not grade anybody's progress.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Input, Select, Textarea, showToast } from '@/shared/ui';
import { TEXT_LIMITS } from '@/core/config/limits';
import { AppError } from '@/core/errors/AppError';
import type { Locale } from '@/core/config/app';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '@/core/config/opportunities';
import {
  newProject,
  validateProject,
  type Project,
  type ProjectRole,
} from '@/entities/project/model';

/** Commitment levels a role can ask for. */
const COMMITMENTS = ['hours', 'part-time', 'full-time'] as const;
type Commitment = (typeof COMMITMENTS)[number];

/** Props for the project form. */
export interface ProjectFormProps {
  readonly ownerUid: string;
  readonly ownerName: string;
  readonly locale: Locale;
  readonly onSubmit: (project: Project) => Promise<void>;
  readonly onCancel: () => void;
}

/**
 * Renders the project form.
 * @param props component props
 * @returns the form element
 */
export function ProjectForm({
  ownerUid,
  ownerName,
  locale,
  onSubmit,
  onCancel,
}: ProjectFormProps): React.ReactElement {
  const { t } = useTranslation('projects');
  const bn = locale === 'bn';
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [stack, setStack] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('planning');
  const [roles, setRoles] = useState<readonly ProjectRole[]>([]);
  const [roleTitle, setRoleTitle] = useState('');
  const [roleCommitment, setRoleCommitment] = useState<Commitment>('hours');
  const [busy, setBusy] = useState(false);

  const addRole = (): void => {
    const value = roleTitle.trim();
    if (value.length === 0 || roles.length >= 8) return;
    setRoles((current) => [
      ...current,
      { title: value, commitment: roleCommitment, filled: false },
    ]);
    setRoleTitle('');
  };

  const submit = (): void => {
    const draft = {
      ownerUid,
      ownerName,
      title,
      summary,
      description,
      repoUrl,
      demoUrl,
      stack: stack
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .slice(0, 12),
      rolesWanted: roles,
      status,
    };
    if (validateProject(draft) !== null) return;
    setBusy(true);
    void onSubmit(newProject(draft))
      .then(() =>
        showToast(locale, { titleBn: t('created.bn'), titleEn: t('created.en'), tone: 'success' }),
      )
      .catch((error: unknown) => {
        const code = error instanceof AppError ? error.code : 'BSDC-DATA-007';
        showToast(locale, {
          tone: 'error',
          titleBn: t(`error.${code}.bn`, { defaultValue: t('error.default.bn') }),
          titleEn: t(`error.${code}.en`, { defaultValue: t('error.default.en') }),
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <form
      className="bsdc-projectForm"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        label={t('form.title')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
        maxLength={100}
      />
      <Input
        label={t('form.summary')}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        required
        maxLength={240}
        counter={{ value: summary.length, max: 240 }}
      />
      <Textarea
        label={t('form.description')}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={TEXT_LIMITS.productDescription}
        counter={{ value: description.length, max: TEXT_LIMITS.productDescription }}
      />
      <div className="bsdc-projectForm__row">
        <Input
          label={t('form.repo')}
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          type="url"
          inputMode="url"
          maxLength={300}
        />
        <Input
          label={t('form.demo')}
          value={demoUrl}
          onChange={(event) => setDemoUrl(event.target.value)}
          type="url"
          inputMode="url"
          maxLength={300}
        />
      </div>
      <Input
        label={t('form.stack')}
        value={stack}
        onChange={(event) => setStack(event.target.value)}
        hint={t('form.stackHint')}
        maxLength={240}
      />
      <Select<ProjectStatus>
        label={t('form.status')}
        value={status}
        onValueChange={setStatus}
        options={PROJECT_STATUSES.map((entry) => ({
          value: entry,
          label: PROJECT_STATUS_LABELS[entry][bn ? 'bn' : 'en'],
        }))}
      />

      <fieldset className="bsdc-projectForm__roles">
        <legend lang={locale === 'bn' ? 'bn' : 'en'}>{t('form.roles')}</legend>
        <div className="bsdc-projectForm__roleRow">
          <Input
            label={t('form.roleTitle')}
            value={roleTitle}
            onChange={(event) => setRoleTitle(event.target.value)}
            maxLength={60}
          />
          <Select<Commitment>
            label={t('form.roleCommitment')}
            value={roleCommitment}
            onValueChange={setRoleCommitment}
            options={COMMITMENTS.map((entry) => ({
              value: entry,
              label: t(`commitment.${entry}`),
            }))}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={addRole}
            disabled={roleTitle.trim().length === 0}
          >
            {t('form.addRole')}
          </Button>
        </div>
        <ul className="bsdc-projectForm__roleList">
          {roles.map((role, index) => (
            <li key={`${role.title}-${index}`}>
              <Chip
                onRemove={() =>
                  setRoles((current) => current.filter((_, position) => position !== index))
                }
                removeLabel={t('form.removeRole')}
              >
                {role.title} · {t(`commitment.${role.commitment}`)}
              </Chip>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="bsdc-projectForm__actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t('form.publish')}
        </Button>
      </div>
    </form>
  );
}
