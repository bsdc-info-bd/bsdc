import { describe, expect, it } from 'vitest';
import {
  cidrSize,
  decideIp,
  ipInCidr,
  normaliseCidr,
  parseCidr,
  parseIpv4,
  type IpRule,
} from '@kit';
import {
  blastRadius,
  expiringSoon,
  lifetime,
  ruleHealth,
  ruleProblems,
  saveSummary,
  summariseDryRun,
  toRule,
  verdictOf,
  windowNote,
  type RuleRowV2,
  type SimulatedStep,
} from './model';

const rule = (over: Partial<IpRule> = {}): IpRule => ({
  id: 'r1',
  cidr: '203.0.113.0/24',
  kind: 'block',
  reason: 'scraping',
  expiresAt: null,
  createdAt: '2026-03-01T00:00:00Z',
  ...over,
});

describe('parsing addresses', () => {
  it('reads a dotted quad and refuses anything else', () => {
    expect(parseIpv4('0.0.0.0')).toBe(0);
    expect(parseIpv4('255.255.255.255')).toBe(4294967295);
    expect(parseIpv4('203.0.113.7')).toBe(3405803783);
    expect(parseIpv4('203.0.113')).toBeNull();
    expect(parseIpv4('203.0.113.256')).toBeNull();
    expect(parseIpv4('203.0.113.a')).toBeNull();
  });

  it('treats a bare address as a single-address range', () => {
    expect(parseCidr('203.0.113.7')).toEqual({ base: 3405803783, prefix: 32 });
    expect(parseCidr('203.0.113.0/24')?.prefix).toBe(24);
    expect(parseCidr('203.0.113.0/33')).toBeNull();
  });

  it('canonicalises a range to its network address', () => {
    expect(normaliseCidr('203.0.113.7/24')).toBe('203.0.113.0/24');
    expect(normaliseCidr('10.1.2.3')).toBe('10.1.2.3/32');
    expect(normaliseCidr('nonsense')).toBeNull();
  });

  it('counts what a range covers', () => {
    expect(cidrSize('203.0.113.0/24')).toBe(256);
    expect(cidrSize('10.0.0.0/8')).toBe(16777216);
    expect(cidrSize('0.0.0.0/0')).toBe(4294967296);
  });

  it('matches membership including the edges of the range', () => {
    expect(ipInCidr('203.0.113.0', '203.0.113.0/24')).toBe(true);
    expect(ipInCidr('203.0.113.255', '203.0.113.0/24')).toBe(true);
    expect(ipInCidr('203.0.114.0', '203.0.113.0/24')).toBe(false);
    expect(ipInCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
    expect(ipInCidr('bad', '0.0.0.0/0')).toBe(false);
  });
});

describe('deciding about an address', () => {
  const now = new Date('2026-03-10T00:00:00Z');

  it('allows anything when no rule matches and allowlist mode is off', () => {
    const decision = decideIp('198.51.100.5', [rule()], { allowlistOnly: false, now });
    expect(decision).toMatchObject({ kind: 'none', allowed: true });
  });

  it('refuses anything unmatched once allowlist mode is on', () => {
    const decision = decideIp('198.51.100.5', [rule()], { allowlistOnly: true, now });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('allowlist-only');
  });

  it('lets the most specific range win', () => {
    const rules = [
      rule({ id: 'wide', cidr: '203.0.0.0/8', kind: 'block' }),
      rule({ id: 'narrow', cidr: '203.0.113.7/32', kind: 'allow', reason: 'office' }),
    ];
    const decision = decideIp('203.0.113.7', rules, { allowlistOnly: false, now });
    expect(decision.ruleId).toBe('narrow');
    expect(decision.allowed).toBe(true);
  });

  it('lets an allow beat a block at the same specificity, whatever the order', () => {
    const rules = [
      rule({ id: 'block', cidr: '203.0.113.0/24', kind: 'block' }),
      rule({ id: 'allow', cidr: '203.0.113.0/24', kind: 'allow' }),
    ];
    expect(decideIp('203.0.113.9', rules, { allowlistOnly: false, now }).ruleId).toBe('allow');
    expect(
      decideIp('203.0.113.9', [...rules].reverse(), { allowlistOnly: false, now }).ruleId,
    ).toBe('allow');
  });

  it('ignores a rule that has already expired', () => {
    const expired = rule({ expiresAt: '2026-03-09T00:00:00Z' });
    expect(decideIp('203.0.113.9', [expired], { allowlistOnly: false, now }).kind).toBe('none');
  });

  it('treats a watch rule as allowed but keeps its reason', () => {
    const watch = rule({ kind: 'watch', reason: 'unusual volume' });
    const decision = decideIp('203.0.113.9', [watch], { allowlistOnly: false, now });
    expect(decision.allowed).toBe(true);
    expect(decision.kind).toBe('watch');
    expect(decision.reason).toBe('unusual volume');
  });
});

describe('what a rule would cover', () => {
  it('warns before a very wide range is saved', () => {
    const radius = blastRadius('10.0.0.0/8');
    expect(radius.valid).toBe(true);
    expect(radius.addresses).toBe(16777216);
    expect(radius.warning).toContain('narrower');
  });

  it('explains that a bare address becomes a /32', () => {
    expect(blastRadius('203.0.113.7').warning).toContain('203.0.113.7/32');
  });

  it('refuses something that is not an address at all', () => {
    expect(blastRadius('not-an-ip').valid).toBe(false);
  });
});

describe('rule lifetimes', () => {
  const now = new Date('2026-03-10T00:00:00Z');

  it('describes a permanent rule as such', () => {
    expect(lifetime(rule(), now)).toBe('until removed');
  });

  it('counts down in hours, then in days', () => {
    expect(lifetime(rule({ expiresAt: '2026-03-10T06:00:00Z' }), now)).toBe('6h left');
    expect(lifetime(rule({ expiresAt: '2026-03-14T00:00:00Z' }), now)).toBe('4d left');
    expect(lifetime(rule({ expiresAt: '2026-03-09T00:00:00Z' }), now)).toBe('expired');
  });

  it('lists expiring rules soonest first and leaves permanent ones out', () => {
    const rules = [
      rule({ id: 'later', expiresAt: '2026-03-20T00:00:00Z' }),
      rule({ id: 'permanent' }),
      rule({ id: 'sooner', expiresAt: '2026-03-11T00:00:00Z' }),
    ];
    expect(expiringSoon(rules, now).map((item) => item.id)).toEqual(['sooner', 'later']);
  });
});

describe('reading rule rows', () => {
  it('renames the range column without losing anything', () => {
    expect(
      toRule({
        id: 'r',
        range: '10.0.0.0/8',
        kind: 'allow',
        reason: 'office',
        expires_at: null,
        created_by: 'uid',
        created_at: '2026-03-01T00:00:00Z',
      }),
    ).toEqual({
      id: 'r',
      cidr: '10.0.0.0/8',
      kind: 'allow',
      reason: 'office',
      expiresAt: null,
      createdAt: '2026-03-01T00:00:00Z',
    });
  });
});

describe('a rule that is still earning its place (§12.3)', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const rule = (over: Partial<RuleRowV2>): RuleRowV2 => ({
    id: 'r1',
    range: '203.0.113.0/24',
    kind: 'block',
    reason: 'Credential stuffing seen from this range',
    expires_at: null,
    created_by: 'admin-1',
    created_at: '2026-10-01T00:00:00Z',
    label: 'Stuffing range',
    review_at: '2026-12-01T00:00:00Z',
    shadow: false,
    match_count: 12,
    last_matched_at: '2026-11-20T00:00:00Z',
    disabled_at: null,
    disabled_reason: '',
    ...over,
  });

  it('flags a rule past its review date, with how far past', () => {
    const health = ruleHealth(rule({ review_at: '2026-11-20T12:00:00Z' }), now);
    expect(health.reviewOverdue).toBe(true);
    expect(health.daysOverdue).toBe(3);
    expect(health.summary).toContain('3 days');
  });

  it('does not flag a rule whose review is still ahead', () => {
    expect(ruleHealth(rule({}), now).reviewOverdue).toBe(false);
  });

  it('reports what a shadow rule would have caught', () => {
    const health = ruleHealth(rule({ shadow: true, match_count: 9 }), now);
    expect(health.summary).toContain('In shadow mode');
    expect(health.summary).toContain('9 requests');
    expect(health.shadow).toBe(true);
  });

  it('says a shadow rule has not matched anything yet', () => {
    expect(ruleHealth(rule({ shadow: true, match_count: 0 }), now).summary).toContain(
      'not matched anything',
    );
  });

  it('questions an armed rule that has never matched', () => {
    const health = ruleHealth(rule({ match_count: 0 }), now);
    expect(health.idle).toBe(true);
    expect(health.summary).toContain('never matched');
  });

  it('treats a null count as never matched rather than as a fault', () => {
    expect(ruleHealth(rule({ match_count: null as unknown as number }), now).neverMatched).toBe(true);
  });

});

describe('what the simulator decided (§12.3)', () => {
  const step = (over: Partial<SimulatedStep>): SimulatedStep => ({
    decision: null,
    matched: null,
    matched_kind: null,
    matched_label: null,
    reason: '',
    shadow: false,
    step: 1,
    skipped_why: 'address outside the range',
    ...over,
  });

  it('names the rule that decided, with its label', () => {
    const v = verdictOf([
      step({
        decision: 'block',
        matched: '203.0.113.42/32',
        matched_kind: 'block',
        matched_label: 'Card tester',
        reason: 'Repeated card testing from this host',
      }),
      step({ skipped_why: 'a more specific rule already decided' }),
    ]);
    expect(v.decision).toBe('block');
    expect(v.sentence).toContain('203.0.113.42/32');
    expect(v.sentence).toContain('Card tester');
  });

  it('says the default applied when nothing matched', () => {
    const v = verdictOf([
      step({ decision: 'allow', matched: null, skipped_why: 'default: no rule matched', reason: 'No rule matches.' }),
    ]);
    expect(v.sentence).toContain('default');
  });

  it('names the rule rather than the default when a rule decided, and still reports the shadow', () => {
    const v = verdictOf([
      step({ decision: 'allow', matched: '203.0.113.0/16', matched_label: 'Partner range' }),
      step({ decision: 'would block', matched: '198.51.100.0/24', shadow: true }),
    ]);
    expect(v.shadowDiffers).toBe(true);
    expect(v.sentence).toContain('Allowed by 203.0.113.0/16');
    expect(v.sentence).toContain('Partner range');
  });

  it('does not claim a shadow difference when the shadow agrees', () => {
    const v = verdictOf([step({ decision: 'block' }), step({ decision: 'would block' })]);
    expect(v.shadowDiffers).toBe(false);
  });

  it('says so when a shadow rule is the only thing that would decide', () => {
    const v = verdictOf([step({ decision: 'would block', shadow: true })]);
    expect(v.sentence).toContain('shadow rule');
  });

  it('admits a simulator with no verdict is a fault, not an answer', () => {
    expect(verdictOf([]).sentence).toContain('fault');
  });
});

describe('the dry run (§12.3)', () => {
  it('counts affected requests and lists what they were doing', () => {
    const summary = summariseDryRun([
      { ip: '203.0.113.42', hits: 9, last_seen: '', actions: ['checkout.callback', 'auth.login'], would_change: 4 },
      { ip: '203.0.113.43', hits: 2, last_seen: '', actions: ['feed.read'], would_change: 1 },
    ]);
    expect(summary.addresses).toBe(2);
    expect(summary.affected).toBe(5);
    expect(summary.requests).toBe(11);
    expect(summary.actions).toEqual(['auth.login', 'checkout.callback', 'feed.read']);
    expect(summary.sentence).toContain('5 requests');
  });

  it('says nothing needs the rule when it changes no outcome', () => {
    const summary = summariseDryRun([]);
    expect(summary.affected).toBe(0);
    expect(summary.sentence).toContain('Nothing needs it');
  });

  it('says a quiet window is evidence, not proof', () => {
    const note = windowNote(7, []);
    expect(note).toContain('evidence, not proof');
    expect(note).toContain('quiet window');
  });

  it('says how far the evidence reaches when there is some', () => {
    const note = windowNote(7, [
      { ip: '203.0.113.42', hits: 1, last_seen: '', actions: [], would_change: 1 },
    ]);
    expect(note).toContain('7 days');
    expect(note).toContain('never recorded');
  });
});

describe('what a new rule needs (§12.3)', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const input = (over: Partial<Parameters<typeof ruleProblems>[0]> = {}) => ({
    cidr: '203.0.113.0/24',
    reason: 'Credential stuffing seen from this range',
    label: 'Stuffing range',
    kind: 'block' as const,
    reviewAt: '2026-12-23T12:00',
    ...over,
  });

  it('accepts a complete rule', () => {
    expect(ruleProblems(input(), now)).toEqual([]);
  });

  it('needs a label, so a list of rules can be read', () => {
    expect(ruleProblems(input({ label: '' }), now)[0]).toContain('label');
  });

  it('needs a reason long enough to explain the block', () => {
    expect(ruleProblems(input({ reason: 'bad' }), now)[0]).toContain('unexplained block');
  });

  it('needs a review date for a block', () => {
    expect(ruleProblems(input({ reviewAt: '' }), now)[0]).toContain('review date');
  });

  it('refuses a review date in the past', () => {
    expect(ruleProblems(input({ reviewAt: '2026-01-01T00:00' }), now)[0]).toContain('not a review');
  });

  it('does not demand a review date for an allow rule', () => {
    expect(ruleProblems(input({ kind: 'allow', reviewAt: '' }), now)).toEqual([]);
  });

  it('says what saving will do, including the shadow promise', () => {
    const summary = saveSummary(true, '', null);
    expect(summary).toContain('shadow mode');
    expect(summary).toContain('blocks nobody');
    expect(summary).toContain('thirty days');
  });

  it('carries the evidence into the promise when there is some', () => {
    const dry = summariseDryRun([
      { ip: '203.0.113.42', hits: 5, last_seen: '', actions: [], would_change: 5 },
    ]);
    expect(saveSummary(false, '2026-12-01T00:00', dry)).toContain('5 request');
  });
});
