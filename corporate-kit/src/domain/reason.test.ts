import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REASON_POLICY,
  confirmationPhraseFor,
  isUsableReason,
  matchesConfirmation,
  reasonMessage,
  reasonProblems,
  reasonQuality,
} from './reason';

const GOOD = 'Vendor uploaded a forged trade licence; verified against the registry.';

describe('reasonProblems', () => {
  it('rejects an empty or whitespace-only reason', () => {
    expect(reasonProblems('')).toEqual([{ kind: 'empty' }]);
    expect(reasonProblems('   \n\t ')).toEqual([{ kind: 'empty' }]);
    expect(reasonProblems(null)).toEqual([{ kind: 'empty' }]);
  });

  it('accepts a reason that names something specific', () => {
    expect(reasonProblems(GOOD)).toEqual([]);
  });

  it('rejects a reason too short to identify anything', () => {
    const problems = reasonProblems('too short');
    expect(problems.some((p) => p.kind === 'too-short')).toBe(true);
  });

  it('names the minimum so the form can say what to do', () => {
    const [first] = reasonProblems('nope');
    expect(first).toEqual({ kind: 'too-short', minimum: DEFAULT_REASON_POLICY.minimum });
  });

  it('rejects a placeholder that is only the word "test"', () => {
    // Padding a placeholder with spaces must not defeat the rule.
    expect(reasonProblems('  test  ')).toEqual([{ kind: 'placeholder', phrase: 'test' }]);
    expect(reasonProblems('test.')).toEqual([{ kind: 'placeholder', phrase: 'test' }]);
    expect(reasonProblems('N/A')).toEqual([{ kind: 'placeholder', phrase: 'n/a' }]);
  });

  it('accepts a real sentence that happens to contain a banned word', () => {
    // The rule is about what the reason *is*, not what it contains.
    expect(reasonProblems('Test account created for the new vendor onboarding')).toEqual([]);
    expect(reasonProblems('None of the documents matched, so the listing was removed')).toEqual(
      [],
    );
  });

  it('rejects a reason that only restates the action', () => {
    expect(reasonProblems('done')).toEqual([{ kind: 'no-substance' }]);
    expect(reasonProblems('ok fixed')).toEqual([{ kind: 'no-substance' }]);
    expect(reasonProblems('handled.')).toEqual([{ kind: 'no-substance' }]);
  });

  it('accepts a short reason that still names something', () => {
    expect(reasonProblems('Duplicate of #4812')).toEqual([]);
  });

  it('rejects an essay past the maximum', () => {
    const problems = reasonProblems('x'.repeat(1_001));
    expect(problems.some((p) => p.kind === 'too-long')).toBe(true);
  });

  it('honours a policy that asks for more', () => {
    expect(reasonProblems('Short but real', { minimum: 40 })).toContainEqual({
      kind: 'too-short',
      minimum: 40,
    });
  });
});

describe('isUsableReason', () => {
  it('agrees with the problem list', () => {
    expect(isUsableReason(GOOD)).toBe(true);
    expect(isUsableReason('test')).toBe(false);
    expect(isUsableReason('')).toBe(false);
  });
});

describe('reasonMessage', () => {
  it('says what is missing, in the operator\u2019s terms', () => {
    expect(reasonMessage('')).toContain('A reason is required');
    expect(reasonMessage('short')).toContain('at least 12 characters');
    expect(reasonMessage('test')).toContain('is not a reason');
    expect(reasonMessage('done')).toContain('Say why it was needed');
  });

  it('returns null for a usable reason, so a form renders no error', () => {
    expect(reasonMessage(GOOD)).toBeNull();
  });
});

describe('reasonQuality', () => {
  it('reports the four states a field can be in', () => {
    expect(reasonQuality('')).toBe('empty');
    expect(reasonQuality('test')).toBe('thin');
    expect(reasonQuality('Vendor licence could not be verified')).toBe('adequate');
    expect(reasonQuality(GOOD)).toBe('good');
  });

  it('counts a concrete detail as a sign of a good reason', () => {
    // Eight words and a number or a name: something a reader can follow up on.
    expect(reasonQuality('Refunded order 99120 after the courier confirmed the parcel was lost')).toBe(
      'good',
    );
  });

  it('does not reward length alone', () => {
    // Long and vague is still not good.
    expect(reasonQuality('the thing was not right and so we decided to do this action')).toBe(
      'adequate',
    );
  });
});

describe('matchesConfirmation', () => {
  it('accepts the exact name, in any case and with stray spaces', () => {
    expect(matchesConfirmation('Undal', 'Undal')).toBe(true);
    expect(matchesConfirmation('  undal  ', 'Undal')).toBe(true);
  });

  it('rejects a partial or mistyped name', () => {
    // Slowing the hands down is the entire purpose; a near-miss must fail.
    expect(matchesConfirmation('unda', 'Undal')).toBe(false);
    expect(matchesConfirmation('undall', 'Undal')).toBe(false);
    expect(matchesConfirmation('', 'Undal')).toBe(false);
  });

  it('rejects everything when there is nothing to confirm against', () => {
    expect(matchesConfirmation('', '')).toBe(false);
    expect(matchesConfirmation('anything', '   ')).toBe(false);
  });
});

describe('confirmationPhraseFor', () => {
  it('uses the record name', () => {
    expect(confirmationPhraseFor('  Undal  General  Store ')).toBe('Undal General Store');
  });

  it('falls back to a fixed word when the record has no name', () => {
    // Otherwise a stray Enter on an empty field would delete the record.
    expect(confirmationPhraseFor('')).toBe('DELETE');
    expect(confirmationPhraseFor('   ')).toBe('DELETE');
  });
});
