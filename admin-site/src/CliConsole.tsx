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

    const [verb, sub, ...rest] = parsed.positional;
    if (!verb) return;

    if (verb === 'clear') {
      setTranscript([]);
      return;
    }

    if (verb === 'help') {
      const lines = CLI_COMMANDS.map(
        (c) => `${c.signature.padEnd(54, ' ')} — ${c.summary}${c.destructive ? ' [--yes]' : ''}`,
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

    if (verb === 'audit') {
      const action = typeof parsed.flags['action'] === 'string' ? parsed.flags['action'] : '';
      const actor = typeof parsed.flags['actor'] === 'string' ? parsed.flags['actor'] : '';
      const subject = typeof parsed.flags['subject'] === 'string' ? parsed.flags['subject'] : '';
      const limit = Number(parsed.flags['limit'] ?? 25);
      const rows = await listRpc<{
        id: number;
        actor_uid: string;
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
            `${r.created_at.slice(0, 19)} | ${r.action.padEnd(24, ' ')} | ${r.actor_uid.slice(0, 12)} | ${r.subject}`,
        )
        .join('\n');
      pushEntry(trimmed, 'ok', formatted || '(0 audit events matched)', csv);
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
