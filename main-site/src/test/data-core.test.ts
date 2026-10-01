import { describe, expect, it } from 'vitest';
import { DEFAULT_FLAGS, isFlagEnabled, type FeatureFlag } from '@/lib/data/feature-flags';
import { fieldsToUpdate, rowToProfile } from '@/lib/profile/supabase-backend';
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

describe('fieldsToUpdate', () => {
  it('only sends the columns that actually changed', () => {
    expect(fieldsToUpdate({ bio: 'new bio' })).toEqual({ bio: 'new bio' });
    expect(fieldsToUpdate({})).toEqual({});
  });

  it('never maps read-only columns', () => {
    const update = fieldsToUpdate({ displayName: 'A', skills: ['go'] });
    expect(Object.keys(update).sort()).toEqual(['display_name', 'skills']);
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
