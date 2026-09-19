/**
 * BSDC — src/tests/unit/eventModel.test.ts
 * Purpose : Proves event validation, phase, seat maths and RSVP waiting-list behaviour.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The rules tested here are the ones a person notices: an event they were told was open
 *   refusing their answer, a list that disagrees with its own detail page about whether an event is
 *   live, and a waiting list that quietly drops somebody who said yes.
 *   Every date is injected. No test depends on the clock.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { BD_TIMEZONE } from '@/shared/lib/date';
import {
  eventPhase,
  isRsvpOpen,
  landsOnWaitingList,
  newEvent,
  newRsvp,
  osmLink,
  seatsLeft,
  sortEvents,
  validateEvent,
  venueThumbnail,
  type NewEventInput,
} from '@/entities/event/model';

const NOW = new Date('2026-03-01T06:00:00.000Z');

function draft(overrides: Partial<NewEventInput> = {}): NewEventInput {
  return {
    ownerUid: 'u1',
    ownerName: 'Rizwan',
    title: 'Sylhet Dev Meetup',
    titleBn: 'সিলেট ডেভ মিটআপ',
    description: 'An evening of short talks.',
    mode: 'onsite',
    venue: {
      label: 'SUST Central Auditorium',
      addressLine: 'Kumargaon',
      area: 'Akhalia',
      division: 'sylhet',
      countryCode: 'BD',
      latitude: 24.9045,
      longitude: 91.8611,
      zoom: 16,
    },
    onlineUrl: '',
    startsAt: '2026-04-01T12:00:00.000Z',
    endsAt: '2026-04-01T15:00:00.000Z',
    timezone: BD_TIMEZONE,
    capacity: 40,
    ...overrides,
  };
}

describe('event validation', () => {
  it('accepts an on-site event with a venue', () => {
    expect(validateEvent(draft()).ok).toBe(true);
  });

  it('refuses an on-site event with no place to go', () => {
    const result = validateEvent(draft({ venue: null }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('BSDC-EVT-003');
  });

  it('refuses an online event with no way to join', () => {
    const result = validateEvent(draft({ mode: 'online', venue: null, onlineUrl: '  ' }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('BSDC-EVT-003');
  });

  it('refuses an event that ends before it starts', () => {
    const result = validateEvent(draft({ endsAt: '2026-03-31T12:00:00.000Z' }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('BSDC-EVT-001');
  });

  it('refuses an event with no title', () => {
    expect(validateEvent(draft({ title: '   ' })).code).toBe('BSDC-DATA-007');
  });
});

describe('event phase', () => {
  it('reports an event as upcoming before it starts', () => {
    expect(eventPhase(newEvent(draft()), NOW)).toBe('upcoming');
  });

  it('reports an event as live while it runs', () => {
    const event = newEvent(draft());
    expect(eventPhase(event, new Date('2026-04-01T13:00:00.000Z'))).toBe('live');
  });

  it('reports an event as ended after it finishes', () => {
    const event = newEvent(draft());
    expect(eventPhase(event, new Date('2026-04-02T00:00:00.000Z'))).toBe('ended');
  });

  it('reports a cancelled event as cancelled even while it would be running', () => {
    const event = newEvent(draft({ status: 'cancelled' }));
    expect(eventPhase(event, new Date('2026-04-01T13:00:00.000Z'))).toBe('cancelled');
  });
});

describe('seats and the waiting list', () => {
  it('leaves zero capacity as an unlimited event', () => {
    const event = newEvent(draft({ capacity: 0 }));
    expect(seatsLeft(event)).toBeNull();
    expect(isRsvpOpen(event, NOW)).toBe(true);
  });

  it('puts a person on the waiting list once the seats are gone', () => {
    const event = { ...newEvent(draft({ capacity: 2 })), rsvpCount: 2 };
    expect(seatsLeft(event)).toBe(0);
    expect(landsOnWaitingList(event, 'going')).toBe(true);
    expect(landsOnWaitingList(event, 'interested')).toBe(false);
  });

  it('keeps registration open for a waiting list but not once the event has finished', () => {
    const full = { ...newEvent(draft({ capacity: 2 })), rsvpCount: 2 };
    expect(isRsvpOpen(full, NOW)).toBe(true);
    const finished = newEvent(
      draft({ startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-01T03:00:00.000Z' }),
    );
    expect(isRsvpOpen(finished, NOW)).toBe(false);
  });

  it('closes registration on an event that was withdrawn', () => {
    expect(isRsvpOpen(newEvent(draft({ status: 'draft' })), NOW)).toBe(false);
  });

  it('records whether an answer was waitlisted, and keys the document by account id', () => {
    const full = { ...newEvent(draft({ capacity: 2 })), rsvpCount: 2 };
    const rsvp = newRsvp('e1', 'u2', 'going', full);
    expect(rsvp.id).toBe('u2');
    expect(rsvp.waitlisted).toBe(true);
    expect(rsvp.deletedAt).toBeNull();
  });
});

describe('event ordering and maps', () => {
  it('puts the next event first, and finished ones last', () => {
    const soon = newEvent(
      draft({
        title: 'Soon',
        startsAt: '2026-03-10T10:00:00.000Z',
        endsAt: '2026-03-10T13:00:00.000Z',
      }),
    );
    const past = newEvent(
      draft({
        title: 'Past',
        startsAt: '2026-01-10T10:00:00.000Z',
        endsAt: '2026-01-10T13:00:00.000Z',
      }),
    );
    const later = newEvent(
      draft({
        title: 'Later',
        startsAt: '2026-05-10T10:00:00.000Z',
        endsAt: '2026-05-10T13:00:00.000Z',
      }),
    );
    const ordered = sortEvents([later, past, soon], NOW);
    expect(ordered.map((event) => event.title)).toEqual(['Soon', 'Later', 'Past']);
  });

  it('builds an OpenStreetMap link and a static thumbnail', () => {
    const venue = draft().venue;
    expect(venue).not.toBeNull();
    if (venue === null || venue === undefined) throw new Error('venue missing');
    expect(osmLink(venue)).toContain('openstreetmap.org');
    expect(venueThumbnail(venue)).toContain('staticmap');
  });
});
