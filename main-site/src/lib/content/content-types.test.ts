import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, draftFromPost, withReadyMedia } from './content-types';

describe('the compose submission snapshot', () => {
  it('includes a newly uploaded image even if the draft-state effect has not run yet', () => {
    const staleDraft = { ...EMPTY_DRAFT, title: 'A picture post', media: [] };
    const ready = [
      {
        mediaId: 'asset-1',
        url: 'https://i.ibb.co/bsdc/post.png',
        thumbUrl: 'https://i.ibb.co/bsdc/thumb-post.png',
        altText: 'A sunset',
        width: 1600,
        height: 900,
      },
    ];

    const submitted = withReadyMedia(staleDraft, ready);

    expect(submitted.title).toBe('A picture post');
    expect(submitted.media).toEqual(ready);
    expect(staleDraft.media).toEqual([]);
  });

  it('uses the attachment queue order and current set when a saved image was removed', () => {
    const staleDraft = {
      ...EMPTY_DRAFT,
      media: [
        {
          mediaId: 'removed-asset',
          url: 'https://example.com/removed.png',
          thumbUrl: '',
          altText: '',
          width: null,
          height: null,
        },
      ],
    };
    const current = [
      {
        mediaId: 'asset-2',
        url: 'https://example.com/current.png',
        thumbUrl: '',
        altText: 'Current image',
        width: 800,
        height: 600,
      },
    ];

    expect(withReadyMedia(staleDraft, current).media).toEqual(current);
  });
});

describe('the editor knows whether the poll has been answered', () => {
  const base = {
    id: 'post-1',
    kind: 'poll' as const,
    title: 'Which editor',
    body: 'Two days in.',
    code: '',
    codeLanguage: 'typescript',
    tags: [],
    media: [],
    visibility: 'public' as const,
    language: 'en' as const,
    allowComments: true,
    isSensitive: false,
    coverUrl: '',
  };

  it('counts the ballots the poll already carries', () => {
    // The editor shows the options read-only when this is above zero; a save with
    // a count of zero would offer an edit the database then refuses.
    const draft = draftFromPost({
      ...base,
      poll: [
        { label: 'Neovim', votes: 3 },
        { label: 'VS Code', votes: 1 },
      ],
    });
    expect(draft.pollVotes).toBe(4);
    expect(draft.pollOptions).toEqual(['Neovim', 'VS Code']);
  });

  it('opens an unanswered poll as editable', () => {
    const draft = draftFromPost({
      ...base,
      poll: [
        { label: 'Neovim', votes: 0 },
        { label: 'VS Code', votes: 0 },
      ],
    });
    expect(draft.pollVotes).toBe(0);
  });

  it('opens a poll whose counts were not read as editable', () => {
    // `Post` predates the count; an older payload must not lock the editor.
    const draft = draftFromPost({ ...base, poll: [{ label: 'Yes' }, { label: 'No' }] });
    expect(draft.pollVotes).toBe(0);
  });
});
