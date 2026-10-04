import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IdTokenResult, User } from 'firebase/auth';
import { bootstrapRole, ensureDataAccess } from '@/lib/auth/data-access';

function token(claims: Record<string, unknown>): IdTokenResult {
  return { claims } as IdTokenResult;
}

function memberUser(getIdTokenResult: ReturnType<typeof vi.fn>): User {
  return {
    uid: 'member-1',
    getIdToken: vi.fn().mockResolvedValue('firebase-id-token'),
    getIdTokenResult,
  } as unknown as User;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bootstrapRole', () => {
  it('uses only the application role represented in the signed token claims', () => {
    expect(bootstrapRole({ role: 'authenticated', bsdc_role: 'vendor' })).toBe('vendor');
    expect(bootstrapRole({ role: 'authenticated' })).toBe('member');
  });
});

describe('ensureDataAccess', () => {
  it('skips the claim endpoint when the current token already has a database role', async () => {
    const getIdTokenResult = vi.fn().mockResolvedValue(token({ role: 'authenticated' }));
    const user = memberUser(getIdTokenResult);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureDataAccess(user)).resolves.toMatchObject({
      claims: { role: 'authenticated' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mints a member claim for the same user, never browser-requested privileges, then refreshes', async () => {
    const getIdTokenResult = vi
      .fn()
      .mockResolvedValueOnce(token({}))
      .mockResolvedValueOnce(token({ role: 'authenticated', bsdc_role: 'member' }));
    const user = memberUser(getIdTokenResult);
    let submittedBody: BodyInit | null | undefined;
    let submittedHeaders: HeadersInit | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      submittedBody = init?.body;
      submittedHeaders = init?.headers;
      return Promise.resolve({ ok: true, status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureDataAccess(user)).resolves.toMatchObject({
      claims: { role: 'authenticated', bsdc_role: 'member' },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(submittedHeaders).toMatchObject({ authorization: 'Bearer firebase-id-token' });
    expect(submittedBody).toBe(
      JSON.stringify({ uid: 'member-1', role: 'member', vendor: false, staff: false }),
    );
    expect(getIdTokenResult).toHaveBeenNthCalledWith(2, true);
  });
});
