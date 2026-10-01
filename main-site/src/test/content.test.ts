import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, validateDraft, type PostDraft } from '@/lib/content/content-types';
import { isDraftMeaningful } from '@/lib/content/draft-storage';
import { renderMarkdown } from '@/lib/content/markdown';
import {
  extractHashtags,
  extractMentions,
  normalizeTag,
  readingTimeMinutes,
  slugify,
  toExcerpt,
  uniqueSlug,
} from '@/lib/content/text';

function draft(overrides: Partial<PostDraft> = {}): PostDraft {
  return { ...EMPTY_DRAFT, ...overrides };
}

describe('slugify', () => {
  it('produces url safe slugs', () => {
    expect(slugify('Hello, BSDC World!')).toBe('hello-bsdc-world');
    expect(slugify('  spaced   out  ')).toBe('spaced-out');
  });

  it('falls back when a title has no latin characters', () => {
    expect(slugify('বাংলায় শিরোনাম', 'article')).toBe('article');
  });

  it('adds a unique suffix that keeps the slug within the column limit', () => {
    const slug = uniqueSlug('a'.repeat(300));
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(uniqueSlug('Same title')).not.toBe(uniqueSlug('Same title'));
  });
});

describe('text helpers', () => {
  it('builds a plain-text excerpt without markdown noise', () => {
    const excerpt = toExcerpt('# Title\n\nSome **bold** text with [a link](https://bsdc.info.bd).');
    expect(excerpt).not.toContain('#');
    expect(excerpt).not.toContain('**');
    expect(excerpt).toContain('a link');
  });

  it('truncates long text with an ellipsis', () => {
    expect(toExcerpt('word '.repeat(200)).endsWith('…')).toBe(true);
  });

  it('estimates reading time between 1 and 180 minutes', () => {
    expect(readingTimeMinutes('short text')).toBe(1);
    expect(readingTimeMinutes('word '.repeat(1000))).toBe(5);
  });

  it('extracts mentions and hashtags', () => {
    const body = 'Thanks @rafi_dev and @nabila for #react and #open-source help.';
    expect(extractMentions(body)).toEqual(['rafi_dev', 'nabila']);
    expect(extractHashtags(body)).toEqual(['react', 'open-source']);
  });

  it('normalises tags', () => {
    expect(normalizeTag('  #React Native ')).toBe('react-native');
    expect(normalizeTag('***')).toBe('');
  });
});

describe('renderMarkdown', () => {
  it('renders markdown to html', () => {
    const html = renderMarkdown('# Heading\n\nSome **bold** text.');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('removes scripts and event handlers', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });

  it('marks external links as nofollow ugc and keeps internal links clean', () => {
    const external = renderMarkdown('[x](https://example.com)');
    expect(external).toContain('rel="nofollow ugc noopener noreferrer"');
    expect(external).toContain('target="_blank"');
    const internal = renderMarkdown('[x](/guidelines)');
    expect(internal).not.toContain('target="_blank"');
  });

  it('turns mentions and hashtags into links', () => {
    const html = renderMarkdown('hi @rafi_dev about #react');
    expect(html).toContain('href="/@rafi_dev"');
    expect(html).toContain('href="/tag/react"');
  });

  it('escapes code blocks instead of executing them', () => {
    const html = renderMarkdown('```js\nconst a = "<img src=x onerror=alert(1)>";\n```');
    expect(html).toContain('class="language-js"');
    // The payload survives only as escaped text, never as a real element.
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });
});

describe('validateDraft', () => {
  it('accepts a simple post with a body', () => {
    expect(validateDraft(draft({ body: 'Hello community' }))).toEqual([]);
  });

  it('requires a title for articles and questions', () => {
    expect(validateDraft(draft({ kind: 'article', body: 'x' }))[0]?.messageKey).toBe(
      'compose.errors.titleShort',
    );
    expect(validateDraft(draft({ kind: 'question', body: 'x' }))[0]?.messageKey).toBe(
      'compose.errors.titleShort',
    );
  });

  it('requires code for snippets and media for media posts', () => {
    expect(validateDraft(draft({ kind: 'snippet' }))[0]?.messageKey).toBe(
      'compose.errors.codeRequired',
    );
    expect(validateDraft(draft({ kind: 'media' }))[0]?.messageKey).toBe(
      'compose.errors.mediaRequired',
    );
  });

  it('requires two distinct poll options', () => {
    const tooFew = validateDraft(draft({ kind: 'poll', body: 'Which?', pollOptions: ['a', ''] }));
    expect(tooFew[0]?.messageKey).toBe('compose.errors.pollOptions');
    const duplicate = validateDraft(
      draft({ kind: 'poll', body: 'Which?', pollOptions: ['a', 'a'] }),
    );
    expect(duplicate[0]?.messageKey).toBe('compose.errors.pollDuplicate');
    expect(validateDraft(draft({ kind: 'poll', body: 'Which?', pollOptions: ['a', 'b'] }))).toEqual(
      [],
    );
  });

  it('reports every problem at once', () => {
    const issues = validateDraft(draft({ kind: 'article', tags: ['1', '2', '3', '4', '5', '6'] }));
    expect(issues.length).toBeGreaterThan(1);
  });
});

describe('isDraftMeaningful', () => {
  it('ignores an untouched draft', () => {
    expect(isDraftMeaningful(draft())).toBe(false);
    expect(isDraftMeaningful(draft({ body: 'something' }))).toBe(true);
  });
});
