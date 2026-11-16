import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IdTokenResult, User } from 'firebase/auth';
import {
  claimsEndpoints,
  ensureCorporateDataAccess,
  mediaUploadEndpoints,
  signedRole,
} from './data-access';
import type { CorporateEnv } from './env';

const env: CorporateEnv = {
  appId: 'bsdc-admin',
  appName: 'Admin',
  siteUrl: 'https://www.bsdc.info.bd',
  verificationUrl: 'https://vf.main.bsdc.info.bd',
  firebase: {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'project',
    appId: 'app',
    databaseURL: '',
  },
  supabase: { url: 'https://example.supabase.co', publishableKey: 'key' },
};
const token = (claims: Record<string, unknown>, raw = 'signed-token'): IdTokenResult =>
  ({ claims, token: raw }) as IdTokenResult;
const user = (getIdTokenResult: ReturnType<typeof vi.fn>): User =>
  ({ uid: 'staff-1', getIdTokenResult }) as unknown as User;

afterEach(() => vi.unstubAllGlobals());

describe('corporate database access', () => {
  it('takes only an application role already present in the signed token', () => {
    expect(signedRole({})).toBe('member');
    expect(signedRole({ role: 'authenticated', bsdc_role: 'admin' })).toBe('admin');
    expect(signedRole({ role: 'owner' })).toBe('owner');
    expect(signedRole({ role: 'authenticated', bsdc_role: 'superuser' })).toBe('member');
  });

  it('does not mint a claim if the token already selects authenticated', async () => {
    const read = vi.fn().mockResolvedValue(token({ role: 'authenticated' }, 'ready'));
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(ensureCorporateDataAccess(env, user(read))).resolves.toMatchObject({
      token: 'ready',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('repairs a role-less token for the same uid, then uses the refreshed token', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(token({}))
      .mockResolvedValueOnce(token({ role: 'authenticated', bsdc_role: 'member' }, 'refreshed'));
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetcher);
    const account = user(read);
    const results = await Promise.all([
      ensureCorporateDataAccess(env, account),
      ensureCorporateDataAccess(env, account),
    ]);
    expect(results.map((result) => result.token)).toEqual(['refreshed', 'refreshed']);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://www.bsdc.info.bd/api/auth/claims');
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ authorization: 'Bearer signed-token' });
    expect(JSON.parse(String(init.body))).toEqual({
      uid: 'staff-1',
      role: 'member',
      vendor: false,
      staff: false,
    });
    expect(read).toHaveBeenNthCalledWith(2, true);
  });

  it('preserves a legacy signed application role without requesting extra flags', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(token({ role: 'admin' }))
      .mockResolvedValueOnce(token({ role: 'authenticated', bsdc_role: 'admin' }));
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetcher);
    await ensureCorporateDataAccess(env, user(read));
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      uid: 'staff-1',
      role: 'admin',
      vendor: false,
      staff: false,
    });
  });

  it('fails closed when the claims service fails and permits a later retry', async () => {
    const read = vi.fn().mockResolvedValue(token({}));
    const account = user(read);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetcher);
    await expect(ensureCorporateDataAccess(env, account)).rejects.toMatchObject({ status: 503 });
    read
      .mockResolvedValueOnce(token({}))
      .mockResolvedValueOnce(token({ role: 'authenticated' }, 'ready'));
    await expect(ensureCorporateDataAccess(env, account)).resolves.toMatchObject({
      token: 'ready',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refuses an unrefreshed token and refuses an insecure remote service', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await expect(
      ensureCorporateDataAccess(env, user(vi.fn().mockResolvedValue(token({})))),
    ).rejects.toMatchObject({ status: 502 });
    await expect(
      ensureCorporateDataAccess(
        { ...env, siteUrl: 'http://example.test' },
        user(vi.fn().mockResolvedValue(token({}))),
      ),
    ).rejects.toThrow('must use HTTPS');
  });

  it('falls back across BSDC apex and Pages origins when www redirects or fails DNS', async () => {
    expect(claimsEndpoints('https://www.bsdc.info.bd')).toEqual([
      'https://www.bsdc.info.bd/api/auth/claims',
      'https://bsdc.info.bd/api/auth/claims',
      'https://bsdc.pages.dev/api/auth/claims',
    ]);
    expect(mediaUploadEndpoints('https://www.bsdc.info.bd')).toEqual([
      'https://www.bsdc.info.bd/api/media/upload',
      'https://bsdc.info.bd/api/media/upload',
      'https://bsdc.pages.dev/api/media/upload',
    ]);
    const read = vi
      .fn()
      .mockResolvedValueOnce(token({}))
      .mockResolvedValueOnce(token({ role: 'authenticated', bsdc_role: 'admin' }, 'refreshed'));
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ claims: { role: 'authenticated' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(ensureCorporateDataAccess(env, user(read))).resolves.toMatchObject({
      token: 'refreshed',
    });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://www.bsdc.info.bd/api/auth/claims',
      'https://bsdc.info.bd/api/auth/claims',
      'https://bsdc.pages.dev/api/auth/claims',
    ]);
  });
});
