import { describe, expect, it } from 'vitest';
import { assertPostMediaLinked, toPost, type JoinedPostRow } from './post-repository';

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

  it('keeps existing Cloudinary-hosted media URLs renderable', () => {
    const url = 'https://res.cloudinary.com/bsdc/image/upload/v1/post/legacy.png';
    const post = toPost(
      joinedPost({
        post_media: [
          {
            media_id: 'legacy-cloudinary-asset',
            position: 0,
            alt_text: 'Legacy Cloudinary image',
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
    expect(post.media[0]).toMatchObject({ url, thumbUrl: '', altText: 'Legacy Cloudinary image' });
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
