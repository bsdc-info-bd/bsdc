import { describe, expect, it } from 'vitest';
import {
  BULK_REASON_MIN,
  CLI_COMMANDS,
  bulkApplyHint,
  cliAutocomplete,
  parseBulkApply,
  parseBulkPlan,
  parseCli,
  splitMacroLines,
  tokenizeCli,
} from './cli-engine';

describe('admin CLI engine', () => {
  it('tokenizes double-quoted, single-quoted, and escaped arguments safely', () => {
    const res = tokenizeCli('cert revoke BSDC-CT-ABCD1234-1 "Typo in \\"name\\"" --yes');
    expect(res.error).toBeUndefined();
    expect(res.tokens).toEqual(['cert', 'revoke', 'BSDC-CT-ABCD1234-1', 'Typo in "name"', '--yes']);
  });

  it('rejects unclosed quotes cleanly', () => {
    const res = parseCli('audit --action "certificate');
    expect(res.error).toContain('Unclosed');
  });

  it('parses flags (--key val, --key=val, boolean --yes) and positional args', () => {
    const res = parseCli('audit --action certificate --limit=40 --yes');
    expect(res.positional).toEqual(['audit']);
    expect(res.flags).toEqual({ action: 'certificate', limit: '40', yes: true });
  });

  it('provides autocomplete suggestions and splits multi-line macros', () => {
    expect(CLI_COMMANDS.length).toBeGreaterThan(15);
    expect(cliAutocomplete('cert').map((c) => c.command)).toContain('cert revoke');
    expect(splitMacroLines('# header\ntelemetry\n\naudit --limit 10; portals')).toEqual([
      'telemetry',
      'audit --limit 10',
      'portals',
    ]);
  });
});

describe('bulk plan parsing', () => {
  it('turns a well-formed line into the arguments the RPC takes', () => {
    const parsed = parseCli(
      'bulk plan shops approve --reason "Reviewed the three complete applications" --status submitted --limit 10',
    );
    const { request, error } = parseBulkPlan(parsed);
    expect(error).toBeUndefined();
    expect(request?.subject).toBe('shops');
    expect(request?.action).toBe('approve');
    expect(request?.reason).toBe('Reviewed the three complete applications');
    expect(request?.selector).toEqual({ status: 'submitted', limit: 10 });
  });

  it('refuses an action the subject does not have', () => {
    const { error } = parseBulkPlan(parseCli('bulk plan shops delete --reason "a long enough reason"'));
    expect(error).toContain('Allowed');
    // The message names what is allowed, so the operator does not have to guess.
    expect(error).toContain('approve');
  });

  it('has no bulk delete at all', () => {
    for (const subject of ['shops', 'campaigns', 'reports', 'posts']) {
      const { error } = parseBulkPlan(parseCli(`bulk plan ${subject} delete --reason "a long enough reason"`));
      expect(error).toBeDefined();
    }
  });

  it('refuses an unknown subject and lists the real ones', () => {
    const { error } = parseBulkPlan(parseCli('bulk plan everything approve --reason "a long enough reason"'));
    expect(error).toContain('Unknown subject');
    expect(error).toContain('shops');
  });

  it('enforces the same twelve-character reason floor the database does', () => {
    expect(BULK_REASON_MIN).toBe(12);
    const { error } = parseBulkPlan(parseCli('bulk plan shops approve --reason "too short"'));
    expect(error).toContain('12 characters');
  });

  it('refuses a negative older-than rather than sending it', () => {
    const { error } = parseBulkPlan(
      parseCli('bulk plan shops approve --reason "a long enough reason" --older-than -3'),
    );
    expect(error).toContain('negative');
  });

  it('refuses a non-numeric limit', () => {
    const { error } = parseBulkPlan(
      parseCli('bulk plan shops approve --reason "a long enough reason" --limit many'),
    );
    expect(error).toContain('positive whole number');
  });

  it('returns an error rather than a request when the command is not bulk', () => {
    expect(parseBulkPlan(parseCli('telemetry')).error).toBeDefined();
  });

  it('prints the apply command so the operator copies one line', () => {
    expect(bulkApplyHint('abc-123')).toBe('bulk apply abc-123');
  });

  it('refuses an apply with no id', () => {
    expect(parseBulkApply(parseCli('bulk apply')).error).toContain('Usage');
  });

  it('accepts an apply with an id', () => {
    expect(parseBulkApply(parseCli('bulk apply 7f3a-b2')).planId).toBe('7f3a-b2');
  });

  it('is offered by autocomplete, because a command nobody can find is not shipped', () => {
    const candidates = cliAutocomplete('bulk');
    expect(candidates.map((spec) => spec.command)).toContain('bulk plan');
    expect(candidates.map((spec) => spec.command)).toContain('bulk apply');
  });

  it('marks apply destructive and plan not, because one of them writes', () => {
    const plan = CLI_COMMANDS.find((spec) => spec.command === 'bulk plan');
    const apply = CLI_COMMANDS.find((spec) => spec.command === 'bulk apply');
    expect(plan?.destructive).toBeUndefined();
    expect(apply?.destructive).toBe(true);
  });
});
