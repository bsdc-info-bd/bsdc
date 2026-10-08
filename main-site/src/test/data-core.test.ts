import { describe, expect, it } from 'vitest';
import { DataAccessBootstrapError } from '@/lib/auth/data-access';
import { cloudinaryConfigured } from '@/lib/env';
import { DEFAULT_FLAGS, isFlagEnabled, type FeatureFlag } from '@/lib/data/feature-flags';
import { fieldsToUpdate, onboardingInsert, rowToProfile } from '@/lib/profile/supabase-backend';
import {
  assertUploadable,
  chooseProvider,
  cloudinaryThumb,
  cloudinaryWide,
  kindOf,
  MAX_BYTES,
  MediaError,
} from '@/lib/storage/upload';
import { dataErrorKey } from '@/lib/supabase/errors';
import { profileErrorKey } from '@/lib/profile/profile-errors';
import { bootstrapDisplayName } from '@/lib/profile/profile-service';
import type { ProfileRow } from '@/lib/supabase/types';

const row: ProfileRow = {
  uid: 'uid-1',
  username: 'rafi_dev',
  display_name: 'Rafi Ahmed',
  bio: 'Builds things in Sylhet.',
  avatar_url: '',
  cover_url: '',
  location: 'Sylhet',
  website: '',
  skills: ['typescript'],
  interests: ['open-source'],
  language: 'bn',
  role: 'member',
  status: 'active',
  onboarding_complete: true,
  email_verified: true,
  notifications: { followers: false, comments: true, mentions: true, messages: true, digest: true },
  privacy: { discoverable: false, showActivity: true, showEmail: false },
  followers_count: 12,
  following_count: 4,
  posts_count: 3,
  reputation: 40,
  last_seen_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00.000Z',
};

function file(type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], 'sample', { type });
}

describe('rowToProfile', () => {
  it('maps snake_case columns onto the shared profile shape', () => {
    const profile = rowToProfile(row);
    expect(profile).not.toBeNull();
    expect(profile?.username).toBe('rafi_dev');
    expect(profile?.displayName).toBe('Rafi Ahmed');
    expect(profile?.notifications.followers).toBe(false);
    expect(profile?.privacy.discoverable).toBe(false);
  });

  it('falls back to defaults for malformed preference json', () => {
    const profile = rowToProfile({ ...row, notifications: 'broken', privacy: 7 });
    expect(profile?.notifications.followers).toBe(true);
    expect(profile?.privacy.discoverable).toBe(true);
  });

  it('rejects a row that cannot satisfy the schema', () => {
    expect(rowToProfile({ ...row, display_name: '' })).toBeNull();
  });
});

describe('profile write payloads', () => {
  it('only sends the columns that actually changed', () => {
    expect(fieldsToUpdate({ bio: 'new bio' })).toEqual({ bio: 'new bio' });
    expect(fieldsToUpdate({})).toEqual({});
  });

  it('never maps read-only columns', () => {
    const update = fieldsToUpdate({ displayName: 'A', skills: ['go'] });
    expect(Object.keys(update).sort()).toEqual(['display_name', 'skills']);
  });

  it('keeps the onboarding insert within the member INSERT grant', () => {
    const insert = onboardingInsert('uid-1', {
      username: 'rafi_dev',
      displayName: 'Rafi Ahmed',
      bio: 'Builds things in Sylhet.',
      avatarUrl: 'https://images.example/avatar.png',
      location: 'Sylhet',
      website: 'https://rafi.example',
      skills: ['typescript'],
      interests: ['open-source'],
      language: 'bn',
      onboardingComplete: true,
    });

    expect(Object.keys(insert).sort()).toEqual([
      'avatar_url',
      'bio',
      'display_name',
      'interests',
      'language',
      'location',
      'notifications',
      'onboarding_complete',
      'privacy',
      'skills',
      'uid',
      'username',
      'website',
    ]);
    expect(insert).not.toHaveProperty('email_verified');
    expect(insert).not.toHaveProperty('last_seen_at');
    expect(insert).not.toHaveProperty('role');
    expect(insert).not.toHaveProperty('status');
  });
});

describe('media routing', () => {
  it('classifies files by mime type', () => {
    expect(kindOf('image/png')).toBe('image');
    expect(kindOf('application/pdf')).toBe('document');
    expect(kindOf('audio/webm')).toBe('audio');
    expect(kindOf('application/x-msdownload')).toBeNull();
  });

  it('keeps important media on Cloudinary and ordinary images on imgbb', () => {
    expect(chooseProvider('avatar', 'image')).toBe('cloudinary');
    expect(chooseProvider('chat-document', 'document')).toBe('cloudinary');
    expect(chooseProvider('voice-note', 'audio')).toBe('cloudinary');
    expect(chooseProvider('post-image', 'image')).toBe('imgbb');
    expect(chooseProvider('comment-image', 'image')).toBe('imgbb');
  });

  it('rejects unsupported, empty and oversized files', () => {
    expect(() => assertUploadable(file('application/x-msdownload', 10))).toThrow(MediaError);
    expect(() => assertUploadable(file('image/png', 0))).toThrow(MediaError);
    expect(() => assertUploadable(file('image/png', MAX_BYTES.image + 1))).toThrow(MediaError);
    expect(assertUploadable(file('image/png', 1024))).toBe('image');
  });

  it('needs both halves of the Cloudinary configuration', () => {
    expect(cloudinaryConfigured('bsdc', 'bsdc_unsigned')).toBe(true);
    expect(cloudinaryConfigured('bsdc', '')).toBe(false);
    expect(cloudinaryConfigured('', 'bsdc_unsigned')).toBe(false);
    expect(cloudinaryConfigured('', '')).toBe(false);
  });

  it('builds Cloudinary delivery transforms', () => {
    const url = 'https://res.cloudinary.com/bsdc/image/upload/v1/bsdc/avatar/a.png';
    expect(cloudinaryThumb(url)).toContain('c_fill,g_auto:face,w_256,h_256,f_auto,q_auto');
    expect(cloudinaryWide(url, 800)).toContain('w_800');
  });
});

describe('dataErrorKey', () => {
  it('maps database failures to bilingual keys', () => {
    expect(dataErrorKey({ message: 'profile/username-taken', code: '23505' })).toBe(
      'auth.errors.usernameTaken',
    );
    expect(dataErrorKey({ message: 'duplicate key value', code: '23505' })).toBe(
      'data.errors.conflict',
    );
    expect(dataErrorKey({ message: 'permission denied', code: '42501' })).toBe(
      'data.errors.forbidden',
    );
    expect(dataErrorKey(new Error('kaboom'))).toBe('data.errors.generic');
  });

  it('treats a foreign key violation as a missing record, not a duplicate', () => {
    // 23503 means the referenced row is gone: the honest message is
    // "no longer exists", not "already in use". This is the exact code a
    // post insert returns when the author has no profile row.
    expect(
      dataErrorKey({
        message: 'insert or update on table "posts" violates foreign key constraint',
        code: '23503',
      }),
    ).toBe('data.errors.notFound');
    // 23505 stays a genuine uniqueness conflict.
    expect(dataErrorKey({ message: 'duplicate key value', code: '23505' })).toBe(
      'data.errors.conflict',
    );
  });

  it('maps the missing-profile signal onto the onboarding prompt', () => {
    expect(dataErrorKey(new Error('profile/missing'))).toBe('data.errors.profileMissing');
  });
});

describe('profileErrorKey', () => {
  it('preserves a database error instead of showing the generic auth fallback', () => {
    expect(profileErrorKey({ message: 'permission denied', code: '42501' })).toBe(
      'data.errors.forbidden',
    );
    expect(profileErrorKey(new TypeError('network failed'))).toBe('data.errors.offline');
  });
});

describe('bootstrapDisplayName', () => {
  it('prefers the sign-up display name', () => {
    expect(bootstrapDisplayName({ displayName: 'Rafi Ahmed', email: 'x@y.bd' })).toBe('Rafi Ahmed');
  });

  it('falls back to the email local part, then to a neutral word', () => {
    expect(bootstrapDisplayName({ displayName: '  ', email: 'rafi.dev@example.com' })).toBe(
      'rafi.dev',
    );
    expect(bootstrapDisplayName({ displayName: null, email: null })).toBe('Member');
    expect(bootstrapDisplayName({})).toBe('Member');
  });

  it('always satisfies the database display_name check (1–60 chars)', () => {
    const long = bootstrapDisplayName({ displayName: 'a'.repeat(120) });
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.length).toBeGreaterThanOrEqual(1);
    for (const seed of [{}, { displayName: '' }, { email: 'a@b.c' }, { displayName: 'Rafi' }]) {
      const name = bootstrapDisplayName(seed);
      expect(name.trim().length).toBeGreaterThanOrEqual(1);
      expect(name.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('isFlagEnabled', () => {
  const flags: FeatureFlag[] = [
    { key: 'profile.public', enabled: true, audience: 'all', description: '' },
    { key: 'admin.tools', enabled: true, audience: 'staff', description: '' },
    { key: 'shop.beta', enabled: false, audience: 'all', description: '' },
  ];
  const member = { staff: false, vendor: false };
  const staff = { staff: true, vendor: false };

  it('honours audience and disabled state', () => {
    expect(isFlagEnabled(flags, 'profile.public', member)).toBe(true);
    expect(isFlagEnabled(flags, 'admin.tools', member)).toBe(false);
    expect(isFlagEnabled(flags, 'admin.tools', staff)).toBe(true);
    expect(isFlagEnabled(flags, 'shop.beta', staff)).toBe(false);
  });

  it('falls back to the built-in default for unknown keys', () => {
    expect(isFlagEnabled([], 'realtime.presence', member)).toBe(DEFAULT_FLAGS['realtime.presence']);
    expect(isFlagEnabled([], 'does.not.exist', member)).toBe(false);
  });
});

describe('profile access bootstrap errors', () => {
  it('explains a service bootstrap failure without blaming member permissions', () => {
    expect(profileErrorKey(new DataAccessBootstrapError(503))).toBe(
      'data.errors.accessUnavailable',
    );
  });
});
