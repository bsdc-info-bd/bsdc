import { describe, expect, it } from 'vitest';
import {
  dayKeyInZone,
  groupEventsByDay,
  parseDayKey,
  type CommunityEvent,
} from './community-types';

function ev(id: string, startsAt: string, timezone = 'Asia/Dhaka'): CommunityEvent {
  return {
    id,
    slug: id,
    title: id,
    mode: 'in_person',
    venue: '',
    city: '',
    coverUrl: '',
    startsAt,
    endsAt: startsAt,
    timezone,
    capacity: null,
    going: 0,
    groupId: null,
    pageId: null,
    myStatus: null,
  };
}

describe('event days in their own zone', () => {
  it('puts a 00:30 Dhaka event on its Dhaka day, not the UTC day before', () => {
    // 00:30 on 12 Nov in Dhaka is 18:30 UTC on 11 Nov.
    expect(dayKeyInZone('2026-11-11T18:30:00.000Z', 'Asia/Dhaka')).toBe('2026-11-12');
  });

  it('uses the event zone for the day, whatever the reader is', () => {
    expect(dayKeyInZone('2026-11-11T18:30:00.000Z', 'UTC')).toBe('2026-11-11');
  });

  it('falls back to Dhaka for a zone that does not exist', () => {
    expect(dayKeyInZone('2026-11-11T18:30:00.000Z', 'Not/AZone')).toBe('2026-11-12');
  });

  it('groups by those days in order', () => {
    const days = groupEventsByDay([
      ev('late', '2026-11-13T10:00:00.000Z'),
      ev('night', '2026-11-11T18:30:00.000Z'),
      ev('same', '2026-11-12T03:00:00.000Z'),
    ]);
    expect(days.map((d) => d.day)).toEqual(['2026-11-12', '2026-11-13']);
    expect(days[0]?.events.map((e) => e.id)).toEqual(['night', 'same']);
  });

  it('parses a day key to the same calendar date in every zone', () => {
    const date = parseDayKey('2026-11-12');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10);
    expect(date.getDate()).toBe(12);
  });
});
