import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/supabase/errors';

interface SaveArgs {
  p_id: string | null;
  p_slug: string;
  p_post: {
    kind: string;
    status: string;
    title: string;
    body: string;
    excerpt: string;
    cover_url: string;
    language: string;
    code: string;
    code_language: string;
    reading_time: number;
    is_sensitive: boolean;
    allow_comments: boolean;
    channel_id: string | null;
  };
  p_tags: string[];
  p_media: { media_id: string; position: number; alt_text: string }[];
  p_mentions: string[];
  p_poll: string[] | null;
}

interface SaveReply {
  data: { id: string; slug: string } | null;
  error: { code: string; message: string } | null;
}

/**
 * The RPC is recorded rather than asserted through the mock's untyped `calls`:
 * the point of these tests is the *arguments*, and an `any` would hide a typo in
 * one of them.
 */
interface SaveCall {
  name: string;
  args: SaveArgs;
}

let reply: SaveReply = { data: { id: 'post-1', slug: 'my-first-week' }, error: null };
const calls: SaveCall[] = [];

/** The one call the save made. A save makes exactly one, which is the point. */
function firstCall(): SaveCall {
  const [call] = calls;
  if (!call) throw new Error('the save made no call');
  return call;
}
const rpcMock = vi.fn((name: string, args: SaveArgs): Promise<SaveReply> => {
  calls.push({ name, args });
  return Promise.resolve(reply);
});
const fromMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({ rpc: rpcMock, from: fromMock }),
}));

import { POLL_LOCKED_MESSAGE, savePost } from './post-repository';
import type { PostDraft } from './content-types';

function draft(overrides: Partial<PostDraft> = {}): PostDraft {
  return {
    id: null,
    kind: 'post',
    visibility: 'public',
    title: 'My first week',
    body: 'Two days in, thanks @rahim.',
    coverUrl: '',
    language: 'en',
    code: '',
    codeLanguage: 'typescript',
    tags: ['Writing', 'writing', 'tips', 'a'],
    media: [],
    pollOptions: [],
    isSensitive: false,
    allowComments: true,
    channelId: null,
    ...overrides,
  } as PostDraft;
}

function media(mediaId: string, url: string, altText: string) {
  return { mediaId, url, thumbUrl: '', altText, width: 1200, height: 800 };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  reply = { data: { id: 'post-1', slug: 'my-first-week' }, error: null };
});

describe('a post is saved in one call', () => {
  it('sends the whole post, its pictures and its mentions through save_post', async () => {
    const saved = await savePost(
      draft({
        media: [
          media('media-1', 'https://i.ibb.co/one.jpg', 'A desk'),
          media('media-2', 'https://i.ibb.co/two.jpg', ''),
        ],
      }),
      'published',
    );

    expect(saved).toEqual({ id: 'post-1', slug: 'my-first-week' });
    // One request, not nine: nothing else is called for a post that is not a poll.
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledTimes(1);

    const { name, args } = firstCall();
    expect(name).toBe('save_post');
    expect(args.p_id).toBeNull();
    // The slug carries a random suffix so two saves of the same title never collide.
    expect(args.p_slug).toMatch(/^my-first-week-[a-z0-9]+$/);
    expect(args.p_post).toMatchObject({
      kind: 'post',
      status: 'published',
      title: 'My first week',
      code_language: '',
    });
    // Tags are normalized, de-duplicated, and short ones dropped — the vocabulary
    // match happens in the database.
    expect(args.p_tags).toEqual(['writing', 'tips']);
    // The order the member arranged is the order the pictures carry.
    expect(args.p_media).toEqual([
      { media_id: 'media-1', position: 0, alt_text: 'A desk' },
      { media_id: 'media-2', position: 1, alt_text: '' },
    ]);
    expect(args.p_mentions).toEqual(['rahim']);
    expect(args.p_poll).toBeNull();
  });

  it('sends the poll labels only when the poll has to be written', async () => {
    await savePost(draft({ kind: 'poll', pollOptions: ['Neovim', 'VS Code'] }), 'published');

    expect(firstCall().args.p_poll).toEqual(['Neovim', 'VS Code']);
  });

  it('sends an explicit null channel for a feed post', async () => {
    await savePost(draft(), 'published');

    expect(firstCall().args.p_post.channel_id).toBeNull();
  });

  it('sends the chosen channel id, and null again when it is cleared', async () => {
    await savePost(draft({ channelId: 'channel-general' }), 'published');
    expect(firstCall().args.p_post.channel_id).toBe('channel-general');

    await savePost(draft({ channelId: null }), 'published');
    expect(calls[1]?.args.p_post.channel_id).toBeNull();
  });

  it('keeps the language of a snippet and does not carry its code language elsewhere', async () => {
    await savePost(draft({ kind: 'snippet', code: 'const a = 1;' }), 'published');

    expect(firstCall().args.p_post.code_language).toBe('typescript');
  });

  it('refuses a poll that has votes before anything is written', async () => {
    const eqMock = vi.fn(() =>
      Promise.resolve({
        data: [
          { position: 0, label: 'Neovim', votes: 3 },
          { position: 1, label: 'VS Code', votes: 1 },
        ],
        error: null,
      }),
    );
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) });

    await expect(
      savePost(
        draft({ id: 'post-1', kind: 'poll', pollOptions: ['Neovim', 'Emacs'] }),
        'published',
      ),
    ).rejects.toThrow(DataError);

    // The point of the pre-check: the save never reaches the database.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('reads a missing profile as an onboarding problem, not a broken save', async () => {
    reply = { data: null, error: { code: '23503', message: 'fk' } };
    await expect(savePost(draft(), 'draft')).rejects.toThrow(DataError);
  });

  it('translates a locked poll raised by the database, for clients that skip the check', async () => {
    reply = { data: null, error: { code: '23514', message: POLL_LOCKED_MESSAGE } };
    const failure = await savePost(draft({ kind: 'post' }), 'published').then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DataError);
  });
});
