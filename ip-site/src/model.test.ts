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
import { blastRadius, expiringSoon, lifetime, toRule } from './model';

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
