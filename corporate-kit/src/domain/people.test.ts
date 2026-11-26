import { describe, expect, it } from 'vitest';
import {
  RELIABILITY_FLOOR,
  appealOutcomeMessage,
  appealQueueSummary,
  breachedAppeals,
  canClaim,
  decisionBlocker,
  describeKind,
  families,
  familyLabel,
  familyOf,
  filterTimeline,
  handoverDue,
  handoverFor,
  ladderBlocker,
  needsAttention,
  openItemsSummary,
  orderAppeals,
  orderLadder,
  orderShifts,
  orderTimeline,
  previewMessage,
  reliabilityIsMeaningful,
  reliabilityLabel,
  reviewBlocker,
  rungEffect,
  rungFor,
  shiftSentence,
  signalSentence,
  signalWorthShowing,
  uncoveredShifts,
  type AppealRow,
  type LadderRung,
  type OpenItems,
  type PersonSignal,
  type ShiftBoardRow,
  type TimelineEvent,
} from './people';

function event(over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    occurred_at: '2026-01-02T10:00:00Z',
    kind: 'report.filed',
    summary: 'Spam',
    detail: '',
    reference: 'a',
    ...over,
  };
}

function items(over: Partial<OpenItems> = {}): OpenItems {
  return {
    open_reports: 0,
    open_cases: 0,
    open_appeals: 0,
    active_standing: 0,
    is_suspended: false,
    last_action_at: null,
    ...over,
  };
}

function rung(over: Partial<LadderRung> = {}): LadderRung {
  return {
    severity: 'normal',
    rung: 'warning',
    points: 10,
    rule_key: 'ladder.normal',
    duration_days: 90,
    message_en: 'This is a formal warning.',
    message_bn: 'এটি একটি সতর্কতা।',
    next_rung: 'restriction',
    ...over,
  };
}

function appeal(over: Partial<AppealRow> = {}): AppealRow {
  return {
    id: 'ap-1',
    appellant_uid: 'member',
    appellant: 'A Member',
    summary: 'On-topic post',
    subject: 'action',
    status: 'open',
    severity: 'normal',
    age_minutes: 100,
    respond_within: 1440,
    respond_state: 'ok',
    original_actor: 'mod',
    reviewer_uid: null,
    created_at: '2026-01-02T10:00:00Z',
    ...over,
  };
}

function shift(over: Partial<ShiftBoardRow> = {}): ShiftBoardRow {
  return {
    shift_id: 's-1',
    shift_name: 'night',
    on_date: '2026-01-02',
    headcount: 2,
    open_reports: 3,
    breached: 0,
    handover: '',
    handover_at: null,
    previous_handover: null,
    ...over,
  };
}

describe('familyOf / families', () => {
  it('takes the family from before the first dot', () => {
    expect(familyOf('moderation.warn')).toBe('moderation');
  });

  it('keeps a kind with no dot as its own family', () => {
    expect(familyOf('opened')).toBe('opened');
  });

  it('offers only the families present, in a fixed order rather than data order', () => {
    const rows = [event({ kind: 'standing.ladder.normal' }), event({ kind: 'report.filed' })];
    expect(families(rows).map((f) => f.key)).toEqual(['report', 'standing']);
  });

  it('reversing the input does not reverse the filter, so the list is stable', () => {
    const forward = families([event({ kind: 'report.filed' }), event({ kind: 'appeal.filed' })]);
    const backward = families([event({ kind: 'appeal.filed' }), event({ kind: 'report.filed' })]);
    expect(forward.map((f) => f.key)).toEqual(backward.map((f) => f.key));
  });

  it('labels a known family in words', () => {
    expect(familyLabel('moderation')).toBe('Actions taken');
  });

  it('falls back to the key for a family nobody has labelled', () => {
    expect(familyLabel('opened')).toBe('opened');
  });
});

describe('describeKind', () => {
  it('distinguishes a report they filed from one about them', () => {
    expect(describeKind('report.filed')).toBe('Reported somebody');
    expect(describeKind('report.about')).toBe('Was reported');
  });

  it('writes an action as a sentence a member can read', () => {
    expect(describeKind('moderation.hide_content')).toBe('Content hidden');
    expect(describeKind('moderation.suspend_account')).toBe('Account suspended');
  });

  it('never leaks an underscore into a member-facing line', () => {
    for (const kind of [
      'moderation.hide_content',
      'moderation.restore_account',
      'moderation.warn',
    ]) {
      expect(describeKind(kind)).not.toContain('_');
    }
  });

  it('names the ladder step with its severity', () => {
    expect(describeKind('standing.ladder.normal')).toBe('Ladder step (normal)');
  });

  it('falls back to the whole kind for something unknown rather than dropping it', () => {
    expect(describeKind('mystery.thing')).toBe('mystery.thing');
  });
});

describe('filterTimeline', () => {
  const rows = [
    event({ kind: 'report.filed', reference: '1' }),
    event({ kind: 'moderation.warn', reference: '2' }),
    event({ kind: 'appeal.filed', reference: '3' }),
  ];

  it('keeps everything when nothing is chosen', () => {
    expect(filterTimeline(rows, [])).toHaveLength(3);
  });

  it('keeps only the chosen families', () => {
    expect(filterTimeline(rows, ['moderation']).map((r) => r.reference)).toEqual(['2']);
  });

  it('does not reorder what it keeps', () => {
    const kept = filterTimeline(rows, ['report', 'appeal']);
    expect(kept.map((r) => r.reference)).toEqual(['1', '3']);
  });

  it('filters by family, so one family choice keeps every kind in it', () => {
    const many = [event({ kind: 'moderation.warn' }), event({ kind: 'moderation.hide_content' })];
    expect(filterTimeline(many, ['moderation'])).toHaveLength(2);
  });
});

describe('orderTimeline', () => {
  it('puts the newest first', () => {
    const rows = [
      event({ occurred_at: '2026-01-01T00:00:00Z', reference: 'old' }),
      event({ occurred_at: '2026-02-01T00:00:00Z', reference: 'new' }),
    ];
    expect(orderTimeline(rows)[0]?.reference).toBe('new');
  });

  it('breaks a tie by reference, so two events in one second do not swap between renders', () => {
    const same = '2026-01-01T00:00:00Z';
    const a = [
      event({ occurred_at: same, reference: 'a' }),
      event({ occurred_at: same, reference: 'b' }),
    ];
    const b = [a[1] as TimelineEvent, a[0] as TimelineEvent];
    expect(orderTimeline(a).map((r) => r.reference)).toEqual(
      orderTimeline(b).map((r) => r.reference),
    );
  });

  it('does not mutate the input', () => {
    const rows = [
      event({ occurrence: 'x' } as never),
      event({ occurred_at: '2020-01-01T00:00:00Z' }),
    ];
    const before = rows.map((r) => r.occurred_at);
    orderTimeline(rows);
    expect(rows.map((r) => r.occurred_at)).toEqual(before);
  });
});

describe('openItemsSummary', () => {
  it('says nothing is open when something has happened but nothing is outstanding', () => {
    expect(openItemsSummary(items({ last_action_at: '2026-01-01T00:00:00Z' }))).toContain(
      'Nothing is open',
    );
  });

  it('does not mention a zero, because a zero is noise on a card', () => {
    const text = openItemsSummary(items({ open_reports: 2 }));
    expect(text).not.toContain('0 open');
    expect(text).toContain('2 open reports');
  });

  it('uses the singular for one', () => {
    // "1 open cases" is the bug this catches; the separator only appears when
    // there is something after it, so the assertion is on the phrase itself.
    expect(openItemsSummary(items({ open_cases: 1 }))).toBe('1 open case');
  });

  it('leads with suspension, because it is the most serious fact', () => {
    const text = openItemsSummary(items({ is_suspended: true, open_reports: 1 }));
    expect(text.startsWith('suspended')).toBe(true);
  });

  it('shows negative standing with its sign', () => {
    expect(openItemsSummary(items({ active_standing: -25 }))).toContain('−25'.replace('−', '-'));
  });

  it('shows positive standing with a plus', () => {
    expect(openItemsSummary(items({ active_standing: 10 }))).toContain('+10 standing');
  });

  it('says an account has no history at all rather than only that nothing is open', () => {
    expect(openItemsSummary(items())).toContain('Nothing has happened');
  });
});

describe('needsAttention', () => {
  it('is false for a clean record', () => {
    expect(needsAttention(items())).toBe(false);
  });

  it('is true for a suspension', () => {
    expect(needsAttention(items({ is_suspended: true }))).toBe(true);
  });

  it('is true for an open appeal, which is somebody waiting', () => {
    expect(needsAttention(items({ open_appeals: 1 }))).toBe(true);
  });

  it('is false for standing alone, because standing is history not work', () => {
    expect(needsAttention(items({ active_standing: -50 }))).toBe(false);
  });
});

describe('the ladder', () => {
  it('finds the rung for a severity', () => {
    expect(rungFor([rung()], 'normal')?.rung).toBe('warning');
  });

  it('returns null for a severity with no policy rather than a default rung', () => {
    expect(rungFor([rung()], 'critical')).toBeNull();
  });

  it('orders lightest first, which is how a moderator reads it', () => {
    const rows = [
      rung({ rung: 'suspension_review' }),
      rung({ rung: 'nudge' }),
      rung({ rung: 'warning' }),
    ];
    expect(orderLadder(rows).map((r) => r.rung)).toEqual(['nudge', 'warning', 'suspension_review']);
  });

  it('names the next step in the preview, because that is what the member reads', () => {
    expect(previewMessage(rung())).toContain('The next step would be: restriction.');
  });

  it('says nothing about a next step at the top of the ladder', () => {
    const text = previewMessage(rung({ next_rung: null }));
    expect(text).not.toContain('next step');
  });

  it('describes the effect in points and time', () => {
    expect(rungEffect(rung())).toBe('−10 standing, expires in 90 days');
  });

  it('says no standing change when a rung carries none', () => {
    expect(rungEffect(rung({ points: 0, duration_days: 30 }))).toContain('no standing change');
  });

  it('says no expiry when a rung is indefinite', () => {
    expect(rungEffect(rung({ duration_days: null }))).toContain('no expiry');
  });
});

describe('ladderBlocker', () => {
  it('blocks a step with no severity chosen', () => {
    expect(ladderBlocker(null, 'a real reason here', 'a', 'b')).toContain('severity');
  });

  it('blocks warning yourself', () => {
    expect(ladderBlocker(rung(), 'a real reason here', 'same', 'same')).toContain('yourself');
  });

  it('blocks a reason under twelve characters', () => {
    expect(ladderBlocker(rung(), 'too short', 'a', 'b')).toContain('twelve');
  });

  it('allows a real step', () => {
    expect(ladderBlocker(rung(), 'Third off-topic promotion this week', 'a', 'b')).toBeNull();
  });

  it('counts characters after trimming, so whitespace is not a reason', () => {
    expect(ladderBlocker(rung(), '            ', 'a', 'b')).not.toBeNull();
  });
});

describe('reviewBlocker', () => {
  it('blocks the original decider, which is the rule the table exists for', () => {
    expect(reviewBlocker(appeal({ original_actor: 'mod' }), 'mod')).toContain(
      'You made the decision',
    );
  });

  it('blocks the appellant from reviewing their own appeal', () => {
    expect(reviewBlocker(appeal({ appellant_uid: 'member' }), 'member')).toContain(
      'your own appeal',
    );
  });

  it('blocks a decided appeal', () => {
    expect(reviewBlocker(appeal({ status: 'upheld' }), 'other')).toContain('already been upheld');
  });

  it('blocks a second reviewer when somebody has it', () => {
    expect(reviewBlocker(appeal({ reviewer_uid: 'someone' }), 'other')).toContain(
      'already reviewing',
    );
  });

  it('allows the reviewer who already holds it to continue', () => {
    expect(reviewBlocker(appeal({ status: 'under_review', reviewer_uid: 'me' }), 'me')).toBeNull();
  });

  it('allows an uninvolved moderator', () => {
    expect(reviewBlocker(appeal(), 'other')).toBeNull();
  });
});

describe('canClaim', () => {
  it('is true for an open appeal and an uninvolved moderator', () => {
    expect(canClaim(appeal(), 'other')).toBe(true);
  });

  it('is false for the original decider, so the button is absent rather than failing', () => {
    expect(canClaim(appeal({ original_actor: 'mod' }), 'mod')).toBe(false);
  });

  it('is false once it is under review', () => {
    expect(canClaim(appeal({ status: 'under_review' }), 'other')).toBe(false);
  });
});

describe('orderAppeals', () => {
  it('puts breached first', () => {
    const rows = [
      appeal({ id: 'ok', respond_state: 'ok' }),
      appeal({ id: 'late', respond_state: 'breached' }),
      appeal({ id: 'watch', respond_state: 'watching' }),
    ];
    expect(orderAppeals(rows).map((r) => r.id)).toEqual(['late', 'watch', 'ok']);
  });

  it('puts the oldest first inside a band', () => {
    const rows = [
      appeal({ id: 'newer', created_at: '2026-02-01T00:00:00Z', respond_state: 'breached' }),
      appeal({ id: 'older', created_at: '2026-01-01T00:00:00Z', respond_state: 'breached' }),
    ];
    expect(orderAppeals(rows)[0]?.id).toBe('older');
  });
});

describe('appealQueueSummary', () => {
  it('says the queue is empty plainly', () => {
    expect(appealQueueSummary([])).toContain('No appeal is waiting');
  });

  it('counts and gives the oldest wait in hours', () => {
    const text = appealQueueSummary([appeal({ age_minutes: 120, respond_state: 'ok' })]);
    expect(text).toContain('1 appeal waiting');
    expect(text).toContain('2 hours');
  });

  it('names how many are past target, and says none when none are', () => {
    expect(appealQueueSummary([appeal()])).toContain('none past target');
    expect(appealQueueSummary([appeal({ respond_state: 'breached' })])).toContain('1 past target');
  });

  it('switches to days when the wait is long, because 71 hours is not a number a reader converts', () => {
    expect(appealQueueSummary([appeal({ age_minutes: 60 * 71 })])).toContain('3 days');
  });
});

describe('breachedAppeals', () => {
  it('counts only breached rows', () => {
    expect(
      breachedAppeals([appeal({ respond_state: 'breached' }), appeal({ respond_state: 'ok' })]),
    ).toBe(1);
  });

  it('is zero for an empty queue', () => {
    expect(breachedAppeals([])).toBe(0);
  });
});

describe('appealOutcomeMessage', () => {
  it('says upheld, then the reason', () => {
    expect(appealOutcomeMessage(true, 'The post was on topic.')).toBe(
      'Your appeal was upheld. The post was on topic.',
    );
  });

  it('says not upheld rather than rejected, which is the sentence a member is owed', () => {
    expect(appealOutcomeMessage(false, 'The guidelines are clear.')).toContain('not upheld');
  });
});

describe('decisionBlocker', () => {
  it('blocks the original decider before it blocks the text', () => {
    expect(decisionBlocker('short', 'mod', appeal({ original_actor: 'mod' }))).toContain(
      'You made',
    );
  });

  it('blocks a short explanation', () => {
    expect(decisionBlocker('no', 'other', appeal())).toContain('twelve');
  });

  it('allows a real decision', () => {
    expect(decisionBlocker('The guidelines are clear about this.', 'other', appeal())).toBeNull();
  });
});

describe('reliability', () => {
  it('never shows a percentage over no decisions', () => {
    const text = reliabilityLabel({
      filed: 3,
      upheld: 0,
      dismissed: 0,
      open: 3,
      upheld_rate: null,
    });
    expect(text).toContain('No decision yet');
    expect(text).not.toContain('0%');
  });

  it('says a person has never reported anything when they have not', () => {
    expect(
      reliabilityLabel({ filed: 0, upheld: 0, dismissed: 0, open: 0, upheld_rate: null }),
    ).toContain('never reported');
  });

  it('gives the rate and the base it was computed over', () => {
    const text = reliabilityLabel({ filed: 6, upheld: 3, dismissed: 3, open: 0, upheld_rate: 0.5 });
    expect(text).toContain('50%');
    expect(text).toContain('6 decided reports');
  });

  it('is not meaningful below the floor, even with a rate', () => {
    expect(
      reliabilityIsMeaningful({ filed: 2, upheld: 1, dismissed: 1, open: 0, upheld_rate: 0.5 }),
    ).toBe(false);
  });

  it('becomes meaningful at the floor', () => {
    expect(
      reliabilityIsMeaningful({
        filed: RELIABILITY_FLOOR,
        upheld: 3,
        dismissed: 2,
        open: 0,
        upheld_rate: 0.6,
      }),
    ).toBe(true);
  });

  it('is not meaningful without a rate however many decisions there are', () => {
    expect(
      reliabilityIsMeaningful({ filed: 9, upheld: 0, dismissed: 0, open: 9, upheld_rate: null }),
    ).toBe(false);
  });
});

describe('signals', () => {
  function signal(over: Partial<PersonSignal> = {}): PersonSignal {
    return {
      signal: 'device',
      value_hash: 'abc',
      shared_with: 1,
      first_seen: '2026-01-01T00:00:00Z',
      last_seen: '2026-02-01T00:00:00Z',
      ...over,
    };
  }

  it('states the count as a fact and names the innocent explanation', () => {
    const text = signalSentence(signal());
    expect(text).toContain('1 other account');
    expect(text).toContain('shared browser');
  });

  it('says plainly when a device is unique to this account', () => {
    expect(signalSentence(signal({ shared_with: 0 }))).toContain('No other account');
  });

  it('uses the plural correctly', () => {
    expect(signalSentence(signal({ shared_with: 3 }))).toContain('3 other accounts have');
  });

  it('describes a payment instrument differently from a device', () => {
    expect(signalSentence(signal({ signal: 'instrument' }))).toContain('payment instrument');
  });

  it('hides a signal nobody else shares, because it is not a signal', () => {
    expect(signalWorthShowing(signal({ shared_with: 0 }))).toBe(false);
    expect(signalWorthShowing(signal({ shared_with: 1 }))).toBe(true);
  });
});

describe('the shift board', () => {
  it('says when a shift is uncovered, which is the failure a roster prevents', () => {
    expect(shiftSentence(shift({ headcount: 0 }))).toContain('uncovered');
  });

  it('gives headcount, workload and lateness in one line', () => {
    const text = shiftSentence(shift({ headcount: 2, open_reports: 3, breached: 1 }));
    expect(text).toBe('2 people · 3 open, 1 past the target');
  });

  it('does not mention lateness when none is late', () => {
    expect(shiftSentence(shift({ breached: 0 }))).not.toContain('past the target');
  });

  it('uses the singular for one person', () => {
    expect(shiftSentence(shift({ headcount: 1 }))).toContain('1 person');
  });

  it('lists uncovered shifts', () => {
    const rows = [shift({ shift_id: 'a', headcount: 0 }), shift({ shift_id: 'b' })];
    expect(uncoveredShifts(rows).map((r) => r.shift_id)).toEqual(['a']);
  });

  it('says a handover is due for a started shift nobody wrote one for', () => {
    expect(handoverDue(shift({ on_date: '2026-01-01' }), new Date('2026-01-02T00:00:00Z'))).toBe(
      true,
    );
  });

  it('does not say a handover is due for a future shift', () => {
    expect(handoverDue(shift({ on_date: '2026-06-01' }), new Date('2026-01-02T00:00:00Z'))).toBe(
      false,
    );
  });

  it('does not say a handover is due once one is written', () => {
    expect(
      handoverDue(
        shift({ on_date: '2026-01-01', handover: 'Two open' }),
        new Date('2026-01-02T00:00:00Z'),
      ),
    ).toBe(false);
  });
});

describe('handoverFor', () => {
  it('prefers the previous shift, because that is the context at a changeover', () => {
    const result = handoverFor(
      shift({ previous_handover: 'From last night', handover: 'For today' }),
    );
    expect(result.note).toBe('From last night');
    expect(result.reason).toContain('shift before');
  });

  it('falls back to this shift when there is no earlier note', () => {
    expect(handoverFor(shift({ handover: 'For today' })).note).toBe('For today');
  });

  it('says there is none rather than showing an empty box', () => {
    const result = handoverFor(shift());
    expect(result.note).toBeNull();
    expect(result.reason).toContain('No handover');
  });

  it('ignores a whitespace-only note', () => {
    expect(handoverFor(shift({ previous_handover: '   ' })).note).toBeNull();
  });
});

describe('orderShifts', () => {
  it('orders by date then by shift', () => {
    const rows = [
      shift({ shift_id: 'n1', on_date: '2026-01-02', shift_name: 'night' }),
      shift({ shift_id: 'm1', on_date: '2026-01-02', shift_name: 'morning' }),
      shift({ shift_id: 'y1', on_date: '2026-01-01', shift_name: 'night' }),
    ];
    expect(orderShifts(rows).map((r) => r.shift_id)).toEqual(['y1', 'm1', 'n1']);
  });
});
