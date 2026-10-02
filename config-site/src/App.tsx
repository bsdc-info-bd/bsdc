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
  parseConfigInput,
  useAsync,
  useCorporateEnv,
  validateConfigValue,
  type ConfigEntry,
} from '@kit';
import {
  describeChange,
  editableText,
  feedWeightDrift,
  toEntry,
  type ConfigRow,
  type HistoryRow,
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
        { id: 'history', label: 'History', render: () => <History /> },
      ]}
    />
  );
}

function useEntries(): ReturnType<typeof useAsync<readonly ConfigEntry[]>> {
  const env = useCorporateEnv();
  const load = useCallback(async () => {
    const rows = await listRpc<ConfigRow>(env, 'site_config_list');
    return rows.map(toEntry);
  }, [env]);
  return useAsync(load, [env]);
}

function Settings(): ReactElement {
  const { state, reload } = useEntries();

  if (state.status === 'loading') return <Loading label="Loading configuration." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Configuration did not load">
        {state.message}
      </Banner>
    );

  const drift = feedWeightDrift(state.data);

  return (
    <div className="kit-stack">
      {drift !== null && drift !== 0 && (
        <Banner tone="warn" title="The feed weights do not add up to one">
          <p className="kit-small">
            They currently total {(1 + drift).toFixed(3)}. Ranking still works, but the weights no
            longer read as shares of a whole.
          </p>
        </Banner>
      )}
      {groupConfig(state.data).map((group) => (
        <Card key={group.name} title={group.name}>
          <div className="kit-grid">
            {group.entries.map((entry) => (
              <Setting key={entry.key} entry={entry} onSaved={reload} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Setting({ entry, onSaved }: { entry: ConfigEntry; onSaved: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [text, setText] = useState(() => editableText(entry));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = text !== editableText(entry);

  const save = (): void => {
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
    setBusy(true);
    setError('');
    callRpc(env, 'set_site_config', { p_key: entry.key, p_value: parsed })
      .then(() => {
        setSaved(true);
        onSaved();
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const boundHint = [
    entry.minValue === null ? '' : `at least ${entry.minValue}`,
    entry.maxValue === null ? '' : `at most ${entry.maxValue}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="kit-stack">
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <strong className="kit-small">{entry.label}</strong>
        {entry.isPublic && <Badge>public</Badge>}
      </div>
      <p className="kit-hint kit-mono">{entry.key}</p>

      {entry.valueType === 'boolean' ? (
        <Select
          label="Value"
          hint={entry.description}
          value={text === 'true' ? 'true' : 'false'}
          onChange={(event) => {
            setText(event.target.value);
            setSaved(false);
          }}
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
          onChange={(event) => {
            setText(event.target.value);
            setSaved(false);
          }}
          options={entry.options.map((option) => ({ value: option, label: option }))}
        />
      ) : entry.valueType === 'json' ? (
        <TextArea
          label="Value"
          hint={entry.description}
          error={error === '' ? undefined : error}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSaved(false);
          }}
        />
      ) : (
        <Field
          label="Value"
          hint={boundHint === '' ? entry.description : `${entry.description} (${boundHint})`}
          error={error === '' ? undefined : error}
          inputMode={entry.valueType === 'number' ? 'decimal' : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSaved(false);
          }}
        />
      )}

      <div className="kit-row">
        <Button size="small" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving' : 'Save'}
        </Button>
        {dirty && (
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              setText(editableText(entry));
              setError('');
            }}
          >
            Discard
          </Button>
        )}
        {saved && !dirty && <span className="kit-hint">Saved.</span>}
      </div>
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

  const revert = (id: number): void => {
    setError('');
    callRpc(env, 'revert_site_config', { p_history_id: id })
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
