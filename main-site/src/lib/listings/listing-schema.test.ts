import { describe, expect, it } from 'vitest';
import type { EventDetail } from '@/lib/communities/community-types';
import type { JobDetail } from '@/lib/opportunities/opportunity-types';
import {
  eventJsonLd,
  formatInZone,
  jobIsLive,
  jobPostingJsonLd,
  safeExternalUrl,
} from './listing-schema';

const NOW = Date.parse('2026-10-11T06:00:00Z');

function job(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    id: 'job-1',
    slug: 'senior-backend',
    title: 'Senior Backend Engineer',
    company: 'Shohoz Labs',
    jobType: 'full_time',
    workMode: 'hybrid',
    level: 'senior',
    city: 'Dhaka',
    salaryMin: 150000,
    salaryMax: 220000,
    currency: 'BDT',
    period: 'month',
    skills: ['node', 'postgres'],
    applications: 3,
    publishedAt: '2026-10-01T00:00:00Z',
    myStatus: null,
    description: 'Build payment rails.',
    country: 'BD',
    applyUrl: '',
    status: 'open',
    expiresAt: '2026-11-01T00:00:00Z',
    posterUid: 'uid-1',
    ...overrides,
  };
}

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'evt-1',
    slug: 'friday-meetup',
    title: 'Friday Meetup',
    mode: 'online',
    venue: '',
    city: '',
    coverUrl: '',
    startsAt: '2026-10-15T12:00:00Z',
    endsAt: '2026-10-15T14:00:00Z',
    capacity: null,
    going: 4,
    groupId: null,
    pageId: null,
    myStatus: null,
    description: 'Talks on Postgres.',
    joinUrl: 'https://meet.example.com/secret-room',
    timezone: 'Asia/Dhaka',
    isCancelled: false,
    hostUid: 'uid-1',
    ...overrides,
  };
}

describe('safeExternalUrl', () => {
  it('accepts an absolute https or http address and normalises it', () => {
    expect(safeExternalUrl('https://example.com/apply')).toBe('https://example.com/apply');
    expect(safeExternalUrl('  http://example.com  ')).toBe('http://example.com/');
  });

  it('refuses script, data and relative addresses', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(safeExternalUrl('/relative/path')).toBeNull();
    expect(safeExternalUrl('mailto:someone@example.com')).toBeNull();
  });

  it('treats an empty or unparseable value as absent', () => {
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl('   ')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
  });
});

describe('jobIsLive', () => {
  it('is live when open with no closing time', () => {
    expect(jobIsLive(job({ expiresAt: null }), NOW)).toBe(true);
  });

  it('is live before its closing time', () => {
    expect(jobIsLive(job({ expiresAt: '2026-11-01T00:00:00Z' }), NOW)).toBe(true);
  });

  it('is not live at or after its closing time', () => {
    expect(jobIsLive(job({ expiresAt: '2026-10-11T06:00:00Z' }), NOW)).toBe(false);
    expect(jobIsLive(job({ expiresAt: '2026-10-01T00:00:00Z' }), NOW)).toBe(false);
  });

  it('is not live unless open', () => {
    expect(jobIsLive(job({ status: 'closed', expiresAt: null }), NOW)).toBe(false);
    expect(jobIsLive(job({ status: 'paused', expiresAt: null }), NOW)).toBe(false);
    expect(jobIsLive(job({ status: 'draft', expiresAt: null }), NOW)).toBe(false);
  });
});

describe('jobPostingJsonLd', () => {
  const url = 'https://www.bsdc.info.bd/jobs/senior-backend';

  it('returns null for a role with no publication date', () => {
    expect(jobPostingJsonLd(job({ publishedAt: null }), url)).toBeNull();
  });

  it('describes an on-site or hybrid role with a place and a closing date', () => {
    const node = jobPostingJsonLd(job(), url);
    expect(node).toMatchObject({
      '@type': 'JobPosting',
      title: 'Senior Backend Engineer',
      employmentType: 'FULL_TIME',
      validThrough: '2026-11-01T00:00:00Z',
      jobLocation: {
        '@type': 'Place',
        address: { addressLocality: 'Dhaka', addressCountry: 'BD' },
      },
      url,
    });
    expect(node).not.toHaveProperty('jobLocationType');
  });

  it('marks a remote role as telecommute and names the country it accepts', () => {
    const node = jobPostingJsonLd(job({ workMode: 'remote', city: '' }), url);
    expect(node).toMatchObject({
      jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements: { '@type': 'Country', name: 'Bangladesh' },
    });
    expect(node).not.toHaveProperty('jobLocation');
  });

  it('maps every job type to its schema.org employment type', () => {
    expect(jobPostingJsonLd(job({ jobType: 'part_time' }), url)).toMatchObject({
      employmentType: 'PART_TIME',
    });
    expect(jobPostingJsonLd(job({ jobType: 'contract' }), url)).toMatchObject({
      employmentType: 'CONTRACTOR',
    });
    expect(jobPostingJsonLd(job({ jobType: 'internship' }), url)).toMatchObject({
      employmentType: 'INTERN',
    });
  });

  it('expresses the salary with its unit, and fills a missing bound from the other', () => {
    expect(jobPostingJsonLd(job(), url)).toMatchObject({
      baseSalary: {
        currency: 'BDT',
        value: { minValue: 150000, maxValue: 220000, unitText: 'MONTH' },
      },
    });
    expect(
      jobPostingJsonLd(job({ salaryMin: null, salaryMax: 90000, period: 'hour' }), url),
    ).toMatchObject({
      baseSalary: { value: { minValue: 90000, maxValue: 90000, unitText: 'HOUR' } },
    });
  });

  it('omits the salary, the closing date and the skills when they are absent', () => {
    const node = jobPostingJsonLd(
      job({ salaryMin: null, salaryMax: null, expiresAt: null, skills: [] }),
      url,
    );
    expect(node).not.toHaveProperty('baseSalary');
    expect(node).not.toHaveProperty('validThrough');
    expect(node).not.toHaveProperty('skills');
  });
});

describe('eventJsonLd', () => {
  const url = 'https://www.bsdc.info.bd/events/friday-meetup';

  it('points an online event at its own page, never at the join link', () => {
    const node = eventJsonLd(event(), url);
    expect(node).toMatchObject({
      '@type': 'Event',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url },
    });
    expect(JSON.stringify(node)).not.toContain('secret-room');
  });

  it('marks a cancelled event as cancelled', () => {
    expect(eventJsonLd(event({ isCancelled: true }), url)).toMatchObject({
      eventStatus: 'https://schema.org/EventCancelled',
    });
  });

  it('gives an in-person event a place with its venue', () => {
    const node = eventJsonLd(
      event({ mode: 'in_person', venue: 'Sylhet Tech Hub', city: 'Sylhet', joinUrl: '' }),
      url,
    );
    expect(node).toMatchObject({
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'Sylhet Tech Hub' },
    });
  });

  it('lists both a place and a virtual location for a hybrid event', () => {
    const node = eventJsonLd(
      event({ mode: 'hybrid', venue: 'Sylhet Tech Hub', city: 'Sylhet' }),
      url,
    );
    expect(node).toMatchObject({
      eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
    });
    expect(node.location).toEqual([
      expect.objectContaining({ '@type': 'Place', name: 'Sylhet Tech Hub' }),
      { '@type': 'VirtualLocation', url },
    ]);
  });

  it('includes the cover image only when there is one', () => {
    expect(eventJsonLd(event({ coverUrl: 'https://i.example/cover.jpg' }), url)).toHaveProperty(
      'image',
      'https://i.example/cover.jpg',
    );
    expect(eventJsonLd(event(), url)).not.toHaveProperty('image');
  });
});

describe('formatInZone', () => {
  const short = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;

  it('renders the instant in the named zone, not the reader zone', () => {
    // 12:00 UTC is 18:00 in Dhaka, which is UTC+6 with no daylight saving.
    expect(formatInZone('2026-10-15T12:00:00Z', 'Asia/Dhaka', 'en-GB', short)).toBe('18:00');
    expect(formatInZone('2026-10-15T12:00:00Z', 'UTC', 'en-GB', short)).toBe('12:00');
  });

  it('falls back to Dhaka for a zone name the runtime does not know', () => {
    expect(formatInZone('2026-10-15T12:00:00Z', 'Mars/Olympus', 'en-GB', short)).toBe('18:00');
  });
});
