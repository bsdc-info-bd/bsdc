import { describe, expect, it } from 'vitest';
import {
  breachedCount,
  budgetUsed,
  isOverdue,
  minutesLabel,
  orderByLatency,
  queueSummary,
  remainingLabel,
  slaTone,
  worstState,
  type SlaRow,
} from './sla';

function row(over: Partial<SlaRow> = {}): SlaRow {
  return {
    severity: 'normal',
    age_minutes: 60,
    respond_within: 240,
    resolve_within: 1440,
    respond_state: 'ok',
    resolve_state: 'ok',
    ...over,
  };
}

describe('worstState', () => {
  it('returns the respond state when it is worse', () => {
    expect(worstState(row({ respond_state: 'breached', resolve_state: 'ok' }))).toBe('breached');
  });

  it('returns the resolve state when that is worse', () => {
    expect(worstState(row({ respond_state: 'ok', resolve_state: 'breached' }))).toBe('breached');
  });

  it('prefers watching over ok', () => {
    expect(worstState(row({ respond_state: 'watching', resolve_state: 'ok' }))).toBe('watching');
  });

  it('treats an unknown state as ok rather than as an emergency', () => {
    expect(worstState(row({ respond_state: 'something-new', resolve_state: 'ok' }))).toBe('ok');
  });

  it('reports met rather than ok when a closed row says so', () => {
    expect(worstState(row({ respond_state: 'met', resolve_state: 'met' }))).toBe('met');
  });
});

describe('minutesLabel', () => {
  it('says under a minute rather than zero', () => {
    expect(minutesLabel(0)).toBe('under a minute');
  });

  it('counts minutes under an hour', () => {
    expect(minutesLabel(45)).toBe('45 min');
  });

  it('splits hours and minutes', () => {
    expect(minutesLabel(90)).toBe('1 h 30 min');
  });

  it('drops a zero remainder rather than printing 2 h 0 min', () => {
    expect(minutesLabel(120)).toBe('2 h');
  });

  it('splits days and hours', () => {
    expect(minutesLabel(60 * 26)).toBe('1 d 2 h');
  });

  it('drops a zero hour remainder', () => {
    expect(minutesLabel(60 * 48)).toBe('2 d');
  });

  it('never prints a negative duration', () => {
    expect(minutesLabel(-5)).toBe('under a minute');
  });
});

describe('remainingLabel', () => {
  it('says how much is left while the clock is running', () => {
    expect(remainingLabel(row({ age_minutes: 60, respond_within: 240 }))).toBe('3 h left');
  });

  it('says due now at the boundary', () => {
    expect(remainingLabel(row({ age_minutes: 240, respond_within: 240 }))).toBe('due now');
  });

  it('says how far past it is, because overdue without a magnitude stops meaning anything', () => {
    expect(remainingLabel(row({ age_minutes: 300, respond_within: 240 }))).toBe('1 h past target');
  });
});

describe('budgetUsed', () => {
  it('is the fraction of the respond budget spent', () => {
    expect(budgetUsed(row({ age_minutes: 120, respond_within: 240 }))).toBe(0.5);
  });

  it('goes past one when late, which is what makes a progress bar overflow visibly', () => {
    expect(budgetUsed(row({ age_minutes: 480, respond_within: 240 }))).toBe(2);
  });

  it('returns zero rather than dividing by a zero budget', () => {
    expect(budgetUsed(row({ respond_within: 0 }))).toBe(0);
  });
});

describe('slaTone', () => {
  it('is bad when breached', () => {
    expect(slaTone('breached')).toBe('bad');
  });

  it('is a warning when watching', () => {
    expect(slaTone('watching')).toBe('warn');
  });

  it('is neutral for met, because a closed case is not an achievement', () => {
    expect(slaTone('met')).toBe('neutral');
  });
});

describe('orderByLatency', () => {
  it('puts a breached row above a watching one', () => {
    const ordered = orderByLatency([
      row({ age_minutes: 10, respond_state: 'watching' }),
      row({ age_minutes: 5, respond_state: 'breached' }),
    ]);
    expect(ordered.map((r) => r.respond_state)).toEqual(['breached', 'watching']);
  });

  it('then orders by age, oldest first', () => {
    const ordered = orderByLatency([
      row({ age_minutes: 10 }),
      row({ age_minutes: 90 }),
    ]);
    expect(ordered.map((r) => r.age_minutes)).toEqual([90, 10]);
  });

  it('does not mutate the input', () => {
    const input = [row({ age_minutes: 1 }), row({ age_minutes: 2 })];
    const copy = [...input];
    orderByLatency(input);
    expect(input).toEqual(copy);
  });
});

describe('breachedCount', () => {
  it('counts only rows past their respond target', () => {
    expect(
      breachedCount([
        row({ respond_state: 'breached' }),
        row({ respond_state: 'watching' }),
        row({ respond_state: 'ok' }),
      ]),
    ).toBe(1);
  });

  it('is zero for an empty queue', () => {
    expect(breachedCount([])).toBe(0);
  });
});

describe('queueSummary', () => {
  it('says nothing is waiting when there is nothing', () => {
    expect(queueSummary([])).toBe('Nothing is waiting.');
  });

  it('says so when the queue is healthy, rather than leaving a blank strip', () => {
    expect(queueSummary([row(), row()])).toBe('2 waiting, none past its target.');
  });

  it('counts the late ones', () => {
    expect(queueSummary([row({ respond_state: 'breached' }), row()])).toBe(
      '2 waiting, 1 past its target.',
    );
  });

  it('uses the plural for more than one', () => {
    expect(
      queueSummary([row({ respond_state: 'breached' }), row({ respond_state: 'breached' })]),
    ).toBe('2 waiting, 2 past their target.');
  });
});

describe('isOverdue', () => {
  it('is true only when the worst clock has breached', () => {
    expect(isOverdue(row({ resolve_state: 'breached' }))).toBe(true);
    expect(isOverdue(row({ respond_state: 'watching' }))).toBe(false);
  });
});
