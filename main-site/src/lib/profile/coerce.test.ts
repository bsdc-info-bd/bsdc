import { describe, expect, it } from 'vitest';
import {
  coerceList,
  coerceNotifications,
  coercePrivacy,
  coerceProfile,
  coerceText,
  coerceTimestamp,
  PROFILE_LIMITS,
} from './coerce';
import type { ProfileRow } from '@/lib/supabase/types';
import { rowToProfile } from './supabase-backend';

/** A row exactly as the database stores it: every column present and sane. */
function row(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    uid: 'uid-1',
    username: 'rafi_dev',
    display_name: 'Rafi Ahmed',
    bio: 'Builds things in Sylhet.',
    avatar_url: 'https://images.example/avatar.png',
    cover_url: '',
    location: 'Sylhet',
    website: 'https://rafi.example',
    skills: ['typescript', 'react'],
    interests: ['open-source'],
    language: 'bn',
    role: 'member',
    status: 'active',
    onboarding_complete: true,
    email_verified: true,
    notifications: {
      followers: true,
      comments: true,
      mentions: true,
      messages: true,
      digest: true,
    },
    privacy: { discoverable: true, showActivity: true, showEmail: false },
    followers_count: 12,
    following_count: 30,
    posts_count: 4,
    reputation: 88,
    last_seen_at: '2026-10-08T10:00:00.000Z',
    created_at: '2026-01-04T10:00:00.000Z',
    updated_at: '2026-10-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('coerceText', () => {
  it('trims, clamps and falls back', () => {
    expect(coerceText('  Rafi  ', 60)).toBe('Rafi');
    expect(coerceText('x'.repeat(300), 280)).toHaveLength(280);
    expect(coerceText('', 60, 'Member')).toBe('Member');
    expect(coerceText(null, 60, 'Member')).toBe('Member');
    expect(coerceText(42, 60, 'Member')).toBe('Member');
  });
});

describe('coerceList', () => {
  it('drops what is not a usable string', () => {
    expect(coerceList(['a', '', '   ', 7, null, 'b'], 20, 32)).toEqual(['a', 'b']);
    expect(coerceList('not-an-array', 20, 32)).toEqual([]);
    expect(coerceList(undefined, 20, 32)).toEqual([]);
  });

  it('clamps each entry and caps the list', () => {
    const long = coerceList(['x'.repeat(80)], 20, 32);
    expect(long[0]).toHaveLength(32);
    const many = coerceList(
      Array.from({ length: 40 }, (_unused, index) => `skill-${String(index)}`),
      PROFILE_LIMITS.skills.items,
      PROFILE_LIMITS.skills.length,
    );
    expect(many).toHaveLength(PROFILE_LIMITS.skills.items);
  });

  it('keeps the first of two entries that differ only in case', () => {
    expect(coerceList(['React', 'react', 'REACT'], 20, 32)).toEqual(['React']);
  });

  it('keeps the order the member chose', () => {
    expect(coerceList(['c', 'a', 'b'], 20, 32)).toEqual(['c', 'a', 'b']);
  });
});

describe('coerceProfile', () => {
  it('reads a normal row without changing it', () => {
    const profile = coerceProfile({
      uid: 'uid-1',
      username: 'rafi_dev',
      displayName: 'Rafi Ahmed',
      avatarUrl: 'https://images.example/avatar.png',
      language: 'bn',
      createdAt: '2026-01-04T10:00:00.000Z',
      updatedAt: '2026-10-08T10:00:00.000Z',
    });
    expect(profile?.username).toBe('rafi_dev');
    expect(profile?.avatarUrl).toBe('https://images.example/avatar.png');
    expect(profile?.language).toBe('bn');
  });

  it('is null only when there is no member to describe', () => {
    expect(coerceProfile({ uid: '' })).toBeNull();
    expect(coerceProfile({})).toBeNull();
    expect(coerceProfile({ uid: '   ' })).toBeNull();
  });

  it('keeps a profile whose handle was never claimed', () => {
    const profile = coerceProfile({ uid: 'uid-1', username: null, displayName: 'Rafi Ahmed' });
    expect(profile?.username).toBe('');
    expect(profile?.displayName).toBe('Rafi Ahmed');
  });
});

describe('a row that exists is a profile that exists', () => {
  it('survives a skills array the columns happily stored', () => {
    // text[] has no length or element check, so all of these are storable —
    // and a strict schema used to reject the row, avatar and all.
    const hostile = row({
      skills: ['x'.repeat(80), '', '  ', 'typescript'],
      interests: ['a'.repeat(200)],
    });
    const profile = rowToProfile(hostile);
    expect(profile).not.toBeNull();
    expect(profile?.avatarUrl).toBe('https://images.example/avatar.png');
    expect(profile?.skills).toEqual(['x'.repeat(32), 'typescript']);
    expect(profile?.interests?.[0]).toHaveLength(32);
  });

  it('survives a display name over the client limit and an empty one', () => {
    expect(rowToProfile(row({ display_name: 'n'.repeat(90) }))?.displayName).toHaveLength(60);
    expect(rowToProfile(row({ display_name: '' }))?.displayName).toBe('Member');
  });

  it('survives jsonb that does not match the shape, field by field', () => {
    const profile = rowToProfile(
      row({ notifications: { followers: 'yes', digest: null }, privacy: {} }),
    );
    expect(profile?.notifications.followers).toBe(true);
    expect(profile?.notifications.digest).toBe(true);
    expect(profile?.privacy.showEmail).toBe(false);
  });

  it('survives a language the enum does not know', () => {
    expect(rowToProfile(row({ language: 'hi' }))?.language).toBe('bn');
    expect(rowToProfile(row({ language: 'en' }))?.language).toBe('en');
  });

  it('survives timestamps that are not strings', () => {
    const profile = rowToProfile(row({ created_at: null as unknown as string, updated_at: '' }));
    expect(coerceTimestamp(profile?.createdAt)).toBe('1970-01-01T00:00:00.000Z');
    expect(typeof profile?.updatedAt).toBe('string');
  });

  it('carries the cover picture the column has always held', () => {
    const profile = rowToProfile(row({ cover_url: 'https://images.example/cover.png' }));
    expect(profile?.coverUrl).toBe('https://images.example/cover.png');
  });

  it('defaults the fields a cache document written before them simply lacks', () => {
    expect(coerceNotifications(undefined)).toEqual({
      followers: true,
      comments: true,
      mentions: true,
      messages: true,
      digest: true,
    });
    expect(coercePrivacy(null).showEmail).toBe(false);
    expect(coerceProfile({ uid: 'uid-1' })?.skills).toEqual([]);
  });
});
