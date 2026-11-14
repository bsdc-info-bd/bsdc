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
