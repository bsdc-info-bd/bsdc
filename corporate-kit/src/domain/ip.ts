/**
 * IPv4 rule matching, mirroring `public.ip_decision()`. The browser evaluates
 * a candidate address against the rule list so an operator can see what a
 * rule will do before saving it; the database remains the authority.
 */

export type IpRuleKind = 'allow' | 'block' | 'watch';

export type IpRule = {
  readonly id: string;
  readonly cidr: string;
  readonly kind: IpRuleKind;
  readonly reason: string;
  readonly expiresAt: string | null;
  readonly createdAt: string;
};

export type IpDecision = {
  readonly kind: IpRuleKind | 'none';
  readonly allowed: boolean;
  readonly ruleId: string | null;
  readonly reason: string;
};

/** Parses dotted-quad IPv4 into a 32-bit unsigned number, or null. */
export function parseIpv4(text: string): number | null {
  const parts = text.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

export type ParsedCidr = { readonly base: number; readonly prefix: number };

/** Parses `a.b.c.d` or `a.b.c.d/len`. A bare address is treated as /32. */
export function parseCidr(text: string): ParsedCidr | null {
  const [addr, len] = text.trim().split('/');
  if (addr === undefined) return null;
  const base = parseIpv4(addr);
  if (base === null) return null;
  if (len === undefined) return { base, prefix: 32 };
  if (!/^\d{1,2}$/.test(len)) return null;
  const prefix = Number(len);
  if (prefix > 32) return null;
  return { base, prefix };
}

function maskFor(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** True when `ip` falls inside `cidr`. Unparseable input matches nothing. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const addr = parseIpv4(ip);
  const net = parseCidr(cidr);
  if (addr === null || net === null) return false;
  const mask = maskFor(net.prefix);
  return (addr & mask) >>> 0 === (net.base & mask) >>> 0;
}

function isExpired(rule: IpRule, now: Date): boolean {
  return rule.expiresAt !== null && Date.parse(rule.expiresAt) <= now.getTime();
}

/**
 * The most specific unexpired matching rule wins. At equal specificity an
 * `allow` beats a `block`, so a deliberate exception inside a blocked range
 * does not depend on insertion order. With no rule at all the answer depends
 * on whether the network is running allowlist-only.
 */
export function decideIp(
  ip: string,
  rules: readonly IpRule[],
  options: { readonly allowlistOnly: boolean; readonly now?: Date },
): IpDecision {
  const now = options.now ?? new Date();
  let best: IpRule | null = null;
  let bestPrefix = -1;
  for (const rule of rules) {
    if (isExpired(rule, now)) continue;
    if (!ipInCidr(ip, rule.cidr)) continue;
    const parsed = parseCidr(rule.cidr);
    if (!parsed) continue;
    if (parsed.prefix > bestPrefix) {
      best = rule;
      bestPrefix = parsed.prefix;
      continue;
    }
    if (parsed.prefix === bestPrefix && rule.kind === 'allow' && best?.kind !== 'allow') {
      best = rule;
    }
  }
  if (!best) {
    return options.allowlistOnly
      ? {
          kind: 'none',
          allowed: false,
          ruleId: null,
          reason: 'allowlist-only mode, no matching rule',
        }
      : { kind: 'none', allowed: true, ruleId: null, reason: 'no matching rule' };
  }
  return {
    kind: best.kind,
    allowed: best.kind !== 'block',
    ruleId: best.id,
    reason: best.reason,
  };
}

/** Number of addresses a prefix covers, for the operator-facing blast radius. */
export function cidrSize(cidr: string): number {
  const parsed = parseCidr(cidr);
  return parsed === null ? 0 : 2 ** (32 - parsed.prefix);
}

/** Canonical form: the network address of the range, then the prefix. */
export function normaliseCidr(cidr: string): string | null {
  const parsed = parseCidr(cidr);
  if (!parsed) return null;
  const base = (parsed.base & maskFor(parsed.prefix)) >>> 0;
  const octets = [base >>> 24, (base >>> 16) & 255, (base >>> 8) & 255, base & 255];
  return `${octets.join('.')}/${parsed.prefix}`;
}
