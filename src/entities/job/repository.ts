/**
 * BSDC — src/entities/job/repository.ts
 * Purpose : Job persistence, and the application pipeline behind it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : An application lives at `jobs/{jobId}/applications/{uid}`. The applicant id is the
 *   document id, so applying twice is impossible by construction and the employer's list contains
 *   one row per person, always. Withdrawing is not a delete: the row stays with `deletedAt` set so
 *   the platform can prove what happened if a dispute ever needs it.
 *   Only the employer advances a status, and the rules refuse anybody else.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { COLLECTIONS, applicationPath, jobPath } from '@/core/config/collections';
import { AppError } from '@/core/errors/AppError';
import { firestoreDb } from '@/services/firebase/app';
import { fromDocument, fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { mirrorGet, mirrorList, mirrorPut, mirrorSoftDelete } from '@/services/offline/mirror';
import { readThrough, writeThrough, type WriteThroughResult } from '@/services/offline/sync';
import type { ApplicationStatus } from '@/core/config/opportunities';
import {
  isJobOpen,
  isWithdrawable,
  newApplication,
  validateApplication,
  validateJob,
  type Application,
  type Job,
} from './model';

/** Filter used when browsing the board. */
export interface JobFilter {
  readonly employmentType?: string | undefined;
  readonly workplaceType?: string | undefined;
  readonly division?: string | undefined;
  readonly experienceLevel?: string | undefined;
  readonly skill?: string | undefined;
  readonly employerUid?: string | undefined;
  readonly limit?: number | undefined;
}

/**
 * Publishes a job.
 * @param job the job entity, built by src/entities/job/model.ts
 * @returns the write outcome, or a refused result when the draft is invalid
 */
export async function createJob(job: Job): Promise<WriteThroughResult> {
  const problem = validateJob({
    employerUid: job.employerUid,
    companyName: job.companyName,
    title: job.title,
    description: job.description,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    location: job.location,
    division: job.division,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
  });
  if (problem !== null) {
    return { synced: false, queued: false, error: new AppError(problem, { jobId: job.id }) };
  }
  return await writeThrough(
    'jobs',
    job,
    {
      kind: 'job.create',
      entityId: job.id,
      payload: job as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, jobPath(job.id)), job);
      } catch (error) {
        throw translateFirestoreError(error, 'job.create');
      }
    },
  );
}

/**
 * Edits a job posting.
 * @param jobId job id
 * @param patch fields to change
 * @returns the write outcome
 */
export async function updateJob(
  jobId: string,
  patch: Partial<
    Pick<Job, 'title' | 'description' | 'status' | 'deadlineAt' | 'skills' | 'externalApplyUrl'>
  >,
): Promise<WriteThroughResult> {
  const current = await mirrorGet<Job>('jobs', jobId);
  if (current === undefined) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { jobId }) };
  }
  const now = new Date().toISOString();
  const next: Job = { ...current, ...patch, updatedAt: now };
  return await writeThrough(
    'jobs',
    next,
    { kind: 'job.update', entityId: jobId, payload: patch },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, jobPath(jobId)), { ...patch, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'job.update');
      }
    },
  );
}

/**
 * Moves a job to the recovery bin.
 * @param jobId job id
 * @returns the write outcome
 */
export async function softDeleteJob(jobId: string): Promise<WriteThroughResult> {
  const now = new Date().toISOString();
  await mirrorSoftDelete('jobs', jobId, now);
  return await writeThrough(
    'jobs',
    { id: jobId, deletedAt: now, updatedAt: now, createdAt: now } as unknown as Job,
    { kind: 'job.delete', entityId: jobId, payload: { deletedAt: now } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, jobPath(jobId)), { deletedAt: now, updatedAt: now });
      } catch (error) {
        throw translateFirestoreError(error, 'job.delete');
      }
    },
  );
}

/**
 * Lists open jobs, newest first.
 * @param filter optional filters
 * @returns the jobs and their provenance
 */
export async function listJobs(
  filter: JobFilter = {},
): Promise<{ readonly items: readonly Job[]; readonly source: 'remote' | 'local' }> {
  const result = await readThrough<Job>(
    'jobs',
    async () => {
      const { collection, query, where, orderBy, limit, getDocs } =
        await import('firebase/firestore');
      const db = await firestoreDb();
      const constraints = [where('deletedAt', '==', null), where('status', '==', 'open')];
      if (filter.employmentType !== undefined) {
        constraints.push(where('employmentType', '==', filter.employmentType));
      }
      if (filter.workplaceType !== undefined) {
        constraints.push(where('workplaceType', '==', filter.workplaceType));
      }
      if (filter.division !== undefined) {
        constraints.push(where('division', '==', filter.division));
      }
      if (filter.experienceLevel !== undefined) {
        constraints.push(where('experienceLevel', '==', filter.experienceLevel));
      }
      if (filter.skill !== undefined) {
        constraints.push(where('skills', 'array-contains', filter.skill));
      }
      if (filter.employerUid !== undefined) {
        constraints.push(where('employerUid', '==', filter.employerUid));
      }
      constraints.push(orderBy('createdAt', 'desc') as never, limit(filter.limit ?? 30) as never);
      try {
        const snapshot = await getDocs(query(collection(db, COLLECTIONS.jobs), ...constraints));
        return fromQuery<Job>(snapshot);
      } catch (error) {
        throw translateFirestoreError(error, 'job.list');
      }
    },
    {
      orderBy: 'createdAt',
      direction: 'desc',
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
    },
  );
  return { items: result.items, source: result.source };
}

/**
 * Reads one job.
 * @param jobId job id
 * @returns the job, or undefined when it does not exist
 */
export async function loadJob(jobId: string): Promise<Job | undefined> {
  const result = await readThrough<Job>(
    'jobs',
    async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        const snapshot = await getDoc(doc(db, jobPath(jobId)));
        const job = fromDocument<Job>(snapshot);
        return job === undefined ? [] : [job];
      } catch (error) {
        throw translateFirestoreError(error, 'job.read');
      }
    },
    { limit: 1 },
  );
  return result.items[0] ?? (await mirrorGet<Job>('jobs', jobId));
}

/**
 * Applies to a job.
 * @param application the application entity, built by src/entities/job/model.ts
 * @param job the job being applied to
 * @returns the write outcome, or a refused result when the draft or the job is not valid
 */
export async function submitApplication(
  application: Application,
  job: Job,
): Promise<WriteThroughResult> {
  const problem = validateApplication(
    {
      jobId: job.id,
      uid: application.uid,
      applicantName: application.applicantName,
      applicantHeadline: application.applicantHeadline,
      applicantPhotoUrl: application.applicantPhotoUrl,
      coverLetter: application.coverLetter,
    },
    job,
  );
  if (problem !== null) {
    return { synced: false, queued: false, error: new AppError(problem, { jobId: job.id }) };
  }
  await mirrorPut('applications', application);
  return await writeThrough(
    'applications',
    application,
    {
      kind: 'application.submit',
      entityId: `${job.id}:${application.uid}`,
      payload: application as unknown as Readonly<Record<string, unknown>>,
    },
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await setDoc(doc(db, applicationPath(job.id, application.uid)), application);
      } catch (error) {
        throw translateFirestoreError(error, 'application.submit');
      }
    },
  );
}

/**
 * Withdraws an application. The row is kept, marked, and never silently edited.
 * @param jobId job id
 * @param uid applicant account id
 * @returns the write outcome
 */
export async function withdrawApplication(jobId: string, uid: string): Promise<WriteThroughResult> {
  const existing = await loadApplication(jobId, uid);
  if (existing === undefined || !isWithdrawable(existing)) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { jobId }) };
  }
  const now = new Date().toISOString();
  const next: Application = { ...existing, status: 'withdrawn', deletedAt: now, updatedAt: now };
  await mirrorPut('applications', next);
  return await writeThrough(
    'applications',
    next,
    { kind: 'application.withdraw', entityId: `${jobId}:${uid}`, payload: { status: 'withdrawn' } },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, applicationPath(jobId, uid)), {
          status: 'withdrawn',
          deletedAt: now,
          updatedAt: now,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'application.withdraw');
      }
    },
  );
}

/**
 * Advances an application's status. Only the employer may call this, and the rules agree.
 * @param jobId job id
 * @param uid applicant account id
 * @param status the new status
 * @param note optional note shown to the applicant
 * @returns the write outcome
 */
export async function setApplicationStatus(
  jobId: string,
  uid: string,
  status: ApplicationStatus,
  note = '',
): Promise<WriteThroughResult> {
  const existing = await loadApplication(jobId, uid);
  if (existing === undefined) {
    return { synced: false, queued: false, error: new AppError('BSDC-DATA-002', { jobId }) };
  }
  const now = new Date().toISOString();
  const next: Application = { ...existing, status, employerNote: note, updatedAt: now };
  await mirrorPut('applications', next);
  return await writeThrough(
    'applications',
    next,
    {
      kind: 'application.status',
      entityId: `${jobId}:${uid}`,
      payload: { status, employerNote: note },
    },
    async () => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const db = await firestoreDb();
      try {
        await updateDoc(doc(db, applicationPath(jobId, uid)), {
          status,
          employerNote: note,
          updatedAt: now,
        });
      } catch (error) {
        throw translateFirestoreError(error, 'application.status');
      }
    },
  );
}

/**
 * Reads one application.
 * @param jobId job id
 * @param uid applicant account id
 * @returns the application, or undefined when it does not exist
 */
export async function loadApplication(
  jobId: string,
  uid: string,
): Promise<Application | undefined> {
  const local = await mirrorList<Application>('applications', {
    limit: 1,
    where: [(item: Application) => item.jobId === jobId && item.uid === uid],
  });
  if (local[0] !== undefined) return local[0];
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const db = await firestoreDb();
    const snapshot = await getDoc(doc(db, applicationPath(jobId, uid)));
    return fromDocument<Application>(snapshot);
  } catch (error) {
    throw translateFirestoreError(error, 'application.read');
  }
}

/**
 * Lists the applications one job has received, newest first.
 * @param jobId job id
 * @returns the applications
 */
export async function listApplications(jobId: string): Promise<readonly Application[]> {
  return await mirrorList<Application>('applications', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(item: Application) => item.jobId === jobId],
  });
}

/**
 * Lists everything one person has applied to, newest first.
 * @param uid applicant account id
 * @returns their applications
 */
export async function listMyApplications(uid: string): Promise<readonly Application[]> {
  return await mirrorList<Application>('applications', {
    orderBy: 'createdAt',
    direction: 'desc',
    where: [(item: Application) => item.uid === uid],
  });
}

/**
 * Reports whether a job is still accepting answers, using the job's own deadline.
 * @param job the job
 * @param now optional instant
 * @returns true while applications are open
 */
export function jobAcceptingApplications(job: Job, now: Date = new Date()): boolean {
  return isJobOpen(job, now);
}

/**
 * Builds an application entity for a person, so a screen never assembles one by hand.
 * @param job the job
 * @param uid applicant account id
 * @param profile profile values
 * @param coverLetter the cover letter
 * @param extras optional resume, portfolio, salary and notice answers
 * @returns the application entity
 */
export function buildApplication(
  job: Job,
  uid: string,
  profile: { readonly displayName: string; readonly headline: string; readonly photoUrl: string },
  coverLetter: string,
  extras: {
    readonly resumeUrl?: string | undefined;
    readonly portfolioUrl?: string | undefined;
    readonly expectedSalary?: number | undefined;
    readonly noticeDays?: number | undefined;
  } = {},
): Application {
  return newApplication({
    jobId: job.id,
    uid,
    applicantName: profile.displayName,
    applicantHeadline: profile.headline,
    applicantPhotoUrl: profile.photoUrl,
    coverLetter,
    ...(extras.resumeUrl !== undefined ? { resumeUrl: extras.resumeUrl } : {}),
    ...(extras.portfolioUrl !== undefined ? { portfolioUrl: extras.portfolioUrl } : {}),
    ...(extras.expectedSalary !== undefined ? { expectedSalary: extras.expectedSalary } : {}),
    ...(extras.noticeDays !== undefined ? { noticeDays: extras.noticeDays } : {}),
  });
}
