import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSupabasePublic, rpc, supabaseAnonHeaders } from '../../functions/_rpc';

afterEach(() => vi.unstubAllGlobals());

describe('anonymous edge database access', () => {
  it('uses gateway publishable keys without pretending they are JWTs', () => {
    expect(supabaseAnonHeaders('sb_publishable_example')).toEqual({
      apikey: 'sb_publishable_example',
    });
    expect(supabaseAnonHeaders('legacy-jwt')).toEqual({
      apikey: 'legacy-jwt',
      authorization: 'Bearer legacy-jwt',
    });
  });

  it('resolves public runtime bindings and refuses missing configuration', () => {
    expect(resolveSupabasePublic({})).toBeNull();
    expect(
      resolveSupabasePublic({
        VITE_SUPABASE_URL: 'https://example.supabase.co/',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      }),
    ).toEqual({ base: 'https://example.supabase.co', key: 'sb_publishable_example' });
  });

  it('sends the public key only as apikey for a modern-key RPC', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      rpc(
        {
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        },
        'sitemap_sections',
        {},
      ),
    ).resolves.toEqual([]);
    const options = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(options.headers).toEqual({
      apikey: 'sb_publishable_example',
      'content-type': 'application/json',
    });
  });
});
