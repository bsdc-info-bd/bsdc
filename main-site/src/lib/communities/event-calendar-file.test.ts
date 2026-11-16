import { describe, expect, it } from 'vitest';
import {
  buildEventIcs,
  escapeIcsText,
  foldIcsLine,
  icsFileName,
  toIcsUtc,
  type CalendarFileEvent,
} from './event-calendar-file';

const base: CalendarFileEvent = {
  id: '3f2a9c1e-0000-4000-8000-000000000001',
  slug: 'friday-meetup',
  title: 'Friday meetup, Dhaka',
  description: 'Bring a laptop; questions welcome.\nDoors at 9.',
  startsAt: '2026-11-13T04:00:00.000Z',
  endsAt: '2026-11-13T06:00:00.000Z',
  venue: 'Sylhet Hub',
  city: 'Sylhet',
  mode: 'in_person',
  url: 'https://bsdc.info.bd/events/friday-meetup',
  isCancelled: false,
};

describe('event calendar file', () => {
  it('writes UTC instants in iCalendar form', () => {
    expect(toIcsUtc('2026-11-13T04:00:00.000Z')).toBe('20261113T040000Z');
  });

  it('escapes the characters RFC 5545 reserves', () => {
    expect(escapeIcsText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
  });

  it('folds long lines at 75 octets without splitting a character', () => {
    const folded = foldIcsLine('এ'.repeat(60));
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line.replace(/^ /, '')).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe('এ'.repeat(60));
  });

  it('builds a valid single-event document with CRLF endings', () => {
    const ics = buildEventIcs(base, '2026-11-11T00:00:00.000Z');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261113T040000Z\r\n');
    expect(ics).toContain('DTEND:20261113T060000Z\r\n');
    expect(ics).toContain('SUMMARY:Friday meetup\\, Dhaka\r\n');
    expect(ics).toContain('LOCATION:Sylhet Hub\\, Sylhet\r\n');
    expect(ics).toContain('STATUS:CONFIRMED\r\n');
    expect(ics).toContain(`UID:${base.id}@bsdc.info.bd\r\n`);
  });

  it('uses the join address as the location of an online event', () => {
    const ics = buildEventIcs(
      { ...base, mode: 'online', venue: '', city: '' },
      '2026-11-11T00:00:00.000Z',
    );
    expect(ics).toContain(`LOCATION:${base.url}\r\n`);
  });

  it('publishes a cancelled event as cancelled', () => {
    expect(buildEventIcs({ ...base, isCancelled: true }, '2026-11-11T00:00:00.000Z')).toContain(
      'STATUS:CANCELLED\r\n',
    );
  });

  it('names the file from a safe slug', () => {
    expect(icsFileName('Friday Meetup!')).toBe('Friday-Meetup.ics');
    expect(icsFileName('')).toBe('event.ics');
  });
});
