import { describe, expect, it } from 'vitest';

import {
  CREATE_LIMITS,
  EMPTY_EVENT,
  EMPTY_GIG,
  EMPTY_GROUP,
  EMPTY_JOB,
  EMPTY_PROJECT,
  GROUP_SLUG_PATTERN,
  PROJECT_LAST_STEP,
  SLUG_PATTERN,
  createdPath,
  isHttpUrl,
  validateCreateDraft,
  validateEventDraft,
  validateGigDraft,
  validateGroupDraft,
  validateJobDraft,
  validateProjectDraft,
  validateProjectDraftStep,
} from './create-types';

const GOOD_EVENT = {
  ...EMPTY_EVENT,
  title: 'Sylhet Developer Meetup',
  description: 'An evening of talks and the sort of arguments only Bangladeshi developers have.',
  mode: 'in_person' as const,
  venue: 'Zindabazar Community Hall',
  city: 'Sylhet',
  startsAt: '2027-03-04T18:00',
  endsAt: '2027-03-04T21:00',
};

const GOOD_JOB = {
  ...EMPTY_JOB,
  title: 'Senior Platform Engineer',
  company: 'BSDC',
  description: 'Own the data layer: migrations, the queue, and the incidents that come with it.',
  workMode: 'remote' as const,
  skills: ['postgres', 'typescript'],
};

function fields(issues: readonly { field: string }[]): string[] {
  return issues.map((issue) => issue.field);
}

describe('an event', () => {
  it('accepts a complete one', () => {
    expect(validateEventDraft(GOOD_EVENT)).toEqual([]);
  });

  it('demands a title the column would take', () => {
    expect(fields(validateEventDraft({ ...GOOD_EVENT, title: 'no' }))).toContain('title');
    expect(fields(validateEventDraft({ ...GOOD_EVENT, title: 'x'.repeat(141) }))).toContain(
      'title',
    );
  });

  // events_ends_after_start
  it('insists the end comes after the start', () => {
    expect(fields(validateEventDraft({ ...GOOD_EVENT, endsAt: GOOD_EVENT.startsAt }))).toContain(
      'endsAt',
    );
    expect(fields(validateEventDraft({ ...GOOD_EVENT, endsAt: '2027-03-04T17:00' }))).toContain(
      'endsAt',
    );
  });

  it('will not send an event with no dates at all', () => {
    const issues = validateEventDraft({ ...GOOD_EVENT, startsAt: '', endsAt: '' });
    expect(fields(issues)).toContain('startsAt');
    expect(fields(issues)).toContain('endsAt');
  });

  // events_online_has_url / events_in_person_has_venue
  it('matches the column checks on mode', () => {
    expect(fields(validateEventDraft({ ...GOOD_EVENT, mode: 'online', joinUrl: '' }))).toContain(
      'joinUrl',
    );
    expect(
      validateEventDraft({ ...GOOD_EVENT, mode: 'online', joinUrl: 'https://meet.bsdc.info.bd/x' }),
    ).toEqual([]);
    expect(fields(validateEventDraft({ ...GOOD_EVENT, mode: 'in_person', venue: '' }))).toContain(
      'venue',
    );
    expect(fields(validateEventDraft({ ...GOOD_EVENT, mode: 'hybrid', joinUrl: '' }))).toContain(
      'joinUrl',
    );
  });

  it('rejects a capacity of zero and a link that is not a link', () => {
    expect(fields(validateEventDraft({ ...GOOD_EVENT, capacity: 0 }))).toContain('capacity');
    expect(fields(validateEventDraft({ ...GOOD_EVENT, joinUrl: 'meet me there' }))).toContain(
      'joinUrl',
    );
  });
});

describe('a job', () => {
  it('accepts a remote posting with no city', () => {
    expect(validateJobDraft(GOOD_JOB)).toEqual([]);
  });

  // jobs_remote_or_city
  it('demands a city for anything that is not remote', () => {
    expect(fields(validateJobDraft({ ...GOOD_JOB, workMode: 'onsite' }))).toContain('city');
    expect(validateJobDraft({ ...GOOD_JOB, workMode: 'onsite', city: 'Dhaka' })).toEqual([]);
  });

  it('checks the company name and the salary order', () => {
    expect(fields(validateJobDraft({ ...GOOD_JOB, company: 'B' }))).toContain('company');
    expect(
      fields(validateJobDraft({ ...GOOD_JOB, salaryMin: 200_000, salaryMax: 80_000 })),
    ).toContain('salaryMax');
    expect(fields(validateJobDraft({ ...GOOD_JOB, salaryMin: -1 }))).toContain('salaryMin');
  });

  it('will not post a description that says nothing', () => {
    expect(fields(validateJobDraft({ ...GOOD_JOB, description: 'urgent' }))).toContain(
      'description',
    );
  });

  it('caps the skill list', () => {
    const skills = Array.from(
      { length: CREATE_LIMITS.skillsMax + 1 },
      (_, index) => `skill-${index}`,
    );
    expect(fields(validateJobDraft({ ...GOOD_JOB, skills }))).toContain('skills');
  });
});

describe('a gig', () => {
  const good = {
    ...EMPTY_GIG,
    title: "Illustrate a children's book",
    description: 'Twenty-four watercolour spreads, a cover, and two rounds of revision.',
    budgetMin: 40_000,
    budgetMax: 60_000,
  };

  it('accepts a complete one', () => expect(validateGigDraft(good)).toEqual([]));

  // gigs_budget_ordered
  it('insists the budget goes up', () => {
    expect(fields(validateGigDraft({ ...good, budgetMin: 60_000, budgetMax: 40_000 }))).toContain(
      'budgetMax',
    );
  });

  it('bounds the duration', () => {
    expect(fields(validateGigDraft({ ...good, durationDays: 0 }))).toContain('durationDays');
    expect(fields(validateGigDraft({ ...good, durationDays: 9_000 }))).toContain('durationDays');
    expect(validateGigDraft({ ...good, durationDays: 30 })).toEqual([]);
  });
});

describe('a project', () => {
  const good = {
    ...EMPTY_PROJECT,
    name: 'Padma',
    description: 'A river-level monitor that runs on a solar board and a prayer.',
    repoUrl: 'https://github.com/bsdc-info-bd/padma',
  };

  it('accepts a complete one', () => expect(validateProjectDraft(good)).toEqual([]));

  it('checks the name and the links', () => {
    expect(fields(validateProjectDraft({ ...good, name: 'P' }))).toContain('name');
    expect(fields(validateProjectDraft({ ...good, demoUrl: 'padma.bsdc' }))).toContain('demoUrl');
    // An empty link is fine: it means there is not one yet.
    expect(validateProjectDraft({ ...good, demoUrl: '' })).toEqual([]);
  });

  it('validates only the visible step, but the final review checks everything', () => {
    const invalidLinks = { ...good, name: 'P', demoUrl: 'not a URL' };
    expect(fields(validateProjectDraftStep(invalidLinks, 0))).toEqual(['name']);
    expect(fields(validateProjectDraftStep(invalidLinks, 1))).toEqual(['demoUrl']);
    // The cover and screenshot steps hold pictures, not text: there is nothing
    // on either screen for a member to get wrong, so neither blocks the way.
    expect(validateProjectDraftStep(invalidLinks, 2)).toEqual([]);
    expect(validateProjectDraftStep(invalidLinks, 3)).toEqual([]);
    expect(fields(validateProjectDraftStep(invalidLinks, PROJECT_LAST_STEP))).toEqual([
      'name',
      'demoUrl',
    ]);
  });

  it('keeps the review step last, so nothing publishes unreviewed', () => {
    // The wizard renders its review at PROJECT_LAST_STEP. Were that number ever
    // to drift from the validator's idea of "the final step", a member could
    // reach Publish with a draft the validator never fully checked.
    expect(PROJECT_LAST_STEP).toBe(4);
    expect(fields(validateProjectDraftStep({ ...good, name: 'P' }, PROJECT_LAST_STEP))).toEqual([
      'name',
    ]);
  });
});

describe('a group', () => {
  it('accepts a valid handle', () => {
    expect(
      validateGroupDraft({ ...EMPTY_GROUP, slug: 'sylhet-devs', name: 'Sylhet Devs' }),
    ).toEqual([]);
  });

  it('refuses a handle the column would refuse', () => {
    expect(
      fields(validateGroupDraft({ ...EMPTY_GROUP, slug: '-bad', name: 'Sylhet Devs' })),
    ).toContain('slug');
    expect(
      fields(validateGroupDraft({ ...EMPTY_GROUP, slug: 'ab', name: 'Sylhet Devs' })),
    ).toContain('slug');
    expect(
      fields(validateGroupDraft({ ...EMPTY_GROUP, slug: 'UPPER CASE', name: 'Sylhet Devs' })),
    ).toContain('slug');
  });

  it('bounds the name', () => {
    expect(fields(validateGroupDraft({ ...EMPTY_GROUP, slug: 'ok-slug', name: 'no' }))).toContain(
      'name',
    );
    expect(
      fields(validateGroupDraft({ ...EMPTY_GROUP, slug: 'ok-slug', name: 'x'.repeat(81) })),
    ).toContain('name');
  });
});

describe('the shared helpers', () => {
  it('routes a group to its own page and the rest to the list they join', () => {
    expect(createdPath('group', 'sylhet-devs')).toBe('/g/sylhet-devs');
    expect(createdPath('event', 'meetup')).toBe('/events');
    expect(createdPath('job', 'senior')).toBe('/jobs');
    expect(createdPath('gig', 'illustrate')).toBe('/freelance');
    expect(createdPath('project', 'padma')).toBe('/projects/padma');
  });

  it('reads a link the way the columns will', () => {
    expect(isHttpUrl('')).toBe(true);
    expect(isHttpUrl('https://bsdc.info.bd')).toBe(true);
    expect(isHttpUrl('http://localhost:5173')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('dispatches through the one door', () => {
    expect(validateCreateDraft('event', GOOD_EVENT)).toEqual([]);
    expect(validateCreateDraft('job', GOOD_JOB)).toEqual([]);
    expect(validateCreateDraft('group', EMPTY_GROUP).length).toBeGreaterThan(0);
  });

  it('generates slugs the columns accept', () => {
    // uniqueSlug is what the repository feeds these patterns.
    expect(SLUG_PATTERN.test('sylhet-developer-meetup-x7k2p9')).toBe(true);
    expect(GROUP_SLUG_PATTERN.test('sylhet-devs')).toBe(true);
    expect(GROUP_SLUG_PATTERN.test('a')).toBe(false);
  });
});
