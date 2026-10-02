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
  moveSection,
  publishBlockers,
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
  fieldText,
  fieldsFor,
  newPayload,
  sectionSummary,
  toSection,
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
    .select('id, slug, title, description, status, noindex, updated_at')
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
    </div>
  );
}

function NewPage({ onCreated }: { onCreated: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slug === '' ? slugify(title) : slug;
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
          error={slugProblem ? 'Use lower-case words joined by single hyphens.' : undefined}
          value={slug}
          placeholder={slugify(title)}
          onChange={(event) => {
            setSlug(event.target.value);
          }}
        />
      </div>
      <div className="kit-row" style={{ marginTop: 'var(--sp-3)' }}>
        <Button
          disabled={busy || title.trim().length < 2 || !isValidSlug(effectiveSlug)}
          onClick={create}
        >
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
        page.status === 'published' ? (
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
        )
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
