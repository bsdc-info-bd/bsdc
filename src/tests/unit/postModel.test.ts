/**
 * BSDC — src/tests/unit/postModel.test.ts
 * Purpose : Proves post construction, scheduling, visibility and edit rights.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Scheduling is the one place a bug hides content: a post written now and published later
 *   must be invisible in between and appear on time, in the person's own timezone.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { TEXT_LIMITS } from '@/core/config/limits';
import {
  canEditPost,
  clampBody,
  hasContent,
  isScheduled,
  isVisible,
  newPost,
  postExcerpt,
} from '@/entities/post/model';

describe('post construction', () => {
  it('creates a published post with zeroed counters', () => {
    const post = newPost({ authorUid: 'u1', body: 'Hello BSDC' });
    expect(post.authorUid).toBe('u1');
    expect(post.visibility).toBe('public');
    expect(post.publishedAt).not.toBeNull();
    expect(post.scheduledFor).toBeNull();
    expect(post.counts.comments).toBe(0);
    expect(post.deletedAt).toBeNull();
  });

  it('clamps the body to the documented ceiling', () => {
    const post = newPost({ authorUid: 'u1', body: 'a'.repeat(TEXT_LIMITS.shortPost + 500) });
    expect(post.body).toHaveLength(TEXT_LIMITS.shortPost);
    expect(clampBody('a'.repeat(10))).toHaveLength(10);
  });

  it('detects the language of the body', () => {
    expect(newPost({ authorUid: 'u1', body: 'আমি BSDC ভালোবাসি' }).language).toBe('bn');
    expect(newPost({ authorUid: 'u1', body: 'I love BSDC' }).language).toBe('en');
  });

  it('carries the author snapshot so a feed page needs one read', () => {
    const post = newPost({
      authorUid: 'u1',
      body: 'Hello',
      author: {
        username: 'rizwan',
        displayName: 'Rizwan',
        displayNameBn: 'রিজওয়ান',
        photoUrl: 'https://cdn.bsdc.info.bd/a.png',
        role: 'admin',
        verified: true,
      },
    });
    expect(post.authorUsername).toBe('rizwan');
    expect(post.authorRole).toBe('admin');
    expect(post.authorVerified).toBe(true);
  });
});

describe('scheduling and visibility', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');

  it('hides a scheduled post until its time arrives', () => {
    const post = newPost({
      authorUid: 'u1',
      body: 'Later',
      scheduledFor: '2026-03-01T18:00:00.000Z',
    });
    expect(isScheduled(post, now)).toBe(true);
    expect(isVisible(post, now)).toBe(false);
    expect(post.publishedAt).toBeNull();
    expect(isVisible(post, new Date('2026-03-01T18:00:01.000Z'))).toBe(true);
  });

  it('never shows a soft-deleted post', () => {
    const post = newPost({ authorUid: 'u1', body: 'Gone' });
    expect(isVisible({ ...post, deletedAt: '2026-03-02T00:00:00.000Z' }, now)).toBe(false);
  });

  it('treats an unscheduled post as visible immediately', () => {
    const post = newPost({ authorUid: 'u1', body: 'Now' });
    expect(isScheduled(post, now)).toBe(false);
    expect(isVisible(post, now)).toBe(true);
  });
});

describe('content and rights', () => {
  it('requires text, media or a link', () => {
    expect(hasContent(newPost({ authorUid: 'u1', body: '' }))).toBe(false);
    expect(hasContent(newPost({ authorUid: 'u1', body: 'text' }))).toBe(true);
    expect(
      hasContent(newPost({ authorUid: 'u1', body: '', linkUrl: 'https://bsdc.info.bd' })),
    ).toBe(true);
  });

  it('lets the author and moderators edit, and nobody else', () => {
    const post = newPost({ authorUid: 'u1', body: 'mine' });
    expect(canEditPost(post, 'u1', 'member')).toBe(true);
    expect(canEditPost(post, 'u2', 'member')).toBe(false);
    expect(canEditPost(post, 'u2', 'moderator')).toBe(true);
    expect(canEditPost(post, null, 'admin')).toBe(false);
  });

  it('falls back to a count-based excerpt when there is no body', () => {
    expect(postExcerpt(newPost({ authorUid: 'u1', body: 'A short line' }))).toContain(
      'A short line',
    );
    const withLink = newPost({ authorUid: 'u1', body: '', linkTitle: 'BSDC Docs' });
    expect(postExcerpt(withLink)).toBe('BSDC Docs');
  });
});
