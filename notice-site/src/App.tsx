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
  downloadPdf,
  formatDocCode,
  getDb,
  listRpc,
  messageOf,
  qrSvg,
  toDataError,
  useAsync,
  useCorporateEnv,
  verificationUrl,
  type CorporateEnv,
} from '@kit';
import {
  AUDIENCES,
  EMPTY_DRAFT,
  PRIORITIES,
  ackProgress,
  audienceLabel,
  draftProblems,
  draftToRow,
  liveState,
  liveStateTone,
  noticeFilename,
  paragraphs,
  rowToDraft,
  scheduleSummary,
  sortNotices,
  type NoticeAudience,
  type NoticeDraft,
  type NoticePriority,
  type NoticeRow,
} from './model';
import { buildNoticePdf, printFromRow } from './notice-pdf';

/**
 * The notice builder. A notice carries its number from the moment it is
 * drafted, so the page being proof-read is the page that will be printed,
 * and it becomes visible when its publish time arrives rather than when
 * somebody remembers to press a button at midnight.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="manager"
      note="A published notice is visible to its audience as soon as its time arrives."
      tabs={[{ id: 'notices', label: 'Notices', render: () => <Notices /> }]}
    />
  );
}

function Notices(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    () => listRpc<NoticeRow>(env, 'notice_registry', { p_limit: 200 }),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);
  const [editing, setEditing] = useState<NoticeRow | null>(null);

  if (state.status === 'loading') return <Loading label="Loading notices." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Notices did not load">
        {state.message}
      </Banner>
    );

  const ordered = sortNotices(state.data);

  return (
    <div className="kit-stack">
      <Composer
        key={editing?.id ?? 'new'}
        existing={editing}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
        onCancel={() => {
          setEditing(null);
        }}
      />

      {ordered.length === 0 ? (
        <Empty>No notices yet. The first draft you save will appear here.</Empty>
      ) : (
        <div className="kit-stack">
          {ordered.map((row) => (
            <NoticeCard
              key={row.id}
              row={row}
              env={env}
              onEdit={() => {
                setEditing(row);
              }}
              onChanged={reload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoticeCard({
  row,
  env,
  onEdit,
  onChanged,
}: {
  row: NoticeRow;
  env: CorporateEnv;
  onEdit: () => void;
  onChanged: () => void;
}): ReactElement {
  const [error, setError] = useState('');
  const [when, setWhen] = useState('');
  const state = liveState(row);
  const progress = ackProgress(row);
  const portal = env.siteUrl.replace('www.', 'vf.');

  const publish = (): void => {
    setError('');
    callRpc(env, 'publish_notice', {
      p_id: row.id,
      p_publish_at: when === '' ? new Date().toISOString() : new Date(when).toISOString(),
    })
      .then(onChanged)
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      });
  };

  const archive = (): void => {
    setError('');
    callRpc(env, 'archive_notice', { p_id: row.id })
      .then(onChanged)
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      });
  };

  return (
    <Card
      title={row.title}
      description={row.summary}
      actions={
        <span className="kit-row">
          {row.pinned && <Badge>pinned</Badge>}
          <Badge
            tone={
              row.priority === 'urgent' ? 'bad' : row.priority === 'important' ? 'warn' : 'neutral'
            }
          >
            {row.priority}
          </Badge>
          <Badge tone={liveStateTone(state)}>{state}</Badge>
        </span>
      }
    >
      {error !== '' && (
        <Banner tone="bad" title="That did not work">
          {error}
        </Banner>
      )}

      <p className="kit-small kit-muted kit-mono">{formatDocCode(row.code)}</p>
      <p className="kit-small">{scheduleSummary(row)}</p>
      <p className="kit-hint">
        {audienceLabel(row.audience)}.{' '}
        {row.requires_ack ? progress.label : 'No acknowledgement asked for.'}
      </p>

      {row.requires_ack && row.staff_total > 0 && (
        <div
          className="kit-bars"
          role="img"
          aria-label={progress.label}
          style={{ height: '8px', marginBottom: 'var(--sp-2)' }}
        >
          <span
            className="kit-bar kit-bar--good"
            style={{ flex: `${String(Math.max(progress.percent, 1))} 1 0` }}
          />
          <span className="kit-bar" style={{ flex: `${String(100 - progress.percent)} 1 0` }} />
        </div>
      )}

      <details>
        <summary className="kit-small">Read the notice</summary>
        {paragraphs(row.body).map((block) => (
          <p key={block.slice(0, 40)} className="kit-small">
            {block}
          </p>
        ))}
      </details>

      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        {state === 'draft' && (
          <>
            <Field
              label="Publish at"
              type="datetime-local"
              hint="Leave empty to publish now."
              value={when}
              onChange={(event) => {
                setWhen(event.target.value);
              }}
            />
            <Button size="small" onClick={publish}>
              Publish
            </Button>
          </>
        )}
        <Button size="small" variant="quiet" onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="small"
          variant="quiet"
          onClick={() => {
            downloadPdf(
              buildNoticePdf(printFromRow(row, portal)),
              noticeFilename(row.code, row.title),
            );
          }}
        >
          PDF
        </Button>
        {row.status !== 'archived' && (
          <Button size="small" variant="danger" onClick={archive}>
            Archive
          </Button>
        )}
      </div>

      {state === 'live' && <Share code={row.code} portal={portal} />}
    </Card>
  );
}

function Share({ code, portal }: { code: string; portal: string }): ReactElement {
  const url = verificationUrl(portal, code);
  return (
    <div className="kit-row" style={{ marginTop: 'var(--sp-3)', alignItems: 'flex-start' }}>
      <div style={{ width: '104px' }} dangerouslySetInnerHTML={{ __html: qrSvg(url) }} />
      <p className="kit-small kit-muted">
        Anybody can confirm this notice at <span className="kit-mono">{url}</span>, including people
        who were not signed in when it was published.
      </p>
    </div>
  );
}

function Composer({
  existing,
  onSaved,
  onCancel,
}: {
  existing: NoticeRow | null;
  onSaved: () => void;
  onCancel: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [draft, setDraft] = useState<NoticeDraft>(existing ? rowToDraft(existing) : EMPTY_DRAFT);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const problems = draftProblems(draft);

  const set = (patch: Partial<NoticeDraft>): void => {
    setDraft({ ...draft, ...patch });
  };

  const save = (): void => {
    setBusy(true);
    setError('');
    void (async () => {
      const row = draftToRow(draft);
      const db = getDb(env);
      const { error: cause } = existing
        ? await db.from('notices').update(row).eq('id', existing.id)
        : await db.from('notices').insert({ ...row, status: 'draft' });
      if (cause) {
        setError(toDataError(cause).message);
      } else {
        setDraft(EMPTY_DRAFT);
        onSaved();
      }
      setBusy(false);
    })();
  };

  return (
    <Card
      title={existing ? `Editing ${existing.code}` : 'New notice'}
      description="A notice receives its number as soon as it is saved, so proofs carry the final reference."
      actions={
        existing ? (
          <Button size="small" variant="quiet" onClick={onCancel}>
            Stop editing
          </Button>
        ) : undefined
      }
    >
      {error !== '' && (
        <Banner tone="bad" title="The notice was not saved">
          {error}
        </Banner>
      )}

      <div className="kit-stack">
        <Field
          label="Title"
          value={draft.title}
          onChange={(event) => {
            set({ title: event.target.value });
          }}
        />
        <Field
          label="Summary"
          hint="One line. This is what a reader sees in a list."
          value={draft.summary}
          onChange={(event) => {
            set({ summary: event.target.value });
          }}
        />
        <TextArea
          label="Body"
          hint="Leave a blank line between paragraphs."
          value={draft.body}
          onChange={(event) => {
            set({ body: event.target.value });
          }}
        />
        <div className="kit-grid">
          <Field
            label="Category"
            value={draft.category}
            onChange={(event) => {
              set({ category: event.target.value });
            }}
          />
          <Select
            label="Audience"
            hint={audienceLabel(draft.audience)}
            value={draft.audience}
            onChange={(event) => {
              set({ audience: event.target.value as NoticeAudience });
            }}
            options={AUDIENCES.map((item) => ({ value: item, label: item }))}
          />
          <Select
            label="Priority"
            value={draft.priority}
            onChange={(event) => {
              set({ priority: event.target.value as NoticePriority });
            }}
            options={PRIORITIES.map((item) => ({ value: item, label: item }))}
          />
          <Field
            label="Expires at"
            type="datetime-local"
            hint="Leave empty for a notice that stands until it is archived."
            value={draft.expiresAt}
            onChange={(event) => {
              set({ expiresAt: event.target.value });
            }}
          />
          <Select
            label="Pinned"
            hint="A pinned notice stays at the top of the list."
            value={draft.pinned ? 'yes' : 'no'}
            onChange={(event) => {
              set({ pinned: event.target.value === 'yes' });
            }}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
          <Select
            label="Ask for acknowledgement"
            hint="Only possible when readers are signed in."
            value={draft.requiresAck ? 'yes' : 'no'}
            onChange={(event) => {
              set({ requiresAck: event.target.value === 'yes' });
            }}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
        </div>
      </div>

      {problems.length > 0 && draft.title !== '' && (
        <ul className="kit-error" style={{ marginTop: 'var(--sp-3)' }}>
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button disabled={busy || problems.length > 0} onClick={save}>
          {busy ? 'Saving' : existing ? 'Save changes' : 'Save draft'}
        </Button>
      </div>
    </Card>
  );
}
