import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPost, type ClaimsRuntimeEnv } from './claims';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const servicePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256' };
const env: ClaimsRuntimeEnv = {
  FB2_PROJECT_ID: 'bsdc-second',
  FB2_CLIENT_EMAIL: 'fixture@bsdc-second.iam.gserviceaccount.com',
  FB2_PRIVATE_KEY: servicePem,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'fixture-publishable-key',
  PUSH_FLUSH_SECRET: 'x'.repeat(40),
};

function signedToken(claims: Record<string, unknown>): string {
  const base64 = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = [
    base64({ alg: 'RS256', kid: 'test-key' }),
    base64({
      iss: 'https://securetoken.google.com/bsdc-second',
      aud: 'bsdc-second',
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'staff-uid',
      email: 'staff@example.test',
      email_verified: true,
      ...claims,
    }),
  ].join('.');
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}

function context(
  environment: ClaimsRuntimeEnv,
  request: Request,
): Parameters<typeof onRequestPost>[0] {
  return { env: environment, request } as Parameters<typeof onRequestPost>[0];
}
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('claims endpoint staff authority', () => {
  function provider(dbRole: string | null = 'member') {
    const calls: { url: string; body: unknown }[] = [];
    const fakeFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      calls.push({ url: target, body });
      if (target.includes('/jwk/')) return json({ keys: [jwk] });
      if (target === 'https://oauth2.googleapis.com/token')
        return json({ access_token: 'mock-oauth-token' });
      if (target.endsWith('/accounts:update')) return json({});
      if (target.endsWith('/my_role'))
        return dbRole === null ? new Response(null, { status: 503 }) : json([{ role: dbRole }]);
      if (target.endsWith('/bootstrap_staff_identity')) return json({});
      throw new Error(`unexpected URL: ${target}`);
    });
    vi.stubGlobal('fetch', fakeFetch);
    vi.stubGlobal('crypto', webcrypto);
    // Node 20 Web Crypto rejects a jsdom-realm ArrayBuffer on importKey.
    // Cloudflare uses one realm; use Node's typed-array constructors to match it.
    vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
    vi.stubGlobal('ArrayBuffer', Buffer.alloc(0).buffer.constructor);
    return calls;
  }
  async function post(
    environment: ClaimsRuntimeEnv,
    token: string,
    role: string,
    uid = 'staff-uid',
  ) {
    const request = new Request('https://www.bsdc.info.bd/api/auth/claims', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        origin: 'https://admin.bsdc.info.bd',
      },
      body: JSON.stringify({ uid, role, vendor: false, staff: false }),
    });
    return await onRequestPost(context(environment, request));
  }

  it('repairs a stale signed staff claim without recreating an elevated profile', async () => {
    const calls = provider();
    const response = await post(env, signedToken({ role: 'owner', bsdc_role: 'owner' }), 'owner');
    expect(response.status, JSON.stringify(calls)).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://admin.bsdc.info.bd');
    const update = calls.find((call) => call.url.endsWith('/accounts:update'))?.body as {
      customAttributes: string;
    };
    expect(JSON.parse(update.customAttributes)).toMatchObject({
      role: 'authenticated',
      bsdc_role: 'member',
      staff: false,
    });
    expect(calls.some((call) => call.url.endsWith('/bootstrap_staff_identity'))).toBe(false);
  });

  it('checks database authority before refreshing an authenticated stale staff claim', async () => {
    const calls = provider('member');
    const response = await post(
      env,
      signedToken({ role: 'authenticated', bsdc_role: 'owner' }),
      'owner',
    );
    expect(response.status, JSON.stringify(calls)).toBe(200);
    const update = calls.find((call) => call.url.endsWith('/accounts:update'))?.body as {
      customAttributes: string;
    };
    expect(JSON.parse(update.customAttributes)).toMatchObject({
      bsdc_role: 'member',
      staff: false,
    });
    expect(calls.some((call) => call.url.endsWith('/my_role'))).toBe(true);
    expect(calls.some((call) => call.url.endsWith('/bootstrap_staff_identity'))).toBe(false);
  });

  it('falls back to a member claim when current authority cannot be read', async () => {
    const calls = provider(null);
    const response = await post(
      env,
      signedToken({ role: 'authenticated', bsdc_role: 'owner' }),
      'owner',
    );
    expect(response.status, JSON.stringify(calls)).toBe(200);
    const update = calls.find((call) => call.url.endsWith('/accounts:update'))?.body as {
      customAttributes: string;
    };
    expect(JSON.parse(update.customAttributes)).toMatchObject({
      bsdc_role: 'member',
      staff: false,
    });
  });

  it('can synchronize a role actually granted by the database', async () => {
    const calls = provider('admin');
    const response = await post(
      env,
      signedToken({ role: 'authenticated', bsdc_role: 'member' }),
      'member',
    );
    expect(response.status, JSON.stringify(calls)).toBe(200);
    const update = calls.find((call) => call.url.endsWith('/accounts:update'))?.body as {
      customAttributes: string;
    };
    expect(JSON.parse(update.customAttributes)).toMatchObject({ bsdc_role: 'admin', staff: true });
    expect(calls.some((call) => call.url.endsWith('/bootstrap_staff_identity'))).toBe(false);
  });

  it('repairs a new corporate session with the least privileged app claim', async () => {
    const calls = provider();
    const response = await post(env, signedToken({}), 'member');
    expect(response.status, JSON.stringify(calls)).toBe(200);
    const body = calls.find((call) => call.url.endsWith('/accounts:update'))?.body as {
      customAttributes: string;
    };
    expect(JSON.parse(body.customAttributes)).toMatchObject({
      role: 'authenticated',
      bsdc_role: 'member',
      staff: false,
    });
    expect(calls.some((call) => call.url.endsWith('/bootstrap_staff_identity'))).toBe(false);
  });

  it('refuses an ordinary member attempting to invent an owner claim', async () => {
    const calls = provider();
    const response = await post(env, signedToken({ role: 'member', bsdc_role: 'member' }), 'owner');
    expect(response.status).toBe(403);
    expect(calls.some((call) => call.url.endsWith('/accounts:update'))).toBe(false);
  });

  it('still permits a verified bootstrap owner to seed their own profile', async () => {
    const calls = provider();
    const response = await post(
      env,
      signedToken({ email: 'rrc@bsdc.info.bd', email_verified: true }),
      'owner',
    );
    expect(response.status, JSON.stringify(calls)).toBe(200);
    expect(
      calls.find((call) => call.url.endsWith('/bootstrap_staff_identity'))?.body,
    ).toMatchObject({
      p_uid: 'staff-uid',
      p_role: 'owner',
    });
  });

  it('permits an explicitly allowlisted owner to seed an authorized assignment', async () => {
    const calls = provider();
    const response = await post(
      { ...env, BSDC2_OWNER_UIDS: 'staff-uid' },
      signedToken({}),
      'admin',
      'another-staff-uid',
    );
    expect(response.status, JSON.stringify(calls)).toBe(200);
    expect(
      calls.find((call) => call.url.endsWith('/bootstrap_staff_identity'))?.body,
    ).toMatchObject({
      p_uid: 'another-staff-uid',
      p_role: 'admin',
    });
  });

  it('reports member and corporate binding presence separately', async () => {
    const request = new Request('https://www.bsdc.info.bd/api/auth/claims');
    const both = {
      ...env,
      FB_PROJECT_ID: 'bsdc-bd',
      FB_CLIENT_EMAIL: 'member@example.test',
      FB_PRIVATE_KEY: 'configured',
    };
    const ready = await onRequestGet(context(both, request));
    expect(await ready.json()).toEqual({ ready: true, corporateReady: true });
    const memberOnly = await onRequestGet(context({ ...both, FB2_PRIVATE_KEY: '' }, request));
    expect(await memberOnly.json()).toEqual({ ready: true, corporateReady: false });
  });
});
