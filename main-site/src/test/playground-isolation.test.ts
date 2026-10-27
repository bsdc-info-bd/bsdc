import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playgroundRunner } from '../../functions/_playground';

describe('isolated playground response', () => {
  it('forces an opaque sandbox even when opened directly', () => {
    const policy = playgroundRunner().headers.get('content-security-policy') ?? '';
    expect(policy).toContain('sandbox allow-scripts');
    expect(policy).not.toContain('allow-same-origin');
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain('worker-src blob:');
  });
  it('allows evaluation only in the runner, never in the application policy', () => {
    expect(playgroundRunner().headers.get('content-security-policy')).toContain("'unsafe-eval'");
    const headers = readFileSync('public/_headers', 'utf8');
    const script = headers.split(';').find((item) => item.includes('script-src')) ?? '';
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("'unsafe-inline'");
  });
  it('serves a noncached external-script document without user code', async () => {
    const response = playgroundRunner();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toContain('<script src="/playground/runner.js" defer>');
  });
  it('keeps the runner out of the offline application-shell fallback', () => {
    expect(readFileSync('src/sw.ts', 'utf8')).toContain('/^\\/playground\\/runner$/');
  });
});
