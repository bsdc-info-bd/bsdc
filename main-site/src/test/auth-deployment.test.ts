import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyFirebaseAuth } from '../../functions/_firebase-auth';

const headers = readFileSync('public/_headers', 'utf8');
const csp = headers.split('\n').find((line) => line.includes('Content-Security-Policy:')) ?? '';
const directive = (name: string) =>
  csp.split(';').find((part) => part.trim().startsWith(`${name} `)) ?? '';

afterEach(() => vi.unstubAllGlobals());

describe('production browser policy', () => {
  it('allows the Firebase helper frame and Google API script used by all OAuth providers', () => {
    expect(directive('frame-src')).toContain('https://bsdc-bd.firebaseapp.com');
    expect(directive('frame-src')).toContain("'self'");
    expect(directive('script-src')).toContain('https://apis.google.com');
    expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin-allow-popups');
    expect(directive('object-src')).toContain("'none'");
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
  });
  it('allows the regional RTDB host configured by the application', () => {
    expect(directive('connect-src')).toContain('https://*.firebasedatabase.app');
    expect(directive('connect-src')).toContain('wss://*.firebasedatabase.app');
  });
  it('keeps auth helper navigations out of the offline app-shell fallback', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain('/^\\/__\\//');
  });
});

describe('same-origin Firebase helper', () => {
  it('proxies only to the fixed project and strips application credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('helper'));
    vi.stubGlobal('fetch', fetchMock);
    const response = await proxyFirebaseAuth(
      new Request('https://www.bsdc.info.bd/__/auth/iframe?apiKey=public', {
        headers: { authorization: 'Bearer private-app-token', cookie: 'session=private' },
      }),
    );
    const forwarded: Request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(forwarded.url).toBe('https://bsdc-bd.firebaseapp.com/__/auth/iframe?apiKey=public');
    expect(forwarded.headers.has('authorization')).toBe(false);
    expect(forwarded.headers.has('cookie')).toBe(false);
    expect(forwarded.redirect).toBe('manual');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('helper');
  });
  it('preserves POST callbacks and rewrites helper redirects to the same origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://bsdc-bd.firebaseapp.com/__/auth/handler?event=1' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await proxyFirebaseAuth(
      new Request('https://www.bsdc.info.bd/__/auth/handler', {
        method: 'POST',
        body: 'code=test',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    );
    const forwarded: Request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(forwarded.method).toBe('POST');
    expect(await forwarded.text()).toBe('code=test');
    expect(response.headers.get('location')).toBe(
      'https://www.bsdc.info.bd/__/auth/handler?event=1',
    );
  });
  it('does not act as an arbitrary URL proxy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (await proxyFirebaseAuth(new Request('https://www.bsdc.info.bd/api/other'))).status,
    ).toBe(404);
    expect(
      (
        await proxyFirebaseAuth(
          new Request('https://www.bsdc.info.bd/__/auth/iframe', { method: 'DELETE' }),
        )
      ).status,
    ).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns an uncached failure if Firebase is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const response = await proxyFirebaseAuth(
      new Request('https://www.bsdc.info.bd/__/auth/iframe'),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
