/**
 * BSDC — src/entities/project/model.ts
 * Purpose : The project entity: what someone is building, and who is helping.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A project is the honest version of a portfolio entry: it says what the thing is, what
 *   stage it is at, what it is built with and what kind of help it needs. `shipped` is a state you
 *   have to claim, not a badge you are given, and `archived` is how a project stops asking for
 *   attention without pretending it never existed.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { TEXT_LIMITS } from '@/core/config/limits';
import { uid } from '@/shared/lib/uid';
import { PROJECT_STATUSES, type ProjectStatus } from '@/core/config/opportunities';

/** A role a project is looking for. */
export interface ProjectRole {
  readonly title: string;
  readonly commitment: 'hours' | 'part-time' | 'full-time';
  readonly filled: boolean;
}

/** A community project. */
export interface Project {
  readonly id: string;
  readonly ownerUid: string;
  readonly ownerName: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly repoUrl: string;
  readonly demoUrl: string;
  readonly coverUrl: string;
  readonly stack: readonly string[];
  readonly rolesWanted: readonly ProjectRole[];
  readonly memberUids: readonly string[];
  readonly lookingForMembers: boolean;
  readonly likeCount: number;
  readonly commentCount: number;
  readonly status: ProjectStatus;
  readonly visibility: 'public' | 'members';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Values needed to create a project. */
export interface NewProjectInput {
  readonly ownerUid: string;
  readonly ownerName: string;
  readonly title: string;
  readonly summary: string;
  readonly description?: string | undefined;
  readonly repoUrl?: string | undefined;
  readonly demoUrl?: string | undefined;
  readonly coverUrl?: string | undefined;
  readonly stack?: readonly string[] | undefined;
  readonly rolesWanted?: readonly ProjectRole[] | undefined;
  readonly status?: ProjectStatus | undefined;
  readonly visibility?: 'public' | 'members' | undefined;
  readonly now?: Date | undefined;
}

/**
 * Builds a project entity.
 * @param input project values
 * @returns a complete project entity
 */
export function newProject(input: NewProjectInput): Project {
  const now = (input.now ?? new Date()).toISOString();
  const rolesWanted = input.rolesWanted ?? [];
  return {
    id: uid(20),
    ownerUid: input.ownerUid,
    ownerName: input.ownerName,
    title: input.title.trim(),
    summary: input.summary.trim().slice(0, 240),
    description: (input.description ?? '').slice(0, TEXT_LIMITS.productDescription),
    repoUrl: input.repoUrl ?? '',
    demoUrl: input.demoUrl ?? '',
    coverUrl: input.coverUrl ?? '',
    stack: input.stack ?? [],
    rolesWanted,
    memberUids: [input.ownerUid],
    lookingForMembers: rolesWanted.some((role) => !role.filled),
    likeCount: 0,
    commentCount: 0,
    status: input.status ?? 'planning',
    visibility: input.visibility ?? 'public',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Validates a project draft.
 * @param input the draft
 * @returns null when valid, otherwise the BSDC error code to surface
 */
export function validateProject(input: NewProjectInput): 'BSDC-DATA-007' | null {
  if (input.title.trim().length === 0) return 'BSDC-DATA-007';
  if (input.summary.trim().length === 0) return 'BSDC-DATA-007';
  return null;
}

/**
 * Reports whether a project is still asking for help.
 * @param project the project
 * @returns true when an unfilled role exists and the project is not over
 */
export function isRecruiting(project: Project): boolean {
  if (project.status === 'archived') return false;
  return project.lookingForMembers && project.rolesWanted.some((role) => !role.filled);
}

/**
 * Counts the unfilled roles a project is advertising.
 * @param project the project
 * @returns the number of open roles
 */
export function openRoleCount(project: Project): number {
  return project.rolesWanted.filter((role) => !role.filled).length;
}

/** Presentation order for project filters: work in progress first, then what shipped. */
const STATUS_ORDER: readonly ProjectStatus[] = [
  'active',
  'planning',
  'shipped',
  'paused',
  'archived',
];

/**
 * Sorts projects for a directory: recruiting and active first, then by recency.
 * @param projects the projects
 * @returns a sorted copy
 */
export function sortProjects(projects: readonly Project[]): readonly Project[] {
  return [...projects].sort((left, right) => {
    const leftRank = STATUS_ORDER.indexOf(left.status);
    const rightRank = STATUS_ORDER.indexOf(right.status);
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (isRecruiting(left) !== isRecruiting(right)) return isRecruiting(left) ? -1 : 1;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

/**
 * Lists every status in presentation order, so a filter rail and a form agree.
 * @returns the statuses
 */
export function projectStatuses(): readonly ProjectStatus[] {
  return PROJECT_STATUSES;
}
