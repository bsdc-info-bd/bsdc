/**
 * The reason an operator gives, and when a reason is not enough.
 *
 * Four of the eleven gaps in the audit were the same gap in different clothes:
 * the console *collected* a reason and the database *accepted* whatever it
 * received, including nothing. A reason field that can be submitted empty is
 * decoration.
 *
 * So the rule lives here, in one place, as a pure function, and the RPC that
 * writes the row calls the same rules. The client cannot be the only guard, but
 * it must not be a *wrong* guard either — two implementations that disagree
 * produce a console that offers a button the server will refuse.
 *
 * What makes a reason good is not its length. It is whether a person who was
 * not there, reading it in six months, can tell why the action was necessary.
 * The rules below are therefore mostly about *shape*: does it name something
 * concrete, does it do more than restate the action, does it survive being read
 * by the person it was done to.
 */

export type ReasonProblem =
  | { readonly kind: 'empty' }
  | { readonly kind: 'too-short'; readonly minimum: number }
  | { readonly kind: 'too-long'; readonly maximum: number }
  | { readonly kind: 'restates-action'; readonly phrase: string }
  | { readonly kind: 'no-substance' }
  | { readonly kind: 'placeholder'; readonly phrase: string };

export type ReasonPolicy = {
  /** Characters below which a reason cannot identify anything specific. */
  readonly minimum?: number;
  readonly maximum?: number;
  /** Words that merely restate the action and prove nothing. */
  readonly banned?: readonly string[];
  /** Stems whose presence makes a reason too thin to be useful. */
  readonly verbs?: readonly string[];
};

/**
 * Defaults chosen from what is actually written in a hurry: the shortest honest
 * reason in the existing audit table is 24 characters ("duplicate of #4812, see
 * note"), and twelve is about where "test" and "n/a" stop being possible.
 */
export const DEFAULT_REASON_POLICY: Required<ReasonPolicy> = {
  minimum: 12,
  maximum: 1_000,
  banned: ['test', 'testing', 'asdf', 'n/a', 'na', 'none', 'no comment', 'xxx', 'todo'],
  verbs: ['done', 'ok', 'okay', 'yes', 'no', 'fixed', 'handled', 'updated', 'changed'],
};

/** Case- and space-insensitive form used for comparison only. */
function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Every problem with a reason, in the order a form should show them.
 *
 * An empty list means the reason is usable. Returning a list rather than a
 * boolean lets a form point at the specific thing to change instead of turning
 * the field red with no explanation.
 */
export function reasonProblems(
  raw: string | null | undefined,
  policy: ReasonPolicy = {},
): readonly ReasonProblem[] {
  const minimum = policy.minimum ?? DEFAULT_REASON_POLICY.minimum;
  const maximum = policy.maximum ?? DEFAULT_REASON_POLICY.maximum;
  const banned = policy.banned ?? DEFAULT_REASON_POLICY.banned;
  const verbs = policy.verbs ?? DEFAULT_REASON_POLICY.verbs;

  const text = (raw ?? '').trim();
  if (text.length === 0) return [{ kind: 'empty' }];

  const flat = normalise(text);

  // Order matters, because the form shows the first problem. "test" is not
  // "too short" — it is a placeholder, and telling the operator to type four
  // more characters would teach them to write "test test test".
  const bannedHit = banned.find((phrase) => flat === phrase || flat === `${phrase}.`);
  if (bannedHit !== undefined) return [{ kind: 'placeholder', phrase: bannedHit }];

  const words = flat.replace(/[.!]+$/u, '').split(' ');
  if (words.length <= 2 && words.every((word) => verbs.includes(word))) {
    return [{ kind: 'no-substance' }];
  }

  const problems: ReasonProblem[] = [];
  if (text.length < minimum) problems.push({ kind: 'too-short', minimum });
  if (text.length > maximum) problems.push({ kind: 'too-long', maximum });
  return problems;
}

/** True when a reason may be recorded. */
export function isUsableReason(raw: string | null | undefined, policy?: ReasonPolicy): boolean {
  return reasonProblems(raw, policy).length === 0;
}

/** One sentence a form shows for the first problem, or null when it is fine. */
export function reasonMessage(
  raw: string | null | undefined,
  policy?: ReasonPolicy,
): string | null {
  const first = reasonProblems(raw, policy)[0];
  if (!first) return null;
  switch (first.kind) {
    case 'empty':
      return 'A reason is required: it is the only part of this record a person will read later.';
    case 'too-short':
      return `Give at least ${first.minimum} characters — enough to say what specifically this is about.`;
    case 'too-long':
      return `Keep it under ${first.maximum} characters. Put the detail in a note instead.`;
    case 'placeholder':
      return `"${first.phrase}" is not a reason. Say what happened.`;
    case 'no-substance':
      return 'That restates the action. Say why it was needed.';
    /* c8 ignore next */
    default:
      return 'That reason cannot be used.';
  }
}

/**
 * How much substance a reason has, for a progress hint beside the field.
 *
 * Deliberately not a length meter: an operator who sees "180/200 characters"
 * writes to the counter. This says whether the sentence identifies anything.
 */
export type ReasonQuality = 'empty' | 'thin' | 'adequate' | 'good';

export function reasonQuality(raw: string | null | undefined): ReasonQuality {
  const text = (raw ?? '').trim();
  if (text.length === 0) return 'empty';
  if (!isUsableReason(text)) return 'thin';
  const words = text.split(/\s+/).length;
  // A reason is "good" when it points at something a reader could go and check:
  // a record number, a date, a person, or the evidence the decision rested on.
  // Length alone is not a signal — a long vague sentence is still vague — so
  // this asks for one concrete handle *and* enough words to be a sentence.
  const concrete =
    /\d/.test(text) ||
    /\b(verified|confirmed|checked|matched|registry|records?|licence|license|photo|log|note|report|receipt)\b/i.test(
      text,
    ) ||
    /[A-Z]/.test(text.slice(1));
  if (words >= 8 && concrete) return 'good';
  return 'adequate';
}

/**
 * Typed-phrase confirmation for an irreversible action.
 *
 * The five irreversible verbs require the operator to type the record's own
 * name. The comparison is deliberately forgiving about case and surrounding
 * space and unforgiving about everything else: a typo must fail, because the
 * only purpose is to make the operator's hands slow down.
 */
export function matchesConfirmation(typed: string | null | undefined, expected: string): boolean {
  const target = expected.trim();
  if (target.length === 0) return false;
  return (typed ?? '').trim().toLowerCase() === target.toLowerCase();
}

/** The phrase to ask for, derived from what is being acted on. */
export function confirmationPhraseFor(label: string): string {
  const cleaned = label.trim().replace(/\s+/g, ' ');
  // An empty name cannot be confirmed, and asking for "" would let a stray
  // Enter through, so a fixed word is used instead.
  return cleaned.length === 0 ? 'DELETE' : cleaned;
}
