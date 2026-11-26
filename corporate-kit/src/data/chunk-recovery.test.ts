import { describe, expect, it, vi } from 'vitest';
import {
  MAX_AUTOMATIC_RELOADS,
  attemptStaleBuildRecovery,
  currentBuild,
  isChunkLoadFailure,
  readAttempt,
  recoveryFailureMessage,
} from './chunk-recovery';

/** A minimal in-memory Storage, so the tests do not need a browser. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

const deps = (over: Partial<Parameters<typeof attemptStaleBuildRecovery>[2]> = {}) => ({
  now: () => 1_000_000,
  online: () => true,
  reload: vi.fn(),
  storage: memoryStorage(),
  ...over,
});

describe('isChunkLoadFailure', () => {
  it('recognises a chunk the server no longer has', () => {
    expect(
      isChunkLoadFailure(
        new TypeError('Failed to fetch dynamically imported module: /assets/Reports-abc123.js'),
      ),
    ).toBe(true);
  });

  it('recognises a stale-to-new evaluation mix', () => {
    expect(
      isChunkLoadFailure(
        new TypeError("Cannot read properties of undefined (reading 'map') in module chunk"),
      ),
    ).toBe(true);
  });

  it('recognises a named export that no longer exists', () => {
    expect(
      isChunkLoadFailure(
        new SyntaxError("The requested module does not provide an export named 'x'"),
      ),
    ).toBe(true);
  });

  it('does not swallow a genuine bug in a screen', () => {
    // This is the whole point of the distinction: a real bug must still reach
    // the error screen so somebody learns about it.
    expect(
      isChunkLoadFailure(new TypeError("Cannot read properties of undefined (reading 'id')")),
    ).toBe(false);
  });

  it('handles a thrown string and a thrown object', () => {
    expect(isChunkLoadFailure('Importing a module script failed.')).toBe(true);
    expect(isChunkLoadFailure({ message: 'failed to fetch dynamically imported module' })).toBe(
      true,
    );
  });

  it('handles nothing at all', () => {
    expect(isChunkLoadFailure(null)).toBe(false);
    expect(isChunkLoadFailure(undefined)).toBe(false);
    expect(isChunkLoadFailure({})).toBe(false);
  });
});

describe('attemptStaleBuildRecovery', () => {
  it('reloads the page so the document and its chunks agree', () => {
    const reload = vi.fn();
    const outcome = attemptStaleBuildRecovery('bsdc-admin', 'build-a', deps({ reload }));
    expect(outcome).toEqual({ recovered: true, reason: 'reloaded' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads exactly twice, then stops and says so', () => {
    const storage = memoryStorage();
    let now = 1_000_000;
    const reload = vi.fn();
    const run = (): unknown =>
      attemptStaleBuildRecovery('bsdc-admin', 'build-a', {
        storage,
        reload,
        now: () => now,
        online: () => true,
      });

    expect(run()).toEqual({ recovered: true, reason: 'reloaded' });
    now += 10_000;
    expect(run()).toEqual({ recovered: true, reason: 'reloaded' });
    now += 10_000;
    // A third reload would be a loop, not a fix.
    expect(run()).toEqual({ recovered: false, reason: 'budget-spent' });
    expect(reload).toHaveBeenCalledTimes(MAX_AUTOMATIC_RELOADS);
  });

  it('does not reload twice within two seconds', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    attemptStaleBuildRecovery('bsdc-admin', 'build-a', {
      storage,
      reload,
      now: () => 1_000_000,
      online: () => true,
    });
    const second = attemptStaleBuildRecovery('bsdc-admin', 'build-a', {
      storage,
      reload,
      now: () => 1_000_500,
      online: () => true,
    });
    expect(second).toEqual({ recovered: false, reason: 'too-soon' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads while offline', () => {
    // Reloading offline would discard a half-written note and fix nothing.
    const reload = vi.fn();
    const outcome = attemptStaleBuildRecovery(
      'bsdc-admin',
      'build-a',
      deps({ reload, online: () => false }),
    );
    expect(outcome).toEqual({ recovered: false, reason: 'offline' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('gives a new deployment a fresh budget', () => {
    const storage = memoryStorage();
    let now = 1_000_000;
    const reload = vi.fn();
    const run = (build = 'build-a'): unknown =>
      attemptStaleBuildRecovery('bsdc-admin', build, {
        storage,
        reload,
        now: () => now,
        online: () => true,
      });
    run();
    now += 10_000;
    run();
    now += 10_000;
    expect(run('build-a')).toEqual({ recovered: false, reason: 'budget-spent' });
    // build-b is a different deploy and deserves its own attempt.
    expect(run('build-b')).toEqual({ recovered: true, reason: 'reloaded' });
  });

  it('keeps consoles from spending each other\u2019s budget', () => {
    const storage = memoryStorage();
    let now = 1_000_000;
    const reload = vi.fn();
    const run = (scope: string): unknown =>
      attemptStaleBuildRecovery(scope, 'build-a', {
        storage,
        reload,
        now: () => now,
        online: () => true,
      });
    run('bsdc-admin');
    now += 10_000;
    run('bsdc-admin');
    now += 10_000;
    run('bsdc-admin');
    // The moderation console has its own ledger and can still recover.
    expect(run('bsdc-mod')).toEqual({ recovered: true, reason: 'reloaded' });
  });

  it('survives a browser that blocks storage', () => {
    const outcome = attemptStaleBuildRecovery('bsdc-admin', 'build-a', deps({ storage: null }));
    expect(outcome).toEqual({ recovered: false, reason: 'storage-blocked' });
  });
});

describe('readAttempt', () => {
  it('ignores a stored value of the wrong shape', () => {
    const storage = memoryStorage();
    storage.setItem('bsdc:chunk-recovery:bsdc-admin', '{"build":7,"count":"two"}');
    expect(readAttempt('bsdc-admin', storage)).toBeNull();
  });

  it('ignores unparseable storage rather than throwing', () => {
    const storage = memoryStorage();
    storage.setItem('bsdc:chunk-recovery:bsdc-admin', 'not json');
    expect(readAttempt('bsdc-admin', storage)).toBeNull();
  });
});

describe('currentBuild', () => {
  it('prefers the injected environment value', () => {
    expect(currentBuild({ VITE_BUILD_SHA: ' a1b2c3 ' })).toBe('a1b2c3');
  });

  it('falls back to "dev", which is honest about having no deploy', () => {
    expect(currentBuild({})).toBe('dev');
    expect(currentBuild()).toBe('dev');
  });
});

describe('recoveryFailureMessage', () => {
  it('says nothing when recovery worked', () => {
    expect(recoveryFailureMessage({ recovered: true, reason: 'reloaded' })).toBe('');
  });

  it('explains an offline console in terms of what is kept', () => {
    expect(recoveryFailureMessage({ recovered: false, reason: 'offline' })).toContain(
      'will keep what you have typed',
    );
  });

  it('tells the operator when the console has given up', () => {
    expect(recoveryFailureMessage({ recovered: false, reason: 'budget-spent' })).toContain(
      'reloaded twice',
    );
  });
});
