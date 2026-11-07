import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('self-hosted Bengali font', () => {
  it('keeps the documented licensed subset byte-for-byte', () => {
    const font = readFileSync('public/fonts/noto-sans-bengali.woff2');
    expect(createHash('sha256').update(font).digest('hex')).toBe(
      'f4ea4b42ab0d692d62935c714c7c6a4de6089e66a411c81104dea777ad3cb036',
    );
  });
});
