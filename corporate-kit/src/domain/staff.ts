/**
 * Staff identity-card codes. The check digit is computed the same way here
 * and in `bsdc.card_check_digit()`, so a mistyped code is rejected by the
 * verification form before the database is asked about it.
 */

/**
 * The same arithmetic as `bsdc.card_check_digit()`: digits count as
 * themselves, letters as their position after nine, alternating weights of
 * one and three, modulo ten. Mistyping one character almost always changes
 * the result, which is the whole point.
 */
export function cardCheckDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i).toUpperCase();
    const value = /[0-9]/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55;
    const weight = i % 2 === 0 ? 1 : 3;
    sum += value * weight;
  }
  return String(((sum % 10) + 10) % 10);
}

export const CARD_PATTERN = /^BSDC-ID-[0-9A-Z]{8}-[0-9]$/;

/**
 * Upper-cases, strips spacing and repairs the two characters people get
 * wrong by hand. Codes are generated without O or I for exactly this
 * reason, so an O can only ever have been a four.
 */
export function normaliseCardCode(code: string): string {
  const compact = code
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[\u2013\u2014]/g, '-');
  if (!/^BSDC-ID-.{8}-.$/.test(compact)) return compact;
  const body = compact.slice(8, 16).replace(/O/g, '4').replace(/I/g, '8');
  return `BSDC-ID-${body}-${compact.slice(17)}`;
}

/** True when the code is well formed and its check digit agrees with its body. */
export function isValidCardCode(code: string): boolean {
  const normalised = normaliseCardCode(code);
  if (!CARD_PATTERN.test(normalised)) return false;
  return cardCheckDigit(normalised.slice(8, 16)) === normalised.slice(17);
}

/** Groups a code for display on the card face itself. */
export function formatCardCode(code: string): string {
  const normalised = normaliseCardCode(code);
  if (!CARD_PATTERN.test(normalised)) return normalised;
  return `${normalised.slice(0, 7)} ${normalised.slice(8, 16)} ${normalised.slice(17)}`;
}

export type StaffRole = 'moderator' | 'manager' | 'admin' | 'owner';

const RANK: Record<string, number> = {
  member: 1,
  creator: 2,
  vendor: 3,
  moderator: 4,
  manager: 5,
  admin: 6,
  owner: 7,
};

export function roleRank(role: string): number {
  return RANK[role] ?? 0;
}

/** An actor may act on a target only while strictly outranking them. */
export function outranks(actorRole: string, targetRole: string): boolean {
  return roleRank(actorRole) > roleRank(targetRole);
}

export function isStaffRole(role: string): role is StaffRole {
  return roleRank(role) >= RANK['moderator']!;
}
