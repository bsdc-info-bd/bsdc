import { describe, expect, it } from 'vitest';

import { localDateTimeValue } from './datetime-local';

describe('localDateTimeValue', () => {
  it('renders an instant as the local wall clock the input expects', () => {
    // The dialog must show the moment the member's own clock would call that
    // instant. Building the expectation from a Date keeps this true in any
    // timezone the test runner happens to use, which is the point of the
    // conversion and the thing that would silently break if it were hard-coded.
    const instant = new Date(2026, 10, 20, 14, 30, 0);
    expect(localDateTimeValue(instant.toISOString())).toBe('2026-11-20T14:30');
  });

  it('pads single-digit months, days, hours and minutes', () => {
    const instant = new Date(2026, 0, 5, 9, 7, 0);
    expect(localDateTimeValue(instant.toISOString())).toBe('2026-01-05T09:07');
  });

  it('answers empty for a value that is not a timestamp', () => {
    // The job and event forms send `expiresAt` and `startsAt` straight back out;
    // an unreadable value must not become the string "NaN".
    expect(localDateTimeValue('')).toBe('');
    expect(localDateTimeValue('not a date')).toBe('');
  });

  it('round-trips through the value the input would produce', () => {
    const instant = new Date(2027, 2, 1, 18, 0, 0);
    const field = localDateTimeValue(instant.toISOString());
    expect(new Date(field).getTime()).toBe(instant.getTime());
  });
});
