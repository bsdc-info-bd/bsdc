import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetClients } from './client';
import { callPublicRpc } from './rpc';
import type { CorporateEnv } from './env';

const env: CorporateEnv = {
  appId: 'bsdc-vf',
  appName: 'Verification',
  siteUrl: 'https://www.bsdc.info.bd',
  verificationUrl: 'https://vf.main.bsdc.info.bd',
  firebase: { apiKey: '', authDomain: '', projectId: '', appId: '', databaseURL: '' },
  supabase: { url: 'https://example.supabase.co', publishableKey: 'public-key' },
};
afterEach(() => {
  resetClients();
  vi.unstubAllGlobals();
});

describe('public verification RPC', () => {
  it('works without initializing a Firebase staff session', async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify([{ valid: true }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    // The test exercises HTTP only. Node 20 has no native WebSocket, but the
    // Supabase client checks for one at construction even without a subscription.
    vi.stubGlobal(
      'WebSocket',
      class {
        constructor() {
          throw new Error('A public RPC must not open a realtime socket.');
        }
      },
    );
    vi.stubGlobal('fetch', fetcher);
    const result = await callPublicRpc<{ valid: boolean }[]>(env, 'verify_code', { p_code: 'x' });
    expect(result).toEqual([{ valid: true }]);
    expect(fetcher).toHaveBeenCalledOnce();
    const request = fetcher.mock.calls[0];
    expect(String(request?.[0])).toContain('/rest/v1/rpc/verify_code');
  });
});
