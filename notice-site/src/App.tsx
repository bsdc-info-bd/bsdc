import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  AppShell,
  Badge,
  Banner,
  BulkBar,
  Button,
  Card,
  Drawer,
  Empty,
  Field,
  Loading,
  Select,
  SplitPane,
  Table,
  TextArea,
  callRpc,
  computeFieldDiff,
  formatDocCode,
  listRpc,
  messageOf,
  qrSvg,
  relativeTimeLabel,
  rowsToCsv,
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
  filterNotices,
  liveState,
  liveStateTone,
  noticeFilename,
  noticeRevisionArgs,
  paragraphs,
  rowToDraft,
  scheduleSummary,
  sortNotices,
  type NoticeAckRosterRow,
  type NoticeAudience,
  type NoticeDraft,
  type NoticePriority,
  type NoticeRevisionRow,
  type NoticeRow,
} from './model';

/**
 * Corporate Official Notice Desk:
 * - Split-Pane Live Composer with side-by-side Proof Preview matching PDF layout
 * - Versioned edits via `save_notice_with_revision` + Revision History & 1-click Revert Drawer
 * - Full lifecycle: Publish, Schedule, Unpublish, Clone, Pin, Archive, PDF, CSV Export
 * - Acknowledgement Roster Drawer showing staff sign-off status per department
 * - Sticky Bulk Operations Bar for multi-notice publishing, pinning, priority, and archiving
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="manager"
      note="Official notices track full editorial revisions, verification codes, and member/staff acknowledgements."
      tabs={[{ id: 'notices', label: 'Notices & Composer', render: () => <Notices /> }]}
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
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState('');

  const [historyRow, setHistoryRow] = useState<NoticeRow | null>(null);
  const [rosterRow, setRosterRow] = useState<NoticeRow | null>(null);

  if (state.status === 'loading') return <Loading label="Loading official notices." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="Notices did not load">
        {state.message}
      </Banner>
    );
  }

  const ordered = sortNotices(state.data);
  const visible = filterNotices(ordered, search, stateFilter, audienceFilter);

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runBulk = async (
    action:
      'publish' | 'archive' | 'unpublish' | 'pin' | 'unpin' | 'urgent' | 'important' | 'routine',
  ): Promise<void> => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    setBulkFeedback('');
    try {
      const updated = await callRpc<number>(env, 'bulk_notice_action', {
        p_ids: selected,
        p_action: action,
        p_publish_at: action === 'publish' ? new Date().toISOString() : null,
      });
      setBulkFeedback(`Applied "${action}" to ${updated} notice(s).`);
      setSelected([]);
      reload();
    } catch (cause) {
      setBulkFeedback(messageOf(cause));
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = (): void => {
    const csv = rowsToCsv(
      [
        'code',
        'title',
        'category',
        'audience',
        'priority',
        'status',
        'pinned',
        'version',
        'acknowledgements',
      ],
      visible.map((r) => [
        r.code,
        r.title,
        r.category,
        r.audience,
        r.priority,
        liveState(r),
        r.pinned,
        r.version ?? 1,
        r.acknowledgements,
      ]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bsdc-official-notices.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="kit-stack">
      <Composer
        key={editing?.id ?? 'new'}
        existing={editing}
        portalUrl={env.verificationUrl}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
        onCancel={() => setEditing(null)}
      />

      <Card
        title={`Official Notice Ledger (${visible.length} / ${ordered.length})`}
        description="Search notices, filter by live visibility state or audience, inspect revision diffs or ack rosters, or bulk manage multiple entries."
        actions={
          <div className="kit-row">
            <Button size="small" variant="quiet" onClick={reload}>
              Refresh
            </Button>
            {visible.length > 0 && (
              <Button size="small" variant="quiet" onClick={exportCsv}>
                Export CSV ({visible.length})
              </Button>
            )}
          </div>
        }
      >
        <div className="kit-grid">
          <Field
            label="Search notices"
            placeholder="Code, title, summary, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            label="State"
            value={stateFilter}
            options={[
              { value: 'all', label: 'All states' },
              { value: 'live', label: 'Live' },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'draft', label: 'Draft' },
              { value: 'expired', label: 'Expired' },
              { value: 'archived', label: 'Archived' },
            ]}
            onChange={(e) => setStateFilter(e.target.value)}
          />
          <Select
            label="Audience"
            value={audienceFilter}
            options={[
              { value: 'all', label: 'All audiences' },
              ...AUDIENCES.map((a) => ({ value: a, label: a })),
            ]}
            onChange={(e) => setAudienceFilter(e.target.value)}
          />
        </div>
      </Card>

      {bulkFeedback !== '' && (
        <Banner tone="neutral" title="Batch Action Complete">
          <p className="kit-small">{bulkFeedback}</p>
        </Banner>
      )}

      {visible.length === 0 ? (
        <Empty>No notices match the current filter.</Empty>
      ) : (
        <div className="kit-stack">
          {visible.map((row) => (
            <NoticeCard
              key={row.id}
              row={row}
              env={env}
              selected={selected.includes(row.id)}
              onToggleSelect={() => toggle(row.id)}
              onEdit={() => {
                setEditing(row);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenHistory={() => setHistoryRow(row)}
              onOpenRoster={() => setRosterRow(row)}
              onChanged={reload}
            />
          ))}
        </div>
      )}

      <BulkBar selectedCount={selected.length} onClear={() => setSelected([])}>
        <Button
          size="small"
          disabled={bulkBusy}
          onClick={() => {
            void runBulk('publish');
          }}
        >
          Publish
        </Button>
        <Button
          size="small"
          variant="quiet"
          disabled={bulkBusy}
          onClick={() => {
            void runBulk('unpublish');
          }}
        >
          Unpublish
        </Button>
        <Button
          size="small"
          variant="quiet"
          disabled={bulkBusy}
          onClick={() => {
            void runBulk('pin');
          }}
        >
          Pin
        </Button>
        <Button
          size="small"
          variant="quiet"
          disabled={bulkBusy}
          onClick={() => {
            void runBulk('unpin');
          }}
        >
          Unpin
        </Button>
        <Button
          size="small"
          variant="danger"
          disabled={bulkBusy}
          onClick={() => {
            void runBulk('archive');
          }}
        >
          Archive
        </Button>
      </BulkBar>

      <Drawer
        open={historyRow !== null}
        title={historyRow ? `Revisions — ${historyRow.code}` : ''}
        subtitle={
          historyRow
            ? `Current version v${historyRow.version ?? 1} · ${historyRow.title}`
            : undefined
        }
        onClose={() => setHistoryRow(null)}
      >
        {historyRow && (
          <NoticeHistoryDrawer
            row={historyRow}
            onReverted={() => {
              setHistoryRow(null);
              reload();
            }}
          />
        )}
      </Drawer>

      <Drawer
        open={rosterRow !== null}
        title={rosterRow ? `Acknowledgement Roster — ${rosterRow.code}` : ''}
        subtitle={rosterRow ? rosterRow.title : undefined}
        onClose={() => setRosterRow(null)}
      >
        {rosterRow && <AckRosterDrawer row={rosterRow} />}
      </Drawer>
    </div>
  );
}

function NoticeCard({
  row,
  env,
  selected,
  onToggleSelect,
  onEdit,
  onOpenHistory,
  onOpenRoster,
  onChanged,
}: {
  row: NoticeRow;
  env: CorporateEnv;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onOpenHistory: () => void;
  onOpenRoster: () => void;
  onChanged: () => void;
}): ReactElement {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [when, setWhen] = useState('');
  const state = liveState(row);
  const progress = ackProgress(row);
  const portal = env.verificationUrl;

  const publish = (): void => {
    setError('');
    setBusy(true);
    callRpc(env, 'publish_notice', {
      p_id: row.id,
      p_publish_at: when === '' ? new Date().toISOString() : new Date(when).toISOString(),
    })
      .then(onChanged)
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  const unpublish = (): void => {
    setError('');
    setBusy(true);
    callRpc(env, 'unpublish_notice', {
      p_id: row.id,
      p_reason: 'Withdrawn to draft by notice desk operator',
    })
      .then(onChanged)
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  const clone = (): void => {
    setError('');
    setBusy(true);
    callRpc<string>(env, 'clone_notice', { p_id: row.id })
      .then(onChanged)
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  const archive = (): void => {
    setError('');
    setBusy(true);
    callRpc(env, 'archive_notice', { p_id: row.id })
      .then(onChanged)
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <Card
      title={row.title}
      description={row.summary}
      actions={
        <span className="kit-row">
          <label className="kit-row kit-small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} />
            <span>Select</span>
          </label>
          <Badge>v{row.version ?? 1}</Badge>
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

      <p className="kit-small kit-muted kit-mono">
        {formatDocCode(row.code)} · {row.category}
      </p>
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
        <summary className="kit-small">Read full notice body</summary>
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
              onChange={(event) => setWhen(event.target.value)}
            />
            <Button size="small" disabled={busy} onClick={publish}>
              Publish
            </Button>
          </>
        )}
        {(state === 'live' || state === 'scheduled') && (
          <Button size="small" variant="quiet" disabled={busy} onClick={unpublish}>
            Unpublish
          </Button>
        )}
        <Button size="small" variant="quiet" onClick={onEdit}>
          Edit
        </Button>
        <Button size="small" variant="quiet" onClick={onOpenHistory}>
          History
        </Button>
        {row.requires_ack && (
          <Button size="small" variant="quiet" onClick={onOpenRoster}>
            Ack Roster
          </Button>
        )}
        <Button size="small" variant="quiet" disabled={busy} onClick={clone}>
          Clone
        </Button>
        <Button
          size="small"
          variant="quiet"
          disabled={printing}
          onClick={() => {
            setError('');
            setPrinting(true);
            void Promise.all([import('./notice-pdf'), import('@kit/pdf')])
              .then(([notice, pdf]) => {
                pdf.downloadPdf(
                  notice.buildNoticePdf(notice.printFromRow(row, portal)),
                  noticeFilename(row.code, row.title),
                );
              })
              .catch((cause: unknown) => setError(messageOf(cause)))
              .finally(() => setPrinting(false));
          }}
        >
          {printing ? 'Preparing…' : 'PDF'}
        </Button>
        {row.status !== 'archived' && (
          <Button size="small" variant="danger" disabled={busy} onClick={archive}>
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
  portalUrl,
  onSaved,
  onCancel,
}: {
  existing: NoticeRow | null;
  portalUrl: string;
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
    void callRpc<string>(
      env,
      'save_notice_with_revision',
      noticeRevisionArgs(existing?.id ?? null, draft),
    )
      .then(() => {
        setDraft(EMPTY_DRAFT);
        onSaved();
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  const previewBlocks = useMemo(() => paragraphs(draft.body), [draft.body]);

  return (
    <SplitPane
      primary={
        <Card
          title={
            existing
              ? `Editing ${existing.code} (v${existing.version ?? 1})`
              : 'New Official Notice'
          }
          description="Every edit records a snapshot in notice_revisions so published wording remains auditable and revertible."
          actions={
            existing ? (
              <Button size="small" variant="quiet" onClick={onCancel}>
                Cancel editing
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
              onChange={(event) => set({ title: event.target.value })}
            />
            <Field
              label="Summary"
              hint="One line shown in public and member lists."
              value={draft.summary}
              onChange={(event) => set({ summary: event.target.value })}
            />
            <TextArea
              label="Body"
              hint="Separate paragraphs with a blank line."
              rows={7}
              value={draft.body}
              onChange={(event) => set({ body: event.target.value })}
            />
            <div className="kit-grid">
              <Field
                label="Category"
                value={draft.category}
                onChange={(event) => set({ category: event.target.value })}
              />
              <Select
                label="Audience"
                hint={audienceLabel(draft.audience)}
                value={draft.audience}
                onChange={(event) => set({ audience: event.target.value as NoticeAudience })}
                options={AUDIENCES.map((item) => ({ value: item, label: item }))}
              />
              <Select
                label="Priority"
                value={draft.priority}
                onChange={(event) => set({ priority: event.target.value as NoticePriority })}
                options={PRIORITIES.map((item) => ({ value: item, label: item }))}
              />
              <Field
                label="Publish at (optional schedule)"
                type="datetime-local"
                value={draft.publishAt}
                onChange={(event) => set({ publishAt: event.target.value })}
              />
              <Field
                label="Expires at (optional)"
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(event) => set({ expiresAt: event.target.value })}
              />
              <Select
                label="Pinned"
                value={draft.pinned ? 'yes' : 'no'}
                onChange={(event) => set({ pinned: event.target.value === 'yes' })}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ]}
              />
              <Select
                label="Ask for acknowledgement"
                value={draft.requiresAck ? 'yes' : 'no'}
                onChange={(event) => set({ requiresAck: event.target.value === 'yes' })}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ]}
              />
            </div>

            {existing && (
              <Field
                label="Editorial revision note"
                placeholder="Summarize what changed for the revision log"
                value={draft.editNote}
                onChange={(event) => set({ editNote: event.target.value })}
              />
            )}
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
              {busy ? 'Saving' : existing ? 'Save Revision' : 'Save Draft'}
            </Button>
          </div>
        </Card>
      }
      secondary={
        <Card
          title="Live Document Proof"
          description="Parity view with PDF & public verification rendering."
        >
          <div
            className="kit-row"
            style={{ justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}
          >
            <Badge>{draft.category || 'general'}</Badge>
            <Badge
              tone={
                draft.priority === 'urgent'
                  ? 'bad'
                  : draft.priority === 'important'
                    ? 'warn'
                    : 'neutral'
              }
            >
              {draft.priority}
            </Badge>
          </div>
          <p className="kit-mono kit-small kit-muted">
            {existing ? formatDocCode(existing.code) : 'BSDC-NT-XXXXXXXX-X (assigned on save)'}
          </p>
          <h3 style={{ marginTop: 'var(--sp-2)' }}>{draft.title || 'Untitled Notice'}</h3>
          <p className="kit-small kit-muted">{draft.summary || 'Summary line appears here...'}</p>
          <hr style={{ borderColor: 'var(--c-line)', margin: 'var(--sp-3) 0' }} />
          {previewBlocks.length === 0 ? (
            <p className="kit-small kit-muted">Paragraphs will appear here as you compose.</p>
          ) : (
            previewBlocks.map((p, idx) => (
              <p key={idx} className="kit-small">
                {p}
              </p>
            ))
          )}
          <hr style={{ borderColor: 'var(--c-line)', margin: 'var(--sp-3) 0' }} />
          <p className="kit-small kit-muted">
            Verify at {existing ? verificationUrl(portalUrl, existing.code) : portalUrl}
          </p>
        </Card>
      }
    />
  );
}

function NoticeHistoryDrawer({
  row,
  onReverted,
}: {
  readonly row: NoticeRow;
  readonly onReverted: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    () => listRpc<NoticeRevisionRow>(env, 'notice_history', { p_notice_id: row.id }),
    [env, row.id],
  );
  const { state } = useAsync(load, [env, row.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const revert = (version: number): void => {
    setBusy(true);
    setError('');
    void callRpc<number>(env, 'revert_notice_revision', {
      p_notice_id: row.id,
      p_version: version,
      p_note: `Restored v${version} via Official Notice Desk`,
    })
      .then(() => onReverted())
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="Revert failed">
          {error}
        </Banner>
      )}
      {state.status === 'loading' && <Loading label="Loading editorial revisions." />}
      {state.status === 'error' && (
        <Banner tone="bad" title="Could not load history">
          {state.message}
        </Banner>
      )}
      {state.status === 'ready' && state.data.length === 0 && (
        <Empty>No prior editorial revisions recorded yet.</Empty>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <div className="kit-stack">
          {state.data.map((rev) => {
            const diffs = computeFieldDiff(
              {
                title: rev.title,
                summary: rev.summary,
                audience: rev.audience,
                priority: rev.priority,
                pinned: String(rev.pinned),
              },
              {
                title: row.title,
                summary: row.summary,
                audience: row.audience,
                priority: row.priority,
                pinned: String(row.pinned),
              },
              ['title', 'summary', 'audience', 'priority', 'pinned'],
            ).filter((d) => d.changed);
            return (
              <Card
                key={rev.id}
                title={`Version v${rev.version}`}
                description={`${rev.edit_note || 'Editorial revision'} · ${relativeTimeLabel(rev.created_at)}`}
                actions={
                  <Button
                    size="small"
                    variant="quiet"
                    disabled={busy}
                    onClick={() => revert(rev.version)}
                  >
                    Revert to v{rev.version}
                  </Button>
                }
              >
                {diffs.length > 0 ? (
                  <ul className="kit-small kit-mono">
                    {diffs.map((d) => (
                      <li key={d.field}>
                        {d.field}: "{d.before}" → "{d.after}"
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="kit-small kit-muted">Body text or schedule updated.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AckRosterDrawer({ row }: { readonly row: NoticeRow }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    () =>
      listRpc<NoticeAckRosterRow>(env, 'notice_ack_roster', { p_notice_id: row.id, p_limit: 250 }),
    [env, row.id],
  );
  const { state } = useAsync(load, [env, row.id]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'ack'>('all');

  if (state.status === 'loading') return <Loading label="Loading staff roster." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="Could not load roster">
        {state.message}
      </Banner>
    );
  }

  const rows = state.data.filter((r) => {
    if (filter === 'pending') return !r.acknowledged;
    if (filter === 'ack') return r.acknowledged;
    return true;
  });

  const exportCsv = (): void => {
    const csv = rowsToCsv(
      ['staff_no', 'display_name', 'department', 'role', 'acknowledged', 'acknowledged_at'],
      rows.map((r) => [
        r.staff_no,
        r.display_name,
        r.department,
        r.role,
        r.acknowledged,
        r.acknowledged_at ?? '',
      ]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${row.code}-ack-roster.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="kit-stack">
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <Select
          label="Status Filter"
          value={filter}
          options={[
            { value: 'all', label: `All active staff (${state.data.length})` },
            {
              value: 'ack',
              label: `Acknowledged (${state.data.filter((x) => x.acknowledged).length})`,
            },
            {
              value: 'pending',
              label: `Pending (${state.data.filter((x) => !x.acknowledged).length})`,
            },
          ]}
          onChange={(e) => setFilter(e.target.value as 'all' | 'pending' | 'ack')}
        />
        <Button size="small" variant="quiet" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <Empty>No staff entries match this filter.</Empty>
      ) : (
        <Table
          caption="Active staff sign-off state"
          head={['Staff No', 'Name', 'Department', 'Status']}
        >
          {rows.map((member) => (
            <tr key={member.uid}>
              <td className="kit-mono kit-small">{member.staff_no}</td>
              <td>{member.display_name}</td>
              <td className="kit-small">{member.department}</td>
              <td>
                <Badge tone={member.acknowledged ? 'ok' : 'warn'}>
                  {member.acknowledged ? 'signed' : 'pending'}
                </Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
