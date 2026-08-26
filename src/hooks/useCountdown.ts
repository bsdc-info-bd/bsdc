/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useState } from 'react';

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export function useCountdown(targetMs: number | null): CountdownParts {
  const [parts, setParts] = useState<CountdownParts>({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });

  useEffect(() => {
    if (!targetMs) {
      setParts({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
      return;
    }
    const compute = (): CountdownParts => {
      const diff = targetMs - Date.now();
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
      return {
        days: Math.floor(diff / 86_400_000),
        hours: Math.floor((diff % 86_400_000) / 3_600_000),
        minutes: Math.floor((diff % 3_600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1000),
        expired: false,
      };
    };
    setParts(compute());
    const timer = window.setInterval(() => setParts(compute()), 1000);
    return () => window.clearInterval(timer);
  }, [targetMs]);

  return parts;
}
