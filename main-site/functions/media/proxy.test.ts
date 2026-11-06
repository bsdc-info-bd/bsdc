import { describe, expect, it } from 'vitest';
import { parseSource } from './i';

/**
 * The repair endpoint is the one place this platform fetches a URL an outsider
 * chose. Every check here is a request that must not leave the edge: a different
 * port, a plaintext scheme, an embedded credential, a host that is not ours, a
 * document, an address that is not an address at all.
 */

describe('which URLs the repair endpoint will fetch', () => {
  it('accepts a picture on a host the platform uploads to', () => {
    expect(parseSource('https://i.ibb.co/abc/photo.jpg')?.hostname).toBe('i.ibb.co');
    expect(
      parseSource('https://res.cloudinary.com/bsdc/image/upload/c_fill,w_256/a.png')?.hostname,
    ).toBe('res.cloudinary.com');
  });

  it('refuses a host that is only a lookalike of one', () => {
    expect(parseSource('https://i.ibb.co.evil.test/a.jpg')).toBeNull();
    expect(parseSource('https://evil-i.ibb.co/a.jpg')).toBeNull();
    expect(parseSource('https://res.cloudinary.com.evil.test/bsdc/a.jpg')).toBeNull();
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
    expect(parseSource('https://res.cloudinary.com/bsdc/raw/upload/report.pdf')).toBeNull();
  });

  it('refuses nothing at all, an empty string and an oversized address', () => {
    expect(parseSource(null)).toBeNull();
    expect(parseSource('')).toBeNull();
    expect(parseSource(`https://i.ibb.co/${'a'.repeat(4_000)}.jpg`)).toBeNull();
  });

  it('refuses a hostname that tries to traverse', () => {
    expect(parseSource('https://i.ibb.co/../a.jpg')).not.toBeNull();
    // The traversal is in the path, not the host, so the host check still holds;
    // what matters is that the host itself can never contain `..`.
    expect(parseSource('https://i.ibb.co../a.jpg')).toBeNull();
  });
});
