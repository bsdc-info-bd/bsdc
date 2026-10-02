import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  decisionProblems,
  hoursWaiting,
  isOverdue,
  queueHealth,
  queueOrder,
  reasonLabel,
  severityOf,
  subjectLabel,
  subjectPath,
  targetHours,
  waitingLabel,
  type ReportRow,
} from '@kit';
import {
  byReason,
  corroboration,
  decisionArgs,
  repeatReporters,
  reportTitle,
  shiftSummary,
  statusLabel,
  statusTone,
} from './model';

const NOW = new Date('2026-10-02T12:00:00Z');

const report = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: 'r1',
  subject_type: 'post',
  subject_id: 'why-rust',
  reason: 'spam',
  details: 'Posted the same link in six groups.',
  status: 'open',
  reporter_uid: 'u1',
  assigned_to: null,
  resolution: '',
  report_count: 1,
  created_at: '2026-10-02T11:00:00Z',
  ...over,
});

describe('how urgent a report is', () => {
  it('ranks danger above nuisance', () => {
    expect(severityOf('self_harm')).toBeGreaterThan(severityOf('harassment'));
    expect(severityOf('harassment')).toBeGreaterThan(severityOf('spam'));
    expect(severityOf('something_new')).toBe(25);
  });

  it('promises an answer sooner the worse the reason is', () => {
    expect(targetHours(report({ reason: 'self_harm' }))).toBe(1);
    expect(targetHours(report({ reason: 'harassment' }))).toBe(4);
    expect(targetHours(report({ reason: 'nudity' }))).toBe(24);
    expect(targetHours(report({ reason: 'spam' }))).toBe(48);
  });

  it('knows when a promise has been broken', () => {
    const late = report({ reason: 'self_harm', created_at: '2026-10-02T09:00:00Z' });
    expect(hoursWaiting(late, NOW)).toBeCloseTo(3, 1);
    expect(isOverdue(late, NOW)).toBe(true);
    expect(isOverdue(report({ reason: 'spam' }), NOW)).toBe(false);
  });

  it('says how long something has waited in units a person uses', () => {
    expect(waitingLabel(report({ created_at: '2026-10-02T11:30:00Z' }), NOW)).toBe('30 minutes');
    expect(waitingLabel(report({ created_at: '2026-10-01T12:00:00Z' }), NOW)).toBe('24 hours');
    expect(waitingLabel(report({ created_at: '2026-09-20T12:00:00Z' }), NOW)).toBe('12 days');
  });
});

describe('the order the queue is worked in', () => {
  it('puts severity first and age last', () => {
    const old = report({ id: 'old', reason: 'spam', created_at: '2026-09-01T00:00:00Z' });
    const grave = report({ id: 'grave', reason: 'self_harm', created_at: '2026-10-02T11:59:00Z' });
    expect(queueOrder([old, grave], NOW).map((row) => row.id)).toEqual(['grave', 'old']);
  });

  it('breaks a tie on how many people reported the same thing', () => {
    const one = report({ id: 'one', report_count: 1 });
    const many = report({ id: 'many', report_count: 12 });
    expect(queueOrder([one, many], NOW)[0]?.id).toBe('many');
  });

  it('summarises the state of the queue honestly', () => {
    expect(queueHealth([], NOW).sentence).toBe('The queue is empty.');
    const health = queueHealth(
      [report({ reason: 'self_harm', created_at: '2026-10-02T06:00:00Z' }), report()],
      NOW,
    );
    expect(health.open).toBe(2);
    expect(health.overdue).toBe(1);
    expect(health.sentence).toContain('past the time they were promised');
  });

  it('leads the handover with anybody in danger', () => {
    const summary = shiftSummary(
      [report({ reason: 'self_harm', created_at: '2026-10-02T06:00:00Z' })],
      NOW,
    );
    expect(summary.severe).toBe(1);
    expect(summary.sentence).toContain("someone's safety");
  });
});

describe('what the row says', () => {
  it('names the subject and the reason in words', () => {
    expect(reportTitle(report())).toBe('Post — Spam');
    expect(reportTitle(report({ subject_type: 'profile', reason: 'impersonation' }))).toBe(
      'Member — Impersonation',
    );
    expect(subjectLabel('widget')).toBe('Item');
    expect(reasonLabel('child_safety')).toBe('Child safety');
  });

  it('links to where the subject can actually be read', () => {
    expect(subjectPath(report())).toBe('/p/why-rust');
    expect(subjectPath(report({ subject_type: 'profile', subject_id: 'ayesha' }))).toBe('/@ayesha');
    expect(subjectPath(report({ subject_type: 'message', subject_id: 'x' }))).toBe('');
  });

  it('distinguishes one complaint from many', () => {
    expect(corroboration(report())).toBe('Reported once.');
    expect(corroboration(report({ report_count: 4 }))).toBe('Reported 4 times.');
    expect(corroboration(report({ report_count: 20 }))).toContain('widely seen');
  });

  it('labels and colours each state', () => {
    expect(statusLabel('claimed')).toBe('Being handled');
    expect(statusTone('open')).toBe('warn');
    expect(statusTone('resolved')).toBe('ok');
  });
});

describe('making a decision', () => {
  it('offers only the actions the database accepts', () => {
    expect(ACTIONS.map((action) => action.id)).toEqual([
      'dismiss',
      'warn',
      'hide_content',
      'restore_content',
    ]);
  });

  it('demands a reason anybody could act on, for every action but dismissal', () => {
    expect(decisionProblems('dismiss', '')).toEqual([]);
    expect(decisionProblems('warn', '')).toEqual([
      'The member is told this reason, so it cannot be empty.',
    ]);
    expect(decisionProblems('warn', 'spam')).toEqual([
      'Write a reason the member can understand and act on.',
    ]);
    expect(decisionProblems('warn', 'Posting the same link in six groups is spam.')).toEqual([]);
    expect(decisionProblems('warn', 'word '.repeat(80))).toEqual([
      'Keep the reason under 300 characters.',
    ]);
  });

  it('refuses an action nobody defined', () => {
    expect(decisionProblems('delete_everything', 'because')).toEqual(['Choose what to do.']);
  });

  it('sends the arguments resolve_report declares, with the reason trimmed', () => {
    expect(decisionArgs('r1', { action: 'warn', reason: '  be kind  ' })).toEqual({
      p_report_id: 'r1',
      p_action: 'warn',
      p_reason: 'be kind',
    });
  });
});

describe('patterns across the queue', () => {
  it('counts what is being reported, most common first', () => {
    const rows = [report(), report({ id: '2' }), report({ id: '3', reason: 'harassment' })];
    expect(byReason(rows)).toEqual([
      { reason: 'Spam', count: 2 },
      { reason: 'Harassment', count: 1 },
    ]);
  });

  it('notices a member filing a great many reports', () => {
    const rows = Array.from({ length: 6 }, (_, index) =>
      report({ id: `r${index}`, reporter_uid: 'busy' }),
    );
    expect(repeatReporters([...rows, report({ id: 'x', reporter_uid: 'quiet' })])).toEqual([
      { uid: 'busy', count: 6 },
    ]);
  });

  it('ignores reports with no reporter attached', () => {
    const rows = Array.from({ length: 6 }, (_, index) =>
      report({ id: `r${index}`, reporter_uid: null }),
    );
    expect(repeatReporters(rows)).toEqual([]);
  });
});
