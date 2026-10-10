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
import { hasClaimedHandle } from '@/lib/profile/types';
import { profileErrorKey } from '@/lib/profile/profile-errors';
import { bootstrapDisplayName } from '@/lib/profile/profile-service';
import { profilePath, ROUTES } from '@/lib/site';
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

  it('degrades one bad field rather than throwing the whole row away', () => {
    // A row that exists is a profile that exists. Rejecting this one is what
    // made a member's picture vanish at sign-in while the database still had
    // it, and the public post page — which reads the column directly — kept
    // showing it.
    const nameless = rowToProfile({ ...row, display_name: '' });
    expect(nameless).not.toBeNull();
    expect(nameless?.displayName).toBe('Member');
    expect(nameless?.avatarUrl).toBe(row.avatar_url);

    const long = rowToProfile({ ...row, bio: 'b'.repeat(400) });
    expect(long).not.toBeNull();
    expect(long?.bio).toHaveLength(280);
  });

  it('is null only when the row has no member in it', () => {
    expect(rowToProfile({ ...row, uid: '' })).toBeNull();
  });

  it('reads a bootstrap row whose handle has not been claimed yet', () => {
    const profile = rowToProfile({
      ...row,
      username: null,
      avatar_url: 'https://cdn.example.com/a.jpg',
    });
    expect(profile).not.toBeNull();
    expect(profile?.username).toBe('');
    expect(profile?.avatarUrl).toBe('https://cdn.example.com/a.jpg');
    expect(profile && hasClaimedHandle(profile)).toBe(false);
  });

  it('keeps an oddly shaped avatar URL instead of losing the whole profile', () => {
    const profile = rowToProfile({ ...row, avatar_url: 'not-a-url' });
    expect(profile).not.toBeNull();
    expect(profile?.avatarUrl).toBe('not-a-url');
  });

  it('knows when a member has claimed their handle', () => {
    expect(hasClaimedHandle({ username: 'rafi_dev' })).toBe(true);
    expect(hasClaimedHandle({ username: '   ' })).toBe(false);
  });
});

describe('profile paths', () => {
  it('builds a permalink for a claimed handle', () => {
    expect(profilePath('rafi_dev')).toBe('/@rafi_dev');
  });

  it('sends a member without a handle home rather than to /@', () => {
    expect(profilePath('')).toBe(ROUTES.home);
    expect(profilePath('   ')).toBe(ROUTES.home);
  });

  it('names the failure when a profile write lands nowhere', () => {
    expect(profileErrorKey(new Error('profile/not-found'))).toBe('profile.errors.notFound');
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
      coverUrl: 'https://images.example/cover.png',
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
      'cover_url',
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

  it('names a repeated application instead of calling it a conflict', () => {
    // apply_to_job/submit_proposal raise these with 23505 once the unique key
    // resolves the second request (0045). Without the message in MESSAGE_MAP
    // the member would read "That value is already in use." on a form they
    // have simply submitted twice.
    expect(dataErrorKey({ message: 'job/already-applied', code: '23505' })).toBe(
      'data.errors.alreadyApplied',
    );
    expect(dataErrorKey({ message: 'gig/already-proposed', code: '23505' })).toBe(
      'data.errors.alreadyProposed',
    );
    // The generic duplicate message still falls through to the conflict key.
    expect(dataErrorKey({ message: 'duplicate key value', code: '23505' })).toBe(
      'data.errors.conflict',
    );
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
