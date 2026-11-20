import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from './draft-storage';
import type { PostDraft } from './content-types';

function draft(overrides: Partial<PostDraft> = {}): PostDraft {
  return {
    id: null,
    kind: 'post',
    title: 'My first week',
    body: 'Two days in, thanks @rahim.',
    code: '',
    codeLanguage: 'typescript',
    tags: [],
    media: [],
    pollOptions: [],
    pollVotes: 0,
    visibility: 'public',
    language: 'bn',
    allowComments: true,
    isSensitive: false,
    coverUrl: '',
    channelId: null,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('a stored draft keeps its channel', () => {
  it('round-trips the channel id', () => {
    saveLocalDraft(draft({ channelId: 'channel-general' }));
    expect(loadLocalDraft()?.channelId).toBe('channel-general');
  });

  it('opens a legacy draft, stored before channels existed, as a feed post', () => {
    // The stored shape of a draft from before channels: no channelId key at
    // all. The schema defaults it to null, so the draft opens as a feed post.
    window.localStorage.setItem(
      'bsdc.compose.draft',
      JSON.stringify({
        id: null,
        kind: 'post',
        title: 'Stored before channels',
        body: 'Still here.',
        code: '',
        codeLanguage: 'typescript',
        tags: [],
        media: [],
        pollOptions: [],
        pollVotes: 0,
        visibility: 'public',
        language: 'bn',
        allowComments: true,
        isSensitive: false,
        coverUrl: '',
        updatedAt: new Date(0).toISOString(),
      }),
    );

    const restored = loadLocalDraft();
    expect(restored).not.toBeNull();
    expect(restored?.channelId).toBeNull();
    expect(restored?.title).toBe('Stored before channels');
  });

  it('rejects a draft whose channel id is not a string', () => {
    window.localStorage.setItem(
      'bsdc.compose.draft',
      JSON.stringify({ ...draft(), channelId: 42 }),
    );

    expect(loadLocalDraft()).toBeNull();
  });

  it('clears the stored draft', () => {
    saveLocalDraft(draft({ channelId: 'channel-general' }));
    clearLocalDraft();
    expect(loadLocalDraft()).toBeNull();
  });
});
