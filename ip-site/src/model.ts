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

// ---------------------------------------------------------------------------
// §12.3 Rules with a reason
// ---------------------------------------------------------------------------

/** `ip_rules` as 0148 returns it: the reason fields the engine needed. */
export type RuleRowV2 = RuleRow & {
  readonly label?: string | undefined;
  readonly review_at?: string | null | undefined;
  readonly shadow?: boolean | undefined;
  readonly match_count?: number | undefined;
  readonly last_matched_at?: string | null | undefined;
  readonly disabled_at?: string | null | undefined;
  readonly disabled_reason?: string | undefined;
};

export type RuleHealth = {
  readonly reviewOverdue: boolean;
  readonly daysOverdue: number | null;
  readonly shadow: boolean;
  readonly neverMatched: boolean;
  /** A block that has done nothing in its life is a block nobody needs. */
  readonly idle: boolean;
  readonly summary: string;
};

/**
 * Whether a rule is still earning its place.
 *
 * §12.3's sentence is "a permanent block added during an incident is how a platform
 * loses a customer six months later" — so the thing worth surfacing is not that a
 * rule exists but that it is overdue for a look, or has never decided anything.
 */
export function ruleHealth(row: RuleRowV2, now = new Date()): RuleHealth {
  const review = row.review_at ?? null;
  const overdueMs = review === null ? 0 : now.getTime() - new Date(review).getTime();
  const reviewOverdue = review !== null && Number.isFinite(overdueMs) && overdueMs > 0;
  const daysOverdue = reviewOverdue ? Math.floor(overdueMs / 86_400_000) : null;
  const shadow = row.shadow === true;
  const matches = row.match_count ?? 0;
  const neverMatched = matches === 0;
  const idle = neverMatched && !shadow;

  if (reviewOverdue) {
    return {
      reviewOverdue,
      daysOverdue,
      shadow,
      neverMatched,
      idle,
      summary: `Past its review date by ${String(daysOverdue)} day${daysOverdue === 1 ? '' : 's'}. Decide whether it should still exist.`,
    };
  }
  if (shadow) {
    return {
      reviewOverdue,
      daysOverdue,
      shadow,
      neverMatched,
      idle,
      summary:
        matches === 0
          ? 'In shadow mode and has not matched anything yet. It blocks nobody until it is armed.'
          : `In shadow mode. It would have matched ${String(matches)} request${matches === 1 ? '' : 's'} so far.`,
    };
  }
  if (idle) {
    return {
      reviewOverdue,
      daysOverdue,
      shadow,
      neverMatched,
      idle,
      summary: 'Has never matched a request. A block nothing needed is a block to question.',
    };
  }
  return {
    reviewOverdue,
    daysOverdue,
    shadow,
    neverMatched,
    idle,
    summary: `Matched ${String(matches)} request${matches === 1 ? '' : 's'}.`,
  };
}

export type SimulatedStep = {
  readonly decision: string | null;
  readonly matched: string | null;
  readonly matched_kind: string | null;
  readonly matched_label: string | null;
  readonly reason: string;
  readonly shadow: boolean;
  readonly step: number;
  readonly skipped_why: string | null;
};

export type Verdict = {
  readonly decision: string;
  /** True when a shadow rule would have decided differently from the real answer. */
  readonly shadowDiffers: boolean;
  readonly sentence: string;
};

/**
 * The answer, separated from the working.
 *
 * The simulator returns every rule in the order the engine considered it, one of
 * which carries the decision and the rest of which carry a reason for being passed
 * over. An operator asking "why did this match" wants the winner first and the
 * reasoning second; showing the list without picking the winner is a wall of rows.
 */
export function verdictOf(steps: readonly SimulatedStep[]): Verdict {
  const decided = steps.find(
    (s): s is SimulatedStep & { decision: string } =>
      s.decision === 'block' || s.decision === 'allow',
  );
  const wouldBlock = steps.find((s) => s.decision === 'would block');
  const wouldAllow = steps.find((s) => s.decision === 'would allow');
  const would = wouldBlock ?? wouldAllow;

  if (decided === undefined) {
    return {
      decision: 'unknown',
      shadowDiffers: would !== undefined,
      sentence:
        would === undefined
          ? 'The simulator returned no decision. That is a fault in the simulator, not an answer.'
          : `Nothing decides this address yet, but a shadow rule ${would.decision === 'would block' ? 'would block it' : 'would allow it'}.`,
    };
  }

  const shadowDiffers = would !== undefined && would.decision !== `would ${decided.decision}`;
  const why = `${String(decided.matched)}${
    decided.matched_label === null ? '' : ` (${decided.matched_label})`
  }`;

  return {
    decision: decided.decision,
    shadowDiffers,
    sentence:
      decided.matched === null
        ? `No rule matches, so the default applies: ${decided.decision}. ${decided.reason}`
        : `${decided.decision === 'block' ? 'Blocked' : 'Allowed'} by ${why}. ${decided.reason}`,
  };
}

export type DryRunRow = {
  readonly ip: string;
  readonly hits: number;
  readonly last_seen: string;
  readonly actions: readonly string[];
  readonly would_change: number;
};

export type DryRunSummary = {
  readonly addresses: number;
  readonly requests: number;
  /** Requests whose outcome would change, which is the only number that matters. */
  readonly affected: number;
  /** Actions a new block would have hit, so a payment callback is visible. */
  readonly actions: readonly string[];
  readonly sentence: string;
};

export function summariseDryRun(rows: readonly DryRunRow[]): DryRunSummary {
  const addresses = rows.length;
  const affected = rows.reduce((sum, row) => sum + Number(row.would_change ?? 0), 0);
  const requests = rows.reduce((sum, row) => sum + Number(row.hits ?? 0), 0);
  const actions = [...new Set(rows.flatMap((row) => row.actions ?? []))].sort();
  if (addresses === 0) {
    return {
      addresses: 0,
      requests: 0,
      affected: 0,
      actions: [],
      sentence:
        'This rule would not have changed the outcome of a single request in the window. Nothing needs it.',
    };
  }
  return {
    addresses,
    requests,
    affected,
    actions,
    sentence: `${String(affected)} request${affected === 1 ? '' : 's'} from ${String(addresses)} address${addresses === 1 ? '' : 'es'} would have been decided differently, out of ${String(requests)} seen.`,
  };
}

/** How much of the window the evidence covers, said plainly. */
export function windowNote(days: number, rows: readonly DryRunRow[]): string {
  const plural = days === 1 ? 'day' : 'days';
  if (rows.length === 0) {
    return `Nothing in the last ${String(days)} ${plural} would have been affected. That is evidence, not proof: a quiet window is also what a rule that is wrong looks like.`;
  }
  return `Based on the last ${String(days)} ${plural} of recorded edge decisions. Requests that were never recorded are not in this answer.`;
}

export const MIN_RULE_REASON = 10;

/** A rule needs a reason, a label and a review date — in that order of importance. */
export function ruleProblems(
  input: {
    readonly cidr: string;
    readonly reason: string;
    readonly label: string;
    readonly kind: IpRuleKind;
    readonly reviewAt: string;
  },
  now = new Date(),
): readonly string[] {
  const problems: string[] = [];

  if (input.label.trim().length < 2) {
    problems.push('Give the rule a short label, so a list of rules is readable at a glance.');
  }
  if (input.reason.trim().length < MIN_RULE_REASON) {
    problems.push(
      'Give a reason of at least ten characters. An unexplained block is a block nobody dares remove.',
    );
  }
  if (input.kind === 'block' || input.kind === 'watch') {
    if (input.reviewAt.trim() === '') {
      problems.push(
        'Give a review date, or accept the default thirty days. A block with no end is how a platform loses a customer six months later.',
      );
    } else {
      const at = new Date(input.reviewAt).getTime();
      if (!Number.isFinite(at)) {
        problems.push('The review date could not be read.');
      } else if (at <= now.getTime()) {
        problems.push(
          'A review date in the past is not a review. Choose a future date, or disable the rule instead.',
        );
      }
    }
  }
  return problems;
}

/** What saving will do, before it is saved. */
export function saveSummary(
  shadow: boolean,
  reviewAt: string,
  dryRun: DryRunSummary | null,
): string {
  const mode = shadow
    ? 'It will be created in shadow mode: it blocks nobody and records what it would have done.'
    : 'It will be armed immediately.';
  const review =
    reviewAt.trim() === '' ? ' It defaults to a review in thirty days.' : ` Review on ${reviewAt}.`;
  const evidence =
    dryRun === null
      ? ''
      : ` ${dryRun.affected === 0 ? 'No request in the last week would have been affected.' : `In the last week it would have affected ${String(dryRun.affected)} request(s).`}`;
  return `${mode}${review}${evidence}`;
}
