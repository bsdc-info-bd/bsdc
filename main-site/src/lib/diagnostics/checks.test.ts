import { describe, expect, it } from 'vitest';
import { checksReport, runChecks, summariseChecks, type CheckResult, type Probes } from './checks';

/**
 * The rules, without a browser and without a network.
 *
 * The interesting part of a self-diagnosis is not that it runs; it is what it
 * says. These checks pin the sentences: configuration failures come before
 * consequences, a healthy deployment produces no failure, and a picture host
 * answering with an HTML page is a failure — because that is the bug that was
 * reported and misdiagnosed as a CDN problem.
 */

function healthy(): Probes {
  return {
    api: (path) =>
      Promise.resolve(
        path.startsWith('/api/health')
          ? { status: 200, body: { app: 'bsdc-main-site', status: 'ok' } }
          : path.startsWith('/api/media/providers')
            ? { status: 200, body: { proxy: true, imgbb: true } }
            : { status: 400, body: { error: 'bad request' } },
      ),
    token: () => Promise.resolve('a-token'),
    rpc: () => Promise.resolve({ ok: true }),
    realtime: () => Promise.resolve({ ok: true }),
    image: () => Promise.resolve({ ok: true, contentType: 'image/jpeg' }),
    capabilities: {
      secureContext: true,
      serviceWorker: true,
      pushManager: true,
      notifications: true,
      notificationPermission: 'granted',
      storage: true,
      online: true,
    },
    config: { firebase: true, supabase: true, webPushKey: true },
  };
}

const byId = (checks: CheckResult[], id: string) => checks.find((check) => check.id === id);

describe('a deployment that works', () => {
  it('reports no failure and no warning', async () => {
    const checks = await runChecks(healthy());
    const summary = summariseChecks(checks);
    expect(summary.failed).toBe(0);
    expect(summary.warned).toBe(0);
    expect(summary.state).toBe('ok');
  });

  it('checks both ImgBB upload readiness and ImgBB image delivery', async () => {
    const checks = await runChecks(healthy());
    expect(byId(checks, 'media.providers')?.state).toBe('ok');
    expect(byId(checks, 'image.imgbb')?.state).toBe('ok');
  });

  it('reads the health endpoint, not merely a 200', async () => {
    const probes = healthy();
    const checks = await runChecks({
      ...probes,
      api: () => Promise.resolve({ status: 200, body: '<!doctype html><html></html>' }),
    });
    expect(byId(checks, 'api.health')?.state).toBe('fail');
    expect(byId(checks, 'api.health')?.detail).toContain('instead of the API');
  });
});

describe('a deployment that is missing its configuration', () => {
  it('fails the configuration checks first, so the cause reads before the effects', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      config: { firebase: false, supabase: false, webPushKey: false },
    });
    expect(checks[0]?.id).toBe('config.supabase');
    expect(checks[0]?.state).toBe('fail');
    expect(checks[1]?.id).toBe('config.firebase');
    expect(checks[1]?.state).toBe('fail');
    expect(byId(checks, 'push.support')?.detail).toContain('no VAPID public key');
  });

  it('names the variable to set, not the symptom', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      config: { ...base.config, supabase: false },
    });
    expect(byId(checks, 'config.supabase')?.detail).toContain('VITE_SUPABASE_URL');
  });
});

describe('the picture failure that was reported', () => {
  it('calls an HTML page under an image URL a failure, not a success', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      image: () => Promise.resolve({ ok: true, contentType: 'text/html' }),
    });
    expect(byId(checks, 'image.imgbb')?.state).toBe('fail');
    expect(byId(checks, 'image.imgbb')?.detail).toContain('not with a picture');
  });

  it('calls an unreachable host a failure with a consequence', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      image: () => Promise.reject(new Error('blocked')),
    });
    expect(byId(checks, 'image.imgbb')?.state).toBe('fail');
    expect(byId(checks, 'image.imgbb')?.detail).toContain('will not load');
  });

  it('warns rather than fails when the repair endpoint is absent', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      api: (path) =>
        Promise.resolve(
          path.startsWith('/media/i')
            ? { status: 0, body: null }
            : { status: 200, body: { app: 'bsdc-main-site' } },
        ),
    });
    expect(byId(checks, 'media.repair')?.state).toBe('warn');
  });
});

describe('a signed-out visitor', () => {
  it('skips the member-only checks instead of failing them', async () => {
    const base = healthy();
    const checks = await runChecks({ ...base, token: () => Promise.resolve(null) });
    expect(byId(checks, 'auth.token')?.state).toBe('skipped');
    expect(summariseChecks(checks).failed).toBe(0);
  });
});

describe('a member whose session cannot reach the database', () => {
  it('says a migration is the likely cause, because it usually is', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      rpc: () => Promise.resolve({ ok: false, error: 'function does not exist' }),
    });
    expect(byId(checks, 'db.inbox')?.state).toBe('fail');
    expect(byId(checks, 'db.inbox')?.detail).toContain('migration');
  });

  it('leaves messaging usable when only realtime is down', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      realtime: () => Promise.resolve({ ok: false, detail: 'timed out' }),
    });
    expect(byId(checks, 'realtime.socket')?.state).toBe('warn');
    expect(byId(checks, 'realtime.socket')?.detail).toContain('still send');
    expect(summariseChecks(checks).failed).toBe(0);
  });
});

describe("the browser's own limits", () => {
  it('explains a refused notification permission as something to fix in the browser', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      capabilities: { ...base.capabilities, notificationPermission: 'denied' },
    });
    expect(byId(checks, 'push.support')?.state).toBe('warn');
    expect(byId(checks, 'push.support')?.detail).toContain('browser');
  });

  it('warns when storage is blocked, because being signed out on reload is confusing', async () => {
    const base = healthy();
    const checks = await runChecks({
      ...base,
      capabilities: { ...base.capabilities, storage: false },
    });
    expect(byId(checks, 'browser.storage')?.state).toBe('warn');
  });
});

describe('the report', () => {
  it('has no secret and no address in it', async () => {
    const checks = await runChecks(healthy());
    const report = checksReport(checks, {
      build: 'abc1234',
      language: 'en',
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    });
    expect(report).toContain('build: abc1234');
    expect(report).toContain('verdict: ok');
    expect(report).not.toContain('a-token');
    expect(report).not.toContain('https://');
  });

  it('is a summary a member can paste, not a stack trace', async () => {
    const checks = await runChecks(healthy());
    const report = checksReport(checks, { build: '', language: 'bn', userAgent: '' });
    expect(report).toContain('build: unknown');
    expect(report).toContain('language: bn');
    expect(report.split('\n').length).toBeLessThan(40);
  });
});
