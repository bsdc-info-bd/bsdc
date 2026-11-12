import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bearerToken, memberOf } from './_member-token';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'member-key-1', alg: 'RS256' };

function signedMemberToken(overrides: Record<string, unknown> = {}): string {
  const base64 = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = [
    base64({ alg: 'RS256', kid: 'member-key-1' }),
    base64({
      iss: 'https://securetoken.google.com/bsdc-bd',
      aud: 'bsdc-bd',
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'member-uid-123',
      email: 'member@example.test',
      email_verified: true,
      ...overrides,
    }),
  ].join('.');
  const signature = sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

function stubJwks(keys: unknown[]) {
  const fakeFetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ keys }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fakeFetch);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  vi.stubGlobal('ArrayBuffer', Buffer.alloc(0).buffer.constructor);
  return fakeFetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('member token verification at the edge', () => {
  it('defaults to the bsdc-bd Firebase project when FB_PROJECT_ID is unset in preview/edge env', async () => {
    stubJwks([jwk]);
    const token = signedMemberToken();
    const request = new Request('https://preview.bsdc.pages.dev/api/media/upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

    const verified = await memberOf(request, {});
    expect(verified).not.toBeNull();
    expect(verified?.uid).toBe('member-uid-123');
    expect(verified?.emailVerified).toBe(true);
  });

  it('parses case-insensitive bearer authorization headers', () => {
    const req = new Request('https://www.bsdc.info.bd/api/media/upload', {
      headers: { authorization: 'bearer   sample-value  ' },
    });
    expect(bearerToken(req)).toBe('sample-value');
  });

  it('retries JWKS fetch with cache busting when a rotated kid is missing from cached keys', async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'stale-key' }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
    vi.stubGlobal('fetch', fakeFetch);
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
    vi.stubGlobal('ArrayBuffer', Buffer.alloc(0).buffer.constructor);

    const request = new Request('https://www.bsdc.info.bd/api/media/upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${signedMemberToken()}` },
    });

    const verified = await memberOf(request, { FB_PROJECT_ID: 'bsdc-bd' });
    expect(verified?.uid).toBe('member-uid-123');
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects tokens from other Firebase projects and expired tokens', async () => {
    stubJwks([jwk]);

    const otherProjectReq = new Request('https://www.bsdc.info.bd/api/media/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${signedMemberToken({
          aud: 'other-project',
          iss: 'https://securetoken.google.com/other-project',
        })}`,
      },
    });
    expect(await memberOf(otherProjectReq, { FB_PROJECT_ID: 'bsdc-bd' })).toBeNull();

    const expiredReq = new Request('https://www.bsdc.info.bd/api/media/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${signedMemberToken({
          exp: Math.floor(Date.now() / 1000) - 300,
        })}`,
      },
    });
    expect(await memberOf(expiredReq, { FB_PROJECT_ID: 'bsdc-bd' })).toBeNull();
  });
});
