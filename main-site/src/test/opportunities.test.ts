import { describe, expect, it } from 'vitest';
import {
  buildSandboxDocument,
  canWithdraw,
  EMPTY_JOB_FILTERS,
  filterJobs,
  formatSalaryRange,
  isApplied,
  isDecided,
  skillFacets,
  type JobListing,
} from '@/lib/opportunities/opportunity-types';

function job(partial: Partial<JobListing>): JobListing {
  return {
    id: 'job-1',
    slug: 'job-1',
    title: 'Backend Engineer',
    company: 'Nexus Labs',
    jobType: 'full_time',
    workMode: 'remote',
    level: 'mid',
    city: 'Dhaka',
    salaryMin: 60000,
    salaryMax: 90000,
    currency: 'BDT',
    period: 'month',
    skills: ['go', 'postgres'],
    applications: 3,
    publishedAt: '2026-01-01T00:00:00.000Z',
    myStatus: null,
    ...partial,
  };
}

describe('formatSalaryRange', () => {
  it('returns null when the employer stated no figure', () => {
    expect(formatSalaryRange(null, null, 'BDT', 'en')).toBeNull();
  });

  it('collapses an equal band to a single figure', () => {
    const value = formatSalaryRange(50000, 50000, 'BDT', 'en');
    expect(value).not.toBeNull();
    expect(value).not.toContain('–');
  });

  it('keeps both ends of a real band', () => {
    expect(formatSalaryRange(50000, 70000, 'BDT', 'en')).toContain('–');
  });

  it('uses only the known end when one side is missing', () => {
    const floorOnly = formatSalaryRange(40000, null, 'BDT', 'en');
    expect(floorOnly).not.toBeNull();
    expect(floorOnly).not.toContain('–');
  });
});

describe('application status helpers', () => {
  it('allows withdrawing only while the application is live', () => {
    expect(canWithdraw('submitted')).toBe(true);
    expect(canWithdraw('shortlisted')).toBe(true);
    expect(canWithdraw('hired')).toBe(false);
    expect(canWithdraw('withdrawn')).toBe(false);
    expect(canWithdraw(null)).toBe(false);
  });

  it('treats a withdrawn application as not applied', () => {
    expect(isApplied('submitted')).toBe(true);
    expect(isApplied('withdrawn')).toBe(false);
    expect(isApplied(null)).toBe(false);
  });

  it('marks terminal states as decided', () => {
    expect(isDecided('rejected')).toBe(true);
    expect(isDecided('hired')).toBe(true);
    expect(isDecided('reviewing')).toBe(false);
  });
});

describe('filterJobs', () => {
  const jobs = [
    job({ id: 'a', title: 'Backend Engineer', skills: ['go', 'postgres'], level: 'mid' }),
    job({
      id: 'b',
      title: 'Frontend Engineer',
      company: 'Pixel',
      city: 'Sylhet',
      skills: ['react', 'typescript'],
      level: 'senior',
      workMode: 'onsite',
    }),
  ];

  it('returns everything when no filter is set', () => {
    expect(filterJobs(jobs, EMPTY_JOB_FILTERS)).toHaveLength(2);
  });

  it('matches the query against title, company, city and skills', () => {
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, query: 'sylhet' })).toHaveLength(1);
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, query: 'POSTGRES' })).toHaveLength(1);
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, query: 'pixel' })).toHaveLength(1);
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, query: 'engineer' })).toHaveLength(2);
  });

  it('narrows by level and work mode', () => {
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, level: 'senior' })).toHaveLength(1);
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, workMode: 'remote' })).toHaveLength(1);
  });

  it('matches skills case-insensitively', () => {
    expect(filterJobs(jobs, { ...EMPTY_JOB_FILTERS, skill: 'React' })).toHaveLength(1);
  });
});

describe('skillFacets', () => {
  it('orders by frequency then alphabetically and respects the limit', () => {
    const jobs = [
      job({ id: 'a', skills: ['react', 'go'] }),
      job({ id: 'b', skills: ['react', 'sql'] }),
      job({ id: 'c', skills: ['react', 'go'] }),
    ];
    expect(skillFacets(jobs)).toEqual(['react', 'go', 'sql']);
    expect(skillFacets(jobs, 2)).toEqual(['react', 'go']);
  });

  it('returns nothing for an empty result set', () => {
    expect(skillFacets([])).toEqual([]);
  });
});

describe('buildSandboxDocument', () => {
  it('escapes SQL so it is displayed, never executed', () => {
    const doc = buildSandboxDocument('sql', 'select * from users where name = "<script>"');
    expect(doc).toContain('&lt;script&gt;');
    expect(doc).not.toContain('<script>');
  });

  it('wraps CSS in a style element rather than running it as markup', () => {
    expect(buildSandboxDocument('css', 'body{color:red}')).toContain('<style>body{color:red}');
  });

  it('passes HTML through untouched', () => {
    expect(buildSandboxDocument('html', '<p>hello</p>')).toBe('<p>hello</p>');
  });

  it('gives JavaScript a console bridge and an error guard', () => {
    const doc = buildSandboxDocument('javascript', 'console.log(1)');
    expect(doc).toContain('console.log=print');
    expect(doc).toContain('catch(error)');
    expect(doc).toContain('console.log(1)');
  });

  it('does not strip TypeScript annotations, so the frame reports the truth', () => {
    const doc = buildSandboxDocument('typescript', 'const n: number = 1;');
    expect(doc).toContain('const n: number = 1;');
  });
});
