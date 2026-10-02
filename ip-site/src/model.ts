import { cidrSize, normaliseCidr, parseCidr, type IpRule, type IpRuleKind } from '@kit';

/** `ip_rules` as the database returns it. */
export type RuleRow = {
  readonly id: string;
  readonly range: string;
  readonly kind: IpRuleKind;
  readonly reason: string;
  readonly expires_at: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
};

export type ActivityRow = {
  readonly ip: string;
  readonly hits: number;
  readonly accounts: number;
  readonly last_seen: string;
  readonly decision: string | null;
};

export function toRule(row: RuleRow): IpRule {
  return {
    id: row.id,
    cidr: row.range,
    kind: row.kind,
    reason: row.reason,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/**
 * What a proposed rule would actually cover. A /8 is 16 million addresses,
 * and an operator reaching for one at two in the morning should be told so
 * before saving, not afterwards.
 */
export type BlastRadius = {
  readonly valid: boolean;
  readonly canonical: string;
  readonly addresses: number;
  readonly warning: string;
};

export function blastRadius(input: string): BlastRadius {
  const parsed = parseCidr(input);
  if (!parsed) {
    return {
      valid: false,
      canonical: '',
      addresses: 0,
      warning: 'That is not an IPv4 address or range.',
    };
  }
  const canonical = normaliseCidr(input) ?? '';
  const addresses = cidrSize(input);
  let warning = '';
  if (parsed.prefix < 16) {
    warning = `This covers ${addresses.toLocaleString('en-GB')} addresses. Prefer a narrower range.`;
  } else if (canonical !== `${input.trim()}` && !input.includes('/')) {
    warning = `A bare address is treated as ${canonical}.`;
  } else if (canonical !== input.trim()) {
    warning = `This range will be stored as ${canonical}.`;
  }
  return { valid: true, canonical, addresses, warning };
}

/** Rules that will disappear on their own, soonest first. */
export function expiringSoon(rules: readonly IpRule[], now = new Date()): readonly IpRule[] {
  return rules
    .filter((rule) => rule.expiresAt !== null && Date.parse(rule.expiresAt) > now.getTime())
    .sort((a, b) => Date.parse(a.expiresAt ?? '') - Date.parse(b.expiresAt ?? ''));
}

/** How a rule's lifetime should read in the table. */
export function lifetime(rule: IpRule, now = new Date()): string {
  if (rule.expiresAt === null) return 'until removed';
  const remaining = Date.parse(rule.expiresAt) - now.getTime();
  if (remaining <= 0) return 'expired';
  const hours = Math.ceil(remaining / 3600000);
  return hours < 48 ? `${hours}h left` : `${Math.ceil(hours / 24)}d left`;
}
