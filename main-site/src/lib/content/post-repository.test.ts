import { describe, expect, it } from 'vitest';
import { DataError } from '@/lib/supabase/errors';
import {
  assertPostMediaLinked,
  decidePollWrite,
  toPost,
  type JoinedPostRow,
} from './post-repository';

function joinedPost(overrides: Partial<JoinedPostRow> = {}): JoinedPostRow {
  return {
    id: 'post-1',
    slug: 'the-picture',
    kind: 'post',
    status: 'published',
    visibility: 'public',
    title: 'The picture',
    body: 'A post with an image.',
    excerpt: 'A post with an image.',
    cover_url: '',
    code: '',
    code_language: '',
    language: 'en',
    reading_time: 1,
    views_count: 0,
    likes_count: 0,
    comments_count: 0,
    is_sensitive: false,
    allow_comments: true,
    published_at: '2026-10-09T00:00:00.000Z',
    edited_at: null,
    deleted_at: null,
    created_at: '2026-10-09T00:00:00.000Z',
    updated_at: '2026-10-09T00:00:00.000Z',
    author_uid: 'member-1',
    ...overrides,
  } as JoinedPostRow;
}

describe('post media reaches the permalink', () => {
  it('maps hosted asset URLs from the post_media join and preserves author order', () => {
    const post = toPost(
      joinedPost({
        post_media: [
          {
            media_id: 'imgbb-second',
            position: 1,
            alt_text: 'Second photo',
            media_assets: {
              url: 'https://i.ibb.co/second.jpg',
              thumb_url: 'https://i.ibb.co/second-thumb.jpg',
              width: 900,
              height: 600,
            },
          },
          {
            media_id: 'imgbb-first',
            position: 0,
            alt_text: 'First photo',
            media_assets: {
              url: 'https://i.ibb.co/first.jpg',
              thumb_url: 'https://i.ibb.co/first-thumb.jpg',
              width: 1200,
              height: 800,
            },
          },
        ],
      }),
    );

    expect(post.media.map((item) => item.url)).toEqual([
      'https://i.ibb.co/first.jpg',
      'https://i.ibb.co/second.jpg',
    ]);
    expect(post.media[0]).toMatchObject({
      mediaId: 'imgbb-first',
      thumbUrl: 'https://i.ibb.co/first-thumb.jpg',
      width: 1200,
      height: 800,
    });
  });

  it('keeps stored media URLs renderable when thumb_url is empty', () => {
    const url = 'https://i.ibb.co/full/post-asset.webp';
    const post = toPost(
      joinedPost({
        post_media: [
          {
            media_id: 'stored-imgbb-asset',
            position: 0,
            alt_text: 'Stored ImgBB image',
            media_assets: {
              url,
              thumb_url: '',
              width: 1200,
              height: 800,
            },
          },
        ],
      }),
    );

    expect(post.media).toHaveLength(1);
    expect(post.media[0]).toMatchObject({ url, thumbUrl: '', altText: 'Stored ImgBB image' });
  });

  it('drops missing asset joins instead of producing a broken empty image source', () => {
    const post = toPost(
      joinedPost({
        post_media: [
          {
            media_id: 'deleted-asset',
            position: 0,
            alt_text: 'No longer available',
            media_assets: null,
          },
          {
            media_id: 'valid-asset',
            position: 1,
            alt_text: 'A real image',
            media_assets: {
              url: 'https://i.ibb.co/real.jpg',
              thumb_url: '',
              width: null,
              height: null,
            },
          },
        ],
      }),
    );

    expect(post.media).toHaveLength(1);
    expect(post.media[0]?.url).toBe('https://i.ibb.co/real.jpg');
  });

  it('refuses to save a post when an uploaded image has no durable asset link', () => {
    expect(() =>
      assertPostMediaLinked([
        {
          mediaId: '',
          url: 'https://i.ibb.co/real.jpg',
          thumbUrl: '',
          altText: '',
          width: 100,
          height: 100,
        },
      ]),
    ).toThrow('media.errors.recordFailed');

    expect(() =>
      assertPostMediaLinked([
        {
          mediaId: 'asset-1',
          url: 'https://i.ibb.co/real.jpg',
          thumbUrl: '',
          altText: '',
          width: 100,
          height: 100,
        },
      ]),
    ).not.toThrow();
  });
});

describe('a poll that has votes keeps its options', () => {
  // The rewrite that used to run on every save: delete every option, insert the
  // new list. `poll_votes.option_id` cascades from `poll_options`, so it deleted
  // every ballot with them — a typo fix in a poll's body emptied the poll.
  const stored = [
    { position: 0, label: 'Neovim', votes: 3 },
    { position: 1, label: 'VS Code', votes: 1 },
  ];

  it('does not rewrite a poll whose options are unchanged', () => {
    // The common case: the author fixes a typo in the body and saves. Nothing
    // about the poll is written, so nothing about it can be lost — and no reader
    // sees a poll with no options for the length of the rewrite.
    expect(decidePollWrite(stored, ['Neovim', 'VS Code'])).toEqual({
      write: false,
      labels: ['Neovim', 'VS Code'],
    });
    expect(decidePollWrite(stored, ['  Neovim ', 'VS Code', ''])).toEqual({
      write: false,
      labels: ['Neovim', 'VS Code'],
    });
  });

  it('rewrites a poll nobody has voted on', () => {
    // A poll with no answers is a draft of a poll: its author may still reword it.
    expect(decidePollWrite([], ['Yes', 'No'])).toEqual({ write: true, labels: ['Yes', 'No'] });
    expect(
      decidePollWrite(
        [
          { position: 0, label: 'Ys', votes: 0 },
          { position: 1, label: 'No', votes: 0 },
        ],
        ['Yes', 'No'],
      ),
    ).toEqual({ write: true, labels: ['Yes', 'No'] });
  });

  it('refuses to change the options of a poll somebody voted on', () => {
    let thrown: unknown;
    try {
      decidePollWrite(stored, ['Neovim', 'Emacs']);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DataError);
    // The member reads a sentence, not `23514` or a constraint name.
    expect((thrown as DataError).messageKey).toBe('compose.errors.pollLocked');
  });

  it('refuses to empty a poll that has votes', () => {
    expect(() => decidePollWrite(stored, [])).toThrow(DataError);
  });

  it('compares options in their stored order, not the order they arrive in', () => {
    const shuffled = [
      { position: 1, label: 'VS Code', votes: 0 },
      { position: 0, label: 'Neovim', votes: 0 },
    ];
    expect(decidePollWrite(shuffled, ['Neovim', 'VS Code'])).toEqual({
      write: false,
      labels: ['Neovim', 'VS Code'],
    });
  });
});
