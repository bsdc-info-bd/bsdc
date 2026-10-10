/**
 * Creating the things the platform lists: an event, a job, a gig, a project, a
 * group.
 *
 * Every one of these tables existed, was readable, and had a row level policy
 * letting a member insert their own row — and nothing in the site asked a member
 * for one. A directory with no way to add to it is a directory that stays empty,
 * which is what the jobs board, the calendar, the freelance listings and the
 * project showcase all were.
 *
 * The validators here mirror the database's own constraints, in the same order,
 * with a message key for each. A member who is told "the end has to be after the
 * start" fixes the form; a member who gets `23514` closes the tab.
 */
import type { ExperienceLevel, JobType, WorkMode } from '@/lib/opportunities/opportunity-types';
import type { EventMode, GroupPrivacy } from '@/lib/communities/community-types';
import { groupPath, projectPath, ROUTES } from '@/lib/site';

export type CreateKind = 'event' | 'job' | 'gig' | 'project' | 'group';

export const CREATE_KINDS: readonly CreateKind[] = ['event', 'job', 'gig', 'project', 'group'];

/** The database's own limits, written down where the form can read them. */
export const CREATE_LIMITS = {
  titleMin: 3,
  titleMax: 140,
  companyMin: 2,
  companyMax: 100,
  projectNameMin: 2,
  projectNameMax: 100,
  groupNameMin: 3,
  groupNameMax: 80,
  eventDescriptionMax: 8_000,
  descriptionMax: 20_000,
  groupDescriptionMax: 2_000,
  taglineMax: 200,
  venueMax: 200,
  cityMax: 80,
  skillsMax: 20,
  durationDaysMax: 3_650,
  /** A listing with nothing in it is not a listing. */
  descriptionMin: 20,
} as const;

export type SalaryPeriod = 'hour' | 'month' | 'year';

export interface EventDraftInput {
  title: string;
  description: string;
  mode: EventMode;
  venue: string;
  city: string;
  joinUrl: string;
  coverUrl: string;
  /** `<input type="datetime-local">` values, converted to ISO on the way out. */
  startsAt: string;
  endsAt: string;
  timezone: string;
  capacity: number | null;
  groupId: string | null;
}

export interface JobDraftInput {
  title: string;
  company: string;
  description: string;
  jobType: JobType;
  workMode: WorkMode;
  level: ExperienceLevel;
  city: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod;
  skills: string[];
  applyUrl: string;
  /** Null leaves the listing open until somebody closes it. */
  expiresAt: string | null;
}

export interface GigDraftInput {
  title: string;
  description: string;
  budgetMin: number | null;
  budgetMax: number | null;
  isHourly: boolean;
  durationDays: number | null;
  skills: string[];
}

export interface ProjectDraftInput {
  name: string;
  tagline: string;
  description: string;
  repoUrl: string;
  demoUrl: string;
  coverUrl: string;
  tech: string[];
  license: string;
  lookingForContributors: boolean;
}

export interface GroupDraftInput {
  slug: string;
  name: string;
  description: string;
  privacy: GroupPrivacy;
  language: 'bn' | 'en';
}

export type ProjectStep = 0 | 1 | 2 | 3;

export interface CreateIssue {
  field: string;
  messageKey: string;
}

export const EMPTY_EVENT: EventDraftInput = {
  title: '',
  description: '',
  mode: 'online',
  venue: '',
  city: '',
  joinUrl: '',
  coverUrl: '',
  startsAt: '',
  endsAt: '',
  timezone: 'Asia/Dhaka',
  capacity: null,
  groupId: null,
};

export const EMPTY_JOB: JobDraftInput = {
  title: '',
  company: '',
  description: '',
  jobType: 'full_time',
  workMode: 'onsite',
  level: 'mid',
  city: '',
  salaryMin: null,
  salaryMax: null,
  salaryPeriod: 'month',
  skills: [],
  applyUrl: '',
  expiresAt: null,
};

export const EMPTY_GIG: GigDraftInput = {
  title: '',
  description: '',
  budgetMin: null,
  budgetMax: null,
  isHourly: false,
  durationDays: null,
  skills: [],
};

export const EMPTY_PROJECT: ProjectDraftInput = {
  name: '',
  tagline: '',
  description: '',
  repoUrl: '',
  demoUrl: '',
  coverUrl: '',
  tech: [],
  license: '',
  lookingForContributors: false,
};

export const EMPTY_GROUP: GroupDraftInput = {
  slug: '',
  name: '',
  description: '',
  privacy: 'public',
  language: 'bn',
};

/** The slug pattern the columns themselves enforce. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,119}$/;
export const GROUP_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,59}$/;

export function isHttpUrl(value: string): boolean {
  if (value.trim().length === 0) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function titleIssues(title: string, field = 'title'): CreateIssue[] {
  const trimmed = title.trim();
  if (trimmed.length < CREATE_LIMITS.titleMin) {
    return [{ field, messageKey: 'create.errors.titleShort' }];
  }
  if (trimmed.length > CREATE_LIMITS.titleMax) {
    return [{ field, messageKey: 'create.errors.titleLong' }];
  }
  return [];
}

function descriptionIssues(
  description: string,
  max: number,
  field = 'description',
  min: number = CREATE_LIMITS.descriptionMin,
): CreateIssue[] {
  const trimmed = description.trim();
  if (trimmed.length < min) return [{ field, messageKey: 'create.errors.descriptionShort' }];
  if (trimmed.length > max) return [{ field, messageKey: 'create.errors.descriptionLong' }];
  return [];
}

/** Two ends of a range, blamed on the end that is wrong. */
function rangeIssues(
  min: number | null,
  max: number | null,
  minField: string,
  maxField: string,
  orderKey: string,
): CreateIssue[] {
  if (min !== null && min < 0) return [{ field: minField, messageKey: 'create.errors.negative' }];
  if (max !== null && max < 0) return [{ field: maxField, messageKey: 'create.errors.negative' }];
  if (min !== null && max !== null && max < min) return [{ field: maxField, messageKey: orderKey }];
  return [];
}

function skillIssues(skills: readonly string[]): CreateIssue[] {
  if (skills.length > CREATE_LIMITS.skillsMax) {
    return [{ field: 'skills', messageKey: 'create.errors.tooManySkills' }];
  }
  return [];
}

export function validateEventDraft(draft: EventDraftInput): CreateIssue[] {
  const issues: CreateIssue[] = [...titleIssues(draft.title)];
  issues.push(
    ...descriptionIssues(draft.description, CREATE_LIMITS.eventDescriptionMax, 'description', 10),
  );

  const starts = draft.startsAt.length > 0 ? new Date(draft.startsAt).getTime() : Number.NaN;
  const ends = draft.endsAt.length > 0 ? new Date(draft.endsAt).getTime() : Number.NaN;
  if (Number.isNaN(starts))
    issues.push({ field: 'startsAt', messageKey: 'create.errors.startsRequired' });
  if (Number.isNaN(ends))
    issues.push({ field: 'endsAt', messageKey: 'create.errors.endsRequired' });
  if (!Number.isNaN(starts) && !Number.isNaN(ends) && ends <= starts) {
    issues.push({ field: 'endsAt', messageKey: 'create.errors.endsAfterStarts' });
  }

  // The column checks these two, and a member who books a room wants them too.
  const needsUrl = draft.mode === 'online' || draft.mode === 'hybrid';
  if (needsUrl && draft.joinUrl.trim().length === 0) {
    issues.push({ field: 'joinUrl', messageKey: 'create.errors.joinUrlRequired' });
  }
  const needsVenue = draft.mode === 'in_person' || draft.mode === 'hybrid';
  if (needsVenue && draft.venue.trim().length === 0) {
    issues.push({ field: 'venue', messageKey: 'create.errors.venueRequired' });
  }
  if (draft.venue.length > CREATE_LIMITS.venueMax) {
    issues.push({ field: 'venue', messageKey: 'create.errors.tooLong' });
  }
  if (draft.city.length > CREATE_LIMITS.cityMax) {
    issues.push({ field: 'city', messageKey: 'create.errors.tooLong' });
  }
  if (draft.capacity !== null && draft.capacity <= 0) {
    issues.push({ field: 'capacity', messageKey: 'create.errors.capacity' });
  }
  if (!isHttpUrl(draft.joinUrl)) {
    issues.push({ field: 'joinUrl', messageKey: 'create.errors.notAUrl' });
  }
  if (!isHttpUrl(draft.coverUrl)) {
    issues.push({ field: 'coverUrl', messageKey: 'create.errors.notAUrl' });
  }
  return issues;
}

export function validateJobDraft(draft: JobDraftInput): CreateIssue[] {
  const issues: CreateIssue[] = [...titleIssues(draft.title)];
  const company = draft.company.trim();
  if (company.length < CREATE_LIMITS.companyMin) {
    issues.push({ field: 'company', messageKey: 'create.errors.companyShort' });
  }
  if (company.length > CREATE_LIMITS.companyMax) {
    issues.push({ field: 'company', messageKey: 'create.errors.companyLong' });
  }
  issues.push(...descriptionIssues(draft.description, CREATE_LIMITS.descriptionMax));
  // The column's own rule: a job that is not remote has to say where it is.
  if (draft.workMode !== 'remote' && draft.city.trim().length === 0) {
    issues.push({ field: 'city', messageKey: 'create.errors.cityRequired' });
  }
  if (draft.city.length > CREATE_LIMITS.cityMax) {
    issues.push({ field: 'city', messageKey: 'create.errors.tooLong' });
  }
  issues.push(
    ...rangeIssues(
      draft.salaryMin,
      draft.salaryMax,
      'salaryMin',
      'salaryMax',
      'create.errors.salaryOrder',
    ),
  );
  issues.push(...skillIssues(draft.skills));
  if (!isHttpUrl(draft.applyUrl)) {
    issues.push({ field: 'applyUrl', messageKey: 'create.errors.notAUrl' });
  }
  return issues;
}

export function validateGigDraft(draft: GigDraftInput): CreateIssue[] {
  const issues: CreateIssue[] = [...titleIssues(draft.title)];
  issues.push(...descriptionIssues(draft.description, CREATE_LIMITS.descriptionMax));
  issues.push(
    ...rangeIssues(
      draft.budgetMin,
      draft.budgetMax,
      'budgetMin',
      'budgetMax',
      'create.errors.budgetOrder',
    ),
  );
  if (draft.durationDays !== null) {
    if (draft.durationDays < 1 || draft.durationDays > CREATE_LIMITS.durationDaysMax) {
      issues.push({ field: 'durationDays', messageKey: 'create.errors.duration' });
    }
  }
  issues.push(...skillIssues(draft.skills));
  return issues;
}

export function validateProjectDraft(draft: ProjectDraftInput): CreateIssue[] {
  const issues: CreateIssue[] = [];
  const name = draft.name.trim();
  if (name.length < CREATE_LIMITS.projectNameMin) {
    issues.push({ field: 'name', messageKey: 'create.errors.nameShort' });
  }
  if (name.length > CREATE_LIMITS.projectNameMax) {
    issues.push({ field: 'name', messageKey: 'create.errors.nameLong' });
  }
  if (draft.tagline.length > CREATE_LIMITS.taglineMax) {
    issues.push({ field: 'tagline', messageKey: 'create.errors.tooLong' });
  }
  issues.push(
    ...descriptionIssues(draft.description, CREATE_LIMITS.descriptionMax, 'description', 10),
  );
  issues.push(...skillIssues(draft.tech));
  for (const [field, value] of [
    ['repoUrl', draft.repoUrl],
    ['demoUrl', draft.demoUrl],
    ['coverUrl', draft.coverUrl],
  ] as const) {
    if (!isHttpUrl(value)) issues.push({ field, messageKey: 'create.errors.notAUrl' });
  }
  return issues;
}

/** Validate only the visible project step; step 3 checks the complete draft. */
export function validateProjectDraftStep(
  draft: ProjectDraftInput,
  step: ProjectStep,
): CreateIssue[] {
  if (step === 3) return validateProjectDraft(draft);
  const fields: Record<Exclude<ProjectStep, 3>, readonly string[]> = {
    0: ['name', 'tagline', 'description'],
    1: ['repoUrl', 'demoUrl', 'tech'],
    2: [],
  };
  return validateProjectDraft(draft).filter((issue) => fields[step].includes(issue.field));
}

export function validateGroupDraft(draft: GroupDraftInput): CreateIssue[] {
  const issues: CreateIssue[] = [];
  const name = draft.name.trim();
  if (name.length < CREATE_LIMITS.groupNameMin) {
    issues.push({ field: 'name', messageKey: 'create.errors.groupNameShort' });
  }
  if (name.length > CREATE_LIMITS.groupNameMax) {
    issues.push({ field: 'name', messageKey: 'create.errors.groupNameLong' });
  }
  if (!GROUP_SLUG_PATTERN.test(draft.slug.trim())) {
    issues.push({ field: 'slug', messageKey: 'create.errors.slugInvalid' });
  }
  if (draft.description.length > CREATE_LIMITS.groupDescriptionMax) {
    issues.push({ field: 'description', messageKey: 'create.errors.descriptionLong' });
  }
  return issues;
}

/** What a member is about to create, checked before the write is attempted. */
export function validateCreateDraft(
  kind: CreateKind,
  draft: EventDraftInput | JobDraftInput | GigDraftInput | ProjectDraftInput | GroupDraftInput,
): CreateIssue[] {
  switch (kind) {
    case 'event':
      return validateEventDraft(draft as EventDraftInput);
    case 'job':
      return validateJobDraft(draft as JobDraftInput);
    case 'gig':
      return validateGigDraft(draft as GigDraftInput);
    case 'project':
      return validateProjectDraft(draft as ProjectDraftInput);
    case 'group':
      return validateGroupDraft(draft as GroupDraftInput);
  }
}

/**
 * Where a member lands after creating one.
 *
 * Groups and projects have public permalinks, so those creators land on the
 * page they just published. The other three go back to their directory.
 */
export function createdPath(kind: CreateKind, slugOrId: string): string {
  switch (kind) {
    case 'group':
      return groupPath(slugOrId);
    case 'event':
      return ROUTES.events;
    case 'job':
      return ROUTES.jobs;
    case 'gig':
      return ROUTES.freelance;
    case 'project':
      return projectPath(slugOrId);
  }
}
