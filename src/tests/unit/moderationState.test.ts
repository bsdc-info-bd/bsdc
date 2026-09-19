/**
 * BSDC — src/tests/unit/moderationState.test.ts
 * Purpose : Proves the report state machine, the appeal rules and the SLA maths.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : These are the rules a community can hold its moderators to, so they are tested as rules
 *   rather than as code paths. A decided report cannot be re-decided quietly. An appeal goes to
 *   somebody who did not make the call. An urgent report has a shorter promise than a nuisance one.
 *   The same file is imported by the Cloud Function that decides, so a rule proven here is a rule
 *   enforced on the server, not merely a rule the screen happens to follow.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import { MODERATION_SLA_HOURS, MAX_APPEALS_PER_REPORT } from '@/core/config/moderation';
import {
  appealRefusal,
  availableActions,
  canAppeal,
  canReviewAppeal,
  canTakeAction,
  isTerminal,
  pointPenalty,
  requiresNote,
  stateAfter,
  stateAfterAppeal,
  transition,
} from '@/entities/moderation/state';
import { newReport, slaHoursFor, type Appeal, type Report } from '@/entities/moderation/model';

function report(category: Parameters<typeof newReport>[0]['category'] = 'spam'): Report {
  return newReport({
    targetType: 'post',
    targetId: 'p1',
    targetLabelBn: 'একটি পোস্ট',
    targetLabelEn: 'A post',
    targetAuthorUid: 'author',
    reporterUid: 'reporter',
    category,
    reasonText: 'This post is advertising a paid course in every group.',
  });
}

function appeal(overrides: Partial<Appeal> = {}): Appeal {
  return {
    id: 'a1',
    reportId: 'r1',
    appellantUid: 'author',
    reasonText: 'The post was a free workshop announcement.',
    status: 'open',
    reviewedBy: '',
    decisionNote: '',
    decidedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('report transitions', () => {
  it('offers the full set of actions on an open report', () => {
    expect(availableActions('open')).toContain('remove');
    expect(availableActions('open')).toContain('escalate');
  });

  it('refuses every action once a report has been decided', () => {
    expect(availableActions('actioned')).toHaveLength(0);
    expect(availableActions('dismissed')).toHaveLength(0);
  });

  it('will not escalate a report that is already escalated', () => {
    expect(canTakeAction('escalated', 'escalate')).toBe(false);
    expect(canTakeAction('escalated', 'suspend')).toBe(true);
  });

  it('moves a report to the state its action implies', () => {
    expect(stateAfter('dismiss')).toBe('dismissed');
    expect(stateAfter('escalate')).toBe('escalated');
    expect(stateAfter('remove')).toBe('actioned');
  });

  it('records who decided, and refuses a decision with no actor', () => {
    const next = transition(report(), 'remove', 'mod1');
    expect(next).not.toBeNull();
    expect(next?.state).toBe('actioned');
    expect(next?.decidedBy).toBe('mod1');
    expect(transition(report(), 'remove', '')).toBeNull();
  });

  it('refuses to decide a report that has already been decided', () => {
    const decided: Report = { ...report(), state: 'actioned', decidedBy: 'mod1' };
    expect(transition(decided, 'remove', 'mod2')).toBeNull();
  });

  it('refuses to decide a report that was removed', () => {
    const gone: Report = { ...report(), deletedAt: '2026-06-02T00:00:00.000Z' };
    expect(transition(gone, 'remove', 'mod1')).toBeNull();
  });
});

describe('what a decision costs', () => {
  it('asks for a written reason when the author will be told', () => {
    expect(requiresNote('remove')).toBe(true);
    expect(requiresNote('warn')).toBe(true);
    expect(requiresNote('dismiss')).toBe(false);
  });

  it('charges no points for dismissing a report that should not have been filed', () => {
    expect(pointPenalty('dismiss')).toBe(0);
  });

  it('charges more points the further the action reaches', () => {
    expect(pointPenalty('warn')).toBeLessThan(pointPenalty('restrict'));
    expect(pointPenalty('restrict')).toBeLessThan(pointPenalty('suspend'));
  });
});

describe('appeals', () => {
  it('refuses an appeal before a decision has been made', () => {
    expect(canAppeal(report())).toBe(false);
    expect(appealRefusal(report(), [])).toBe('not-decided');
  });

  it('allows one appeal after a decision', () => {
    const decided: Report = { ...report(), state: 'actioned', decidedBy: 'mod1' };
    expect(canAppeal(decided)).toBe(true);
    expect(appealRefusal(decided, [])).toBeNull();
  });

  it('allows exactly one appeal, and says why the second is refused', () => {
    const decided: Report = { ...report(), state: 'actioned', decidedBy: 'mod1' };
    const used = Array.from({ length: MAX_APPEALS_PER_REPORT }, () => appeal());
    expect(canAppeal(decided, used)).toBe(false);
    expect(appealRefusal(decided, used)).toBe('already-used');
  });

  it('ignores a withdrawn appeal when counting', () => {
    const decided: Report = { ...report(), state: 'actioned', decidedBy: 'mod1' };
    const withdrawn = [appeal({ deletedAt: '2026-06-03T00:00:00.000Z' })];
    expect(canAppeal(decided, withdrawn)).toBe(true);
  });

  it('keeps the reviewer who made the decision away from the appeal', () => {
    const decided: Report = { ...report(), state: 'actioned', decidedBy: 'mod1' };
    expect(canReviewAppeal(decided, 'mod1')).toBe(false);
    expect(canReviewAppeal(decided, 'mod2')).toBe(true);
  });

  it('moves the report to the state the appeal outcome implies', () => {
    expect(stateAfterAppeal('upheld')).toBe('dismissed');
    expect(stateAfterAppeal('rejected')).toBe('actioned');
  });

  it('treats decided reports as terminal', () => {
    expect(isTerminal({ ...report(), state: 'actioned' })).toBe(true);
    expect(isTerminal({ ...report(), state: 'open' })).toBe(false);
  });
});

describe('response targets', () => {
  it('promises a faster answer the more serious the report', () => {
    const urgent = report('self-harm');
    const nuisance = report('spam');
    expect(slaHoursFor(urgent)).toBeLessThan(slaHoursFor(nuisance));
  });

  it('never promises to be slower than the slowest target in the catalogue', () => {
    const slowest = Math.max(...Object.values(MODERATION_SLA_HOURS));
    expect(slaHoursFor(report('other'))).toBeLessThanOrEqual(slowest);
  });
});
