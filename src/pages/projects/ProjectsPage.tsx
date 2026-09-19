/**
 * BSDC — src/pages/projects/ProjectsPage.tsx
 * Purpose : The project directory, and the place a builder asks for help.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Publishing a project is open to every member: the barrier to showing your work should
 *   be low, and the barrier to claiming it is finished is the status field, which you set yourself
 *   and the community can see. Anybody may ask to join an open role; the owner decides, and the
 *   request is a real record rather than a message that gets lost.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Container, Heading, Modal, Skeleton, Tabs, Text } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { ignoreReadFailure } from '@/core/errors/ignore';
import { ProjectForm, ProjectList } from '@/features/projects';
import { createProject, listProjects, setProjectMembership } from '@/entities/project/repository';
import type { Project } from '@/entities/project/model';
import type { ProjectStatus } from '@/core/config/opportunities';

/**
 * Renders the projects route.
 * @returns the projects page
 */
export function ProjectsPage(): React.ReactElement {
  const { t } = useTranslation('projects');
  const { session, profile, locale } = useSession();
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [mine, setMine] = useState<readonly Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [recruitingOnly, setRecruitingOnly] = useState(true);
  const [selected, setSelected] = useState<Project | null>(null);

  const reload = (): void => {
    void listProjects({ ...(status !== null ? { status } : {}) })
      .then((next) => setProjects(next.items))
      .catch(ignoreReadFailure)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    const uid = session.uid;
    if (uid === null || uid.length === 0) {
      setMine([]);
      return;
    }
    void listProjects({ ownerUid: uid })
      .then((next) => setMine(next.items))
      .catch(ignoreReadFailure);
  }, [session.uid]);

  const lang = locale === 'bn' ? 'bn' : 'en';

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={lang}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={lang}>
          {t('subtitle')}
        </Text>
        {profile !== null ? (
          <Button variant="primary" iconLeft="plus" onClick={() => setComposing(true)}>
            {t('start')}
          </Button>
        ) : null}
      </header>

      {composing && profile !== null ? (
        <ProjectForm
          ownerUid={profile.uid}
          ownerName={profile.displayName}
          locale={locale}
          onCancel={() => setComposing(false)}
          onSubmit={async (project) => {
            await createProject(project);
            setComposing(false);
            reload();
          }}
        />
      ) : null}

      {loading ? (
        <Skeleton height={420} />
      ) : (
        <Tabs
          label={t('tabs.label')}
          defaultValue="directory"
          items={[
            {
              value: 'directory',
              label: t('tabs.directory'),
              content: (
                <ProjectList
                  projects={projects}
                  locale={locale}
                  activeStatus={status}
                  recruitingOnly={recruitingOnly}
                  onStatusChange={setStatus}
                  onRecruitingChange={setRecruitingOnly}
                  onOpen={setSelected}
                />
              ),
            },
            {
              value: 'mine',
              label: t('tabs.mine'),
              content:
                mine.length === 0 ? (
                  <Text as="p" tone="muted" lang={lang}>
                    {t('tabs.mineEmpty')}
                  </Text>
                ) : (
                  <ProjectList
                    projects={mine}
                    locale={locale}
                    activeStatus={null}
                    recruitingOnly={false}
                    onStatusChange={() => undefined}
                    onRecruitingChange={() => undefined}
                    onOpen={setSelected}
                  />
                ),
            },
          ]}
        />
      )}

      <Modal
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.title ?? ''}
        size="md"
        closeLabel={t('detail.close')}
        footer={
          profile !== null && selected?.memberUids.includes(profile.uid) === true ? (
            <Button
              variant="secondary"
              onClick={() => {
                void setProjectMembership(selected.id, profile.uid, false).then(() =>
                  setSelected(null),
                );
              }}
            >
              {t('detail.leave')}
            </Button>
          ) : profile !== null && selected !== null ? (
            <Button
              variant="primary"
              onClick={() => {
                void setProjectMembership(selected.id, profile.uid, true).then(() =>
                  setSelected(null),
                );
              }}
            >
              {t('detail.join')}
            </Button>
          ) : undefined
        }
      >
        {selected !== null ? (
          <div className="bsdc-projectDetail">
            <Text as="p" lang={lang}>
              {selected.summary}
            </Text>
            {selected.description.length > 0 ? (
              <Text as="p" lang={lang}>
                {selected.description}
              </Text>
            ) : null}
            {selected.rolesWanted.length > 0 ? (
              <ul className="bsdc-projectDetail__roles">
                {selected.rolesWanted.map((role) => (
                  <li key={role.title} lang={lang}>
                    {role.title} · {t(`commitment.${role.commitment}`)} ·{' '}
                    {role.filled ? t('detail.filled') : t('detail.open')}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="bsdc-projectDetail__links">
              {selected.repoUrl.length > 0 ? (
                <a href={selected.repoUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {t('detail.repo')}
                </a>
              ) : null}
              {selected.demoUrl.length > 0 ? (
                <a href={selected.demoUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {t('detail.demo')}
                </a>
              ) : null}
            </p>
          </div>
        ) : null}
      </Modal>
    </Container>
  );
}
