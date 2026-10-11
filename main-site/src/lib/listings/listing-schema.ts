import type { EventDetail } from '@/lib/communities/community-types';
import type { JobDetail } from '@/lib/opportunities/opportunity-types';
import { SITE } from '@/lib/site';

/**
 * Returns the URL only when it is an absolute http or https address. Anything
 * else (javascript:, data:, a bare word, an empty string) is refused, so a
 * poster cannot make an apply link run script for every reader.
 */
export function safeExternalUrl(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A job is live when it is open and has not passed its closing time. */
export function jobIsLive(job: Pick<JobDetail, 'status' | 'expiresAt'>, now = Date.now()): boolean {
  if (job.status !== 'open') return false;
  return job.expiresAt === null || Date.parse(job.expiresAt) > now;
}

const EMPLOYMENT_TYPE: Record<JobDetail['jobType'], string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
};

const SALARY_UNIT: Record<string, string> = { hour: 'HOUR', month: 'MONTH', year: 'YEAR' };

const COUNTRY_NAME: Record<string, string> = { BD: 'Bangladesh' };

/**
 * schema.org JobPosting for a live role. Returns null when the role has no
 * publication date, because search engines reject a posting without one.
 */
export function jobPostingJsonLd(job: JobDetail, url: string): Record<string, unknown> | null {
  if (job.publishedAt === null) return null;
  const remote = job.workMode === 'remote';
  const hasSalary = job.salaryMin !== null || job.salaryMax !== null;

  return {
    '@type': 'JobPosting',
    title: job.title,
    description: job.description.length > 0 ? job.description : job.title,
    datePosted: job.publishedAt,
    ...(job.expiresAt !== null ? { validThrough: job.expiresAt } : {}),
    employmentType: EMPLOYMENT_TYPE[job.jobType],
    hiringOrganization: { '@type': 'Organization', name: job.company },
    ...(remote
      ? {
          jobLocationType: 'TELECOMMUTE',
          applicantLocationRequirements: {
            '@type': 'Country',
            name: COUNTRY_NAME[job.country] ?? job.country,
          },
        }
      : {
          jobLocation: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressLocality: job.city,
              addressCountry: job.country,
            },
          },
        }),
    ...(hasSalary
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: job.currency,
            value: {
              '@type': 'QuantitativeValue',
              minValue: job.salaryMin ?? job.salaryMax,
              maxValue: job.salaryMax ?? job.salaryMin,
              unitText: SALARY_UNIT[job.period] ?? 'MONTH',
            },
          },
        }
      : {}),
    ...(job.skills.length > 0 ? { skills: job.skills.join(', ') } : {}),
    url,
  };
}

const ATTENDANCE_MODE: Record<EventDetail['mode'], string> = {
  online: 'https://schema.org/OnlineEventAttendanceMode',
  in_person: 'https://schema.org/OfflineEventAttendanceMode',
  hybrid: 'https://schema.org/MixedEventAttendanceMode',
};

/**
 * schema.org Event for one event page. The location points at the event's own
 * page, never at the join link, which is released only to attendees.
 */
export function eventJsonLd(event: EventDetail, url: string): Record<string, unknown> {
  const place = {
    '@type': 'Place',
    name: event.venue,
    address: { '@type': 'PostalAddress', addressLocality: event.city, addressCountry: 'BD' },
  };
  const virtual = { '@type': 'VirtualLocation', url };
  const location =
    event.mode === 'online' ? virtual : event.mode === 'in_person' ? place : [place, virtual];

  return {
    '@type': 'Event',
    name: event.title,
    description: event.description.length > 0 ? event.description : event.title,
    url,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: event.isCancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: ATTENDANCE_MODE[event.mode],
    location,
    organizer: { '@type': 'Organization', name: SITE.shortName, url: SITE.url },
    ...(event.coverUrl.length > 0 ? { image: event.coverUrl } : {}),
  };
}

/**
 * Formats an instant in the event's own time zone. The zone is stored as free
 * text, so an unrecognised name falls back to Dhaka rather than throwing inside
 * a render and blanking the page.
 */
export function formatInZone(
  iso: string,
  zone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'Asia/Dhaka' }).format(date);
  }
}
