import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadFailure, recoverFromStaleBuild } from './chunk-recovery';

/**
 * The failure this guards against was reported as "every link from the home
 * page shows the error screen": a tab open across a deploy asking for chunks
 * that build no longer has. Each case below is one way that arrives.
 */
describe('isChunkLoadFailure', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://www.bsdc.info.bd/assets/AboutPage-abc.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/AboutPage-def.css',
    'TypeError: Failed to fetch dynamically imported module: /assets/MarketplacePage-1.js',
  ])('recognises a chunk that never arrived: %s', (message) => {
    expect(isChunkLoadFailure(new TypeError(message))).toBe(true);
  });

  it('recognises a stale chunk that arrived but cannot run', () => {
    expect(
      isChunkLoadFailure(
        new TypeError('(0 , _design_system__WEBPACK_IMPORTED_MODULE_0__.Button) is not a function'),
      ),
    ).toBe(true);
    expect(
      isChunkLoadFailure(
        new Error("The requested module '/assets/x.js' does not provide an export named 'Seo'"),
      ),
    ).toBe(true);
  });

  it('accepts a bare string, as a rejection reason can be', () => {
    expect(isChunkLoadFailure('Failed to fetch dynamically imported module')).toBe(true);
  });

  /** The error screen exists for these. Recovering from them would hide real bugs. */
  it.each([
    new Error('Cannot read properties of undefined (reading "map")'),
    new Error('Rendered more hooks than during the previous render'),
    new Error('Objects are not valid as a React child'),
    new TypeError("Cannot read properties of null (reading 'length')"),
    'quota exceeded',
    undefined,
    null,
    {},
  ])('leaves a genuine page bug to the error screen: %s', (error) => {
    expect(isChunkLoadFailure(error)).toBe(false);
  });

  it('does not match a page error that merely mentions a module in passing', () => {
    expect(isChunkLoadFailure(new Error('useModule must be called inside a provider'))).toBe(false);
  });
});

describe('recoverFromStaleBuild', () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
    window.sessionStorage.clear();
    reload.mockClear();
    // jsdom refuses a real navigation; the decision to navigate is what matters.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reloads once, so the document and its chunks come from the same build', () => {
    expect(recoverFromStaleBuild('build-a')).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads a second time for a second deployment', () => {
    expect(recoverFromStaleBuild('build-a')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(recoverFromStaleBuild('build-b')).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  /** A page that is genuinely broken must end on the error screen, not a loop. */
  it('stops after two automatic reloads for the same build', () => {
    expect(recoverFromStaleBuild('build-a')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(recoverFromStaleBuild('build-a')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(recoverFromStaleBuild('build-a')).toBe(false);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload twice in a row, which would trap the tab in a loop', () => {
    expect(recoverFromStaleBuild('build-a')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(recoverFromStaleBuild('build-a')).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  /**
   * Private and embedded contexts can refuse session storage entirely. The
   * visitor still needs the page, so a first visit is assumed — but a storage
   * that rejects writes must not throw out of the error path.
   */
  it('reloads a visitor whose chunk failed while they were online', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(recoverFromStaleBuild('build-a')).toBe(true);
    online.mockRestore();
  });

  it('still recovers when session storage refuses to be read', () => {
    const getItem = vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(recoverFromStaleBuild('build-a')).toBe(true);
    getItem.mockRestore();
  });

  it('does not throw when session storage refuses to be written', () => {
    const setItem = vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => recoverFromStaleBuild('build-a')).not.toThrow();
    setItem.mockRestore();
  });
});
