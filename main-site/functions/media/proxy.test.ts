import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, parseSource } from './i';

/**
 * The edge delivery & repair endpoint (`/media/i`) only fetches verified image
 * URLs on BSDC's ImgBB hosts.
 */

describe('which URLs the repair endpoint will fetch', () => {
  it('accepts a picture on an ImgBB host the platform uploads to', () => {
    expect(parseSource('https://i.ibb.co/abc/photo.jpg')?.hostname).toBe('i.ibb.co');
    expect(parseSource('https://ibb.co/abc/photo.webp')?.hostname).toBe('ibb.co');
    expect(parseSource('https://i.ibb.co.com/abc/photo.webp')?.hostname).toBe('i.ibb.co.com');
  });

  it('refuses a host that is only a lookalike or retired host', () => {
    expect(parseSource('https://i.ibb.co.evil.test/a.jpg')).toBeNull();
    expect(parseSource('https://evil-i.ibb.co/a.jpg')).toBeNull();
    expect(parseSource('https://evil.example.com/bsdc/a.jpg')).toBeNull();
  });

  it('refuses a third-party avatar host, which is not ours to repair', () => {
    expect(parseSource('https://lh3.googleusercontent.com/a/photo.jpg')).toBeNull();
  });

  it('refuses plaintext, credentials, another port and another scheme', () => {
    expect(parseSource('http://i.ibb.co/a.jpg')).toBeNull();
    expect(parseSource('https://user:pass@i.ibb.co/a.jpg')).toBeNull();
    expect(parseSource('https://i.ibb.co:8443/a.jpg')).toBeNull();
    expect(parseSource('file:///etc/passwd')).toBeNull();
    expect(parseSource('javascript:alert(1)')).toBeNull();
    expect(parseSource('data:image/png;base64,AAAA')).toBeNull();
  });

  it('refuses a document, which is not a picture to repair', () => {
    expect(parseSource('https://i.ibb.co/abc/report.pdf')).toBeNull();
  });

  it('refuses nothing at all, an empty string and an oversized address', () => {
    expect(parseSource(null)).toBeNull();
    expect(parseSource('')).toBeNull();
    expect(parseSource(`https://i.ibb.co/${'a'.repeat(4_000)}.jpg`)).toBeNull();
  });

  it('refuses a hostname that tries to traverse', () => {
    expect(parseSource('https://i.ibb.co/../a.jpg')).not.toBeNull();
    expect(parseSource('https://i.ibb.co../a.jpg')).toBeNull();
  });
});

describe('edge media proxy safeguards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks redirects to non-ImgBB hosts instead of following them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://169.254.169.254/latest/meta-data/' },
      }),
    );

    const res = await onRequestGet({
      request: new Request(
        'https://www.bsdc.info.bd/media/i?u=https%3A%2F%2Fi.ibb.co%2Fabc%2Fpic.png',
      ),
      env: {},
    } as Parameters<typeof onRequestGet>[0]);

    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sandboxes forwarded SVG images and accepts SVGs with XML prologs', async () => {
    const svg =
      '<?xml version="1.0" encoding="UTF-8"?><!-- metadata padding over 64 bytes for sniffing check --><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(svg, {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      }),
    );

    const res = await onRequestGet({
      request: new Request(
        'https://www.bsdc.info.bd/media/i?u=https%3A%2F%2Fi.ibb.co%2Fabc%2Fpic.svg',
      ),
      env: {},
    } as Parameters<typeof onRequestGet>[0]);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
  });
});
