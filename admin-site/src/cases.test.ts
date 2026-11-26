import { describe, expect, it } from 'vitest';
import {
  CASE_OUTCOMES,
  ageNote,
  closeBlocker,
  orderCases,
  outcomeNote,
  reopenBlocker,
  reopenNote,
  tellsTheMember,
  visibleTimeline,
  type CaseEvent,
  type CaseRow,
} from './cases';

function row(over: Partial<CaseRow> = {}): CaseRow {
  return {
    id: 'c1',
    subject_uid: 'u1',
    subject_name: 'A Member',
    status: 'open',
    reports: 1,
    reopened_count: 0,
    age_hours: 10,
    opened_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('ageNote', () => {
  it('says under an hour rather than a fraction', () => {
    expect(ageNote(0.4)).toBe('under an hour');
  });

  it('counts hours up to two days, because a queue is measured in hours', () => {
    expect(ageNote(3.9)).toBe('3 h');
    expect(ageNote(23)).toBe('23 h');
  });

  it('splits days and hours in the second day', () => {
    expect(ageNote(40)).toBe('1 day 16 h');
  });

  it('drops the hours after that, where they stop being useful', () => {
    expect(ageNote(72)).toBe('3 days');
  });

  it('switches to weeks past a fortnight', () => {
    expect(ageNote(24 * 21)).toBe('3 weeks');
  });

  it('does not print a negative age if the clock disagrees', () => {
    expect(ageNote(-5)).toBe('just opened');
  });
});

describe('reopenNote', () => {
  it('says nothing for a case that was never reopened', () => {
    expect(reopenNote(0)).toBe('—');
  });

  it('says once, in words', () => {
    expect(reopenNote(1)).toBe('reopened once');
  });

  it('and counts higher than that', () => {
    expect(reopenNote(3)).toBe('reopened 3 times');
  });
});

describe('orderCases', () => {
  it('puts a reopened case ahead of an older untouched one', () => {
    const ordered = orderCases([
      row({ id: 'old', age_hours: 100 }),
      row({ id: 'reopened', age_hours: 5, reopened_count: 2 }),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(['reopened', 'old']);
  });

  it('then puts the oldest first', () => {
    const ordered = orderCases([
      row({ id: 'young', age_hours: 2 }),
      row({ id: 'old', age_hours: 90 }),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(['old', 'young']);
  });

  it('sorts a closed case last even when it is older', () => {
    const ordered = orderCases([
      row({ id: 'closed', age_hours: 500, status: 'closed' }),
      row({ id: 'open', age_hours: 1 }),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(['open', 'closed']);
  });

  it('does not mutate the input', () => {
    const input = [row({ id: 'b', age_hours: 1 }), row({ id: 'a', age_hours: 2 })];
    const copy = [...input];
    orderCases(input);
    expect(input).toEqual(copy);
  });
});

describe('outcomeNote', () => {
  it('describes every outcome in the vocabulary, none of them by falling through', () => {
    for (const outcome of CASE_OUTCOMES) {
      expect(outcomeNote(outcome)).not.toBe(outcome);
    }
  });

  it('says plainly when nothing was done', () => {
    expect(outcomeNote('no_action')).toContain('nothing was done');
  });

  it('says a referral is a queue admitting it could not decide', () => {
    expect(outcomeNote('referred')).toContain('could not decide');
  });

  it('has a phrase for a case with no outcome yet', () => {
    expect(outcomeNote('')).toBe('no outcome yet');
  });
});

describe('tellsTheMember', () => {
  it('is false for the two outcomes that mean nothing happened', () => {
    expect(tellsTheMember('no_action')).toBe(false);
    expect(tellsTheMember('duplicate')).toBe(false);
  });

  it('is true for a removal', () => {
    expect(tellsTheMember('content_removed')).toBe(true);
  });
});

describe('visibleTimeline', () => {
  const events: CaseEvent[] = [
    { id: 1, kind: 'opened', actor_uid: 'a', body: 'opened', metadata: {}, created_at: 'x' },
    { id: 2, kind: 'note', actor_uid: 'a', body: 'staffroom', metadata: {}, created_at: 'x' },
    { id: 3, kind: 'closed', actor_uid: 'a', body: 'closed', metadata: {}, created_at: 'x' },
  ];

  it('shows staff the internal note', () => {
    expect(visibleTimeline(events, true)).toHaveLength(3);
  });

  it('withholds the staffroom note from a member', () => {
    const seen = visibleTimeline(events, false);
    expect(seen.map((e) => e.kind)).toEqual(['closed', 'opened']);
  });

  it('is newest first, by id rather than by timestamp', () => {
    expect(visibleTimeline(events, true).map((e) => e.id)).toEqual([3, 2, 1]);
  });
});

describe('closeBlocker', () => {
  it('refuses an outcome outside the vocabulary', () => {
    expect(closeBlocker('felt like it', 'a long enough note')).toContain('Choose an outcome');
  });

  it('refuses a short note when the member will be told', () => {
    expect(closeBlocker('content_removed', 'short')).toContain('twelve characters');
  });

  it('allows a short note when nothing is being announced', () => {
    expect(closeBlocker('no_action', 'short')).toBeNull();
  });

  it('allows a long note for an outcome that is announced', () => {
    expect(closeBlocker('warned', 'Warned about the second thread')).toBeNull();
  });
});

describe('reopenBlocker', () => {
  it('refuses a case that is not closed', () => {
    expect(reopenBlocker('open', 'a reason long enough to pass')).toContain('not closed');
  });

  it('refuses a thin reason', () => {
    expect(reopenBlocker('closed', 'no')).toContain('twelve characters');
  });

  it('allows a closed case with a real reason', () => {
    expect(reopenBlocker('closed', 'The appeal produced the rest of the thread')).toBeNull();
  });
});
