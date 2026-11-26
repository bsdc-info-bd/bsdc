import { describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  RefusedError,
  TimeoutError,
  backoffMs,
  breakerMessage,
  describeDuration,
  isPermanent,
  withRetry,
  withTimeout,
} from './resilience';

describe('withTimeout', () => {
  it('returns a result that arrives in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1_000)).resolves.toBe(7);
  });

  it('abandons work that runs past its deadline', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200));
    await expect(withTimeout(slow, 20)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('names the thing that timed out, in seconds a person can read', async () => {
    // A promise that never settles is the honest fixture for a deadline: any
    // finite promise might win the race, which would make this test prove
    // nothing about timeouts.
    const never = new Promise<void>(() => {});
    const outcome = await withTimeout(never, 20, { what: 'Loading the queue' }).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('the call should have timed out');
    expect(outcome.error).toBeInstanceOf(TimeoutError);
    // 20ms is quoted as "1 second": a sub-second deadline still reads as time.
    expect((outcome.error as Error).message).toBe(
      'Loading the queue took longer than 1 second and was abandoned.',
    );
  });

  it('quotes a deadline in the unit a reader would use', () => {
    expect(describeDuration(20)).toBe('1 second');
    expect(describeDuration(1_000)).toBe('1 second');
    expect(describeDuration(15_000)).toBe('15 seconds');
    expect(describeDuration(60_000)).toBe('1 minute');
    expect(describeDuration(150_000)).toBe('3 minutes');
    expect(describeDuration(0)).toBe('no time at all');
  });

  it('does not fire the deadline once the work has already won', async () => {
    // The losing timer must be cleared, or a console that finishes quickly
    // would still emit an abandonment log on every call.
    const onAbandon = vi.fn();
    await expect(withTimeout(Promise.resolve('fast'), 50, { onAbandon })).resolves.toBe('fast');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it('fires onAbandon exactly once, so a caller can log without its own timer', async () => {
    const onAbandon = vi.fn();
    const slow = new Promise<void>((resolve) => setTimeout(resolve, 100));
    await expect(withTimeout(slow, 10, { onAbandon })).rejects.toBeInstanceOf(TimeoutError);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(onAbandon).toHaveBeenCalledTimes(1);
  });

  it('does not abandon when no deadline is asked for', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 0)).resolves.toBe('ok');
  });

  it('propagates the underlying rejection rather than the deadline', async () => {
    const boom = Promise.reject(new RefusedError('No.'));
    await expect(withTimeout(boom, 1_000)).rejects.toBeInstanceOf(RefusedError);
  });
});

describe('backoffMs', () => {
  it('doubles with each attempt and then stops at the cap', () => {
    // Jitter is downward-only, so these are the exact achievable ceilings.
    expect(backoffMs(1, { jitter: 0 })).toBe(400);
    expect(backoffMs(2, { jitter: 0 })).toBe(800);
    expect(backoffMs(3, { jitter: 0 })).toBe(1_600);
    expect(backoffMs(9, { jitter: 0 })).toBe(8_000);
  });

  it('never exceeds the cap even with jitter', () => {
    for (let i = 0; i < 50; i += 1) expect(backoffMs(12)).toBeLessThanOrEqual(8_000);
  });

  it('returns zero before the first attempt', () => {
    expect(backoffMs(0)).toBe(0);
  });
});

describe('isPermanent', () => {
  it('treats a refusal as permanent', () => {
    expect(isPermanent(new RefusedError('No.'))).toBe(true);
  });

  it('treats a timeout as worth retrying', () => {
    expect(isPermanent(new TimeoutError(1_000))).toBe(false);
  });

  it('recognises the SQL states that a retry cannot fix', () => {
    expect(isPermanent(Object.assign(new Error('denied'), { code: '42501' }))).toBe(true);
    expect(isPermanent(Object.assign(new Error('dup'), { code: '23505' }))).toBe(true);
    expect(isPermanent(Object.assign(new Error('session'), { code: 'PGRST301' }))).toBe(true);
  });

  it('treats an ordinary network fault as retryable', () => {
    expect(isPermanent(new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('withRetry', () => {
  const instant = (): Promise<void> => Promise.resolve();

  it('returns on the first success without retrying', async () => {
    const work = vi.fn(async () => 'done');
    await expect(withRetry(work, { sleep: instant })).resolves.toBe('done');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('retries a transport failure and succeeds', async () => {
    let calls = 0;
    const work = async (): Promise<string> => {
      calls += 1;
      if (calls < 3) throw new TypeError('Failed to fetch');
      return 'third time';
    };
    await expect(withRetry(work, { sleep: instant })).resolves.toBe('third time');
    expect(calls).toBe(3);
  });

  it('gives up after the attempt budget', async () => {
    const work = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(withRetry(work, { attempts: 3, sleep: instant })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('never retries a refusal, so a typo is reported immediately', async () => {
    const work = vi.fn(async () => {
      throw new RefusedError('That reason is too short.');
    });
    await expect(withRetry(work, { sleep: instant })).rejects.toBeInstanceOf(RefusedError);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('reports each retry it makes', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const work = async (): Promise<void> => {
      calls += 1;
      if (calls < 2) throw new TypeError('Failed to fetch');
    };
    await withRetry(work, { sleep: instant, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[1]).toBe(1);
  });
});

describe('CircuitBreaker', () => {
  const at = (ms: number) => (): number => ms;

  it('starts closed and allows calls', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.snapshot().state).toBe('closed');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('opens after the threshold is reached', () => {
    const breaker = new CircuitBreaker({ threshold: 3, now: at(0) });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.canAttempt()).toBe(true);
    breaker.recordFailure();
    expect(breaker.snapshot().state).toBe('open');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('does not count a refusal as a failure', () => {
    // The server answered, so the connection is alive. Counting a permission
    // error would lock an operator out of a console that works.
    const breaker = new CircuitBreaker({ threshold: 2, now: at(0) });
    breaker.recordFailure(new RefusedError('Not allowed.'));
    breaker.recordFailure(new RefusedError('Not allowed.'));
    breaker.recordFailure(new RefusedError('Not allowed.'));
    expect(breaker.snapshot().state).toBe('closed');
    expect(breaker.snapshot().failures).toBe(0);
  });

  it('allows exactly one probe after the cooldown, then reopens on failure', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 10_000, now: () => now });
    breaker.recordFailure();
    expect(breaker.canAttempt()).toBe(false);
    now = 10_000;
    expect(breaker.snapshot().state).toBe('half-open');
    expect(breaker.canAttempt()).toBe(true);
    breaker.recordFailure();
    expect(breaker.snapshot().state).toBe('open');
    // A new cooldown begins; the probe does not grant a second immediately.
    expect(breaker.retryAfterMs()).toBe(10_000);
  });

  it('closes again after a successful probe', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 1_000, now: () => now });
    breaker.recordFailure();
    now = 1_000;
    expect(breaker.canAttempt()).toBe(true);
    breaker.recordSuccess();
    expect(breaker.snapshot()).toEqual({ state: 'closed', failures: 0, openedAt: null });
  });

  it('counts down the time until it will retry', () => {
    let now = 5_000;
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 20_000, now: () => now });
    breaker.recordFailure();
    expect(breaker.retryAfterMs()).toBe(20_000);
    now = 10_000;
    expect(breaker.retryAfterMs()).toBe(15_000);
  });

  it('trips immediately when the browser says it is offline', () => {
    const breaker = new CircuitBreaker({ threshold: 5, now: at(0) });
    breaker.trip();
    expect(breaker.canAttempt()).toBe(false);
  });
});

describe('breakerMessage', () => {
  it('counts down in seconds while open', () => {
    expect(breakerMessage({ state: 'open', failures: 5, openedAt: 0 }, 12_000)).toBe(
      'The console is not reaching the database. Retrying in 12s.',
    );
  });

  it('says nothing while closed', () => {
    expect(breakerMessage({ state: 'closed', failures: 0, openedAt: null }, 0)).toBe('');
  });
});
