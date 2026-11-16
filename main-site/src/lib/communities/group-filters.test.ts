import { describe, expect, it } from 'vitest';
import type { GroupSummary } from './community-types';
import { filterGroups } from './group-filters';

function group(overrides: Partial<GroupSummary>): GroupSummary {
  return {
    id: 'g',
    slug: 'g',
    name: 'Group',
    description: '',
    privacy: 'public',
    avatarUrl: '',
    members: 1,
    posts: 0,
    myRole: null,
    requestStatus: null,
    ...overrides,
  };
}

const groups = [
  group({ id: 'rust', slug: 'rust', name: 'Rust Dhaka', description: 'Systems programming' }),
  group({ id: 'react', slug: 'react', name: 'React Sylhet', myRole: 'member' }),
  group({ id: 'secret', slug: 'secret', name: 'Invite only', privacy: 'secret' }),
  group({ id: 'private', slug: 'private', name: 'Private guild', privacy: 'private' }),
];

describe('filterGroups', () => {
  it('returns everything for an empty query in the all scope', () => {
    expect(filterGroups(groups, '  ', 'all', false)).toHaveLength(4);
  });

  it('matches names and descriptions without regard to case', () => {
    expect(filterGroups(groups, 'SYSTEMS', 'all', false).map((g) => g.id)).toEqual(['rust']);
    expect(filterGroups(groups, 'sylhet', 'all', false).map((g) => g.id)).toEqual(['react']);
  });

  it('joined scope keeps only the groups the reader is a member of', () => {
    expect(filterGroups(groups, '', 'joined', true).map((g) => g.id)).toEqual(['react']);
  });

  it('open scope keeps groups the reader can still join or request', () => {
    expect(filterGroups(groups, '', 'open', true).map((g) => g.id)).toEqual(['rust', 'private']);
  });

  it('open scope is empty for a signed-out reader on invite-only and private groups', () => {
    expect(filterGroups(groups, '', 'open', false)).toEqual([]);
  });
});
