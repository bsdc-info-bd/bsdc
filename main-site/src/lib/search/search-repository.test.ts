import { beforeEach, describe, expect, it, vi } from 'vitest';

const returnsMock = vi.fn();
const rpcMock = vi.fn(() => ({ returns: returnsMock }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    rpc: rpcMock,
  }),
}));

import { fetchRichSuggestions } from './search-repository';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchRichSuggestions', () => {
  it('maps rich suggestions from search_suggestions_rich', async () => {
    returnsMock.mockResolvedValueOnce({
      data: [
        {
          kind: 'person',
          id: 'u-1',
          slug: 'rizwan',
          title: 'Rizwan Rahim',
          subtitle: '@rizwan · Sylhet',
          image_url: 'https://i.ibb.co/a/r.png',
        },
      ],
      error: null,
    });

    const suggestions = await fetchRichSuggestions('@riz', 6);

    expect(rpcMock).toHaveBeenCalledWith('search_suggestions_rich', {
      p_prefix: '@riz',
      p_limit: 6,
    });
    expect(suggestions).toEqual([
      {
        kind: 'person',
        id: 'u-1',
        slug: 'rizwan',
        title: 'Rizwan Rahim',
        subtitle: '@rizwan · Sylhet',
        imageUrl: 'https://i.ibb.co/a/r.png',
      },
    ]);
  });

  it('falls back cleanly to search_suggestions when the rich RPC is absent', async () => {
    returnsMock
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Could not find the function', code: 'PGRST202' },
      })
      .mockResolvedValueOnce({
        data: [{ kind: 'post', slug: 'rust-guide', title: 'Rust Guide' }],
        error: null,
      });

    const suggestions = await fetchRichSuggestions('rust', 8);

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'search_suggestions_rich', {
      p_prefix: 'rust',
      p_limit: 8,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'search_suggestions', {
      p_prefix: 'rust',
      p_limit: 8,
    });
    expect(suggestions).toEqual([
      {
        kind: 'post',
        id: 'post-rust-guide-0',
        slug: 'rust-guide',
        title: 'Rust Guide',
        subtitle: '',
        imageUrl: '',
      },
    ]);
  });
});
