/**
 * BSDC — src/entities/project/repository.ts
 * Purpose : Project persistence: publish, browse, join and leave.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A project is owned by the person who started it and joined by everybody else through
 *   `projects/{id}/members/{uid}`. Leaving is honest: the member record is marked, not erased, so
 *   the project's history of who helped stays true even after somebody steps away.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, projectMemberPath, projectPath } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { fromDocument, fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { mirrorGet, mirrorList, mirrorSoftDelete } from '@/services/offline/mirror';
import { readThrough, writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import { sortProjects, validateProject, type Project } from './model';

/** Filter used when browsing projects. */
export interface ProjectFilter {
  readonly status?: string | undefined;
  readonly stack?: string | undefined;
  readonly ownerUid?: string | undefined;
  readonly recruitingOnly?: boolean | undefined;
  readonly limit?: number | undefined;
}

/**
 * Publishes a project.
 * @param project the project entity, built by src/entities/project/model.ts
 * @returns the write outcome, or a refused result when the draft is invalid
 */
export async function createProject(project: Project): Promise<WriteThroughResult> {
  const problem = validateProject({
    ownerUid: project.ownerUid,
    ownerName: project.ownerName,
    title: project.title,
    summary: project.summary,
    description: project.description,
    stack: project.stack,
    rolesWanted: project.rolesWanted,
  });
  if (problem !== null) {
    return {
      synced: false,
      queued: false,
      error: new AppError(problem, { projectId: project.id }),
    };
  }
  return await writeThrough(
    'projects',
    project,
    {
      kind: 'project.create',
      entityId: project.id,
      payload: project as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, projectPath(project.id)), project);
      } catch (error) {
        throw translateFirestoreError(error, 'project.create');
      }
    },
  );
}

/**
 * Edits a project.
 * @param projectId project id
 * @param patch fields to change
 * @returns the write outcome
 */
export async function updateProject(
  projectId: string,
  patch: Partial<
    Pick<
      Project,
      | 'title'
      | 'summary'
      | 'description'
      | 'repoUrl'
      | 'demoUrl'
      | 'coverUrl'
      | 'stack'
      | 'rolesWanted'
      | 'status'
    >
  >,
): Promise<WriteThroughResult> {
  const current = await mirrorGet<Project>('projects', projectId);
  if (current === undefined) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { projectId }) };
  }
  const now = new Date().toISOString();
  const next: Project = { ...current, ...patch, updatedAt: now };
  return await writeThrough(
    'projects',
    next,
    { kind: 'project.update', entityId: projectId, payload: patch },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, projectPath(projectId)), { ...patch, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'project.update');
      }
    },
  );
}

/**
 * Moves a project to the recovery bin.
 * @param projectId project id
 * @returns the write outcome
 */
export async function softDeleteProject(projectId: string): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('projects', projectId, now);
  return await writeThrough(
    'projects',
    { id: projectId, deletedAt: now, updatedAt: now, createdAt: now } as unknown as Project,
    { kind: 'project.delete', entityId: projectId, payload: { deletedAt: now } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, projectPath(projectId)), { deletedAt: now, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'project.delete');
      }
    },
  );
}

/**
 * Lists projects in the order src/entities/project/model.ts defines.
 * @param filter optional filters
 * @returns the projects and their provenance
 */
export async function listProjects(
  filter: ProjectFilter = {},
): Promise<{ readonly items: readonly Project[]; readonly source: 'remote' | 'local' }> {
  const result = await readThrough<Project>(
    'projects',
    async () => {
      const { collection, query, where, orderBy, limit, getDocs } =
        await import('firebase/firestore');
      const db = await firestoreDb();
      const constraints = [where('deletedAt', '==', null), where('visibility', '==', 'public')];
      if (filter.status !== undefined) {
        constraints.push(where('status', '==', filter.status));
      }
      if (filter.ownerUid !== undefined) {
        constraints.push(where('ownerUid', '==', filter.ownerUid));
      }
      if (filter.stack !== undefined) {
        constraints.push(where('stack', 'array-contains', filter.stack));
      }
      constraints.push(orderBy('createdAt', 'desc') as never, limit(filter.limit ?? 30) as never);
      try {
        const snapshot = await getDocs(query(collection(db, COLLECTIONS.projects), ...constraints));
        return fromQuery<Project>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'project.list');
      }
    },
    {
      orderBy: 'createdAt',
      direction: 'desc',
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
    },
  );
  const items = sortProjects(result.items).filter(
    (project) => filter.recruitingOnly !== true || project.lookingForMembers,
  );
  return { items, source: result.source };
}

/**
 * Reads one project.
 * @param projectId project id
 * @returns the project, or undefined when it does not exist
 */
export async function loadProject(projectId: string): Promise<Project | undefined> {
  const result = await readThrough<Project>(
    'projects',
    async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDoc(doc(db, projectPath(projectId)));
        const project = fromDocument<Project>(snapshot);
        return project === undefined ? [] : [project];
      } catch (error) {
        throw translateFirestoreError(error, 'project.read');
      }
    },
    { limit: 1 },
  );
  return result.items[0] ?? (await mirrorGet<Project>('projects', projectId));
}

/**
 * Joins or leaves a project as a contributor.
 * @param projectId project id
 * @param uid account id
 * @param joining true to join, false to leave
 * @param roleLabel what the person is doing on the project
 * @returns the write outcome
 */
export async function setProjectMembership(
  projectId: string,
  uid: string,
  joining: boolean,
  roleLabel = 'contributor',
): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  const record = {
    id: uid,
    projectId,
    uid,
    role: roleLabel,
    joinedAt: now,
    leftAt: joining ? null : now,
    updatedAt: now,
    deletedAt: joining ? null : now,
  };
  return await writeThrough(
    'projects',
    record as unknown as Project,
    {
      kind: joining ? 'project.join' : 'project.leave',
      entityId: `${projectId}:${uid}`,
      payload: record,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, projectMemberPath(projectId, uid)), record);
      } catch (error) {
        throw translateFirestoreError(error, joining ? 'project.join' : 'project.leave');
      }
    },
  );
}

/**
 * Lists the projects one person is a member of, newest first.
 * @param uid account id
 * @returns their projects
 */
export async function listMyProjects(uid: string): Promise<readonly Project[]> {
  return await mirrorList<Project>('projects', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(project: Project) => project.memberUids.includes(uid)],
  });
}
