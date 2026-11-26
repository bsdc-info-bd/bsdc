import { confirmationTarget, planCommand, renderPlan, requiresTypedId } from './dry-run';
import { actorLabel } from './overview';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  CopyButton,
  accessiblePortals,
  callRpc,
  getDb,
  listRpc,
  messageOf,
  resolvePortalHref,
  rowsToCsv,
  toDataError,
  useAsync,
  useCorporateEnv,
  useSession,
  type TelemetrySnapshot,
} from '@kit';
import {
  CLI_COMMANDS,
  cliAutocomplete,
  parseCli,
  splitMacroLines,
  bulkApplyHint,
  parseBulkApply,
  parseBulkPlan,
  type CliCommandSpec,
} from './cli-engine';

interface MacroRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly command_script: string;
  readonly min_role: string;
  readonly is_shared: boolean;
  readonly created_by: string;
  readonly updated_at: string;
}

interface CliTranscriptEntry {
  readonly id: string;
  readonly command: string;
  readonly status: 'ok' | 'error' | 'info';
  readonly output: string;
  readonly csv?: string | undefined;
}

const HISTORY_KEY = 'bsdc-admin-cli-history';

function readHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

export function CliConsole(): ReactElement {
  const env = useCorporateEnv();
  const { state: session } = useSession();
  const profile = session.status === 'authenticated' ? session.profile : null;

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>(readHistory);
  const [historyCursor, setHistoryCursor] = useState<number>(-1);
  const [transcript, setTranscript] = useState<CliTranscriptEntry[]>([
    {
      id: 'boot',
      command: 'boot',
      status: 'info',
      output:
        'BSDC Interactive Corporate CLI ready. Every command calls Postgres security-definer RPCs under your active staff clearance. Type "help" or press Tab to complete.',
    },
  ]);

  const outRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadMacros = useCallback(() => listRpc<MacroRow>(env, 'list_admin_macros'), [env]);
  const { state: macrosState, reload: reloadMacros } = useAsync(loadMacros, [env]);

  useEffect(() => {
    if (outRef.current) {
      outRef.current.scrollTop = outRef.current.scrollHeight;
    }
  }, [transcript]);

  const pushEntry = (
    command: string,
    status: CliTranscriptEntry['status'],
    output: string,
    csv?: string,
  ): void => {
    setTranscript((prev) => [
      ...prev.slice(-80),
      { id: `${Date.now()}-${Math.random()}`, command, status, output, csv },
    ]);
  };

  const runCommand = async (rawLine: string, depth = 0): Promise<void> => {
    const trimmed = rawLine.trim();
    if (trimmed === '') return;

    if (depth === 0) {
      const nextHistory = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, 40);
      setHistory(nextHistory);
      setHistoryCursor(-1);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      } catch {
        /* ignore storage failures */
      }
    }

    const parsed = parseCli(trimmed);
    if (parsed.error) {
      pushEntry(trimmed, 'error', parsed.error);
      return;
    }

    // `--dry-run` resolves the command and prints the plan without calling
    // anything. It runs before every other branch, so a destructive verb cannot
    // slip past it by matching an earlier handler — the check is on the flag, not
    // on a list of verbs that has to be kept in step.
    if (parsed.flags['dry-run'] === true || parsed.flags['dry-run'] === 'true') {
      const plan = planCommand(parsed.positional, parsed.flags);
      pushEntry(trimmed, plan.ok ? 'info' : 'error', renderPlan(plan));
      return;
    }

    // A destructive verb needs its subject id typed back, not the word "confirm".
    // Typing an id forces the operator to look at which record they are about to
    // change; typing "yes" forces them to look at nothing. The id is compared
    // exactly, so a near miss is a refusal rather than a decision about the wrong
    // row. `--confirm <id>` carries it, because a prompt that blocks the terminal
    // cannot be tested and cannot be pasted into an incident review.
    if (requiresTypedId(trimmed)) {
      const expected = confirmationTarget(trimmed);
      const typed = typeof parsed.flags['confirm'] === 'string' ? parsed.flags['confirm'] : '';
      if (expected !== null && typed !== expected) {
        pushEntry(
          trimmed,
          'error',
          [
            `This command changes a record. Type its id to confirm:`,
            `  ${trimmed} --confirm ${expected}`,
            '',
            typed === ''
              ? 'Nothing was called.'
              : `You typed "${typed}", which is not the id. Nothing was called.`,
            'Add --dry-run to see what it would do first.',
          ].join('\n'),
        );
        return;
      }
    }

    const [verb, sub, ...rest] = parsed.positional;
    if (!verb) return;

    if (verb === 'clear') {
      setTranscript([]);
      return;
    }

    if (verb === 'help') {
      const lines = CLI_COMMANDS.map(
        (c) =>
          `${c.signature.padEnd(54, ' ')} — ${c.summary}${
            c.destructive ? ' [--dry-run to preview; the subject id is typed to confirm]' : ''
          }`,
      );
      pushEntry(trimmed, 'info', lines.join('\n'));
      return;
    }

    if (verb === 'whoami') {
      if (!profile) {
        pushEntry(trimmed, 'error', 'No active staff profile loaded.');
        return;
      }
      pushEntry(
        trimmed,
        'ok',
        JSON.stringify(
          {
            uid: profile.uid,
            displayName: profile.displayName,
            role: profile.role,
            appId: env.appId,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (verb === 'portals') {
      const list = accessiblePortals(profile?.role ?? null);
      const lines = list.map(
        (p) =>
          `[${p.shortcut}] ${p.id.padEnd(14, ' ')} (${p.minRole.padEnd(9, ' ')}) -> ${resolvePortalHref(p)}`,
      );
      pushEntry(trimmed, 'ok', lines.join('\n'));
      return;
    }

    if (verb === 'open') {
      const needle = (sub ?? '').toLowerCase();
      const target = accessiblePortals(profile?.role ?? null).find(
        (p) =>
          p.id.toLowerCase() === needle ||
          p.id.replace('bsdc-', '') === needle ||
          p.shortName.toLowerCase() === needle,
      );
      if (!target) {
        pushEntry(
          trimmed,
          'error',
          `Unknown or inaccessible portal "${sub ?? ''}". Run "portals".`,
        );
        return;
      }
      const href = resolvePortalHref(target);
      pushEntry(trimmed, 'ok', `Opening ${target.name} at ${href}...`);
      window.location.assign(href);
      return;
    }

    if (verb === 'telemetry') {
      const rows = await listRpc<TelemetrySnapshot>(env, 'admin_telemetry_snapshot');
      const snap = rows[0];
      if (!snap) {
        pushEntry(trimmed, 'error', 'No telemetry snapshot returned.');
        return;
      }
      const csv = rowsToCsv(Object.keys(snap), [Object.values(snap)]);
      pushEntry(trimmed, 'ok', JSON.stringify(snap, null, 2), csv);
      return;
    }

    if (verb === 'bulk') {
      // `bulk` is the one verb family in this console that can change other
      // people's rows, so it is the one that insists on a preview first. `bulk
      // plan` writes nothing; `bulk apply` needs an id that only a plan printed.
      const sub = parsed.positional[1];

      if (sub === 'plan') {
        const { request, error } = parseBulkPlan(parsed);
        if (error || !request) {
          pushEntry(trimmed, 'error', error ?? 'The plan could not be built.');
          return;
        }
        const rows = await listRpc<{ id: string; matched: number; applicable: number }>(
          env,
          'bulk_plan',
          {
            p_subject: request.subject,
            p_action: request.action,
            p_selector: request.selector,
            p_reason: request.reason,
          },
        );
        const plan = rows[0];
        if (!plan) {
          pushEntry(trimmed, 'error', 'The plan returned no id, which means nothing was planned.');
          return;
        }
        pushEntry(
          trimmed,
          'ok',
          [
            `Plan ${plan.id}`,
            `  ${String(plan.applicable)} of ${String(plan.matched)} row(s) would be ${request.action}d.`,
            `  Nothing has been written. To run it: ${bulkApplyHint(plan.id)}`,
            '  A row that changes before you apply is skipped, not overwritten.',
          ].join('\n'),
        );
        return;
      }

      if (sub === 'apply') {
        const { planId, error } = parseBulkApply(parsed);
        if (error || !planId) {
          pushEntry(trimmed, 'error', error ?? 'No plan id given.');
          return;
        }
        const rows = await listRpc<{ applied: number; skipped: number; details: unknown }>(
          env,
          'bulk_apply',
          { p_plan_id: planId },
        );
        const outcome = rows[0];
        if (!outcome) {
          pushEntry(trimmed, 'error', 'The apply returned no outcome.');
          return;
        }
        const detail = Array.isArray(outcome.details) ? outcome.details : [];
        const skippedLines = detail
          .filter((item) => (item as { outcome?: string }).outcome !== 'applied')
          .map((item) => {
            const row = item as { label?: string; why?: string; outcome?: string };
            return `  ${row.outcome ?? 'skipped'}: ${row.label ?? '?'} — ${row.why ?? 'no reason given'}`;
          });
        pushEntry(
          trimmed,
          // A partial apply is not a success. `info` would scroll away like one.
          outcome.skipped > 0 ? 'error' : 'ok',
          [
            `${String(outcome.applied)} applied, ${String(outcome.skipped)} skipped.`,
            ...skippedLines,
          ].join('\n'),
        );
        return;
      }

      if (sub === 'plans') {
        const limit = Number(parsed.flags['limit'] ?? 20);
        const rows = await listRpc<{
          id: string;
          subject: string;
          action: string;
          matched: number;
          applicable: number;
          applied_at: string | null;
          applied_count: number | null;
          is_mine: boolean;
        }>(env, 'bulk_plans_for_me', {
          p_limit: Number.isFinite(limit) ? limit : 20,
        });
        if (rows.length === 0) {
          pushEntry(
            trimmed,
            'ok',
            'No plans. Make one with `bulk plan <subject> <action> --reason <text>`.',
          );
          return;
        }
        pushEntry(
          trimmed,
          'ok',
          rows
            .map(
              (row) =>
                `${row.id.slice(0, 8)}… | ${row.subject} ${row.action} | ${String(row.applicable)}/${String(row.matched)} | ${
                  row.applied_at ? `applied ${String(row.applied_count ?? 0)}` : 'not applied'
                } | ${row.is_mine ? 'mine' : 'somebody else'}`,
            )
            .join('\n'),
        );
        return;
      }

      if (sub === 'show') {
        const id = parsed.positional[2];
        if (!id) {
          pushEntry(trimmed, 'error', 'Usage: bulk show <plan-id>');
          return;
        }
        const rows = await listRpc<{
          label: string;
          from_status: string;
          to_status: string;
          applicable: boolean;
          blocked: string | null;
        }>(env, 'bulk_plan_detail', { p_plan_id: id });
        if (rows.length === 0) {
          pushEntry(trimmed, 'ok', '(the plan lists no rows)');
          return;
        }
        pushEntry(
          trimmed,
          'ok',
          rows
            .map(
              (row) =>
                `${row.applicable ? 'yes' : 'no '} | ${row.label} | ${row.from_status} → ${row.to_status}${
                  row.blocked ? ` (${row.blocked})` : ''
                }`,
            )
            .join('\n'),
        );
        return;
      }

      pushEntry(
        trimmed,
        'error',
        'Usage: bulk plan <subject> <action> --reason <text> | bulk apply <id> | bulk plans | bulk show <id>',
      );
      return;
    }

    if (verb === 'audit') {
      const action = typeof parsed.flags['action'] === 'string' ? parsed.flags['action'] : '';
      const actor = typeof parsed.flags['actor'] === 'string' ? parsed.flags['actor'] : '';
      const subject = typeof parsed.flags['subject'] === 'string' ? parsed.flags['subject'] : '';
      const limit = Number(parsed.flags['limit'] ?? 25);
      const rows = await listRpc<{
        id: number;
        actor_uid: string | null;
        action: string;
        subject: string;
        metadata: unknown;
        created_at: string;
      }>(env, 'admin_cli_audit_query', {
        p_action: action,
        p_actor: actor,
        p_subject: subject,
        p_limit: Number.isFinite(limit) ? limit : 25,
      });
      const csv = rowsToCsv(
        ['created_at', 'actor_uid', 'action', 'subject'],
        rows.map((r) => [r.created_at, r.actor_uid, r.action, r.subject]),
      );
      const formatted = rows
        .map(
          (r) =>
            `${r.created_at.slice(0, 19)} | ${r.action.padEnd(24, ' ')} | ${actorLabel(r.actor_uid)} | ${r.subject}`,
        )
        .join('\n');
      pushEntry(trimmed, 'ok', formatted || '(0 audit events matched)', csv);
      return;
    }

    if (verb === 'case') {
      // The case family. `case note` and `case close` write; both are refused by
      // the database without `moderation.resolve`, so the terminal does not need a
      // second permission check — it needs to say so when the refusal comes.
      if (sub === 'queue') {
        const status = typeof parsed.flags['status'] === 'string' ? parsed.flags['status'] : 'open';
        const rows = await listRpc<{
          id: string;
          subject_name: string;
          status: string;
          reports: number;
          reopened_count: number;
          age_hours: number;
        }>(env, 'case_queue', { p_status: status, p_limit: 100 });
        const formatted = rows
          .map(
            (r) =>
              `${r.id.slice(0, 8)} | ${(r.subject_name || 'unnamed').padEnd(20, ' ')} | ${String(r.reports).padStart(3)} reports | ${String(r.age_hours).padStart(4)} h | ${r.reopened_count > 0 ? `reopened ${String(r.reopened_count)}` : '—'}`,
          )
          .join('\n');
        pushEntry(trimmed, 'ok', formatted || '(0 cases in this queue)');
        return;
      }

      if (sub === 'show') {
        const id = parsed.positional[2];
        if (!id) {
          pushEntry(trimmed, 'error', 'Usage: case show <id>');
          return;
        }
        const [one] = await listRpc<{
          id: string;
          subject_name: string;
          status: string;
          outcome: string;
          reopened_count: number;
          reports: { reason: string; status: string }[];
          events: { kind: string; body: string; created_at: string }[];
        }>(env, 'admin_case', { p_case_id: id });
        if (!one) {
          pushEntry(trimmed, 'error', 'No case with that id, or it is not yours to read.');
          return;
        }
        const lines = [
          `case ${one.id} · ${one.subject_name || 'unnamed'} · ${one.status}`,
          `outcome: ${one.outcome === '' ? 'none yet' : one.outcome}${
            one.reopened_count > 0 ? ` · reopened ${String(one.reopened_count)}×` : ''
          }`,
          '',
          `reports (${String(one.reports.length)}):`,
          ...one.reports.map((r) => `  - ${r.reason} [${r.status}]`),
          '',
          'timeline (newest first):',
          ...[...one.events]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map(
              (e) =>
                `  ${e.created_at.slice(0, 16).replace('T', ' ')} ${e.kind.padEnd(14, ' ')} ${e.body}`,
            ),
        ];
        pushEntry(trimmed, 'ok', lines.join('\n'));
        return;
      }

      if (sub === 'note') {
        const id = parsed.positional[2];
        const body = parsed.positional.slice(3).join(' ');
        if (!id || body.trim().length < 2) {
          pushEntry(trimmed, 'error', 'Usage: case note <id> "<text>"');
          return;
        }
        await callRpc(env, 'add_case_note', {
          p_case_id: id,
          p_body: body.trim(),
          p_kind: 'note',
          p_metadata: {},
        });
        pushEntry(
          trimmed,
          'ok',
          'Note added. A timeline entry cannot be edited, so a correction is another note.',
        );
        return;
      }

      if (sub === 'close') {
        const id = parsed.positional[2];
        const outcome = parsed.positional[3];
        const reason = typeof parsed.flags['reason'] === 'string' ? parsed.flags['reason'] : '';
        if (!id || !outcome) {
          pushEntry(
            trimmed,
            'error',
            `Usage: case close <id> <outcome> --reason "<text>"\nOutcomes: no_action, content_removed, account_suspended, account_banned, warned, referred, duplicate`,
          );
          return;
        }
        const quiet = outcome === 'no_action' || outcome === 'duplicate';
        if (!quiet && reason.trim().length < 12) {
          pushEntry(
            trimmed,
            'error',
            'The member is told about this outcome, so --reason needs at least twelve characters.',
          );
          return;
        }
        await callRpc(env, 'close_case', {
          p_case_id: id,
          p_outcome: outcome,
          p_outcome_message_key: quiet ? '' : outcome,
          p_note: reason.trim(),
        });
        pushEntry(
          trimmed,
          'ok',
          quiet
            ? 'Closed. Nothing is announced, because nothing was done.'
            : 'Closed. The member has been told, with your note.',
        );
        return;
      }

      pushEntry(
        trimmed,
        'error',
        'Usage: case queue | case show <id> | case note <id> "<text>" | case close <id> <outcome> --reason "<text>"',
      );
      return;
    }

    if (verb === 'standing') {
      if (sub === 'reconcile') {
        const rows = await listRpc<{
          uid: string;
          cached_points: number;
          ledger_points: number;
          difference: number;
        }>(env, 'standing_reconcile', { p_limit: 200 });
        const formatted = rows
          .map(
            (r) =>
              `${r.uid.slice(0, 12)} | cached ${String(r.cached_points).padStart(5)} | ledger ${String(r.ledger_points).padStart(5)} | off by ${String(r.difference)}`,
          )
          .join('\n');
        pushEntry(trimmed, 'ok', formatted || 'The cache agrees with the ledger for every member.');
        return;
      }

      const uid = parsed.positional[1];
      if (!uid) {
        pushEntry(trimmed, 'error', 'Usage: standing <uid> | standing reconcile');
        return;
      }
      const [one] = await listRpc<{
        display_name: string;
        cached_points: number;
        ledger_points: number;
        agrees: boolean;
        entries: number;
        counted_entries: number;
      }>(env, 'admin_standing', { p_uid: uid });
      if (!one) {
        pushEntry(trimmed, 'error', 'No such member.');
        return;
      }
      pushEntry(
        trimmed,
        one.agrees ? 'ok' : 'error',
        [
          `${one.display_name || uid}: ${String(one.ledger_points)} points`,
          `cache: ${String(one.cached_points)} — ${one.agrees ? 'agrees with the ledger' : 'DISAGREES with the ledger'}`,
          `entries: ${String(one.entries)}, of which ${String(one.counted_entries)} count`,
        ].join('\n'),
      );
      return;
    }

    if (verb === 'receipt') {
      const id = parsed.positional[1];
      if (!id) {
        pushEntry(trimmed, 'error', 'Usage: receipt <id>');
        return;
      }
      const [one] = await listRpc<{
        action: string;
        subject: string;
        reason: string;
        via: string;
        actor_name: string;
        created_at: string;
        purge_after: string;
      }>(env, 'admin_receipt', { p_id: id });
      if (!one) {
        pushEntry(trimmed, 'error', 'No receipt with that id, or it is not yours to read.');
        return;
      }
      pushEntry(
        trimmed,
        'ok',
        [
          `${one.action} on ${one.subject}`,
          `by ${one.actor_name} via ${one.via} at ${one.created_at.slice(0, 16).replace('T', ' ')}`,
          one.reason === '' ? 'no reason recorded' : `reason: ${one.reason}`,
          `kept until ${one.purge_after.slice(0, 10)}`,
        ].join('\n'),
      );
      return;
    }

    if (verb === 'seo') {
      if (sub === 'coverage') {
        const limit = Number(parsed.flags['limit'] ?? 50);
        const rows = await listRpc<{
          path: string;
          problem: string;
          title_length: number;
          description_length: number;
        }>(env, 'seo_coverage', {
          p_limit: Number.isFinite(limit) ? limit : 50,
          p_only_problems: true,
        });
        const formatted = rows.map((r) => `${r.path.padEnd(40, ' ')} ${r.problem}`).join('\n');
        pushEntry(
          trimmed,
          'ok',
          formatted || 'Every page that matters has an override that holds up.',
        );
        return;
      }

      if (sub === 'missing') {
        const limit = Number(parsed.flags['limit'] ?? 50);
        const rows = await listRpc<{
          path: string;
          hits: number;
          last_seen: string;
          covered_by: string | null;
        }>(env, 'redirect_404_sources', {
          p_limit: Number.isFinite(limit) ? limit : 50,
        });
        const formatted = rows
          .map(
            (r) =>
              `${r.path.padEnd(40, ' ')} ${String(r.hits).padStart(6)} hits | last seen ${r.last_seen.slice(0, 10)} | ${r.covered_by === null ? 'no redirect' : `→ ${r.covered_by}`}`,
          )
          .join('\n');
        pushEntry(trimmed, 'ok', formatted || 'No path is being missed.');
        return;
      }

      pushEntry(trimmed, 'error', 'Usage: seo coverage [--limit <n>] | seo missing [--limit <n>]');
      return;
    }

    if (verb === 'approvals' && sub === 'list') {
      const [shops, campaigns] = await Promise.all([
        listRpc<{ id: string; name: string; city: string; owner_name: string }>(
          env,
          'admin_pending_shops',
          { p_limit: 50 },
        ),
        listRpc<{ id: string; name: string; total_budget: number; owner_name: string }>(
          env,
          'admin_pending_campaigns',
          { p_limit: 50 },
        ),
      ]);
      pushEntry(
        trimmed,
        'ok',
        JSON.stringify({ pending_shops: shops, pending_campaigns: campaigns }, null, 2),
      );
      return;
    }

    if (verb === 'approvals' && (sub === 'shop' || sub === 'campaign')) {
      const [id, decision] = rest;
      if (!id || (decision !== 'approve' && decision !== 'refuse')) {
        pushEntry(
          trimmed,
          'error',
          `Usage: approvals ${sub} <uuid> <approve|refuse> [--reason "..."]`,
        );
        return;
      }
      const approve = decision === 'approve';
      const reason = typeof parsed.flags['reason'] === 'string' ? parsed.flags['reason'] : '';
      if (!approve && reason.trim().length < 4) {
        pushEntry(trimmed, 'error', 'Refusing requires --reason "..." with at least 4 characters.');
        return;
      }
      if (sub === 'shop') {
        await callRpc(env, 'decide_shop', {
          p_shop_id: id,
          p_approve: approve,
          p_reason: approve ? '' : reason,
        });
      } else {
        await callRpc(env, 'decide_campaign', {
          p_campaign_id: id,
          p_approve: approve,
          p_note: approve ? '' : reason,
        });
      }
      pushEntry(trimmed, 'ok', `${sub} ${id} -> ${decision}d.`);
      return;
    }

    if (verb === 'cert') {
      if (sub === 'get' && rest[0]) {
        const rows = await listRpc<Record<string, unknown>>(env, 'certificate_detail', {
          p_code: rest[0],
        });
        pushEntry(
          trimmed,
          rows.length > 0 ? 'ok' : 'error',
          rows[0] ? JSON.stringify(rows[0], null, 2) : `Certificate ${rest[0]} not found.`,
        );
        return;
      }
      if (sub === 'history' && rest[0]) {
        const rows = await listRpc<Record<string, unknown>>(env, 'certificate_history', {
          p_code: rest[0],
        });
        pushEntry(
          trimmed,
          'ok',
          rows.length > 0 ? JSON.stringify(rows, null, 2) : 'No prior editorial revisions yet.',
        );
        return;
      }
      if ((sub === 'revoke' || sub === 'restore') && rest[0]) {
        const reason = rest.slice(1).join(' ').trim();
        if (parsed.flags['yes'] !== true) {
          pushEntry(trimmed, 'error', 'Destructive action blocked: pass --yes to confirm.');
          return;
        }
        if (reason.length < 3) {
          pushEntry(trimmed, 'error', 'Provide a reason (minimum 3 characters).');
          return;
        }
        if (sub === 'revoke') {
          await callRpc(env, 'revoke_certificate', { p_code: rest[0], p_reason: reason });
        } else {
          await callRpc(env, 'restore_issued_certificate', { p_code: rest[0], p_reason: reason });
        }
        pushEntry(trimmed, 'ok', `Certificate ${rest[0]} ${sub}d.`);
        return;
      }
    }

    if (verb === 'notice') {
      if (sub === 'list') {
        const { data, error } = await getDb(env)
          .from('notices')
          .select('id, title, status, priority, audience, version, pinned')
          .order('created_at', { ascending: false })
          .limit(30);
        if (error) throw toDataError(error);
        pushEntry(trimmed, 'ok', JSON.stringify(data ?? [], null, 2));
        return;
      }
      if (sub === 'publish' && rest[0]) {
        if (parsed.flags['yes'] !== true) {
          pushEntry(trimmed, 'error', 'Pass --yes to publish notice immediately.');
          return;
        }
        await callRpc(env, 'publish_notice', {
          p_id: rest[0],
          p_publish_at: new Date().toISOString(),
        });
        pushEntry(trimmed, 'ok', `Notice ${rest[0]} published.`);
        return;
      }
      if (sub === 'unpublish' && rest[0]) {
        if (parsed.flags['yes'] !== true) {
          pushEntry(trimmed, 'error', 'Pass --yes to withdraw notice back to draft.');
          return;
        }
        const reason = rest.slice(1).join(' ');
        await callRpc(env, 'unpublish_notice', { p_id: rest[0], p_reason: reason });
        pushEntry(trimmed, 'ok', `Notice ${rest[0]} unpublished.`);
        return;
      }
    }

    if (verb === 'ip' && sub === 'list') {
      const { data, error } = await getDb(env)
        .from('ip_rules')
        .select('id, cidr, action, reason, expires_at')
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw toDataError(error);
      pushEntry(trimmed, 'ok', JSON.stringify(data ?? [], null, 2));
      return;
    }

    if (verb === 'config' && sub === 'list') {
      const { data, error } = await getDb(env)
        .from('site_config')
        .select('key, value, value_type, updated_at')
        .order('key');
      if (error) throw toDataError(error);
      pushEntry(trimmed, 'ok', JSON.stringify(data ?? [], null, 2));
      return;
    }

    if (verb === 'staff' && sub === 'list') {
      const { data, error } = await getDb(env)
        .from('staff_records')
        .select('staff_no, department, job_title, is_active, verified_at')
        .order('staff_no')
        .limit(60);
      if (error) throw toDataError(error);
      pushEntry(trimmed, 'ok', JSON.stringify(data ?? [], null, 2));
      return;
    }

    if (verb === 'macro') {
      if (sub === 'list') {
        const rows = await listRpc<MacroRow>(env, 'list_admin_macros');
        pushEntry(trimmed, 'ok', JSON.stringify(rows, null, 2));
        return;
      }
      if (sub === 'save') {
        const name = rest[0] ?? '';
        const script = rest.slice(1).join(' ');
        const desc = typeof parsed.flags['desc'] === 'string' ? parsed.flags['desc'] : '';
        const id = await callRpc<string>(env, 'save_admin_macro', {
          p_name: name,
          p_description: desc,
          p_command_script: script,
        });
        reloadMacros();
        pushEntry(trimmed, 'ok', `Saved macro "${name}" (${id}).`);
        return;
      }
      if (sub === 'rm' && rest[0]) {
        if (parsed.flags['yes'] !== true) {
          pushEntry(trimmed, 'error', 'Pass --yes to delete macro.');
          return;
        }
        const ok = await callRpc<boolean>(env, 'delete_admin_macro', { p_id: rest[0] });
        reloadMacros();
        pushEntry(
          trimmed,
          ok ? 'ok' : 'error',
          ok ? `Deleted macro ${rest[0]}.` : 'Macro not found or permission denied.',
        );
        return;
      }
      if (sub === 'run' && rest[0]) {
        if (depth >= 2) {
          pushEntry(trimmed, 'error', 'Nested macro depth exceeded.');
          return;
        }
        const macros = macrosState.status === 'ready' ? macrosState.data : await loadMacros();
        const found = macros.find((m) => m.name === rest[0] || m.id === rest[0]);
        if (!found) {
          pushEntry(trimmed, 'error', `Macro "${rest[0]}" not found.`);
          return;
        }
        for (const step of splitMacroLines(found.command_script)) {
          await runCommand(step, depth + 1);
        }
        return;
      }
    }

    pushEntry(trimmed, 'error', `Unrecognized command "${trimmed}". Type "help" for syntax.`);
  };

  const execute = (line: string): void => {
    if (busy || line.trim() === '') return;
    setBusy(true);
    setInput('');
    void runCommand(line)
      .catch((cause: unknown) => {
        pushEntry(line, 'error', messageOf(cause));
      })
      .finally(() => {
        setBusy(false);
        inputRef.current?.focus();
      });
  };

  const suggestions: readonly CliCommandSpec[] = cliAutocomplete(input);

  return (
    <div className="kit-stack">
      <Banner tone="neutral" title="Interactive Corporate Admin CLI">
        <p className="kit-small">
          Execute audited operational queries, cross-portal telemetry, bulk checks, and reusable
          Postgres-persisted macros without leaving the browser. Destructive mutations require
          explicit <span className="kit-mono">--yes</span> confirmation.
        </p>
      </Banner>

      {macrosState.status === 'ready' && macrosState.data.length > 0 && (
        <Card
          title={`Saved Macros (${macrosState.data.length})`}
          description="One-click reusable scripts stored securely in Postgres admin_saved_macros."
          actions={
            <Button size="small" variant="quiet" onClick={reloadMacros}>
              Refresh
            </Button>
          }
        >
          <div className="kit-row">
            {macrosState.data.map((macro) => (
              <Button
                key={macro.id}
                size="small"
                variant="quiet"
                disabled={busy}
                title={macro.command_script}
                onClick={() => execute(`macro run "${macro.name}"`)}
              >
                {macro.name}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <div className="kit-terminal">
        <div
          className="kit-row"
          style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}
        >
          <div className="kit-row">
            <Badge tone="ok">{profile?.role ?? 'staff'}</Badge>
            <span className="kit-small" style={{ color: '#94a3b8' }}>
              RPC Shell · audit_log active
            </span>
          </div>
          <div className="kit-row">
            <Button size="small" variant="quiet" onClick={() => execute('telemetry')}>
              telemetry
            </Button>
            <Button size="small" variant="quiet" onClick={() => execute('audit --limit 15')}>
              audit --limit 15
            </Button>
            <Button size="small" variant="quiet" onClick={() => setTranscript([])}>
              clear
            </Button>
          </div>
        </div>

        <div ref={outRef} className="kit-terminal-out" aria-live="polite">
          {transcript.map((item) => (
            <div key={item.id} style={{ borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
              <div className="kit-row" style={{ justifyContent: 'space-between' }}>
                <span style={{ color: '#38bdf8' }}>$ {item.command}</span>
                <div className="kit-row">
                  {item.csv && <CopyButton value={item.csv} label="Copy CSV" />}
                  <CopyButton value={item.output} label="Copy" />
                </div>
              </div>
              <pre
                style={{
                  margin: '4px 0 0',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  color:
                    item.status === 'error'
                      ? '#fda4af'
                      : item.status === 'info'
                        ? '#cbd5e1'
                        : '#d9f99d',
                }}
              >
                {item.output}
              </pre>
            </div>
          ))}
        </div>

        <form
          className="kit-terminal-prompt"
          onSubmit={(event) => {
            event.preventDefault();
            execute(input);
          }}
        >
          <span style={{ color: '#2dd4bf', fontWeight: 700 }}>&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            disabled={busy}
            aria-label="CLI command input"
            placeholder='Type command (e.g. "telemetry", "audit --limit 20", "help")...'
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                const nextIdx = Math.min(historyCursor + 1, history.length - 1);
                if (history[nextIdx] !== undefined) {
                  setHistoryCursor(nextIdx);
                  setInput(history[nextIdx]);
                }
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                const nextIdx = historyCursor - 1;
                if (nextIdx < 0) {
                  setHistoryCursor(-1);
                  setInput('');
                } else if (history[nextIdx] !== undefined) {
                  setHistoryCursor(nextIdx);
                  setInput(history[nextIdx]);
                }
              } else if (event.key === 'Tab') {
                const first = suggestions[0];
                if (first) {
                  event.preventDefault();
                  setInput(first.command + ' ');
                }
              }
            }}
          />
          <Button type="submit" size="small" disabled={busy || input.trim() === ''}>
            {busy ? 'Running' : 'Run'}
          </Button>
        </form>

        {suggestions.length > 0 && (
          <div className="kit-row" style={{ marginTop: 'var(--sp-2)' }}>
            {suggestions.slice(0, 6).map((spec) => (
              <button
                key={spec.signature}
                type="button"
                className="kit-btn kit-btn--quiet kit-btn--small"
                style={{ color: '#94a3b8', borderColor: '#334155' }}
                onClick={() => {
                  setInput(spec.command + ' ');
                  inputRef.current?.focus();
                }}
              >
                {spec.command}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export default CliConsole;
