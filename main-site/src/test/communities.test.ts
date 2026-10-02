import { describe, expect, it } from 'vitest';
import {
  canAdministerGroup,
  canModerateGroup,
  groupEventsByDay,
  isEventFull,
  isEventLive,
  joinAction,
  sortMembers,
  type CommunityEvent,
  type GroupMemberEntry,
  type GroupSummary,
} from '@/lib/communities/community-types';

function group(overrides: Partial<GroupSummary> = {}): GroupSummary {
  return {
    id: 'g1',
    slug: 'dhaka-react',
    name: 'Dhaka React',
    description: '',
    privacy: 'public',
    avatarUrl: '',
    members: 10,
    posts: 3,
    myRole: null,
    requestStatus: null,
    ...overrides,
  };
}

function event(overrides: Partial<CommunityEvent> = {}): CommunityEvent {
  return {
    id: 'e1',
    slug: 'meetup',
    title: 'Meetup',
    mode: 'online',
    venue: '',
    city: '',
    coverUrl: '',
    startsAt: '2026-10-05T10:00:00.000Z',
    endsAt: '2026-10-05T12:00:00.000Z',
    capacity: null,
    going: 0,
    groupId: null,
    pageId: null,
    myStatus: null,
    ...overrides,
  };
}

describe('group privileges', () => {
  it('treats moderator and above as able to moderate', () => {
    expect(canModerateGroup('owner')).toBe(true);
    expect(canModerateGroup('admin')).toBe(true);
    expect(canModerateGroup('moderator')).toBe(true);
    expect(canModerateGroup('member')).toBe(false);
    expect(canModerateGroup(null)).toBe(false);
  });

  it('keeps administration above moderation', () => {
    expect(canAdministerGroup('moderator')).toBe(false);
    expect(canAdministerGroup('admin')).toBe(true);
  });
});

describe('joinAction', () => {
  it('offers nothing to a guest', () => {
    expect(joinAction(group(), false)).toBe('closed');
  });

  it('opens the group for an existing member', () => {
    expect(joinAction(group({ myRole: 'member' }), true)).toBe('open');
  });

  it('joins a public group instantly and queues a private one', () => {
    expect(joinAction(group(), true)).toBe('join');
    expect(joinAction(group({ privacy: 'private' }), true)).toBe('request');
  });

  it('shows a pending request instead of a second one', () => {
    expect(joinAction(group({ privacy: 'private', requestStatus: 'pending' }), true)).toBe(
      'pending',
    );
  });

  it('refuses a secret group to a non-member', () => {
    expect(joinAction(group({ privacy: 'secret' }), true)).toBe('closed');
  });
});

describe('sortMembers', () => {
  it('ranks by role, then by seniority', () => {
    const members: GroupMemberEntry[] = [
      {
        uid: 'm',
        role: 'member',
        joinedAt: '2026-01-01T00:00:00.000Z',
        username: 'm',
        displayName: 'M',
        avatarUrl: '',
      },
      {
        uid: 'o',
        role: 'owner',
        joinedAt: '2026-02-01T00:00:00.000Z',
        username: 'o',
        displayName: 'O',
        avatarUrl: '',
      },
      {
        uid: 'a2',
        role: 'admin',
        joinedAt: '2026-03-01T00:00:00.000Z',
        username: 'a2',
        displayName: 'A2',
        avatarUrl: '',
      },
      {
        uid: 'a1',
        role: 'admin',
        joinedAt: '2026-01-15T00:00:00.000Z',
        username: 'a1',
        displayName: 'A1',
        avatarUrl: '',
      },
    ];
    expect(sortMembers(members).map((member) => member.uid)).toEqual(['o', 'a1', 'a2', 'm']);
  });
});

describe('events', () => {
  it('reports a full event only for members who are not already going', () => {
    expect(isEventFull(event({ capacity: 10, going: 10 }))).toBe(true);
    expect(isEventFull(event({ capacity: 10, going: 10, myStatus: 'going' }))).toBe(false);
    expect(isEventFull(event({ capacity: null, going: 999 }))).toBe(false);
  });

  it('knows when an event is happening right now', () => {
    const now = Date.parse('2026-10-05T11:00:00.000Z');
    expect(isEventLive(event(), now)).toBe(true);
    expect(isEventLive(event(), Date.parse('2026-10-05T09:00:00.000Z'))).toBe(false);
    expect(isEventLive(event(), Date.parse('2026-10-05T13:00:00.000Z'))).toBe(false);
  });

  it('groups by calendar day in chronological order', () => {
    const days = groupEventsByDay([
      event({
        id: 'late',
        startsAt: '2026-10-06T09:00:00.000Z',
        endsAt: '2026-10-06T10:00:00.000Z',
      }),
      event({
        id: 'early',
        startsAt: '2026-10-05T09:00:00.000Z',
        endsAt: '2026-10-05T10:00:00.000Z',
      }),
      event({
        id: 'same-day',
        startsAt: '2026-10-05T18:00:00.000Z',
        endsAt: '2026-10-05T19:00:00.000Z',
      }),
    ]);

    expect(days.map((entry) => entry.day)).toEqual(['2026-10-05', '2026-10-06']);
    expect(days[0]?.events.map((item) => item.id)).toEqual(['early', 'same-day']);
  });

  it('returns nothing for an empty calendar', () => {
    expect(groupEventsByDay([])).toEqual([]);
  });
});
