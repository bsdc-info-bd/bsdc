import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  AppShell,
  BRAND_TOKENS,
  Badge,
  Banner,
  Button,
  Card,
  CONTRAST_PAIRS,
  Empty,
  Field,
  Loading,
  Select,
  Table,
  TextArea,
  callRpc,
  cleanTokens,
  contrastGrade,
  contrastRatio,
  getDb,
  listRpc,
  meetsRole,
  messageOf,
  normalisePath,
  redirectMeaning,
  redirectProblems,
  seoChecks,
  serpPreview,
  shades,
  sitemapIndexXml,
  themeCss,
  toDataError,
  useAsync,
  useCorporateEnv,
  useSession,
  wordmarkSvg,
  worstSeverity,
  type BrandTheme,
  type BrandTokens,
  type CorporateEnv,
  type RedirectRow,
  type SeoEntry,
  type SitemapSection,
} from '@kit';
import {
  EMPTY_OVERRIDE,
  EMPTY_REDIRECT,
  NEW_THEME,
  draftAsEntry,
  draftFromRow,
  overrideArgs,
  overrideProblems,
  overrideSummary,
  redirectNote,
  sortRedirects,
  themeSaveProblems,
  type OverrideDraft,
  type OverrideRow,
  type RedirectDraft,
  type ThemeDraft,
} from './model';

/**
 * The SEO centre and the branding studio.
 *
 * Both halves work the same way: the console shows what the site is
 * currently saying, the editor changes it, and the database re-checks every
 * rule before the change lands. Nothing here is advisory — a title that is
 * too long is cut by Postgres, and a palette that cannot be read is refused
 * by Postgres.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="manager"
      note="Changes here reach every visitor and every crawler."
      tabs={[
        { id: 'pages', label: 'Pages', render: () => <Pages /> },
        { id: 'redirects', label: 'Redirects', render: () => <Redirects /> },
        { id: 'sitemap', label: 'Sitemap', render: () => <Sitemap /> },
        { id: 'brand', label: 'Branding', render: () => <Branding /> },
      ]}
    />
  );
}

function download(filename: string, body: string, type: string): void {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Severity({ checks }: { checks: ReturnType<typeof seoChecks> }): ReactElement {
  const worst = worstSeverity(checks);
  return (
    <Badge tone={worst === 'error' ? 'bad' : worst === 'warning' ? 'warn' : 'ok'}>
      {worst === 'error' ? 'Needs work' : worst === 'warning' ? 'Could be better' : 'Good'}
    </Badge>
  );
}

function Preview({ entry }: { entry: SeoEntry }): ReactElement {
  const env = useCorporateEnv();
  const preview = serpPreview(env.siteUrl, entry);
  const checks = seoChecks({
    title: entry.title,
    description: entry.description,
    path: entry.path,
    image_url: entry.image_url,
    robots: entry.robots,
  });

  return (
    <div className="kit-stack">
      <div className="kit-card" style={{ background: 'var(--c-surface-2)' }}>
        <p className="kit-small kit-muted" style={{ margin: 0 }}>
          {preview.url}
        </p>
        <p style={{ margin: 'var(--sp-1) 0', fontSize: '1.1rem', color: 'var(--c-accent)' }}>
          {preview.title === '' ? 'Untitled page' : preview.title}
        </p>
        <p className="kit-small" style={{ margin: 0 }}>
          {preview.description === ''
            ? 'No description: the search engine will assemble one from the page.'
            : preview.description}
        </p>
      </div>
      <ul className="kit-list">
        {checks.map((check) => (
          <li key={check.id}>
            <Badge
              tone={
                check.severity === 'error' ? 'bad' : check.severity === 'warning' ? 'warn' : 'ok'
              }
            >
              {check.severity === 'good' ? 'ok' : check.severity}
            </Badge>{' '}
            {check.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function loadOverrides(env: CorporateEnv): Promise<readonly OverrideRow[]> {
  const { data, error } = await getDb(env)
    .from('seo_overrides')
    .select(
      'path, title, description, image_url, canonical, robots, changefreq, priority, note, updated_at',
    )
    .order('updated_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as OverrideRow[];
}

function Pages(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => loadOverrides(env), [env]);
  const { state, reload } = useAsync(load, [env]);
  const [draft, setDraft] = useState<OverrideDraft>(EMPTY_OVERRIDE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState('');
  const [resolved, setResolved] = useState<SeoEntry | null>(null);

  const problems = overrideProblems(draft);

  const save = (): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc<OverrideRow>(env, 'set_seo_override', overrideArgs(draft));
        setDraft(EMPTY_OVERRIDE);
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  const clear = (path: string): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc<boolean>(env, 'clear_seo_override', { p_path: path });
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  const check = (): void => {
    setError('');
    void (async () => {
      try {
        const rows = await listRpc<SeoEntry>(env, 'seo_for_path', { p_path: lookup });
        setResolved(rows[0] ?? null);
      } catch (cause) {
        setError(messageOf(cause));
      }
    })();
  };

  if (state.status === 'loading') return <Loading label="Loading page metadata." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Metadata did not load">
        {state.message}
      </Banner>
    );

  const summary = overrideSummary(state.data);

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="That change was refused">
          {error}
        </Banner>
      )}

      <Card
        title="What is this page telling search engines?"
        description="Any path on the site, answered by the same function the edge uses."
      >
        <div className="kit-row">
          <Field
            label="Path"
            value={lookup}
            placeholder="/p/a-post-slug"
            onChange={(event) => setLookup(event.target.value)}
          />
          <Button onClick={check} disabled={lookup.trim() === ''}>
            Look up
          </Button>
        </div>
        {resolved && (
          <div className="kit-stack">
            <p className="kit-small kit-muted">
              Source: <strong>{resolved.source}</strong>
              {resolved.source !== 'override' &&
                ' — nobody has overridden this page; it describes itself.'}
            </p>
            <Preview entry={resolved} />
            <Button
              variant="quiet"
              onClick={() =>
                setDraft({
                  ...EMPTY_OVERRIDE,
                  path: resolved.path,
                  title: resolved.title,
                  description: resolved.description,
                  imageUrl: resolved.image_url,
                  robots: resolved.robots,
                })
              }
            >
              Edit this page
            </Button>
          </div>
        )}
      </Card>

      <Card
        title="Override"
        description="Stored against the canonical path, so one page cannot be given two titles."
      >
        <div className="kit-grid">
          <Field
            label="Path"
            value={draft.path}
            hint={draft.path.trim() === '' ? '' : `Stored as ${normalisePath(draft.path)}`}
            onChange={(event) => setDraft({ ...draft, path: event.target.value })}
          />
          <Field
            label="Title"
            value={draft.title}
            hint={`${draft.title.trim().length} characters`}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <TextArea
            label="Description"
            rows={3}
            value={draft.description}
            hint={`${draft.description.trim().length} characters`}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
          <Field
            label="Share image"
            value={draft.imageUrl}
            hint="Shown when the link is posted elsewhere."
            onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })}
          />
          <Field
            label="Canonical path"
            value={draft.canonical}
            hint="Leave empty unless this page is a duplicate of another."
            onChange={(event) => setDraft({ ...draft, canonical: event.target.value })}
          />
          <Select
            label="Search engines"
            value={draft.robots}
            options={[
              { value: 'index', label: 'May index this page' },
              { value: 'noindex', label: 'Withhold this page' },
            ]}
            onChange={(event) => setDraft({ ...draft, robots: event.target.value })}
          />
          <Select
            label="Expected change"
            value={draft.changefreq}
            options={['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].map(
              (value) => ({ value, label: value }),
            )}
            onChange={(event) => setDraft({ ...draft, changefreq: event.target.value })}
          />
          <Field
            label="Priority"
            value={draft.priority}
            inputMode="decimal"
            hint="0.0 to 1.0, relative to the rest of this site only."
            onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
          />
          <Field
            label="Note"
            value={draft.note}
            hint="Why this page needed an override."
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
        </div>

        <Preview entry={draftAsEntry(draft)} />

        {problems.length > 0 && (
          <Banner tone="warn" title="Not ready to save">
            <ul className="kit-list">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Banner>
        )}
        <Button onClick={save} disabled={busy || problems.length > 0}>
          {busy ? 'Saving' : 'Save override'}
        </Button>
      </Card>

      <Card
        title={`Overrides (${summary.total})`}
        description={`${summary.withheld} withheld from search, ${summary.promoted} promoted.`}
      >
        {state.data.length === 0 ? (
          <Empty>No page has been overridden. Every page describes itself.</Empty>
        ) : (
          <Table
            caption="Pages with editorial metadata"
            head={['Path', 'Title', 'Robots', 'Priority', 'Quality', '']}
          >
            {state.data.map((row) => {
              const checks = seoChecks({
                title: row.title,
                description: row.description,
                path: row.path,
                image_url: row.image_url,
                robots: row.robots,
              });
              return (
                <tr key={row.path}>
                  <td className="kit-mono">{row.path}</td>
                  <td>{row.title}</td>
                  <td>
                    {row.robots === 'noindex' ? (
                      <Badge tone="warn">withheld</Badge>
                    ) : (
                      <Badge tone="ok">indexed</Badge>
                    )}
                  </td>
                  <td>{row.priority.toFixed(1)}</td>
                  <td>
                    <Severity checks={checks} />
                  </td>
                  <td>
                    <div className="kit-row">
                      <Button
                        size="small"
                        variant="quiet"
                        onClick={() => setDraft(draftFromRow(row))}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="danger"
                        disabled={busy}
                        onClick={() => clear(row.path)}
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

async function loadRedirects(env: CorporateEnv): Promise<readonly RedirectRow[]> {
  const { data, error } = await getDb(env)
    .from('redirects')
    .select('from_path, to_path, status, note, hits, last_hit, is_enabled');
  if (error) throw toDataError(error);
  return (data ?? []) as RedirectRow[];
}

function Redirects(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => loadRedirects(env), [env]);
  const { state, reload } = useAsync(load, [env]);
  const [draft, setDraft] = useState<RedirectDraft>(EMPTY_REDIRECT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rows = state.status === 'ready' ? state.data : [];
  const problems = redirectProblems(draft.from, draft.to, Number(draft.status), rows);

  const save = (): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc<RedirectRow>(env, 'set_redirect', {
          p_from: draft.from,
          p_to: draft.to,
          p_status: Number(draft.status),
          p_note: draft.note,
        });
        setDraft(EMPTY_REDIRECT);
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  const remove = (from: string): void => {
    setBusy(true);
    void (async () => {
      try {
        await callRpc<boolean>(env, 'remove_redirect', { p_from: from });
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  if (state.status === 'loading') return <Loading label="Loading redirects." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Redirects did not load">
        {state.message}
      </Banner>
    );

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="That redirect was refused">
          {error}
        </Banner>
      )}

      <Card
        title="Move a URL"
        description="A destination must be a real page, never another redirect: visitors pay for every hop."
      >
        <div className="kit-grid">
          <Field
            label="From"
            value={draft.from}
            hint={draft.from.trim() === '' ? '' : `Matched as ${normalisePath(draft.from)}`}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
          <Field
            label="To"
            value={draft.to}
            hint="A path on this site, or a full https:// address."
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
          <Select
            label="Kind"
            value={draft.status}
            hint={redirectMeaning(Number(draft.status))}
            options={[
              { value: '301', label: '301 — permanent' },
              { value: '308', label: '308 — permanent, method kept' },
              { value: '302', label: '302 — temporary' },
              { value: '307', label: '307 — temporary, method kept' },
            ]}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          />
          <Field
            label="Note"
            value={draft.note}
            hint="What moved, and why."
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
        </div>
        {problems.length > 0 && (
          <Banner tone="warn" title="Not ready to save">
            <ul className="kit-list">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Banner>
        )}
        <Button onClick={save} disabled={busy || problems.length > 0}>
          {busy ? 'Saving' : 'Save redirect'}
        </Button>
      </Card>

      <Card title={`Redirects (${rows.length})`} description="Busiest first.">
        {rows.length === 0 ? (
          <Empty>Nothing has moved yet.</Empty>
        ) : (
          <Table caption="Redirects in force" head={['From', 'To', 'Status', 'Use', '']}>
            {sortRedirects(rows).map((row) => (
              <tr key={row.from_path}>
                <td className="kit-mono">{row.from_path}</td>
                <td className="kit-mono">{row.to_path}</td>
                <td>{row.status}</td>
                <td className="kit-small kit-muted">{redirectNote(row)}</td>
                <td>
                  <Button
                    size="small"
                    variant="danger"
                    disabled={busy}
                    onClick={() => remove(row.from_path)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function Sitemap(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    () => listRpc<SitemapSection>(env, 'sitemap_sections', { p_size: 1000 }),
    [env],
  );
  const { state } = useAsync(load, [env]);

  const index = useMemo(
    () => (state.status === 'ready' ? sitemapIndexXml(env.siteUrl, state.data) : ''),
    [state, env.siteUrl],
  );

  if (state.status === 'loading') return <Loading label="Counting public URLs." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="The sitemap did not load">
        {state.message}
      </Banner>
    );

  const total = state.data.reduce((sum, section) => sum + section.urls, 0);

  return (
    <div className="kit-stack">
      <Card
        title={`${total} public URLs`}
        description="Counted with the same conditions the pages use, so nothing is listed that a crawler would be refused."
        actions={
          <Button variant="quiet" onClick={() => download('sitemap.xml', index, 'application/xml')}>
            Download index
          </Button>
        }
      >
        {state.data.length === 0 ? (
          <Empty>There is nothing public to list yet.</Empty>
        ) : (
          <Table caption="Sitemap sections" head={['Section', 'URLs', 'Files', 'Last change']}>
            {state.data.map((section) => (
              <tr key={section.section}>
                <td>{section.section}</td>
                <td>{section.urls}</td>
                <td>{section.pages}</td>
                <td className="kit-small kit-muted">
                  {section.lastmod === null ? '—' : section.lastmod.slice(0, 10)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Index as served" description="What /sitemap.xml returns at the edge.">
        <pre className="kit-pre kit-mono kit-small">{index}</pre>
      </Card>
    </div>
  );
}

async function loadThemes(env: CorporateEnv): Promise<readonly BrandTheme[]> {
  const { data, error } = await getDb(env)
    .from('brand_themes')
    .select('key, name, tokens, is_active, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as BrandTheme[];
}

function Branding(): ReactElement {
  const env = useCorporateEnv();
  const { state: session } = useSession();
  const load = useCallback(() => loadThemes(env), [env]);
  const { state, reload } = useAsync(load, [env]);
  const [draft, setDraft] = useState<ThemeDraft>(NEW_THEME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const profile = session.status === 'authenticated' ? session.profile : null;
  const mayManage = meetsRole(profile, 'admin');
  const problems = themeSaveProblems(draft);
  const css = themeCss(draft.tokens);
  const svg = wordmarkSvg(draft.tokens);

  const setToken = (key: string, value: string): void => {
    setDraft({ ...draft, tokens: { ...draft.tokens, [key]: value } });
  };

  const save = (): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc<BrandTheme>(env, 'save_brand_theme', {
          p_key: draft.key.trim().toLowerCase(),
          p_name: draft.name.trim(),
          p_tokens: cleanTokens(draft.tokens),
        });
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  const activate = (key: string): void => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await callRpc<BrandTheme>(env, 'activate_brand_theme', { p_key: key });
        reload();
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setBusy(false);
      }
    })();
  };

  if (!mayManage) {
    return (
      <Banner tone="warn" title="Branding is an administrator’s job">
        A palette change reaches every visitor at once, so it is kept to administrators. You can
        still see what is live on the site.
      </Banner>
    );
  }

  if (state.status === 'loading') return <Loading label="Loading themes." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Themes did not load">
        {state.message}
      </Banner>
    );

  const primary = draft.tokens['primary'] ?? '#1b4332';

  return (
    <div className="kit-stack">
      {error !== '' && (
        <Banner tone="bad" title="That theme was refused">
          {error}
        </Banner>
      )}

      <Card
        title="Palette"
        description="Contrast is checked here and again in the database; an unreadable theme cannot be saved by either."
      >
        <div className="kit-grid">
          <Field
            label="Key"
            value={draft.key}
            hint="Used in the stylesheet name; cannot be changed later."
            onChange={(event) => setDraft({ ...draft, key: event.target.value })}
          />
          <Field
            label="Name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          {BRAND_TOKENS.map((token) => (
            <Field
              key={token.key}
              type="color"
              label={token.label}
              hint={token.help}
              value={draft.tokens[token.key] ?? '#000000'}
              onChange={(event) => setToken(token.key, event.target.value)}
            />
          ))}
        </div>
      </Card>

      <Card title="Readability" description="WCAG 2.1 contrast, by the same formula Postgres uses.">
        <Table caption="Contrast pairs" head={['Pair', 'Ratio', 'Needs', 'Grade']}>
          {CONTRAST_PAIRS.map((pair) => {
            const ratio = contrastRatio(
              draft.tokens[pair.foreground] ?? '#000000',
              draft.tokens[pair.background] ?? '#ffffff',
            );
            const ok = ratio >= pair.minimum;
            return (
              <tr key={`${pair.foreground}-${pair.background}`}>
                <td>{pair.reason}</td>
                <td className="kit-mono">{ratio.toFixed(2)}:1</td>
                <td>{pair.minimum}:1</td>
                <td>
                  <Badge tone={ok ? 'ok' : 'bad'}>{ok ? contrastGrade(ratio) : 'fail'}</Badge>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card
        title="How it looks"
        description="The wordmark is drawn from the palette, so it can never fall behind it."
        actions={
          <div className="kit-row">
            <Button variant="quiet" onClick={() => download('bsdc-theme.css', css, 'text/css')}>
              Download CSS
            </Button>
            <Button
              variant="quiet"
              onClick={() => download('bsdc-wordmark.svg', svg, 'image/svg+xml')}
            >
              Download wordmark
            </Button>
          </div>
        }
      >
        <div
          className="kit-stack"
          style={{
            background: draft.tokens['surface'] ?? '#ffffff',
            color: draft.tokens['text'] ?? '#000000',
            border: `1px solid ${draft.tokens['border'] ?? '#cccccc'}`,
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-4)',
          }}
        >
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="" width={240} />
          <p style={{ margin: 0 }}>
            Body text on the page surface, which is the thing most people read most of the time.
          </p>
          <p className="kit-small" style={{ margin: 0, color: draft.tokens['text-muted'] }}>
            Secondary text, which is the thing most palettes get wrong.
          </p>
          <div className="kit-row">
            <span
              style={{
                background: draft.tokens['primary'],
                color: draft.tokens['on-primary'],
                padding: '0.5rem 1rem',
                borderRadius: 'var(--r-md)',
              }}
            >
              Primary action
            </span>
            <span
              style={{
                background: draft.tokens['accent'],
                color: draft.tokens['on-accent'],
                padding: '0.5rem 1rem',
                borderRadius: 'var(--r-md)',
              }}
            >
              Accent
            </span>
          </div>
          <div className="kit-row" aria-label="Primary shades">
            {shades(primary).map((shade) => (
              <span
                key={shade.step}
                title={`${shade.step} ${shade.hex}`}
                className="kit-swatch"
                style={{ background: shade.hex }}
              />
            ))}
          </div>
        </div>

        {problems.length > 0 && (
          <Banner tone="warn" title="Not ready to save">
            <ul className="kit-list">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Banner>
        )}
        <Button onClick={save} disabled={busy || problems.length > 0}>
          {busy ? 'Saving' : 'Save theme'}
        </Button>
      </Card>

      <Card title={`Themes (${state.data.length})`} description="One theme is live at a time.">
        {state.data.length === 0 ? (
          <Empty>No theme has been saved; the site is using the colours it shipped with.</Empty>
        ) : (
          <Table caption="Saved themes" head={['Theme', 'Key', 'State', '']}>
            {state.data.map((theme) => (
              <tr key={theme.key}>
                <td>{theme.name}</td>
                <td className="kit-mono">{theme.key}</td>
                <td>{theme.is_active ? <Badge tone="ok">live</Badge> : <Badge>draft</Badge>}</td>
                <td>
                  <div className="kit-row">
                    <Button
                      size="small"
                      variant="quiet"
                      onClick={() =>
                        setDraft({
                          key: theme.key,
                          name: theme.name,
                          tokens: { ...(theme.tokens as BrandTokens) },
                        })
                      }
                    >
                      Open
                    </Button>
                    {!theme.is_active && (
                      <Button size="small" disabled={busy} onClick={() => activate(theme.key)}>
                        Make live
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
