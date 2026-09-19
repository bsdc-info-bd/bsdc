/**
 * BSDC — src/tests/unit/backendGateway.test.ts
 * Purpose : Proves the gateway degrades instead of breaking (ADR-019).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Every repository depends on this behaviour: a backend that cannot be reached must
 *   produce a device-local answer and an honest reason, never a thrown error and never a blank
 *   screen claiming there is no data.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/core/errors/AppError';
import {
  REMOTE_TIMEOUT_MS,
  getBackendState,
  markLocal,
  markRemote,
  subscribeBackend,
  withRemote,
  withRemoteFallback,
} from '@/services/backend/gateway';

afterEach(() => {
  markRemote();
});

describe('backend gateway', () => {
  it('reports the remote mode after a successful operation', async () => {
    const result = await withRemote(() => Promise.resolve(42), 'read posts');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
    expect(getBackendState().mode).toBe('remote');
    expect(getBackendState().failures).toBe(0);
  });

  it('degrades to device-local mode with a reason when the operation fails', async () => {
    const result = await withRemote(
      () => Promise.reject(new AppError('BSDC-NET-005', { operation: 'read posts' })),
      'read posts',
    );
    expect(result.ok).toBe(false);
    expect(getBackendState().mode).toBe('local');
    expect(getBackendState().code).toBe('BSDC-NET-005');
    expect(getBackendState().reason).toBeTruthy();
    expect(getBackendState().failures).toBeGreaterThan(0);
  });

  it('recovers the remote mode on the next success', async () => {
    markLocal('offline');
    expect(getBackendState().mode).toBe('local');
    const result = await withRemote(() => Promise.resolve('ok'), 'probe');
    expect(result.ok).toBe(true);
    expect(getBackendState().mode).toBe('remote');
  });

  it('returns the fallback instead of throwing when the remote call fails', async () => {
    const value = await withRemoteFallback(
      (): Promise<string> => Promise.reject(new AppError('BSDC-NET-002', {})),
      'fallback-value',
      'read groups',
    );
    expect(value).toBe('fallback-value');
  });

  it('gives up after the documented timeout', async () => {
    vi.useFakeTimers();
    const pending = withRemote(() => new Promise<string>(() => undefined), 'hangs');
    await vi.advanceTimersByTimeAsync(REMOTE_TIMEOUT_MS + 10);
    const result = await pending;
    vi.useRealTimers();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BSDC-NET-002');
  });

  it('notifies subscribers on every state change and stops after unsubscribe', () => {
    const seen: string[] = [];
    const stop = subscribeBackend((state) => seen.push(state.mode));
    markLocal('offline');
    markRemote();
    stop();
    markLocal('again');
    expect(seen).toEqual(['local', 'remote']);
  });
});
