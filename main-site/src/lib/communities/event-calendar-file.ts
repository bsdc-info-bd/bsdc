import type { CommunityEvent, EventDetail } from './community-types';

/** The fields an .ics file needs. Times are instants; the calendar app shows them in the reader's zone. */
export interface CalendarFileEvent {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venue: string;
  readonly city: string;
  readonly mode: CommunityEvent['mode'];
  readonly url: string;
  readonly isCancelled: boolean;
}

const UTF8 = new TextEncoder();
const MAX_OCTETS = 75;

/** iCalendar UTC timestamp, e.g. 20261106T040000Z. */
export function toIcsUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** Escapes text per RFC 5545: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds a content line at 75 octets, never splitting a UTF-8 character; continuation lines start with a space. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let currentOctets = 0;
  let limit = MAX_OCTETS;
  for (const char of line) {
    const size = UTF8.encode(char).length;
    if (currentOctets + size > limit) {
      parts.push(current);
      current = '';
      currentOctets = 0;
      limit = MAX_OCTETS - 1; // continuation lines begin with one space
    }
    current += char;
    currentOctets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** A complete single-event iCalendar document. Cancelled events are published as CANCELLED. */
export function buildEventIcs(event: CalendarFileEvent, nowIso: string): string {
  const location =
    event.mode === 'online'
      ? event.url
      : [event.venue, event.city].filter((part) => part.trim().length > 0).join(', ');
  const description = [event.description.trim(), event.url].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BSDC//Community Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@bsdc.info.bd`,
    `DTSTAMP:${toIcsUtc(nowIso)}`,
    `DTSTART:${toIcsUtc(event.startsAt)}`,
    `DTEND:${toIcsUtc(event.endsAt)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `URL:${event.url}`,
    `STATUS:${event.isCancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** A safe, predictable download name for an event's calendar file. */
export function icsFileName(slug: string): string {
  const safe = slug.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe.length > 0 ? safe : 'event'}.ics`;
}

/** The calendar file for a loaded event page, with the page's own address. */
export function calendarFileForDetail(event: EventDetail, url: string): CalendarFileEvent {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venue: event.venue,
    city: event.city,
    mode: event.mode,
    url,
    isCancelled: event.isCancelled,
  };
}
