import { describe, expect, it, vi } from 'vitest';
import {
  buildPayload,
  createReporter,
  deviceKind,
  errorFingerprint,
  isPlausible,
  routePattern,
  type Measurement,
} from './vitals';

const alwaysSends = (): ((endpoint: string, body: string) => boolean) => () => true;

function reporter(
  send = vi.fn<(endpoint: string, body: string) => boolean>(alwaysSends()),
  route = '/p/why-rust-is-nice',
) {
  let current = route;
  const instance = createReporter({
    build: 'abc1234',
    route: () => current,
    device: () => 'mobile',
    connection: () => '4g',
    send,
  });
  return {
    instance,
    send,
    go: (path: string): void => {
      current = path;
    },
  };
}

describe('a route, not a URL', () => {
  it('reduces an address with an identifier in it to the page it belongs to', () => {
    expect(routePattern('/p/why-rust-is-nice')).toBe('/p/:slug');
    expect(routePattern('/shop/mechanical-keyboard')).toBe('/shop/:slug');
    expect(routePattern('/@ayesha')).toBe('/@:username');
    expect(routePattern('/messages/4f1d7c3e-2b11-4f0a-9f3b-1c2d3e4f5a6b')).toBe('/messages/:slug');
    expect(routePattern('/learn/rust/lesson/12')).toBe('/learn/:slug/lesson/:n');
  });

  it('leaves a static route alone and normalises the trailing slash', () => {
    expect(routePattern('/jobs')).toBe('/jobs');
    expect(routePattern('/About/')).toBe('/about');
    expect(routePattern('/')).toBe('/');
    expect(routePattern('/search?q=secret#top')).toBe('/search');
  });

  it('never lets a slug reach the payload, even if the caller passes one', () => {
    const payload = buildPayload(
      [
        {
          route: '/p/a-private-draft',
          metric: 'LCP',
          value: 1200,
          device: 'mobile',
          connection: '4g',
          build: '',
        },
      ],
      [],
    );
    expect(payload.measurements[0]?.route).toBe('/p/:slug');
    expect(JSON.stringify(payload)).not.toContain('private-draft');
  });
});

describe('what counts as a measurement', () => {
  it('drops a metric it does not know and a value it cannot believe', () => {
    expect(isPlausible('LCP', 2400)).toBe(true);
    expect(isPlausible('SPEED', 10)).toBe(false);
    expect(isPlausible('LCP', -1)).toBe(false);
    expect(isPlausible('LCP', 600_001)).toBe(false);
    expect(isPlausible('CLS', 0.02)).toBe(true);
    expect(isPlausible('CLS', 11)).toBe(false);
    expect(isPlausible('LCP', Number.NaN)).toBe(false);
  });

  it('classifies a device from the coarsest signals available', () => {
    expect(deviceKind(390, true)).toBe('mobile');
    expect(deviceKind(820, true)).toBe('tablet');
    expect(deviceKind(820, false)).toBe('desktop');
    expect(deviceKind(1600, false)).toBe('desktop');
  });

  it('caps a payload so one bad page cannot flood the endpoint', () => {
    const many: Measurement[] = Array.from({ length: 50 }, () => ({
      route: '/jobs',
      metric: 'CLS',
      value: 0.01,
      device: 'mobile',
      connection: '4g',
      build: '',
    }));
    expect(buildPayload(many, []).measurements).toHaveLength(20);
  });
});

describe('naming a fault', () => {
  it('gives the same fingerprint to the same bug in two builds', () => {
    const a = errorFingerprint('TypeError', 'Cannot read x of undefined at line 42', '/p/one');
    const b = errorFingerprint('TypeError', 'Cannot read x of undefined at line 97', '/p/two');
    expect(a).toBe(b);
  });

  it('gives different fingerprints to different faults', () => {
    const a = errorFingerprint('TypeError', 'Cannot read x', '/jobs');
    const b = errorFingerprint('RangeError', 'Cannot read x', '/jobs');
    const c = errorFingerprint('TypeError', 'Cannot read x', '/shop/thing');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('strips the parts of a message that change every time', () => {
    const withUrl = errorFingerprint('Error', 'Failed to fetch https://cdn.test/a/b.js', '/');
    const other = errorFingerprint('Error', 'Failed to fetch https://cdn.test/c/d.js', '/');
    expect(withUrl).toBe(other);
  });

  it('is eight hexadecimal characters, so it fits a database key', () => {
    expect(errorFingerprint('Error', 'x', '/')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('the buffer', () => {
  it('keeps the last reading of a metric rather than every reading', () => {
    const { instance, send } = reporter();
    instance.add('CLS', 0.01);
    instance.add('CLS', 0.04);
    instance.add('LCP', 2400);
    expect(instance.size()).toBe(2);
    instance.flush();
    const body = JSON.parse(String(send.mock.calls[0]?.[1])) as {
      measurements: { metric: string; value: number }[];
    };
    expect(body.measurements).toHaveLength(2);
    expect(body.measurements.find((item) => item.metric === 'CLS')?.value).toBe(0.04);
  });

  it('measures each route separately when one page view spans two', () => {
    const { instance, go, send } = reporter();
    instance.add('LCP', 2000);
    go('/jobs');
    instance.add('LCP', 900);
    instance.flush();
    const body = JSON.parse(String(send.mock.calls[0]?.[1])) as {
      measurements: { route: string }[];
    };
    expect(body.measurements.map((item) => item.route).sort()).toEqual(['/jobs', '/p/:slug']);
  });

  it('reports a fault once per page view however often it fires', () => {
    const { instance } = reporter();
    for (let index = 0; index < 50; index += 1) {
      instance.addError('TypeError', 'Cannot read properties of undefined');
    }
    expect(instance.size()).toBe(1);
  });

  it('sends nothing when there is nothing to send', () => {
    const { instance, send } = reporter();
    expect(instance.flush()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('empties itself after a flush, so a second signal does not duplicate it', () => {
    const { instance, send } = reporter();
    instance.add('LCP', 2000);
    expect(instance.flush()).toBe(true);
    expect(instance.flush()).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('forgets a beacon the browser refused rather than retrying it', () => {
    const send = vi.fn<(endpoint: string, body: string) => boolean>(() => false);
    const { instance } = reporter(send);
    instance.add('LCP', 2000);
    expect(instance.flush()).toBe(false);
    expect(instance.size()).toBe(0);
  });

  it('refuses an implausible reading at the door', () => {
    const { instance } = reporter();
    instance.add('LCP', -5);
    instance.add('CLS', 99);
    expect(instance.size()).toBe(0);
  });

  it('carries nothing that identifies the visitor', () => {
    const { instance, send } = reporter();
    instance.add('LCP', 2000);
    instance.addError('TypeError', 'x is undefined');
    instance.flush();
    const body = String(send.mock.calls[0]?.[1]);
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['errors', 'measurements']);
    for (const key of ['uid', 'user', 'session', 'email', 'ip', 'referrer']) {
      expect(body).not.toContain(key);
    }
  });
});
