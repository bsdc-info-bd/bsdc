/**
 * BSDC — src/entities/job/model.ts
 * Purpose : The job entity and the application entity behind it.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A job is a promise about work, so it has to be specific: what it pays, where it is,
 *   what it asks for and when it stops accepting answers. A posting that hides the salary is
 *   allowed to exist, but the form makes the omission visible rather than letting it look like
 *   an oversight.
 *   An application is keyed by the applicant's account id, which is why a person cannot apply
 *   twice by accident — and why withdrawing and re-applying is a deliberate, single action
 *   instead of a pile of duplicates the employer has to sort through.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { TEXT_LIMITS } from '@/core/config/limits';
import { uid } from '@/shared/lib/uid';
import {
  APPLICATION_STATUSES,
  WITHDRAWABLE_APPLICATION_STATUSES,
  type ApplicationStatus,
  type Currency,
  type Division,
  type EmploymentType,
  type ExperienceLevel,
  type JobStatus,
  type SalaryPeriod,
  type WorkplaceType,
} from '@/core/config/opportunities';

/** A job posting. */
export interface Job {
  readonly id: string;
  readonly employerUid: string;
  readonly companyName: string;
  readonly companyLogoUrl: string;
  readonly title: string;
  readonly description: string;
  readonly employmentType: EmploymentType;
  readonly workplaceType: WorkplaceType;
  readonly location: string;
  readonly division: Division;
  readonly countryCode: string;
  readonly salaryMin: number;
  readonly salaryMax: number;
  /** Zero means "not disclosed", which the UI states plainly. */
  readonly salaryDisclosed: boolean;
  readonly currency: Currency;
  readonly salaryPeriod: SalaryPeriod;
  readonly skills: readonly string[];
  readonly experienceLevel: ExperienceLevel;
  readonly deadlineAt: string | null;
  readonly externalApplyUrl: string;
  readonly applicationCount: number;
  readonly status: JobStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** One person's application to one job. */
export interface Application {
  /** Equals the applicant's account id. */
  readonly id: string;
  readonly jobId: string;
  readonly uid: string;
  readonly applicantName: string;
  readonly applicantHeadline: string;
  readonly applicantPhotoUrl: string;
  readonly coverLetter: string;
  readonly resumeUrl: string;
  readonly portfolioUrl: string;
  readonly expectedSalary: number;
  readonly noticeDays: number;
  readonly status: ApplicationStatus;
  readonly employerNote: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Values needed to publish a job. */
export interface NewJobInput {
  readonly employerUid: string;
  readonly companyName: string;
  readonly title: string;
  readonly description: string;
  readonly employmentType: EmploymentType;
  readonly workplaceType: WorkplaceType;
  readonly location: string;
  readonly division: Division;
  readonly countryCode?: string | undefined;
  readonly salaryMin: number;
  readonly salaryMax: number;
  readonly currency?: Currency | undefined;
  readonly salaryPeriod?: SalaryPeriod | undefined;
  readonly skills?: readonly string[] | undefined;
  readonly experienceLevel?: ExperienceLevel | undefined;
  readonly deadlineAt?: string | null | undefined;
  readonly externalApplyUrl?: string | undefined;
  readonly companyLogoUrl?: string | undefined;
  readonly status?: JobStatus | undefined;
  readonly now?: Date | undefined;
}

/** Minimum characters a cover letter must carry to be useful to an employer. */
export const MIN_COVER_LETTER_CHARS = 50;

/**
 * Builds a job entity.
 * @param input job values
 * @returns a complete job entity
 */
export function newJob(input: NewJobInput): Job {
  const now = (input.now ?? new Date()).toISOString();
  const salaryDisclosed = input.salaryMin > 0 || input.salaryMax > 0;
  return {
    id: uid(20),
    employerUid: input.employerUid,
    companyName: input.companyName.trim(),
    companyLogoUrl: input.companyLogoUrl ?? '',
    title: input.title.trim(),
    description: input.description.slice(0, TEXT_LIMITS.productDescription),
    employmentType: input.employmentType,
    workplaceType: input.workplaceType,
    location: input.location.trim(),
    division: input.division,
    countryCode: input.countryCode ?? 'BD',
    salaryMin: Math.max(0, Math.trunc(input.salaryMin)),
    salaryMax: Math.max(0, Math.trunc(input.salaryMax)),
    salaryDisclosed,
    currency: input.currency ?? 'BDT',
    salaryPeriod: input.salaryPeriod ?? 'monthly',
    skills: input.skills ?? [],
    experienceLevel: input.experienceLevel ?? 'junior',
    deadlineAt: input.deadlineAt ?? null,
    externalApplyUrl: input.externalApplyUrl ?? '',
    applicationCount: 0,
    status: input.status ?? 'open',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Validates a job draft.
 * @param input the draft
 * @returns null when valid, otherwise the BSDC error code to surface
 */
export function validateJob(input: NewJobInput): 'BSDC-DATA-007' | 'BSDC-JOB-004' | null {
  if (input.title.trim().length === 0 || input.companyName.trim().length === 0) {
    return 'BSDC-DATA-007';
  }
  if (input.salaryMax > 0 && input.salaryMin > input.salaryMax) return 'BSDC-JOB-004';
  return null;
}

/**
 * Reports whether a job is still accepting applications.
 * @param job the job
 * @param now optional instant
 * @returns true while the posting is open and its deadline has not passed
 */
export function isJobOpen(job: Job, now: Date = new Date()): boolean {
  if (job.status !== 'open') return false;
  if (job.deadlineAt === null) return true;
  return Date.parse(job.deadlineAt) > now.getTime();
}

/**
 * Days left before the deadline, or null when there is no deadline.
 * @param job the job
 * @param now optional instant
 * @returns whole days remaining, floored at zero
 */
export function daysToDeadline(job: Job, now: Date = new Date()): number | null {
  if (job.deadlineAt === null) return null;
  const remaining = Date.parse(job.deadlineAt) - now.getTime();
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 86_400_000);
}

/**
 * Renders a salary range in one line. An undisclosed salary says so instead of showing zeroes.
 * @param job the job
 * @param symbol currency symbol
 * @returns the salary line
 */
export function salaryLine(job: Job, symbol: string): string {
  if (!job.salaryDisclosed) return '';
  if (job.salaryMin === job.salaryMax) return `${symbol}${job.salaryMin.toLocaleString('en-US')}`;
  if (job.salaryMin === 0) return `${symbol}${job.salaryMax.toLocaleString('en-US')}`;
  if (job.salaryMax === 0) return `${symbol}${job.salaryMin.toLocaleString('en-US')}`;
  return `${symbol}${job.salaryMin.toLocaleString('en-US')} - ${symbol}${job.salaryMax.toLocaleString('en-US')}`;
}

/** Values needed to apply to a job. */
export interface NewApplicationInput {
  readonly jobId: string;
  readonly uid: string;
  readonly applicantName: string;
  readonly applicantHeadline: string;
  readonly applicantPhotoUrl: string;
  readonly coverLetter: string;
  readonly resumeUrl?: string | undefined;
  readonly portfolioUrl?: string | undefined;
  readonly expectedSalary?: number | undefined;
  readonly noticeDays?: number | undefined;
  readonly now?: Date | undefined;
}

/**
 * Builds an application entity.
 * @param input application values
 * @returns a complete application entity
 */
export function newApplication(input: NewApplicationInput): Application {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: input.uid,
    jobId: input.jobId,
    uid: input.uid,
    applicantName: input.applicantName,
    applicantHeadline: input.applicantHeadline,
    applicantPhotoUrl: input.applicantPhotoUrl,
    coverLetter: input.coverLetter.trim(),
    resumeUrl: input.resumeUrl ?? '',
    portfolioUrl: input.portfolioUrl ?? '',
    expectedSalary: Math.max(0, Math.trunc(input.expectedSalary ?? 0)),
    noticeDays: Math.min(180, Math.max(0, Math.trunc(input.noticeDays ?? 0))),
    status: 'submitted',
    employerNote: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Validates an application draft against the job it answers.
 * @param input the draft
 * @param job the job
 * @param now optional instant
 * @returns null when valid, otherwise the BSDC error code to surface
 */
export function validateApplication(
  input: NewApplicationInput,
  job: Job,
  now: Date = new Date(),
): 'BSDC-JOB-001' | 'BSDC-JOB-003' | null {
  if (!isJobOpen(job, now)) return 'BSDC-JOB-001';
  if (input.coverLetter.trim().length < MIN_COVER_LETTER_CHARS) return 'BSDC-JOB-003';
  return null;
}

/**
 * Reports whether an applicant may still take their application back.
 * @param application the application
 * @returns true while the application has not reached a decision
 */
export function isWithdrawable(application: Application): boolean {
  return (
    application.deletedAt === null && WITHDRAWABLE_APPLICATION_STATUSES.includes(application.status)
  );
}

/**
 * Reports whether a status is one the candidate should be told about immediately.
 * @param status application status
 * @returns true for statuses that end or advance a candidacy
 */
export function isDecisionStatus(status: ApplicationStatus): boolean {
  return status === 'offered' || status === 'hired' || status === 'rejected';
}

/**
 * Counts applications per status, in the catalogue's own order.
 * @param applications the applications
 * @returns a count per status
 */
export function countByStatus(
  applications: readonly Application[],
): Readonly<Record<ApplicationStatus, number>> {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<
    ApplicationStatus,
    number
  >;
  for (const application of applications) {
    if (application.deletedAt !== null) continue;
    counts[application.status] += 1;
  }
  return counts;
}
