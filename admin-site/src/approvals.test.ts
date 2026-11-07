import { describe, expect, it } from 'vitest';
import {
  EMPTY_DECISION,
  confirmDecision,
  decisionLabel,
  decisionProblems,
  emptyQueueMessage,
  money,
  oldestFirst,
  waitingFor,
} from './approvals';

/**
 * The rules of a review queue, pinned.
 *
 * These are the parts of the Approvals screen that decide what happens to
 * somebody else's shop or advertising money, so they are tested without a DOM:
 * a rejection that carries no reason, a queue sorted newest-first, or a budget
 * off by two orders of magnitude are all bugs that a screenshot cannot show.
 */

const NOW = Date.parse('2026-11-06T12:00:00.000Z');

describe('a decision', () => {
  it('lets an approval through without a note, because the outcome is the answer', () => {
    expect(decisionProblems(true, EMPTY_DECISION)).toEqual([]);
    expect(decisionProblems(true, { note: '   ' })).toEqual([]);
  });

  it('refuses a rejection with no reason, because the applicant reads it', () => {
    expect(decisionProblems(false, EMPTY_DECISION)).toHaveLength(1);
    expect(decisionProblems(false, { note: 'no' })).toHaveLength(1);
    expect(decisionProblems(false, { note: '  ok  ' })).toHaveLength(1);
    expect(decisionProblems(false, { note: 'Photos are of another shop.' })).toEqual([]);
  });

  it('names the button after what it does', () => {
    expect(decisionLabel(true)).toBe('Approve');
    expect(decisionLabel(false)).toBe('Refuse');
  });

  it('says what the decision will do, with the name in the sentence', () => {
    expect(confirmDecision('shop', true, 'Dhaka Threads')).toContain('Dhaka Threads');
    expect(confirmDecision('shop', true, 'Dhaka Threads')).toContain('live');
    expect(confirmDecision('campaign', false, 'Eid Sale')).toContain('advertisement');
    expect(confirmDecision('campaign', false, 'Eid Sale')).toContain('Eid Sale');
    expect(confirmDecision('campaign', false, 'Eid Sale')).toContain('told why');
  });
});

describe('how long something has been waiting', () => {
  it('reads the way an operator says it', () => {
    expect(waitingFor('2026-11-06T11:59:40.000Z', NOW)).toBe('just now');
    expect(waitingFor('2026-11-06T11:45:00.000Z', NOW)).toBe('15m');
    expect(waitingFor('2026-11-06T09:00:00.000Z', NOW)).toBe('3h');
    expect(waitingFor('2026-11-05T12:00:00.000Z', NOW)).toBe('1 day');
    expect(waitingFor('2026-11-01T12:00:00.000Z', NOW)).toBe('5 days');
  });

  it('never says something has been waiting a negative amount of time', () => {
    // A clock difference between the browser and the database is normal.
    expect(waitingFor('2026-11-06T12:00:30.000Z', NOW)).toBe('just now');
  });

  it('says so rather than guessing when a date is unreadable', () => {
    expect(waitingFor('not a date', NOW)).toBe('unknown');
    expect(waitingFor('', NOW)).toBe('unknown');
  });
});

describe('the order a queue is worked in', () => {
  const rows = [
    { id: 'new', created_at: '2026-11-06T10:00:00.000Z' },
    { id: 'oldest', created_at: '2026-11-01T10:00:00.000Z' },
    { id: 'broken', created_at: 'yesterday-ish' },
    { id: 'middle', created_at: '2026-11-04T10:00:00.000Z' },
  ];

  it('puts the oldest first, so nobody waits forever behind a newer arrival', () => {
    expect(oldestFirst(rows).map((row) => row.id)).toEqual(['oldest', 'middle', 'new', 'broken']);
  });

  it('does not mutate the list it was given', () => {
    const original = [...rows];
    oldestFirst(rows);
    expect(rows).toEqual(original);
  });

  it('leaves an empty queue empty', () => {
    expect(oldestFirst([])).toEqual([]);
  });
});

describe('budgets', () => {
  it('renders the smallest unit as money, not as a raw integer', () => {
    expect(money(5000)).toBe('৳50');
    expect(money(123_456)).toBe('৳1,234.56');
    expect(money(0)).toBe('৳0');
  });

  it('refuses to print a number it cannot trust', () => {
    expect(money(-1)).toBe('—');
    expect(money(Number.NaN)).toBe('—');
    expect(money(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('an empty queue', () => {
  it('says the queue is empty, not that the screen is broken', () => {
    expect(emptyQueueMessage('shop')).toContain('No shops');
    expect(emptyQueueMessage('campaign')).toContain('No advertisements');
  });
});
