import { describe, expect, it } from 'vitest';
import type { Post } from '@/lib/content/post-repository';
import type { Comment } from '@/lib/interactions/interaction-types';
import { isEdgeNoindexPath } from './app-routes';
import { alternateLangUrl, pruneJsonLd } from './engine';
import { buildPostJsonLd } from './post-schema';

function samplePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    slug: 'why-typescript-matters',
    kind: 'post',
    status: 'published',
    visibility: 'public',
    title: 'Why TypeScript matters for production apps',
    body: 'Static typing helps teams refactor safely across growing modules.',
    excerpt: 'Static typing helps teams refactor safely.',
    coverUrl: 'https://i.ibb.co/cover/ts.webp',
    code: '',
    codeLanguage: '',
    language: 'en',
    readingTime: 3,
    views: 120,
    likes: 12,
    comments: 2,
    isSensitive: false,
    allowComments: true,
    publishedAt: '2026-10-01T10:00:00.000Z',
    editedAt: '2026-10-02T12:00:00.000Z',
    deletedAt: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    author: {
      uid: 'u1',
      username: 'tanim',
      displayName: 'Tanim Islam',
      avatarUrl: 'https://i.ibb.co/avatar/tanim.webp',
    },
    tags: ['typescript', 'architecture'],
    poll: [],
    media: [],
    ...overrides,
  };
}

function sampleComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    postId: 'post-1',
    parentId: null,
    rootId: null,
    depth: 0,
    body: 'Enable strictNullChecks from day one so nullability bugs fail at compile time.',
    likes: 5,
    replies: 0,
    isAnswer: false,
    createdAt: '2026-10-01T11:00:00.000Z',
    editedAt: null,
    author: {
      uid: 'u2',
      username: 'nadia',
      displayName: 'Nadia Karim',
      avatarUrl: '',
    },
    liked: false,
    ...overrides,
  };
}

describe('buildPostJsonLd', () => {
  it('emits valid QAPage schema with mainEntity Question, acceptedAnswer, and suggestedAnswer', () => {
    const post = samplePost({
      kind: 'question',
      slug: 'how-to-avoid-n-plus-one',
      title: 'How do I avoid N+1 queries in Postgres?',
      comments: 2,
    });
    const accepted = sampleComment({ id: 'ans-1', isAnswer: true, likes: 9 });
    const other = sampleComment({
      id: 'ans-2',
      isAnswer: false,
      likes: 4,
      body: 'Use a single join or array_agg in your query.',
    });
    const nestedReply = sampleComment({
      id: 'reply-1',
      parentId: 'ans-1',
      rootId: 'ans-1',
      depth: 1,
      body: 'Thanks, that worked!',
    });

    const node = buildPostJsonLd(post, [accepted, other, nestedReply]);
    expect(node['@type']).toBe('QAPage');

    const question = node['mainEntity'] as Record<string, unknown>;
    expect(question['@type']).toBe('Question');
    expect(question['name']).toBe('How do I avoid N+1 queries in Postgres?');
    expect(question['answerCount']).toBe(2);
    expect((question['acceptedAnswer'] as Record<string, unknown>)['@type']).toBe('Answer');
    expect((question['acceptedAnswer'] as Record<string, unknown>)['url']).toBe(
      'https://www.bsdc.info.bd/p/how-to-avoid-n-plus-one#comment-ans-1',
    );
    const suggested = question['suggestedAnswer'] as Array<Record<string, unknown>>;
    expect(suggested).toHaveLength(1);
    expect(suggested[0]?.['url']).toBe(
      'https://www.bsdc.info.bd/p/how-to-avoid-n-plus-one#comment-ans-2',
    );
  });

  it('emits QAPage with answerCount 0 and no empty answer arrays when unanswered', () => {
    const post = samplePost({ kind: 'question', comments: 0 });
    const node = buildPostJsonLd(post, []);
    const question = node['mainEntity'] as Record<string, unknown>;
    expect(node['@type']).toBe('QAPage');
    expect(question['answerCount']).toBe(0);
    expect(question['acceptedAnswer']).toBeUndefined();
    expect(question['suggestedAnswer']).toBeUndefined();
  });

  it('maps articles to Article, snippets to TechArticle, and posts to DiscussionForumPosting', () => {
    const article = buildPostJsonLd(samplePost({ kind: 'article' }));
    expect(article['@type']).toBe('Article');
    expect(article['keywords']).toBe('typescript, architecture');

    const snippet = buildPostJsonLd(samplePost({ kind: 'snippet' }));
    expect(snippet['@type']).toBe('TechArticle');

    const discussion = buildPostJsonLd(samplePost({ kind: 'post', title: '' }));
    expect(discussion['@type']).toBe('DiscussionForumPosting');
    expect(typeof discussion['headline']).toBe('string');
  });
});

describe('SEO URL & JSON-LD helpers', () => {
  it('merges lang query parameter cleanly whether canonical already has query params or not', () => {
    expect(alternateLangUrl('https://www.bsdc.info.bd/jobs', 'bn')).toBe(
      'https://www.bsdc.info.bd/jobs?lang=bn',
    );
    expect(alternateLangUrl('https://www.bsdc.info.bd/search?q=react', 'en')).toBe(
      'https://www.bsdc.info.bd/search?q=react&lang=en',
    );
    expect(alternateLangUrl('https://www.bsdc.info.bd/search?lang=bn&q=react', 'en')).toBe(
      'https://www.bsdc.info.bd/search?lang=en&q=react',
    );
  });

  it('strips empty items inside arrays as well as empty objects in pruneJsonLd', () => {
    expect(
      pruneJsonLd({
        '@type': 'ItemList',
        itemListElement: [{ '@type': 'ListItem', name: 'A' }, {}, { name: '' }],
        emptyList: [{}, ''],
        count: 0,
        ok: false,
      }),
    ).toEqual({
      '@type': 'ItemList',
      itemListElement: [{ '@type': 'ListItem', name: 'A' }],
      count: 0,
      ok: false,
    });
  });

  it('identifies private, editor, search, and verification-code routes for edge noindex', () => {
    expect(isEdgeNoindexPath('/messages/abc')).toBe(true);
    expect(isEdgeNoindexPath('/settings')).toBe(true);
    expect(isEdgeNoindexPath('/search')).toBe(true);
    expect(isEdgeNoindexPath('/system-check')).toBe(true);
    expect(isEdgeNoindexPath('/verify/cert-123')).toBe(true);
    expect(isEdgeNoindexPath('/projects/acme/edit')).toBe(true);

    expect(isEdgeNoindexPath('/verify')).toBe(false);
    expect(isEdgeNoindexPath('/projects/edit')).toBe(false);
    expect(isEdgeNoindexPath('/author/raha')).toBe(false);
    expect(isEdgeNoindexPath('/jobs')).toBe(false);
    expect(isEdgeNoindexPath('/p/hello-world')).toBe(false);
  });
});
