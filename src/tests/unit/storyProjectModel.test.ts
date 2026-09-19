/**
 * BSDC — src/tests/unit/storyProjectModel.test.ts
 * Purpose : Proves that stories disappear on time, and that projects say honestly whether they
 *   need help.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A story's expiry is a promise, so it is tested at the exact boundary: a story is live
 *   one second before its expiry and gone at the instant it passes, for everybody, regardless of
 *   who is looking. Expiry is written at creation and never extended, which is what makes that true.
 *   A project's "we need help" line is derived from its own roles rather than stored separately, so
 *   the two can never disagree — a project with every role filled is not recruiting, whatever its
 *   owner checked when they published it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { RETENTION } from '@/core/config/limits';
import { PROJECT_STATUSES } from '@/core/config/opportunities';
import {
  groupByAuthor,
  hoursRemaining,
  isExpired,
  newStory,
  partitionByExpiry,
  storyProgress,
  type NewStoryInput,
  type Story,
} from '@/entities/story/model';
import {
  isRecruiting,
  newProject,
  openRoleCount,
  projectStatuses,
  sortProjects,
  validateProject,
  type NewProjectInput,
  type Project,
} from '@/entities/project/model';

const NOW = new Date('2026-06-01T06:00:00.000Z');

function storyDraft(overrides: Partial<NewStoryInput> = {}): NewStoryInput {
  return {
    authorUid: 'u1',
    authorName: 'Tanvir Ahmed',
    authorNameBn: 'তানভীর আহমেদ',
    authorUsername: 'tanvir',
    authorPhotoUrl: '',
    mediaUrl: 'https://images.example.test/story/tanvir-1.jpg',
    caption: 'First day at the Sylhet workshop.',
    ...overrides,
  };
}

function story(overrides: Partial<NewStoryInput> = {}): Story {
  return newStory({ ...storyDraft(overrides), now: NOW });
}

describe('a story expires when it says it will', () => {
  it('lives for exactly the retention window', () => {
    const made = story();
    expect(made.expiresAt).toBe(
      new Date(NOW.getTime() + RETENTION.storyHours * 3_600_000).toISOString(),
    );
  });

  it('is live one second before the deadline and gone at the deadline', () => {
    const made = story();
    const justBefore = new Date(Date.parse(made.expiresAt) - 1000);
    expect(isExpired(made, justBefore)).toBe(false);
    expect(isExpired(made, new Date(Date.parse(made.expiresAt)))).toBe(true);
  });

  it('is gone the moment it is taken down, whatever its expiry says', () => {
    const takenDown: Story = { ...story(), deletedAt: '2026-06-01T06:30:00.000Z' };
    expect(isExpired(takenDown, NOW)).toBe(true);
  });

  it('counts down whole hours, and never reports less than zero', () => {
    const made = story();
    expect(hoursRemaining(made, NOW)).toBe(RETENTION.storyHours);
    expect(hoursRemaining(made, new Date(NOW.getTime() + 90 * 60_000))).toBe(
      RETENTION.storyHours - 2,
    );
    expect(hoursRemaining(made, new Date(NOW.getTime() + 48 * 3_600_000))).toBe(0);
  });

  it('moves from zero progress to full progress across its life', () => {
    const made = story();
    expect(storyProgress(made, NOW)).toBe(0);
    expect(storyProgress(made, new Date(NOW.getTime() + 12 * 3_600_000))).toBeCloseTo(0.5, 2);
    expect(storyProgress(made, new Date(Date.parse(made.expiresAt)))).toBe(1);
  });
});

describe('story lists', () => {
  it('splits live stories from finished ones', () => {
    const { live, expired } = partitionByExpiry(
      [story(), { ...story(), expiresAt: '2026-05-01T00:00:00.000Z' }],
      NOW,
    );
    expect(live).toHaveLength(1);
    expect(expired).toHaveLength(1);
  });

  it('shows one ring per author, with their frames in the order they posted them', () => {
    const older = newStory({ ...storyDraft({ caption: 'Morning' }), now: NOW });
    const newer = newStory({
      ...storyDraft({ caption: 'Afternoon' }),
      now: new Date(NOW.getTime() + 3_600_000),
    });
    const other = newStory({
      ...storyDraft({ authorUid: 'u2', authorUsername: 'ayesha' }),
      now: NOW,
    });
    const groups = groupByAuthor([newer, other, older], NOW);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.authorUid).toBe('u1');
    expect(groups[0]?.frames.map((frame) => frame.caption)).toEqual(['Morning', 'Afternoon']);
  });

  it('leaves an author out entirely once all their frames have expired', () => {
    const gone = { ...story(), expiresAt: '2026-05-01T00:00:00.000Z' };
    expect(groupByAuthor([gone], NOW)).toHaveLength(0);
  });
});

function projectDraft(overrides: Partial<NewProjectInput> = {}): NewProjectInput {
  return {
    ownerUid: 'u1',
    ownerName: 'Tanvir Ahmed',
    title: 'BSDC job board',
    summary: 'An open job board for the Bangladeshi software community.',
    ...overrides,
  };
}

function project(overrides: Partial<NewProjectInput> = {}): Project {
  return newProject({ ...projectDraft(overrides), now: NOW });
}

describe('projects', () => {
  it('refuses a project with no name or no summary', () => {
    expect(validateProject(projectDraft())).toBeNull();
    expect(validateProject(projectDraft({ title: ' ' }))).toBe('BSDC-DATA-007');
    expect(validateProject(projectDraft({ summary: ' ' }))).toBe('BSDC-DATA-007');
  });

  it('starts the owner as the only member', () => {
    const made = project();
    expect(made.memberUids).toEqual(['u1']);
    expect(made.status).toBe('planning');
  });

  it('asks for help only when a role is actually open', () => {
    const open = project({
      rolesWanted: [{ title: 'Backend', commitment: 'hours', filled: false }],
    });
    expect(isRecruiting(open)).toBe(true);
    expect(openRoleCount(open)).toBe(1);
    expect(open.lookingForMembers).toBe(true);

    const filled = project({
      rolesWanted: [{ title: 'Backend', commitment: 'hours', filled: true }],
    });
    expect(isRecruiting(filled)).toBe(false);
    expect(filled.lookingForMembers).toBe(false);
  });

  it('stops asking once the project is archived, even with an open role', () => {
    const archived = project({
      status: 'archived',
      rolesWanted: [{ title: 'Backend', commitment: 'hours', filled: false }],
    });
    expect(isRecruiting(archived)).toBe(false);
  });

  it('puts the projects that want help at the front of the directory', () => {
    const quiet = project({ title: 'Quiet', status: 'active' });
    const asking = project({
      title: 'Asking',
      status: 'active',
      rolesWanted: [{ title: 'Designer', commitment: 'hours', filled: false }],
    });
    const planning = project({ title: 'Planning', status: 'planning' });
    expect(sortProjects([planning, quiet, asking]).map((entry) => entry.title)[0]).toBe('Asking');
    expect(sortProjects([planning, quiet, asking]).map((entry) => entry.title)).toEqual([
      'Asking',
      'Quiet',
      'Planning',
    ]);
  });

  it('offers the same statuses in the filter rail and the form', () => {
    expect(projectStatuses()).toEqual(PROJECT_STATUSES);
  });
});
