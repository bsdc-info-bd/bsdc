import { useCallback, useState, type ReactElement } from 'react';
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Select,
  TextArea,
  callRpc,
  formatConfigValue,
  groupConfig,
  listRpc,
  messageOf,
  relativeTimeLabel,
  parseConfigInput,
  useAsync,
  useCorporateEnv,
  validateConfigValue,
  type ConfigEntry,
} from '@kit';
import {
  describeBlastRadius,
  describeChange,
  editableText,
  feedWeightDrift,
  plannedRoute,
  provenanceOf,
  reasonMessage,
  routeSummary,
  secretState,
  toEntry,
  type BlastRadiusReader,
  type ConsoleRow,
  type HistoryRow,
  type StagedRow,
} from './model';

/**
 * The configuration console. Every value is typed by the database, so this
 * screen can refuse a bad edit with the same rule the database would use —
 * and when the two ever disagree, the database wins and says why.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="admin"
      note="Configuration changes affect the live community immediately."
      tabs={[
        { id: 'settings', label: 'Settings', render: () => <Settings /> },
        { id: 'pending', label: 'Awaiting a decision', render: () => <PendingChanges /> },
        { id: 'history', label: 'History', render: () => <History /> },
      ]}
    />
  );
}

/**
 * The console read, not the public one.
 *
 * `site_config_console()` is the only function that returns provenance, the secret
 * flag and the reader count — and the only one that redacts a secret to a boolean
 * before it leaves the table. Reading `site_config_list` here would show every
 * setting as though an operator had chosen it, and would put a secret in the page.
 */
function useConsole(): ReturnType<typeof useAsync<readonly ConsoleRow[]>> {
  const env = useCorporateEnv();
  const load = useCallback(() => listRpc<ConsoleRow>(env, 'site_config_console'), [env]);
  return useAsync(load, [env]);
}

function useEntries(): ReturnType<typeof useAsync<readonly ConfigEntry[]>> {
  const consoleRows = useConsole();
  return {
    ...consoleRows,
    state:
      consoleRows.state.status === 'ready'
        ? { status: 'ready', data: consoleRows.state.data.map(toEntry) }
        : consoleRows.state,
  } as ReturnType<typeof useAsync<readonly ConfigEntry[]>>;
}

function Setting({ entry, row, onSaved }: { entry: ConfigEntry; row: ConsoleRow; onSaved: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [text, setText] = useState(() => (row.is_secret ? '' : editableText(entry)));
  const [reason, setReason] = useState('');
  const [applyAt, setApplyAt] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRadius, setShowRadius] = useState(false);

  const provenance = provenanceOf(row);
  const secret = secretState(row);
  const route = plannedRoute(row, applyAt);
  const dirty = row.is_secret ? text !== '' : text !== editableText(entry);
  // The kit's message names the actual problem — a placeholder reads differently
  // from a short reason, and telling somebody to type more characters when they
  // wrote "test" teaches them to write "test test test".
  const reasonIssue = reasonMessage(reason);

  const loadRadius = useCallback(
    () => listRpc<BlastRadiusReader>(env, 'config_blast_radius', { p_key: row.key }),
    [env, row.key],
  );
  const radius = useAsync(loadRadius, [showRadius, row.key]);
  const radiusSummary =
    radius.state.status === 'ready'
      ? describeBlastRadius(radius.state.data)
      : { sentence: 'Reading what uses this setting…', orphan: false, count: 0, readers: [] };

  const save = (): void => {
    if (reasonIssue !== null) {
      setError(reasonIssue);
      return;
    }
    let payload: unknown = null;
    if (row.is_secret) {
      if (text === '') {
        setError('Enter the new secret before saving.');
        return;
      }
      payload = text;
    } else {
      const parsed = parseConfigInput(entry.valueType, text);
      if (parsed === undefined) {
        setError(`This key holds a ${entry.valueType} value.`);
        return;
      }
      const check = validateConfigValue(entry, parsed);
      if (!check.ok) {
        setError(check.reason);
        return;
      }
      payload = parsed;
    }

    setBusy(true);
    setError('');
    setResult('');
    callRpc<{ route?: string; needs_approval?: boolean }>(env, 'save_config_setting', {
      p_key: row.key,
      p_value: payload,
      p_reason: reason.trim(),
      p_apply_at: applyAt === '' ? null : new Date(applyAt).toISOString(),
      p_secret: row.is_secret,
    })
      .then((outcome) => {
        // The message names the route the *database* took, not the one the screen
        // planned: a staged change that reported "saved" is how somebody leaves
        // believing a flag is on.
        const took = typeof outcome?.route === 'string' ? outcome.route : route;
        setResult(
          took === 'staged'
            ? 'Staged. The live value has not moved — somebody else has to approve it.'
            : took === 'scheduled'
              ? `Scheduled. The live value changes at ${applyAt}.`
              : 'Saved.',
        );
        setReason('');
        setText(row.is_secret ? '' : text);
        onSaved();
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="kit-stack">
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <strong className="kit-small">{entry.label}</strong>
        <span className="kit-row">
          {entry.isPublic && <Badge>public</Badge>}
          {row.is_secret && <Badge tone="warn">write-only</Badge>}
          {row.requires_approval && <Badge tone="warn">needs approval</Badge>}
          {row.removal_proposed && <Badge tone="warn">removal proposed</Badge>}
          <Badge tone={provenance.chosen ? 'ok' : 'neutral'}>{provenance.label}</Badge>
        </span>
      </div>
      <p className="kit-hint kit-mono">{entry.key}</p>
      <p className="kit-small kit-muted">{provenance.detail}</p>

      {row.is_secret ? (
        <div className="kit-stack">
          <Banner tone={secret.rotationDue ? 'warn' : 'neutral'} title="Secret">
            {secret.summary}
            {secret.rotationDue && ' It is over ninety days old; rotate it.'}
          </Banner>
          <Field
            label={secret.isSet ? 'Replace the secret' : 'Set the secret'}
            type="password"
            hint="A secret is never read back. Saving replaces it and the old value is not kept."
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
      ) : entry.valueType === 'boolean' ? (
        <Select
          label="Value"
          hint={entry.description}
          value={text === 'true' ? 'true' : 'false'}
          onChange={(event) => setText(event.target.value)}
          options={[
            { value: 'true', label: 'On' },
            { value: 'false', label: 'Off' },
          ]}
        />
      ) : entry.options ? (
        <Select
          label="Value"
          hint={entry.description}
          value={text}
          onChange={(event) => setText(event.target.value)}
          options={entry.options.map((option) => ({ value: option, label: option }))}
        />
      ) : entry.valueType === 'json' ? (
        <TextArea
          label="Value"
          hint={entry.description}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      ) : (
        <Field
          label="Value"
          hint={entry.description}
          inputMode={entry.valueType === 'number' ? 'decimal' : undefined}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      )}

      {error !== '' && (
        <Banner tone="bad" title="Not saved">
          {error}
        </Banner>
      )}
      {result !== '' && (
        <Banner tone="ok" title="Written">
          {result}
        </Banner>
      )}

      <div className="kit-grid kit-grid--2">
        <Field
          label="Why this is changing"
          hint="At least twelve characters, and about something specific. This is the first thing read during an incident."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Field
          label="Apply at (optional)"
          type="datetime-local"
          hint="Leave empty to apply on save. A time stages the change until then."
          value={applyAt}
          onChange={(event) => setApplyAt(event.target.value)}
        />
      </div>

      <p className="kit-small kit-muted">{routeSummary(route, row)}</p>

      <div className="kit-row">
        <Button size="small" disabled={!dirty || busy || reasonIssue !== null} onClick={save}>
          {busy ? 'Saving' : route === 'direct' ? 'Save' : route === 'staged' ? 'Propose' : 'Schedule'}
        </Button>
        {dirty && (
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              setText(row.is_secret ? '' : editableText(entry));
              setError('');
            }}
          >
            Discard
          </Button>
        )}
        <Button size="small" variant="quiet" onClick={() => setShowRadius(!showRadius)}>
          {showRadius ? 'Hide blast radius' : 'What uses this?'}
        </Button>
      </div>

      {showRadius && (
        <div className="kit-stack">
          {radius.state.status === 'error' ? (
            <Banner tone="bad" title="Could not read the usage map">
              {radius.state.message}
            </Banner>
          ) : (
            <>
              <p className="kit-small">{radiusSummary.sentence}</p>
              {radius.state.status === 'ready' && radius.state.data.length > 0 && (
                <ul className="kit-small kit-mono">
                  {radius.state.data.map((reader) => (
                    <li key={`${reader.kind}-${reader.reader}`}>
                      {reader.kind}: {reader.reader}
                      {reader.note === '' ? '' : ` — ${reader.note}`}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Settings(): ReactElement {
  const { state, reload } = useConsole();
  const [search, setSearch] = useState('');

  if (state.status === 'loading') return <Loading label="Loading configuration." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Configuration did not load">
        {state.message}
      </Banner>
    );

  const entries = state.data.map(toEntry);
  const drift = feedWeightDrift(entries);
  const byKey = new Map(state.data.map((row) => [row.key, row]));
  const q = search.trim().toLowerCase();
  const filtered =
    q === ''
      ? entries
      : entries.filter(
          (e) =>
            e.key.toLowerCase().includes(q) ||
            e.label.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q),
        );
  const orphans = state.data.filter((row) => row.reader_count === 0);
  const dueSecrets = state.data.filter((row) => row.is_secret && secretState(row).rotationDue);

  return (
    <div className="kit-stack">
      {dueSecrets.length > 0 && (
        <Banner tone="warn" title={`${String(dueSecrets.length)} secret(s) past their rotation`}>
          <ul className="kit-small">
            {dueSecrets.map((row) => (
              <li key={row.key}>{row.key}</li>
            ))}
          </ul>
        </Banner>
      )}
      {drift !== null && drift !== 0 && (
        <Banner tone="warn" title="The feed weights do not add up to one">
          <p className="kit-small">
            They currently total {(1 + drift).toFixed(3)}. Ranking still works, but the weights no
            longer read as shares of a whole.
          </p>
        </Banner>
      )}
      {orphans.length > 0 && (
        <Banner tone="warn" title={`${String(orphans.length)} setting(s) nothing reads`}>
          <p className="kit-small">
            {orphans.map((row) => row.key).join(', ')}
          </p>
          <p className="kit-small kit-muted">
            This is a proposal to review, not a cleanup: a reader that has not been mapped looks
            exactly like a reader that does not exist.
          </p>
        </Banner>
      )}
      <Card
        title={`Search Settings (${String(filtered.length)} / ${String(entries.length)})`}
        description="Filter across configuration keys, labels, and descriptions."
      >
        <Field
          label="Search keys"
          placeholder="e.g. feed.weight, ad., security..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>
      {filtered.length === 0 ? (
        <Empty>No settings match “{search}”.</Empty>
      ) : (
        groupConfig(filtered).map((group) => (
          <Card key={group.name} title={group.name}>
            <div className="kit-grid">
              {group.entries.map((entry) => {
                const row = byKey.get(entry.key);
                return row ? (
                  <Setting key={entry.key} entry={entry} row={row} onSaved={reload} />
                ) : null;
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

/**
 * §12.1's staging, as a screen.
 *
 * A change that needs a second person is only a safeguard if the second person can
 * find it. This lists what is waiting, says plainly whether *you* may decide it, and
 * separates the two kinds: a proposal needs approval, a schedule needs only to not be
 * forgotten.
 */
function PendingChanges(): ReactElement {
  const env = useCorporateEnv();
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () => listRpc<StagedRow>(env, 'config_pending_changes', { p_limit: 100 }),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  const act = (row: StagedRow, approve: boolean): void => {
    setError('');
    setBusy(true);
    callRpc(env, 'decide_config_change', {
      p_id: row.id,
      p_approve: approve,
      p_note: note.trim(),
    })
      .then(() => {
        setNote('');
        reload();
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  const cancel = (row: StagedRow): void => {
    setError('');
    setBusy(true);
    callRpc(env, 'cancel_config_change', {
      p_id: row.id,
      p_reason: note.trim() === '' ? 'Cancelled from the console' : note.trim(),
    })
      .then(() => {
        setNote('');
        reload();
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  if (state.status === 'loading') return <Loading label="Loading staged changes." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="Could not load staged changes">
        {state.message}
      </Banner>
    );
  }

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="Refused">
          {error}
        </Banner>
      )}
      <Card
        title="Note for the decision"
        description="Stored with the change. An approval with no note is a click nobody can review."
      >
        <Field label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
      </Card>

      {state.data.length === 0 ? (
        <Empty>Nothing is waiting. A change that needs approval will appear here.</Empty>
      ) : (
        state.data.map((row) => {
          // `can_decide` and `blocker` come from the same function that enforces the
          // rule, so the button and the refusal cannot disagree.
          const isSchedule = row.apply_at !== null;
          return (
            <Card
              key={row.id}
              title={`${row.key} → ${formatConfigValue('json', row.proposed_value)}`}
              description={
                isSchedule
                  ? `Scheduled. It applies at ${String(row.apply_at)} unless somebody cancels it.`
                  : row.can_decide
                    ? 'Waiting for approval. You can decide this.'
                    : row.blocker
              }
            >
              <div className="kit-stack">
                <p className="kit-small">
                  <strong>Why:</strong> {row.reason}
                </p>
                <p className="kit-small kit-muted">
                  Proposed {relativeTimeLabel(row.proposed_at)} by {row.proposed_by}
                  {isSchedule && ` · applies at ${String(row.apply_at)}`}
                </p>
                <div className="kit-row">
                  {!isSchedule && row.can_decide && (
                    <>
                      <Button size="small" disabled={busy} onClick={() => act(row, true)}>
                        Approve
                      </Button>
                      <Button
                        size="small"
                        variant="danger"
                        disabled={busy}
                        onClick={() => act(row, false)}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {!isSchedule && !row.can_decide && (
                    <span className="kit-hint">{row.blocker}</span>
                  )}
                  <Button size="small" variant="quiet" disabled={busy} onClick={() => cancel(row)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

function History(): ReactElement {
  const env = useCorporateEnv();
  const entries = useEntries();
  const [key, setKey] = useState('');

  const load = useCallback(async () => {
    if (key === '') return [] as readonly HistoryRow[];
    return listRpc<HistoryRow>(env, 'site_config_history_for', { p_key: key, p_limit: 50 });
  }, [env, key]);
  const { state, reload } = useAsync(load, [env, key]);

  if (entries.state.status !== 'ready') return <Loading label="Loading keys." />;

  const options = [
    { value: '', label: 'Choose a setting' },
    ...entries.state.data.map((entry) => ({
      value: entry.key,
      label: `${entry.key} — ${entry.label}`,
    })),
  ];
  const selected = entries.state.data.find((entry) => entry.key === key) ?? null;

  return (
    <div className="kit-stack">
      <Card
        title="Change history"
        description="Every configuration change keeps its record, including who made it and what it replaced."
      >
        <Select
          label="Setting"
          value={key}
          options={options}
          onChange={(event) => {
            setKey(event.target.value);
          }}
        />
      </Card>

      {key === '' ? (
        <Empty>Choose a setting to see how it reached its current value.</Empty>
      ) : state.status === 'loading' ? (
        <Loading label="Loading history." />
      ) : state.status === 'error' ? (
        <Banner tone="bad" title="History did not load">
          {state.message}
        </Banner>
      ) : state.data.length === 0 ? (
        <Empty>This setting has never been changed.</Empty>
      ) : (
        <Table rows={state.data} entry={selected} onReverted={reload} />
      )}
    </div>
  );
}

function Table({
  rows,
  entry,
  onReverted,
}: {
  rows: readonly HistoryRow[];
  entry: ConfigEntry | null;
  onReverted: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [error, setError] = useState('');
  const [revertReason, setRevertReason] = useState('');

  // §12.1: "Rollback restores the previous value and is itself revertible". The
  // older `revert_site_config` wrote its history row through `set_site_config`,
  // which does not record the route, so a revert and an edit looked identical
  // afterwards. `rollback_config` goes through the one write path and marks it.
  const revert = (id: number): void => {
    setError('');
    callRpc(env, 'rollback_config', {
      p_history_id: id,
      p_reason: revertReason.trim() === '' ? '' : revertReason.trim(),
    })
      .then(onReverted)
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      });
  };

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="Revert failed">
          {error}
        </Banner>
      )}
      <Field
        label="Why this is being rolled back"
        hint="Optional here, but stored with the change. A revert with no reason is the one nobody can explain three months later."
        value={revertReason}
        onChange={(event) => setRevertReason(event.target.value)}
      />
      <div className="kit-tablewrap">
        <table className="kit-table">
          <caption
            className="kit-small kit-muted"
            style={{ captionSide: 'top', padding: 'var(--sp-2)' }}
          >
            Newest change first. Reverting writes a new change rather than erasing one.
          </caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">What changed</th>
              <th scope="col">Revert</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="kit-small">{new Date(row.changed_at).toLocaleString('en-GB')}</td>
                <td className="kit-small kit-mono">{row.changed_by ?? 'system'}</td>
                <td className="kit-small">
                  {entry
                    ? describeChange(entry.valueType, row)
                    : `set to ${formatConfigValue('string', row.new_value)}`}
                </td>
                <td>
                  <Button
                    size="small"
                    variant="quiet"
                    disabled={row.old_value === null || row.old_value === undefined}
                    onClick={() => {
                      revert(row.id);
                    }}
                  >
                    Revert to previous
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
