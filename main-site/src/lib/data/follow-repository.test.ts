import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/supabase/errors';

const returnsMock = vi.fn();
const rpcMock = vi.fn(() => ({ returns: returnsMock }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    rpc: rpcMock,
  }),
}));

import {
  fetchProfileFollowers,
  fetchProfileFollowing,
  isPrivateSocialListError,
} from './follow-repository';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isPrivateSocialListError', () => {
  it('recognizes Postgres 42501 and private-list messages', () => {
    expect(
      isPrivateSocialListError(new DataError({ message: 'permission denied', code: '42501' })),
    ).toBe(true);
    expect(
      isPrivateSocialListError(
        new DataError({ message: 'Followers list is PRIVATE', code: 'P0001' }),
      ),
    ).toBe(true);
    expect(isPrivateSocialListError(new Error('following list is private'))).toBe(true);
  });

  it('rejects unrelated errors and non-error values', () => {
    expect(
      isPrivateSocialListError(new DataError({ message: 'member not found', code: 'P0002' })),
    ).toBe(false);
    expect(isPrivateSocialListError(new Error('network timeout'))).toBe(false);
    expect(isPrivateSocialListError('private')).toBe(false);
  });
});

describe('fetchProfileFollowers & fetchProfileFollowing', () => {
  it('calls profile_followers with p_uid, p_limit, p_offset and maps social profile fields', async () => {
    returnsMock.mockResolvedValueOnce({
      data: [
        {
          uid: 'u-2',
          username: 'tania',
          display_name: 'Tania Akter',
          avatar_url: 'https://i.ibb.co/a/t.png',
          bio: 'Systems engineer',
          location: 'Sylhet',
          verified: true,
          viewer_follows: false,
          followed_at: '2026-11-10T10:00:00Z',
        },
      ],
      error: null,
    });

    const items = await fetchProfileFollowers('u-1', 25, 10);

    expect(rpcMock).toHaveBeenCalledWith('profile_followers', {
      p_uid: 'u-1',
      p_limit: 25,
      p_offset: 10,
    });
    expect(items).toEqual([
      {
        uid: 'u-2',
        username: 'tania',
        displayName: 'Tania Akter',
        avatarUrl: 'https://i.ibb.co/a/t.png',
        bio: 'Systems engineer',
        location: 'Sylhet',
        verified: true,
        viewerFollows: false,
        followedAt: '2026-11-10T10:00:00Z',
      },
    ]);
  });

  it('calls profile_following with p_uid and throws DataError when the list is private', async () => {
    returnsMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'following list is private', code: '42501', details: null, hint: null },
    });

    await expect(fetchProfileFollowing('u-private', 30, 0)).rejects.toMatchObject({
      name: 'DataError',
      code: '42501',
    });
    expect(rpcMock).toHaveBeenCalledWith('profile_following', {
      p_uid: 'u-private',
      p_limit: 30,
      p_offset: 0,
    });
  });
});
