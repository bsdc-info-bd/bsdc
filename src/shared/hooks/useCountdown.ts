/**
 * BSDC — src/shared/hooks/useCountdown.ts
 * Purpose : Launch countdown that is safe under prerender and never mismatches hydration
 *           (PART 03.05, PART 10.02).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The first render intentionally returns zeros; the real values appear after mount.
 *           This is what prevents a hydration mismatch between the prerendered HTML and the
 *           client's clock (ADR-022).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect, useState } from 'react';
import { countdownParts } from '@/shared/lib/date';

/** Countdown state. */
export interface CountdownState {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly totalMs: number;
  readonly launched: boolean;
  /** False until the first client tick, so prerender and hydration agree. */
  readonly ready: boolean;
}

/**
 * Ticks a countdown to a target timestamp.
 * @param target epoch milliseconds (or Date) of the launch moment
 * @param enabled false pauses the countdown (admin control)
 * @returns the current countdown state
 */
export function useCountdown(target: number | Date, enabled = true): CountdownState {
  const targetMs = typeof target === 'number' ? target : target.getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  if (now === null) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, launched: false, ready: false };
  }

  const parts = countdownParts(targetMs, now);
  return {
    days: parts.days,
    hours: parts.hours,
    minutes: parts.minutes,
    seconds: parts.seconds,
    totalMs: parts.total,
    launched: parts.past,
    ready: true,
  };
}
