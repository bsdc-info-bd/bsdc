/**
 * Pure, deterministic command parser and specification engine for the
 * BSDC Interactive Admin CLI Console (`CliConsole`).
 *
 * Every mutation still runs exclusively against Postgres security-definer
 * RPCs — this engine handles tokenization (with quote support), syntax
 * validation, autocomplete candidates, macro interpolation, and destructive
 * safety flagging without ever touching raw SQL.
 */

export interface CliCommandSpec {
  readonly signature: string;
  readonly command: string;
  readonly category: 'navigation' | 'telemetry' | 'governance' | 'trust' | 'security' | 'macro';
  readonly summary: string;
  readonly destructive?: boolean | undefined;
}

export const CLI_COMMANDS: readonly CliCommandSpec[] = [
  {
    signature: 'help',
    command: 'help',
    category: 'navigation',
    summary: 'List all available interactive administrative commands and flags',
  },
  {
    signature: 'clear',
    command: 'clear',
    category: 'navigation',
    summary: 'Clear the terminal output buffer',
  },
  {
    signature: 'whoami',
    command: 'whoami',
    category: 'navigation',
    summary: 'Print the authenticated staff identity, role rank, and Firebase UID',
  },
  {
    signature: 'portals',
    command: 'portals',
    category: 'navigation',
    summary: 'List all accessible corporate and public portals with shortcuts',
  },
  {
    signature: 'open <portal>',
    command: 'open',
    category: 'navigation',
    summary: 'Navigate immediately to another console by portal id or short name (e.g. open cert)',
  },
  {
    signature: 'telemetry',
    command: 'telemetry',
    category: 'telemetry',
    summary: 'Fetch live cross-portal telemetry counters via admin_telemetry_snapshot()',
  },
  {
    signature: 'audit [--action <substr>] [--actor <uid>] [--subject <substr>] [--limit <n>]',
    command: 'audit',
    category: 'telemetry',
    summary: 'Query the immutable Postgres audit ledger with structured filters',
  },
  {
    signature: 'case queue [--status <open|pending|closed>]',
    command: 'case queue',
    category: 'governance',
    summary: 'Read the case queue: reopened first, then the oldest',
  },
  {
    signature: 'case show <id>',
    command: 'case show',
    category: 'governance',
    summary: 'Read one case: its reports, its timeline and its outcome',
  },
  {
    signature: 'case note <id> "<text>"',
    command: 'case note',
    category: 'governance',
    // Not destructive: it adds an entry and can alter nothing that exists. The
    // timeline's append-only guarantee is what makes that true, so this is the one
    // write in the family that needs no confirmation.
    summary: 'Add an immutable note to a case timeline',
  },
  {
    signature: 'case close <id> <outcome> [--reason "<text>"]',
    command: 'case close',
    category: 'governance',
    summary: 'Close a case with an outcome, and tell the member unless nothing was done',
    destructive: true,
  },
  {
    signature: 'standing <uid>',
    command: 'standing',
    category: 'governance',
    summary: 'Read a member standing: the cached number, the ledger number, and whether they agree',
  },
  {
    signature: 'standing reconcile',
    command: 'standing reconcile',
    category: 'governance',
    summary: 'List every member whose cached standing disagrees with the ledger',
  },
  {
    signature: 'receipt <id>',
    command: 'receipt',
    category: 'governance',
    summary: 'Read one action receipt by id',
  },
  {
    signature: 'seo coverage [--limit <n>]',
    command: 'seo coverage',
    category: 'telemetry',
    summary: 'List pages whose SEO override is missing, thin or stale',
  },
  {
    signature: 'seo missing [--limit <n>]',
    command: 'seo missing',
    category: 'telemetry',
    summary: 'List paths that are being asked for and are not there',
  },
  {
    signature: 'approvals list',
    command: 'approvals list',
    category: 'governance',
    summary: 'List pending shops and advertisement campaigns waiting for decision',
  },
  {
    signature: 'approvals shop <id> <approve|refuse> [--reason "<text>"]',
    command: 'approvals shop',
    category: 'governance',
    summary: 'Approve or refuse a pending storefront application',
    destructive: true,
  },
  {
    signature: 'approvals campaign <id> <approve|refuse> [--reason "<text>"]',
    command: 'approvals campaign',
    category: 'governance',
    summary: 'Approve or refuse a pending advertisement campaign',
    destructive: true,
  },
  {
    signature: 'cert get <code>',
    command: 'cert get',
    category: 'trust',
    summary: 'Inspect issued certificate metadata and revision count by code',
  },
  {
    signature: 'cert history <code>',
    command: 'cert history',
    category: 'trust',
    summary: 'Display full revision audit trail for a certificate',
  },
  {
    signature: 'cert revoke <code> "<reason>" --yes',
    command: 'cert revoke',
    category: 'trust',
    summary: 'Revoke a live certificate with mandatory audit reason',
    destructive: true,
  },
  {
    signature: 'cert restore <code> "<reason>" --yes',
    command: 'cert restore',
    category: 'trust',
    summary: 'Restore a revoked certificate back to valid standing',
    destructive: true,
  },
  {
    signature: 'notice list',
    command: 'notice list',
    category: 'trust',
    summary: 'Show official notices across draft, published, and archived states',
  },
  {
    signature: 'notice publish <uuid> --yes',
    command: 'notice publish',
    category: 'trust',
    summary: 'Publish a draft official notice immediately',
    destructive: true,
  },
  {
    signature: 'notice unpublish <uuid> "<reason>" --yes',
    command: 'notice unpublish',
    category: 'trust',
    summary: 'Withdraw a published notice back to draft state',
    destructive: true,
  },
  {
    signature: 'ip list',
    command: 'ip list',
    category: 'security',
    summary: 'Inspect active CIDR allow, block, and rate-limit rules',
  },
  {
    signature: 'config list',
    command: 'config list',
    category: 'security',
    summary: 'Read typed platform configuration keys and live values',
  },
  {
    signature: 'staff list',
    command: 'staff list',
    category: 'governance',
    summary: 'List active staff roster entries and departments',
  },
  {
    signature: 'macro list',
    command: 'macro list',
    category: 'macro',
    summary: 'List saved CLI macros stored in Postgres admin_saved_macros',
  },
  {
    signature: 'macro save <name> "<command_script>" [--desc "<text>"]',
    command: 'macro save',
    category: 'macro',
    summary: 'Persist a reusable CLI command or script to Postgres',
  },
  {
    signature: 'macro run <name>',
    command: 'macro run',
    category: 'macro',
    summary: 'Execute a saved macro by name or UUID',
  },
  {
    signature: 'macro rm <id> --yes',
    command: 'macro rm',
    category: 'macro',
    summary: 'Delete a saved macro by UUID',
    destructive: true,
  },
  // Bulk verbs. Every one of them is two commands in one grammar, because the
  // first half is the part people skip: nothing is written until a plan has been
  // printed and its id has been handed back to `bulk apply`.
  {
    signature: 'bulk plan <subject> <action> --reason <text> [--status <s>] [--search <text>] [--older-than <days>]',
    command: 'bulk plan',
    category: 'governance',
    summary:
      'Preview a bulk decision without writing anything, and print the plan id that `bulk apply` needs',
  },
  {
    signature: 'bulk apply <plan-id>',
    command: 'bulk apply',
    category: 'governance',
    summary: 'Run a plan that was previewed, skipping any row that changed since',
    destructive: true,
  },
  {
    signature: 'bulk plans [--limit <n>]',
    command: 'bulk plans',
    category: 'governance',
    summary: 'List recent plans, who made them, and what they did',
  },
  {
    signature: 'bulk show <plan-id>',
    command: 'bulk show',
    category: 'governance',
    summary: 'Read every row a plan would touch, with the reason each one is or is not applicable',
  },
];

export interface ParsedCliInput {
  readonly tokens: readonly string[];
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
  readonly error?: string | undefined;
}

/**
 * Tokenize shell-style CLI input supporting `"double quotes"` and `'single quotes'`.
 */
export function tokenizeCli(raw: string): {
  readonly tokens: readonly string[];
  readonly error?: string | undefined;
} {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (escaping) return { tokens: [], error: 'Trailing escape character.' };
  if (quote !== null) return { tokens: [], error: `Unclosed ${quote} quote.` };
  if (current.length > 0) tokens.push(current);
  return { tokens };
}

export function parseCli(raw: string): ParsedCliInput {
  const { tokens, error } = tokenizeCli(raw.trim());
  if (error) {
    return { tokens: [], positional: [], flags: {}, error };
  }

  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i]!;
    if (tok.startsWith('--') && tok.length > 2) {
      const key = tok.slice(2);
      const eq = key.indexOf('=');
      if (eq >= 0) {
        flags[key.slice(0, eq)] = key.slice(eq + 1);
      } else {
        const next = tokens[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(tok);
    }
  }

  return { tokens, positional, flags };
}

export function cliAutocomplete(prefix: string): readonly CliCommandSpec[] {
  const trimmed = prefix.trim().toLowerCase();
  if (trimmed === '') return CLI_COMMANDS.slice(0, 8);
  return CLI_COMMANDS.filter(
    (spec) => spec.command.startsWith(trimmed) || spec.signature.toLowerCase().includes(trimmed),
  );
}

export function splitMacroLines(script: string): readonly string[] {
  return script
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** The subjects a bulk verb accepts, and the actions each one allows. */
export const BULK_SUBJECTS = {
  shops: ['approve', 'refuse'],
  campaigns: ['approve', 'refuse'],
  reports: ['resolve', 'dismiss'],
  posts: ['hide', 'restore'],
} as const;

export type BulkSubject = keyof typeof BULK_SUBJECTS;
export type BulkAction = (typeof BULK_SUBJECTS)[BulkSubject][number];

/** What `bulk plan` resolved to, ready to hand to `bulk_plan`. */
export interface BulkPlanRequest {
  readonly subject: BulkSubject;
  readonly action: BulkAction;
  readonly reason: string;
  readonly selector: Record<string, unknown>;
}

export interface BulkPlanParse {
  readonly request?: BulkPlanRequest | undefined;
  readonly error?: string | undefined;
}

/**
 * Turns a `bulk plan` line into the arguments the RPC takes, or explains why it
 * cannot.
 *
 * Written as a pure function with its own errors rather than letting the console
 * make the round trip and report the database's refusal, for one reason: half of
 * these mistakes are knowable before any network call, and a tool that asks the
 * database whether `bulk plan shops delete` is spelled correctly is a tool that
 * feels slow for no gain. The database still checks everything — this only avoids
 * the pointless trip.
 *
 * The reason floor is twelve characters, matching the database exactly. A console
 * that accepted ten would produce a plan the server then refuses, which reads to
 * the operator as the tool being broken.
 */
export const BULK_REASON_MIN = 12;

export function parseBulkPlan(input: ParsedCliInput): BulkPlanParse {
  // `positional` is [bulk, plan, <subject>, <action>]: the grammar is two words
  // before the arguments, and an earlier draft read one word too few.
  const [verb, sub, subjectRaw, actionRaw] = input.positional;
  if (verb !== 'bulk' || sub !== 'plan') {
    return { error: 'Usage: bulk plan <subject> <action> --reason <text>' };
  }
  if (subjectRaw === undefined || actionRaw === undefined) {
    return { error: 'Usage: bulk plan <subject> <action> --reason <text>' };
  }

  const subject = subjectRaw.toLowerCase();
  if (!(subject in BULK_SUBJECTS)) {
    return {
      error: `Unknown subject "${subjectRaw}". One of: ${Object.keys(BULK_SUBJECTS).join(', ')}.`,
    };
  }
  const typedSubject = subject as BulkSubject;

  const action = actionRaw.toLowerCase();
  const allowed: readonly string[] = BULK_SUBJECTS[typedSubject];
  if (!allowed.includes(action)) {
    return {
      // The refusal lists what the subject does allow, because "invalid action"
      // makes the operator guess and guessing is what a CLI should remove.
      error: `"${actionRaw}" is not something you can do to ${typedSubject}. Allowed: ${allowed.join(', ')}.`,
    };
  }

  const reason = typeof input.flags.reason === 'string' ? input.flags.reason.trim() : '';
  if (reason.length < BULK_REASON_MIN) {
    return {
      error: `A reason of at least ${String(BULK_REASON_MIN)} characters is required, and it is read by somebody who was not here.`,
    };
  }

  const selector: Record<string, unknown> = {};
  if (typeof input.flags.status === 'string') selector.status = input.flags.status;
  if (typeof input.flags.search === 'string') selector.search = input.flags.search;
  if (typeof input.flags['older-than'] === 'string') {
    const days = Number(input.flags['older-than']);
    if (!Number.isFinite(days) || days < 0) {
      return { error: '--older-than takes a number of days, and a negative number of days is not a thing.' };
    }
    selector.olderThanDays = Math.floor(days);
  }
  if (typeof input.flags.limit === 'string') {
    const limit = Number(input.flags.limit);
    if (!Number.isFinite(limit) || limit < 1) {
      return { error: '--limit takes a positive whole number.' };
    }
    selector.limit = Math.floor(limit);
  }

  return {
    request: {
      subject: typedSubject,
      action: action as BulkAction,
      reason,
      selector,
    },
  };
}

/**
 * The command that would apply a plan, printed after the plan is made.
 *
 * The point is that the operator copies one line rather than remembering an id.
 * A tool that says "plan 7f3a-…" and leaves the operator to construct the apply
 * command is a tool that gets an apply command wrong.
 */
export function bulkApplyHint(planId: string): string {
  return `bulk apply ${planId}`;
}

/**
 * Whether a `bulk apply` line is complete enough to send.
 *
 * Deliberately not a uuid check: the RPC takes a uuid and Postgres validates it
 * better than a regex this file would have to keep in step with. What is checked
 * is the thing the server cannot: that an id was given at all.
 */
export function parseBulkApply(input: ParsedCliInput): {
  readonly planId?: string | undefined;
  readonly error?: string | undefined;
} {
  const [, sub, id] = input.positional;
  if (sub !== 'apply' || id === undefined || id.trim() === '' || id.startsWith('--')) {
    return { error: 'Usage: bulk apply <plan-id>. The id is printed by `bulk plan`.' };
  }
  return { planId: id.trim() };
}
