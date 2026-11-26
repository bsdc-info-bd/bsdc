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
  SECTION_KINDS,
  Select,
  TextArea,
  callRpc,
  getDb,
  isValidSlug,
  listRpc,
  messageOf,
  moveSection,
  publishBlockers,
  reasonMessage,
  relativeTimeLabel,
  sectionKindLabel,
  slugify,
  toDataError,
  useAsync,
  useCorporateEnv,
  type CorporateEnv,
  type PageSection,
  type SectionKind,
} from '@kit';
import {
  describeVersions,
  fieldText,
  localSlugCheck,
  fieldsFor,
  newPayload,
  publishProblems,
  publishSummary,
  sectionSummary,
  toSection,
  windowSummary,
  withField,
  type PageRow,
  type SectionRow,
} from './model';

/**
 * The page composer. Sections are reordered by the database, so what this
 * screen shows after a move is what every other editor will see too.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="admin"
      note="Published pages are public immediately."
      tabs={[{ id: 'pages', label: 'Pages', render: () => <Pages /> }]}
    />
  );
}

async function loadPages(env: CorporateEnv): Promise<readonly PageRow[]> {
  const { data, error } = await getDb(env)
    .from('custom_pages')
    .select(
      'id, slug, title, description, status, noindex, updated_at, current_version, publish_at, unpublish_at',
    )
    .order('updated_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as PageRow[];
}

async function loadSections(env: CorporateEnv, pageId: string): Promise<readonly PageSection[]> {
  const { data, error } = await getDb(env)
    .from('page_sections')
    .select('id, page_id, kind, position, payload, is_visible')
    .eq('page_id', pageId)
    .order('position', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as SectionRow[]).map(toSection);
}

function Pages(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => loadPages(env), [env]);
  const { state, reload } = useAsync(load, [env]);
  const [openId, setOpenId] = useState<string | null>(null);

  if (state.status === 'loading') return <Loading label="Loading pages." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Pages did not load">
        {state.message}
      </Banner>
    );

  const open = state.data.find((page) => page.id === openId) ?? null;

  return (
    <div className="kit-stack">
      <NewPage onCreated={reload} />
      {state.data.length === 0 ? (
        <Empty>No pages yet. The first one you create will appear here.</Empty>
      ) : (
        <Card title="Pages" description="Choose a page to compose it.">
          <div className="kit-tablewrap">
            <table className="kit-table">
              <caption
                className="kit-small kit-muted"
                style={{ captionSide: 'top', padding: 'var(--sp-2)' }}
              >
                Most recently edited first.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Address</th>
                  <th scope="col">State</th>
                  <th scope="col">Compose</th>
                </tr>
              </thead>
              <tbody>
                {state.data.map((page) => (
                  <tr key={page.id}>
                    <td>{page.title}</td>
                    <td className="kit-mono kit-small">/{page.slug}</td>
                    <td>
                      <Badge tone={page.status === 'published' ? 'ok' : 'neutral'}>
                        {page.status}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        size="small"
                        variant="quiet"
                        onClick={() => {
                          setOpenId(page.id === openId ? null : page.id);
                        }}
                      >
                        {page.id === openId ? 'Close' : 'Open'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {open && <Composer page={open} onChanged={reload} />}
      {open && <PublishPanel page={open} onChanged={reload} />}
    </div>
  );
}

/**
 * §12.2's publish panel.
 *
 * Publishing is the moment a page stops being a draft and starts being what a
 * stranger sees, so the panel answers three questions before the button is pressed
 * rather than after: what would stop it, when does it stop being published by itself,
 * and what did the last three publishes look like.
 */
function PublishPanel({ page, onChanged }: { page: PageRow; onChanged: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [unpublishAt, setUnpublishAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const versions = useAsync(
    useCallback(
      () => listRpc<VersionRow>(env, 'custom_page_versions', { p_page_id: page.id }),
      [env, page.id],
    ),
    [env, page.id],
  );

  const raw = useAsync(
    useCallback(async () => {
      const { data, error: cause } = await getDb(env)
        .from('page_sections')
        .select('kind, position, payload, is_visible')
        .eq('page_id', page.id)
        .order('position', { ascending: true });
      if (cause) throw toDataError(cause);
      return (data ?? []) as readonly {
        kind: SectionKind;
        position: number;
        payload: Record<string, unknown>;
        is_visible: boolean;
      }[];
    }, [env, page.id]),
    [env, page.id],
  );

  const problems = raw.state.status === 'ready' ? publishProblems(raw.state.data) : [];
  const sectionCount = raw.state.status === 'ready' ? raw.state.data.length : 0;
  const canPublish = raw.state.status === 'ready' && problems.length === 0 && sectionCount > 0;

  const publish = (): void => {
    setError('');
    setResult('');
    setBusy(true);
    callRpc(env, 'publish_custom_page', {
      p_page_id: page.id,
      p_publish_at: null,
      p_unpublish_at: unpublishAt === '' ? null : new Date(unpublishAt).toISOString(),
    })
      .then(() => {
        setResult(
          unpublishAt === ''
            ? 'Published. It stays published until somebody changes it.'
            : `Published, and it will unpublish itself at ${unpublishAt}.`,
        );
        onChanged();
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  const revert = (version: number): void => {
    const issue = reasonMessage(reason);
    if (issue !== null) {
      setError(issue);
      return;
    }
    setError('');
    setResult('');
    setBusy(true);
    callRpc(env, 'revert_custom_page', {
      p_page_id: page.id,
      p_version: version,
      p_reason: reason.trim(),
    })
      .then(() => {
        // A revert deliberately leaves the page as a draft: republishing it through
        // the validator is a separate decision, because a version that was valid in
        // March is not automatically valid now.
        setResult(
          `Reverted to version ${String(version)}. The page is a draft again — publish it to put it back on the site.`,
        );
        setReason('');
        onChanged();
      })
      .catch((cause: unknown) => setError(messageOf(cause)))
      .finally(() => setBusy(false));
  };

  const views =
    versions.state.status === 'ready'
      ? describeVersions(versions.state.data, page.current_version ?? 0)
      : [];

  return (
    <Card
      title="Publish"
      description="A page goes live only when every section passes its own check, and it can be given an end date so it takes itself down."
    >
      <div className="kit-stack">
        {error !== '' && (
          <Banner tone="bad" title="Not published">
            {error}
          </Banner>
        )}
        {result !== '' && (
          <Banner tone="ok" title="Done">
            {result}
          </Banner>
        )}

        {page.status === 'published' && (
          <Banner tone="ok" title="This page is live">
            {windowSummary(page.publish_at ?? null, page.unpublish_at ?? null)}
          </Banner>
        )}

        {problems.length > 0 && (
          <Banner
            tone="warn"
            title={`${String(problems.length)} section(s) would stop the publish`}
          >
            <ul className="kit-small">
              {problems.map((problem) => (
                <li key={`${String(problem.position)}-${problem.kind}`}>
                  Section {String(problem.position + 1)} ({sectionKindLabel(problem.kind)}):{' '}
                  {problem.problem}
                </li>
              ))}
            </ul>
          </Banner>
        )}

        <p className="kit-small">{publishSummary(problems, sectionCount, unpublishAt)}</p>

        <div className="kit-grid kit-grid--2">
          <Field
            label="Unpublish at (optional)"
            type="datetime-local"
            hint="A page with an end takes itself down. A page without one stays up until somebody remembers."
            value={unpublishAt}
            onChange={(event) => setUnpublishAt(event.target.value)}
          />
          <Field
            label="Reason (for a revert)"
            hint="Stored with the new version. At least twelve characters, and about something specific."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <div className="kit-row">
          <Button size="small" disabled={busy || !canPublish} onClick={publish}>
            {busy ? 'Working' : page.status === 'published' ? 'Republish' : 'Publish'}
          </Button>
        </div>

        <p className="kit-hint">
          Publishing writes a version. Every version is kept, and reverting writes a new one rather
          than deleting the ones after it — so a wrong revert is itself revertible.
        </p>

        {versions.state.status === 'error' && (
          <Banner tone="bad" title="Could not read the version history">
            {versions.state.message}
          </Banner>
        )}
        {views.length === 0 && versions.state.status === 'ready' && (
          <Empty>This page has never been published.</Empty>
        )}
        {views.length > 0 && (
          <div className="kit-stack">
            {views.map((view) => (
              <div key={view.version} className="kit-card" style={{ padding: 'var(--sp-3)' }}>
                <div className="kit-row" style={{ justifyContent: 'space-between' }}>
                  <Badge tone={view.current ? 'ok' : 'neutral'}>
                    Version {view.version}
                    {view.current ? ' · current' : ''}
                  </Badge>
                  <span className="kit-small kit-muted">{relativeTimeLabel(view.at)}</span>
                </div>
                <p className="kit-small kit-muted">
                  {view.sectionCount} section{view.sectionCount === 1 ? '' : 's'}
                  {view.note === '' ? '' : ` · ${view.note}`}
                </p>
                {!view.current && (
                  <Button
                    size="small"
                    variant="quiet"
                    disabled={busy}
                    onClick={() => revert(view.version)}
                  >
                    Revert to this version
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

type VersionRow = {
  readonly version: number;
  readonly created_at: string;
  readonly note: string;
  readonly sections: readonly unknown[];
};

function NewPage({ onCreated }: { onCreated: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slug === '' ? slugify(title) : slug;
  // §12.2's reserved-path guard, checked here so an editor sees the collision as they
  // type. The database holds the authoritative list and refuses again on save.
  const local = localSlugCheck(effectiveSlug);
  const slugProblem = effectiveSlug !== '' && !isValidSlug(effectiveSlug);

  const create = (): void => {
    setBusy(true);
    setError('');
    void (async () => {
      const { error: cause } = await getDb(env)
        .from('custom_pages')
        .insert({ title: title.trim(), slug: effectiveSlug, status: 'draft' });
      if (cause) {
        setError(toDataError(cause).message);
      } else {
        setTitle('');
        setSlug('');
        onCreated();
      }
      setBusy(false);
    })();
  };

  return (
    <Card
      title="New page"
      description="A page starts as a draft and stays private until you publish it."
    >
      {error !== '' && (
        <Banner tone="bad" title="The page was not created">
          {error}
        </Banner>
      )}
      <div className="kit-grid">
        <Field
          label="Title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <Field
          label="Address"
          hint={effectiveSlug === '' ? 'Lower-case words joined by hyphens.' : `/${effectiveSlug}`}
          error={
            slugProblem
              ? 'Use lower-case words joined by single hyphens.'
              : effectiveSlug !== '' && !local.available
                ? local.reason
                : undefined
          }
          value={slug}
          placeholder={slugify(title)}
          onChange={(event) => {
            setSlug(event.target.value);
          }}
        />
      </div>
      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button disabled={busy || title.trim().length < 2 || !local.available} onClick={create}>
          {busy ? 'Creating' : 'Create page'}
        </Button>
      </div>
    </Card>
  );
}

function Composer({ page, onChanged }: { page: PageRow; onChanged: () => void }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => loadSections(env, page.id), [env, page.id]);
  const { state, reload } = useAsync(load, [env, page.id]);
  const [kind, setKind] = useState<SectionKind>('hero');
  const [error, setError] = useState('');

  const add = (): void => {
    setError('');
    callRpc(env, 'add_page_section', {
      p_page_id: page.id,
      p_kind: kind,
      p_payload: newPayload(kind),
    })
      .then(reload)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The section was not added.');
      });
  };

  const move = (section: PageSection, delta: number): void => {
    if (state.status !== 'ready') return;
    const target = moveSection(state.data, section.id, section.position + delta);
    const landed = target.find((item) => item.id === section.id);
    if (!landed) return;
    callRpc(env, 'move_page_section', { p_section_id: section.id, p_to: landed.position })
      .then(reload)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The section was not moved.');
      });
  };

  const setStatus = (status: 'draft' | 'published' | 'archived'): void => {
    void (async () => {
      const { error: cause } = await getDb(env)
        .from('custom_pages')
        .update({ status })
        .eq('id', page.id);
      if (cause) {
        setError(toDataError(cause).message);
        return;
      }
      onChanged();
    })();
  };

  if (state.status === 'loading') return <Loading label="Loading sections." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Sections did not load">
        {state.message}
      </Banner>
    );

  const blockers = publishBlockers({ title: page.title, slug: page.slug, sections: state.data });

  return (
    <Card
      title={`Composing: ${page.title}`}
      description="Sections appear on the page in this order."
      actions={
        <div className="kit-row">
          <a
            href={`${env.siteUrl}/${page.slug}`}
            target="_blank"
            rel="noreferrer noopener"
            className="kit-btn kit-btn--quiet kit-btn--small"
          >
            Preview /{page.slug}
          </a>
          {page.status === 'published' ? (
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                setStatus('draft');
              }}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              size="small"
              disabled={blockers.length > 0}
              onClick={() => {
                setStatus('published');
              }}
            >
              Publish
            </Button>
          )}
        </div>
      }
    >
      {error !== '' && (
        <Banner tone="bad" title="That did not work">
          {error}
        </Banner>
      )}
      {blockers.length > 0 && page.status !== 'published' && (
        <Banner tone="warn" title="Not ready to publish">
          <ul className="kit-small">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="kit-row" style={{ margin: 'var(--sp-3) 0' }}>
        <Select
          label="Add a section"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as SectionKind);
          }}
          options={SECTION_KINDS.map((item) => ({ value: item, label: sectionKindLabel(item) }))}
        />
        <Button size="small" onClick={add}>
          Add
        </Button>
      </div>

      {state.data.length === 0 ? (
        <Empty>This page has no sections yet.</Empty>
      ) : (
        <div className="kit-stack">
          {state.data.map((section, index) => (
            <SectionEditor
              key={section.id}
              section={section}
              isFirst={index === 0}
              isLast={index === state.data.length - 1}
              onMove={(delta) => {
                move(section, delta);
              }}
              onSaved={reload}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function SectionEditor({
  section,
  isFirst,
  isLast,
  onMove,
  onSaved,
}: {
  section: PageSection;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: number) => void;
  onSaved: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [payload, setPayload] = useState<Record<string, unknown>>(section.payload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = (): void => {
    setBusy(true);
    setError('');
    void (async () => {
      const { error: cause } = await getDb(env)
        .from('page_sections')
        .update({ payload })
        .eq('id', section.id);
      if (cause) setError(toDataError(cause).message);
      else onSaved();
      setBusy(false);
    })();
  };

  const remove = (): void => {
    void (async () => {
      const { error: cause } = await getDb(env).from('page_sections').delete().eq('id', section.id);
      if (cause) setError(toDataError(cause).message);
      else onSaved();
    })();
  };

  return (
    <div className="kit-card">
      <div className="kit-row" style={{ justifyContent: 'space-between' }}>
        <strong>
          {section.position + 1}. {sectionKindLabel(section.kind)}
        </strong>
        <span className="kit-small kit-muted">{sectionSummary({ ...section, payload })}</span>
      </div>

      <div className="kit-stack" style={{ marginTop: 'var(--sp-3)' }}>
        {fieldsFor(section.kind).map((field) =>
          field.multiline ? (
            <TextArea
              key={field.name}
              label={field.label}
              value={fieldText(payload, field.name)}
              onChange={(event) => {
                setPayload(withField(section.kind, payload, field.name, event.target.value));
              }}
            />
          ) : (
            <Field
              key={field.name}
              label={field.label}
              value={fieldText(payload, field.name)}
              onChange={(event) => {
                setPayload(withField(section.kind, payload, field.name, event.target.value));
              }}
            />
          ),
        )}
      </div>

      {error !== '' && <p className="kit-error">{error}</p>}

      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button size="small" disabled={busy} onClick={save}>
          {busy ? 'Saving' : 'Save section'}
        </Button>
        <Button
          size="small"
          variant="quiet"
          disabled={isFirst}
          onClick={() => {
            onMove(-1);
          }}
        >
          Move up
        </Button>
        <Button
          size="small"
          variant="quiet"
          disabled={isLast}
          onClick={() => {
            onMove(1);
          }}
        >
          Move down
        </Button>
        <Button size="small" variant="danger" onClick={remove}>
          Remove
        </Button>
      </div>
    </div>
  );
}
