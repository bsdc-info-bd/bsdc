import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as vitals } from './api/vitals';
import { onRequestPost as push } from './api/push/content';
import { onRequestPost as reverse } from './api/geo/reverse';

afterEach(() => vi.unstubAllGlobals());

describe('public edge request validation', () => {
  it.each(['null', '[]', '1', '"hello"', '{'])(
    'drops invalid telemetry body %s without throwing',
    async (body) => {
      const waitUntil = vi.fn();
      const context = {
        request: new Request('https://www.bsdc.info.bd/api/vitals', { method: 'POST', body }),
        env: {},
        waitUntil,
      } as unknown as Parameters<typeof vitals>[0];
      expect((await vitals(context)).status).toBe(204);
      expect(waitUntil).not.toHaveBeenCalled();
    },
  );
  it('ignores null and primitive entries inside telemetry arrays', async () => {
    const waitUntil = vi.fn();
    const context = {
      request: new Request('https://www.bsdc.info.bd/api/vitals', {
        method: 'POST',
        body: JSON.stringify({ measurements: [null, 1, 'bad', []], errors: [null, false, 3] }),
      }),
      env: {},
      waitUntil,
    } as unknown as Parameters<typeof vitals>[0];
    expect((await vitals(context)).status).toBe(204);
    expect(waitUntil).not.toHaveBeenCalled();
  });
  it.each(['null', '[]', 'false'])(
    'refuses non-object push/geocoder requests %s before upstream calls',
    async (body) => {
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const context = () => ({
        request: new Request('https://www.bsdc.info.bd/api/test', { method: 'POST', body }),
        env: {},
      });
      expect((await push(context() as unknown as Parameters<typeof push>[0])).status).toBe(400);
      expect((await reverse(context() as unknown as Parameters<typeof reverse>[0])).status).toBe(
        400,
      );
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it('refuses an oversized push body with no declared length', async () => {
    const context = {
      request: new Request('https://www.bsdc.info.bd/api/push/content', {
        method: 'POST',
        body: 'x'.repeat(8193),
      }),
      env: {},
    } as unknown as Parameters<typeof push>[0];
    expect((await push(context)).status).toBe(413);
  });
});
