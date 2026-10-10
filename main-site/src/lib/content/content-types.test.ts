import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, withReadyMedia } from './content-types';

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
