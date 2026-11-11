import { describe, expect, it } from 'vitest';
import {
  advanceRecovery,
  classifyImageFailure,
  recoveryRungs,
  initialRecoveryState,
  isSignedUrl,
  isTrustworthyLoad,
  MAX_RECOVERY_ATTEMPTS,
  planRecovery,
  proxyUrlFor,
  withBust,
} from './resilience';
import {
  isAllowedMediaHost,
  isRepairableMediaHost,
  looksLikeDocument,
  MEDIA_MAX_AGE_SECONDS,
} from './hosts';

describe('the picture hosts the platform trusts', () => {
  it('accepts the ImgBB hosts the platform uploads and delivers from', () => {
    expect(isAllowedMediaHost('i.ibb.co')).toBe(true);
    expect(isAllowedMediaHost('ibb.co')).toBe(true);
    expect(isAllowedMediaHost('i.ibb.co.com')).toBe(true);
    expect(isAllowedMediaHost('ibb.co.com')).toBe(true);
    expect(isAllowedMediaHost('image.ibb.co')).toBe(true);
    expect(isAllowedMediaHost('preview.ibb.co')).toBe(true);
    expect(isAllowedMediaHost('thumb.ibb.co')).toBe(true);
    expect(isAllowedMediaHost('i2.ibb.co')).toBe(true);
  });

  it('accepts the OAuth avatar and map hosts by suffix, and nothing wider', () => {
    expect(isAllowedMediaHost('lh3.googleusercontent.com')).toBe(true);
    expect(isAllowedMediaHost('avatars.githubusercontent.com')).toBe(false);
    expect(isAllowedMediaHost('a.tile.openstreetmap.org')).toBe(true);
    expect(isAllowedMediaHost('googleusercontent.com.evil.test')).toBe(false);
    expect(isAllowedMediaHost('notgoogleusercontent.com')).toBe(false);
  });

  it('refuses empty, relative and lookalike hosts', () => {
    expect(isAllowedMediaHost('')).toBe(false);
    expect(isAllowedMediaHost('evil-i.ibb.co')).toBe(false);
    expect(isAllowedMediaHost('i.ibb.co.evil.test')).toBe(false);
  });

  it('only repairs the ImgBB hosts the platform serves from', () => {
    expect(isRepairableMediaHost('i.ibb.co')).toBe(true);
    expect(isRepairableMediaHost('ibb.co')).toBe(true);
    expect(isRepairableMediaHost('i.ibb.co.com')).toBe(true);
    expect(isRepairableMediaHost('image.ibb.co')).toBe(true);
    expect(isRepairableMediaHost('i3.ibb.co')).toBe(true);
    expect(isRepairableMediaHost('lh3.googleusercontent.com')).toBe(false);
  });

  it('recognises a document that is not a picture at all', () => {
    expect(looksLikeDocument('https://i.ibb.co/x/report.pdf')).toBe(true);
    expect(looksLikeDocument('https://i.ibb.co/a/b.jpg')).toBe(false);
    expect(looksLikeDocument('https://i.ibb.co/a/b.jpg?x=1.pdf')).toBe(false);
  });

  it('keeps the trust window short enough that a poisoned entry dies', () => {
    expect(MEDIA_MAX_AGE_SECONDS).toBeLessThanOrEqual(60 * 60 * 24 * 7);
  });
});

describe('naming what actually failed', () => {
  const url = 'https://i.ibb.co/abc/photo.jpg';

  it('treats no response as the connection, not as a missing picture', () => {
    expect(classifyImageFailure(0, url)).toBe('transient');
    expect(classifyImageFailure(408, url)).toBe('transient');
  });

  it('treats 429 as a promise to answer later', () => {
    expect(classifyImageFailure(429, url)).toBe('rate-limited');
  });

  it('knows an expired signature from a refusal', () => {
    const signed = 'https://i.ibb.co/abc/photo.jpg?signature=abc12345';
    expect(isSignedUrl(signed)).toBe(true);
    expect(classifyImageFailure(403, signed)).toBe('expired');
    expect(classifyImageFailure(403, url)).toBe('forbidden');
    expect(classifyImageFailure(410, 'https://i.ibb.co/x.jpg?token=abc')).toBe('expired');
  });

  it('knows a deleted file from an unreachable one', () => {
    expect(classifyImageFailure(404, url)).toBe('missing');
    expect(classifyImageFailure(500, url)).toBe('transient');
  });

  it('treats a 200 that is not a picture as poison', () => {
    expect(classifyImageFailure(200, url, { contentType: 'text/html' })).toBe('poisoned');
    expect(classifyImageFailure(200, url, { contentType: 'image/jpeg' })).toBe('poisoned');
    expect(classifyImageFailure(204, url)).toBe('poisoned');
  });
});

describe('the recovery ladder', () => {
  const base = { online: true, hasFallback: true, canProxy: true };

  it('asks the other size of the picture first, because it costs nothing', () => {
    const plan = planRecovery({ ...base, failure: 'transient', attempt: 0 });
    expect(plan.step).toBe('fallback');
    expect(plan.delayMs).toBe(0);
  });

  it('retries the same address twice when there is no other size to ask', () => {
    const alone = { ...base, hasFallback: false };
    expect(planRecovery({ ...alone, failure: 'transient', attempt: 0 }).step).toBe('retry');
    expect(planRecovery({ ...alone, failure: 'transient', attempt: 1 }).step).toBe('retry-later');
  });

  it('reaches the platform proxy when the connection never comes back', () => {
    const plan = planRecovery({ ...base, failure: 'transient', attempt: 2, hasFallback: false });
    expect(plan.step).toBe('proxy');
  });

  it('does not hammer a rate limit', () => {
    const first = planRecovery({ ...base, failure: 'rate-limited', attempt: 0 });
    expect(first.step).toBe('retry-later');
    expect(first.delayMs).toBeGreaterThanOrEqual(1_000);
    expect(planRecovery({ ...base, failure: 'rate-limited', attempt: 1 }).step).toBe('fallback');
    expect(planRecovery({ ...base, failure: 'rate-limited', attempt: 2 }).step).toBe('proxy');
    expect(planRecovery({ ...base, failure: 'rate-limited', attempt: 3 }).step).toBe('give-up');
  });

  it('sends an expired signature to the edge on the first try', () => {
    expect(planRecovery({ ...base, failure: 'expired', attempt: 0 }).step).toBe('proxy');
  });

  it('sends a refusing host through this origin', () => {
    expect(planRecovery({ ...base, failure: 'forbidden', attempt: 0 }).step).toBe('proxy');
  });

  it('busts the cache for bytes that were not a picture', () => {
    expect(planRecovery({ ...base, failure: 'poisoned', attempt: 0 }).step).toBe('bust');
  });

  it('never retries a file that is genuinely not there', () => {
    expect(planRecovery({ ...base, failure: 'missing', attempt: 0 }).step).toBe('fallback');
    expect(planRecovery({ ...base, failure: 'missing', attempt: 1 }).step).toBe('give-up');
    expect(planRecovery({ ...base, failure: 'missing', attempt: 0, hasFallback: false }).step).toBe(
      'give-up',
    );
  });

  it('does nothing at all while the device is offline, and says so', () => {
    const plan = planRecovery({ ...base, failure: 'transient', attempt: 0, online: false });
    expect(plan.step).toBe('give-up');
    expect(plan.offline).toBe(true);
  });

  it('is a finite list per failure, and every list ends in the same place', () => {
    const failures = [
      'transient',
      'rate-limited',
      'expired',
      'forbidden',
      'poisoned',
      'missing',
      'unknown',
    ] as const;
    for (const failure of failures) {
      const full = recoveryRungs({ failure, hasFallback: true, canProxy: true });
      const bare = recoveryRungs({ failure, hasFallback: false, canProxy: false });
      expect(full.at(-1)).toBe('give-up');
      expect(bare.at(-1)).toBe('give-up');
      expect(bare).not.toContain('fallback');
      expect(bare).not.toContain('proxy');
      expect(new Set(full).size).toBe(full.length);
    }
  });

  it('walks a whole ladder without ever repeating an address', () => {
    const start = 'https://i.ibb.co/abc/photo.jpg';
    const thumb = 'https://i.ibb.co/abc/photo-thumb.jpg';
    let state = initialRecoveryState(start);
    const seen: string[] = [state.url];
    for (let index = 0; index < MAX_RECOVERY_ATTEMPTS + 2; index += 1) {
      state = advanceRecovery(state, {
        failure: 'transient',
        online: true,
        fallbackUrl: thumb,
        primaryUrl: start,
        canProxy: true,
      }).state;
      seen.push(state.url);
      if (state.settled) break;
    }
    expect(state.settled).toBe(true);
    expect(seen.filter((url) => url === start).length).toBeLessThanOrEqual(2);
  });

  it('stops after a bounded number of attempts, so nothing can loop', () => {
    let state = initialRecoveryState('https://i.ibb.co/abc/photo.jpg');
    let turns = 0;
    for (let index = 0; index < 20; index += 1) {
      state = advanceRecovery(state, {
        failure: 'transient',
        online: true,
        fallbackUrl: 'https://i.ibb.co/abc/photo-thumb.jpg',
        canProxy: true,
      }).state;
      turns += 1;
      if (state.settled) break;
    }
    expect(turns).toBeLessThanOrEqual(MAX_RECOVERY_ATTEMPTS);
    expect(state.settled).toBe(true);
  });
});

describe('the URLs the ladder produces', () => {
  it('adds the bust parameter once and keeps the rest of the query', () => {
    const once = withBust('https://i.ibb.co/a/b.jpg?w=600', 'n1');
    expect(once).toBe('https://i.ibb.co/a/b.jpg?w=600&bsdc_r=n1');
    expect(withBust(once, 'n2')).toBe('https://i.ibb.co/a/b.jpg?w=600&bsdc_r=n2');
  });

  it('keeps a fragment out of the query', () => {
    expect(withBust('https://i.ibb.co/a/b.jpg#frag', 'x')).toBe(
      'https://i.ibb.co/a/b.jpg?bsdc_r=x#frag',
    );
  });

  it('encodes the source once for the proxy', () => {
    const source = 'https://i.ibb.co/a/b.jpg?w=1&h=2';
    const url = new URL(proxyUrlFor(source), 'https://www.bsdc.info.bd');
    expect(url.pathname).toBe('/media/i');
    expect(url.searchParams.get('u')).toBe(source);
  });
});

describe('a paint is only trusted when it painted', () => {
  it('rejects a load event with no decoded size, which is how poison is caught', () => {
    expect(isTrustworthyLoad(0, 0)).toBe(false);
    expect(isTrustworthyLoad(640, 0)).toBe(false);
    expect(isTrustworthyLoad(640, 480)).toBe(true);
  });
});
