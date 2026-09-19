/**
 * BSDC — src/tests/unit/flags.test.ts
 * Purpose : Unit coverage for the feature-flag client, including scheduled windows (LAW-11).
 * Owner   : RRC Development / BSDC Platform Team
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateSchedule,
  isEnabled,
  listFlags,
  resetFlag,
  setFlag,
} from '@/core/flags/flagClient';
import { FLAG_KEYS } from '@/core/config/features';

/** In-memory adapter so the test never touches browser storage. */
const memory = new Map<string, boolean>();

describe('feature flags', () => {
  beforeEach(() => {
    resetFlag(FLAG_KEYS.shell);
    resetFlag(FLAG_KEYS.marketplace);
    memory.clear();
  });

  it('defaults every registered flag to the registry default', () => {
    const flags = listFlags();
    expect(flags.length).toBeGreaterThan(40);
    const shell = flags.find((flag) => flag.key === FLAG_KEYS.shell);
    expect(shell?.enabled).toBe(true);
  });

  it('applies an explicit override', () => {
    setFlag(FLAG_KEYS.marketplace, false);
    expect(isEnabled(FLAG_KEYS.marketplace)).toBe(false);
    resetFlag(FLAG_KEYS.marketplace);
    expect(isEnabled(FLAG_KEYS.marketplace)).toBe(true);
  });

  it('evaluates a scheduled window against the current instant', () => {
    const now = new Date('2026-03-01T00:00:00Z');
    expect(evaluateSchedule({ enabledAt: '2026-06-01T00:00:00Z' }, now)).toBe(false);
    expect(evaluateSchedule({ enabledAt: '2026-01-01T00:00:00Z' }, now)).toBe(true);
    expect(evaluateSchedule({ disabledAt: '2026-02-01T00:00:00Z' }, now)).toBe(false);
    expect(evaluateSchedule(null, now)).toBeNull();
    expect(memory.size).toBe(0);
  });
});
