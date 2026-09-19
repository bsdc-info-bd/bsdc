/**
 * BSDC — src/tests/unit/jobModel.test.ts
 * Purpose : Proves the job board's honesty rules: salary, deadlines and applications.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The salary line is the one people read first and the one most job boards get wrong, so
 *   it is tested at every edge: disclosed, hidden, single figure, one end of the range missing.
 *   An undisclosed salary renders as nothing at all rather than a row of zeroes, because zeroes
 *   look like a number and a number that is not real wastes everybody's afternoon.
 *   Withdrawal is allowed while a candidacy is live and not after a decision, which is the rule the
 *   candidate actually needs to be able to rely on.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_COVER_LETTER_CHARS,
  countByStatus,
  daysToDeadline,
  isDecisionStatus,
  isJobOpen,
  isWithdrawable,
  newApplication,
  newJob,
  salaryLine,
  validateApplication,
  validateJob,
  type Job,
  type NewApplicationInput,
  type NewJobInput,
} from '@/entities/job/model';

const NOW = new Date('2026-06-01T06:00:00.000Z');

function draft(overrides: Partial<NewJobInput> = {}): NewJobInput {
  return {
    employerUid: 'e1',
    companyName: 'RRC Development',
    title: 'Backend Engineer',
    description: 'Build and maintain the BSDC platform.',
    employmentType: 'full-time',
    workplaceType: 'remote',
    location: 'Sylhet',
    division: 'sylhet',
    salaryMin: 50000,
    salaryMax: 90000,
    ...overrides,
  };
}

function job(overrides: Partial<NewJobInput> = {}): Job {
  return newJob(draft(overrides));
}

describe('job validation', () => {
  it('accepts a job with a title and a company', () => {
    expect(validateJob(draft())).toBeNull();
  });

  it('refuses a job with an empty title or company', () => {
    expect(validateJob(draft({ title: '  ' }))).toBe('BSDC-DATA-007');
    expect(validateJob(draft({ companyName: ' ' }))).toBe('BSDC-DATA-007');
  });

  it('refuses a range whose top is below its bottom instead of swapping them', () => {
    expect(validateJob(draft({ salaryMin: 90000, salaryMax: 50000 }))).toBe('BSDC-JOB-004');
  });
});

describe('salary lines', () => {
  it('renders a range when both ends are given', () => {
    expect(salaryLine(job(), '৳')).toBe('৳50,000 - ৳90,000');
  });

  it('renders a single figure when both ends are the same', () => {
    expect(salaryLine(job({ salaryMin: 60000, salaryMax: 60000 }), '৳')).toBe('৳60,000');
  });

  it('renders the one end that was given', () => {
    expect(salaryLine(job({ salaryMin: 0, salaryMax: 70000 }), '৳')).toBe('৳70,000');
    expect(salaryLine(job({ salaryMin: 70000, salaryMax: 0 }), '৳')).toBe('৳70,000');
  });

  it('renders nothing when the employer chose not to disclose', () => {
    expect(salaryLine(job({ salaryMin: 0, salaryMax: 0 }), '৳')).toBe('');
    expect(job({ salaryMin: 0, salaryMax: 0 }).salaryDisclosed).toBe(false);
  });
});

describe('deadlines', () => {
  it('keeps a job with no deadline open', () => {
    const open = job({ deadlineAt: null });
    expect(isJobOpen(open, NOW)).toBe(true);
    expect(daysToDeadline(open, NOW)).toBeNull();
  });

  it('counts down to a deadline and closes on the day', () => {
    const closing = job({ deadlineAt: '2026-06-04T18:00:00.000Z' });
    expect(daysToDeadline(closing, NOW)).toBe(4);
    expect(isJobOpen(closing, NOW)).toBe(true);
    expect(isJobOpen(closing, new Date('2026-06-05T00:00:00.000Z'))).toBe(false);
    expect(daysToDeadline(closing, new Date('2026-06-05T00:00:00.000Z'))).toBe(0);
  });

  it('closes a job that was filled or withdrawn', () => {
    expect(isJobOpen(job({ status: 'closed' }), NOW)).toBe(false);
  });
});

describe('applications', () => {
  const application: NewApplicationInput = {
    jobId: 'j1',
    uid: 'u9',
    applicantName: 'Ayesha Rahman',
    applicantHeadline: 'Backend engineer',
    applicantPhotoUrl: '',
    coverLetter: 'x'.repeat(MIN_COVER_LETTER_CHARS),
  };

  it('accepts an application with a real cover letter', () => {
    expect(validateApplication(application, job(), NOW)).toBeNull();
  });

  it('refuses an application that says almost nothing', () => {
    expect(
      validateApplication(
        { ...application, coverLetter: 'Interested please consider' },
        job(),
        NOW,
      ),
    ).toBe('BSDC-JOB-003');
  });

  it('refuses an application once the deadline has passed', () => {
    const closed = job({ deadlineAt: '2026-05-01T00:00:00.000Z' });
    expect(validateApplication(application, closed, NOW)).toBe('BSDC-JOB-001');
  });

  it('keys the application by account id so a duplicate is impossible', () => {
    const created = newApplication(application);
    expect(created.id).toBe('u9');
    expect(created.status).toBe('submitted');
    expect(created.employerNote).toBe('');
  });

  it('clamps an unrealistic notice period instead of storing it', () => {
    expect(newApplication({ ...application, noticeDays: 9999 }).noticeDays).toBe(180);
    expect(newApplication({ ...application, noticeDays: -5 }).noticeDays).toBe(0);
  });

  it('lets a candidate withdraw while the candidacy is live, and not after a decision', () => {
    const created = newApplication(application);
    expect(isWithdrawable(created)).toBe(true);
    expect(isWithdrawable({ ...created, status: 'shortlisted' })).toBe(true);
    expect(isWithdrawable({ ...created, status: 'hired' })).toBe(false);
    expect(isWithdrawable({ ...created, status: 'rejected' })).toBe(false);
    expect(isWithdrawable({ ...created, deletedAt: '2026-06-02T00:00:00.000Z' })).toBe(false);
  });

  it('names the statuses a candidate should hear about at once', () => {
    expect(isDecisionStatus('offered')).toBe(true);
    expect(isDecisionStatus('hired')).toBe(true);
    expect(isDecisionStatus('rejected')).toBe(true);
    expect(isDecisionStatus('reviewing')).toBe(false);
  });

  it('counts applications by status and ignores withdrawn ones', () => {
    const created = newApplication(application);
    const counts = countByStatus([
      created,
      { ...created, uid: 'u10', id: 'u10', status: 'shortlisted' },
      { ...created, uid: 'u11', id: 'u11', status: 'shortlisted' },
      {
        ...created,
        uid: 'u12',
        id: 'u12',
        status: 'submitted',
        deletedAt: '2026-06-02T00:00:00.000Z',
      },
    ]);
    expect(counts.submitted).toBe(1);
    expect(counts.shortlisted).toBe(2);
    expect(counts.hired).toBe(0);
  });
});
