import { describe, expect, it } from 'vitest';
import { normaliseSkill, normaliseSkills } from './skills';

describe('skills', () => {
  it('reduces a skill to its canonical form', () => {
    expect(normaliseSkill('  React   Native ')).toBe('react native');
  });

  it('drops blanks and duplicates, and sorts the rest', () => {
    expect(normaliseSkills(['TypeScript', ' react', 'react ', '', '   ', 'Node JS'])).toEqual([
      'node js',
      'react',
      'typescript',
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(normaliseSkills([])).toEqual([]);
  });
});

describe('job skill filter', () => {
  it('finds a job whatever the case the filter or the posting was typed in', async () => {
    const { filterJobs, EMPTY_JOB_FILTERS } = await import('./opportunity-types');
    const jobs = [
      {
        id: 'a',
        slug: 'a',
        title: 'Frontend',
        company: 'X',
        jobType: 'full_time',
        workMode: 'remote',
        level: 'mid',
        city: '',
        salaryMin: null,
        salaryMax: null,
        currency: 'BDT',
        period: 'month',
        skills: normaliseSkills(['React', ' TypeScript ']),
        applications: 0,
        publishedAt: null,
        myStatus: null,
      },
    ] as const;
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, skill: 'REACT' })).toHaveLength(1);
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, skill: 'Vue' })).toHaveLength(0);
  });
});
