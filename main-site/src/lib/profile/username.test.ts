import { describe, expect, it } from 'vitest';

import {
  HANDLE_COOLDOWN_DAYS,
  HANDLE_ISSUE_KEYS,
  HANDLE_LIMITS,
  HANDLE_PATTERN,
  handleIssue,
  normaliseHandle,
} from './username';

describe('what a member meant when they typed it', () => {
  it('takes the spaces and the capitals away', () => {
    expect(normaliseHandle('  Ada First  ')).toBe('adafirst');
    expect(normaliseHandle('ADA_BUILDS')).toBe('ada_builds');
    expect(normaliseHandle('ada\t\nfirst')).toBe('adafirst');
  });

  it('leaves a handle that is already right alone', () => {
    expect(normaliseHandle('adafirst')).toBe('adafirst');
  });
});

describe('the rules, in the field rather than in a toast', () => {
  it('accepts what the database accepts', () => {
    for (const handle of ['ada', 'adafirst', 'ada_builds', 'ada99', 'a'.repeat(24)]) {
      expect(handleIssue(handle)).toBeNull();
      expect(HANDLE_PATTERN.test(normaliseHandle(handle))).toBe(true);
    }
  });

  it('names each reason it cannot', () => {
    expect(handleIssue('')).toBe('empty');
    expect(handleIssue('   ')).toBe('empty');
    expect(handleIssue('ab')).toBe('tooShort');
    expect(handleIssue('a'.repeat(25))).toBe('tooLong');
    expect(handleIssue('ada first!')).toBe('characters');
    expect(handleIssue('ada-first')).toBe('characters');
    expect(handleIssue('হ্যান্ডেল')).toBe('characters');
    expect(handleIssue('_ada')).toBe('underscore');
    expect(handleIssue('ada_')).toBe('underscore');
  });

  it('knows a handle that is already the member\u2019s', () => {
    expect(handleIssue('adafirst', 'adafirst')).toBe('same');
    expect(handleIssue(' AdaFirst ', 'adafirst')).toBe('same');
    expect(handleIssue('adabuilds', 'adafirst')).toBeNull();
    expect(handleIssue('adabuilds', null)).toBeNull();
  });

  it('agrees with the limits it is written against', () => {
    expect(HANDLE_LIMITS).toEqual({ min: 3, max: 24 });
    expect(handleIssue('a'.repeat(HANDLE_LIMITS.min))).toBeNull();
    expect(handleIssue('a'.repeat(HANDLE_LIMITS.min - 1))).toBe('tooShort');
    expect(handleIssue('a'.repeat(HANDLE_LIMITS.max))).toBeNull();
    expect(handleIssue('a'.repeat(HANDLE_LIMITS.max + 1))).toBe('tooLong');
    // The wait is the database's thirty days, not a number chosen here. t33
    // proves the same refusal against the real routine.
    expect(HANDLE_COOLDOWN_DAYS).toBe(30);
  });

  it('has a sentence for every reason', () => {
    for (const issue of [
      'empty',
      'tooShort',
      'tooLong',
      'characters',
      'underscore',
      'same',
    ] as const) {
      expect(HANDLE_ISSUE_KEYS[issue].startsWith('handle.issues.')).toBe(true);
    }
  });
});
