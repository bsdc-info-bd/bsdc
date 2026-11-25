import { Suspense, lazy, useCallback, useMemo, useState, type ReactElement } from 'react';
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
  coverage,
  normalisePath,
  previewOverride,
  redirectMeaning,
  redirectProblems,
  DESCRIPTION_CUT,
  chainFrom,
  collapseSuggestion,
  describePlan,
  explainLoop,
  exportRedirects,
  parseRedirects,
  planRedirectImport,
  SOCIAL_DESCRIPTION_CUT,
  SOCIAL_TITLE_CUT,
  TITLE_CUT,
  seoChecks,
  shades,
  sitemapIndexXml,
  themeCss,
  themeProblems,
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
  type Cut,
  type RedirectPlan,
  type SeoEntry,
  type SitemapSection,
} from '@kit';
import { DYNAMIC_ROUTES, STATIC_ROUTES } from './routes.generated';
import { Approvals } from './Approvals';
import { Campaigns } from './Campaigns';
import { Authority } from './Authority';
import { Deck } from './Deck';
import { Cases } from './Cases';
import { Telemetry } from './Telemetry';
import { Sessions } from './Sessions';
import { Overview } from './Overview';
import { Marketplace } from './Marketplace';
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

const LazyCliConsole = lazy(() => import('./CliConsole'));
const LazyBulkWorkbench = lazy(() => import('./BulkWorkbench'));

/**
 * Central BSDC Admin Console:
 * - Overview & Live Cross-Portal Telemetry + Audit Inspector Drawer
 * - Interactive Audited Corporate CLI (lazy-loaded)
 * - Bulk Governance Workbench
 * - Approvals, Campaigns, SEO Pages, Redirects, Sitemap, and Branding
 */
export function App(): ReactElement {
  const [tabId, setTabId] = useState('overview');

  return (
    <AppShell
      minRole="manager"
      activeTabId={tabId}
      onTabChange={setTabId}
      note="Zero-trust central admin, audited CLI, approvals, SEO & branding."
      commandActions={[
        {
          id: 'cmd:cli',
          label: 'Open Interactive Admin CLI',
          section: 'Terminal',
          hint: 'Run telemetry, audit, cert, notice, and macro commands',
          onSelect: () => setTabId('cli'),
        },
        {
          id: 'cmd:bulk',
          label: 'Open Bulk Governance Workbench',
          section: 'Batch',
          hint: 'Batch decide shops, campaigns, redirects, or SEO overrides',
          onSelect: () => setTabId('bulk'),
        },
      ]}
      tabs={[
        // The deck leads, because it is the only screen that knows what this
        // reader can act on. Overview follows it: the nine platform-wide totals
        // are context, and context belongs after the queues.
        { id: 'deck', label: 'Command Deck', render: () => <Deck /> },
        { id: 'overview', label: 'Overview', render: () => <Overview /> },
        { id: 'telemetry', label: 'Telemetry', render: () => <Telemetry /> },
        { id: 'authority', label: 'Authority', render: () => <Authority /> },
        { id: 'sessions', label: 'Sessions', render: () => <Sessions /> },
        { id: 'cases', label: 'Cases', render: () => <Cases /> },
        {
          id: 'cli',
          label: 'CLI Terminal',
          render: () => (
            <Suspense fallback={<Loading label="Loading CLI runtime." />}>
              <LazyCliConsole />
            </Suspense>
          ),
        },
        {
          id: 'bulk',
          label: 'Bulk Workbench',
          render: () => (
            <Suspense fallback={<Loading label="Loading Bulk Workbench." />}>
              <LazyBulkWorkbench />
            </Suspense>
          ),
        },
        { id: 'approvals', label: 'Approvals', render: () => <Approvals /> },
        { id: 'marketplace', label: 'Marketplace', render: () => <Marketplace /> },
        { id: 'campaigns', label: 'Campaigns', render: () => <Campaigns /> },
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
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Severity({ checks }: { checks: ReturnType<typeof seoChecks> }): ReactElement {
  const worst = worstSeverity(checks);
  return (
    <Badge tone={worst === 'error' ? 'bad' : worst === 'warning' ? 'warn' : 'ok'}>
      {worst === 'error' ? 'Needs work' : worst === 'warning' ? 'Could be better' : 'Good'}
    </Badge>
  );
}

/** Whether the prerenderer lists a path, which is what "in the sitemap" means. */
function routeInSitemap(path: string): boolean {
  const clean = normalisePath(path);
  if (STATIC_ROUTES.some((route) => route.path === clean)) return true;
  // A dynamic family is in the sitemap by pattern, not by name: every published
  // post is a URL. Matching the pattern is the honest test — matching only the
  // static list would call every real post page "not in the sitemap".
  return DYNAMIC_ROUTES.some((route) => {
    const prefix = route.pattern.split('/:')[0] ?? '';
    return prefix !== '' && clean.startsWith(`${prefix}/`);
  });
}

/** One cut field, with the number that decided it. */
function CutLine({ cut, limit }: { cut: Cut; limit: number }): ReactElement {
  return (
    <span>
      {cut.shown === '' ? <span className="kit-muted">empty</span> : cut.shown}{' '}
      <Badge tone={cut.cut ? 'warn' : 'ok'}>
        {cut.counted} of {limit}
      </Badge>
      {cut.cut && <span className="kit-small kit-muted"> {cut.hidden} characters hidden</span>}
    </span>
  );
}

/**
 * The preview: what a search result will show, and what a share card will show.
 *
 * Both, side by side, because they cut at different widths and an operator who
 * only sees the wider one ships a card with half a sentence in it.
 */
function Preview({ entry }: { entry: SeoEntry }): ReactElement {
  const env = useCorporateEnv();
  const checks = seoChecks({
    title: entry.title,
    description: entry.description,
    path: entry.path,
    image_url: entry.image_url,
    robots: entry.robots,
  });
  const preview = previewOverride(
    {
      path: entry.path,
      title: entry.title,
      description: entry.description,
      canonical: entry.canonical,
      robots: entry.robots,
      inSitemap: routeInSitemap(entry.path),
    },
    env.siteUrl.replace(/^https?:\/\//, ''),
  );

  return (
    <div className="kit-stack">
      <div className="kit-grid">
        <div className="kit-card" style={{ background: 'var(--c-surface-2)' }}>
          <p className="kit-small kit-muted" style={{ margin: 0 }}>
            In a search result
          </p>
          <p className="kit-small kit-muted" style={{ margin: 0 }}>
            {preview.breadcrumb}
          </p>
          <p style={{ margin: 'var(--sp-1) 0', color: 'var(--c-accent)' }}>
            <CutLine cut={preview.title} limit={TITLE_CUT} />
          </p>
          <p className="kit-small" style={{ margin: 0 }}>
            <CutLine cut={preview.description} limit={DESCRIPTION_CUT} />
          </p>
        </div>
        <div className="kit-card" style={{ background: 'var(--c-surface-2)' }}>
          <p className="kit-small kit-muted" style={{ margin: 0 }}>
            When the link is shared
          </p>
          <p style={{ margin: 'var(--sp-1) 0', color: 'var(--c-accent)' }}>
            <CutLine cut={preview.socialTitle} limit={SOCIAL_TITLE_CUT} />
          </p>
          <p className="kit-small" style={{ margin: 0 }}>
            <CutLine cut={preview.socialDescription} limit={SOCIAL_DESCRIPTION_CUT} />
          </p>
        </div>
      </div>

      {preview.notes.length > 0 && (
        <Banner tone="warn" title="Worth knowing before you save">
          <ul className="kit-list">
            {preview.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Banner>
      )}

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
  // The two contradictions §8.5 refuses to publish: a page withheld from
  // indexing while it is listed in the sitemap, and a canonical naming itself.
  // They are checked from the same function the preview draws from, so the
  // sentence under the field and the disabled button cannot disagree.
  const blocker = previewOverride({
    path: draft.path,
    title: draft.title,
    description: draft.description,
    canonical: draft.canonical,
    robots: draft.robots,
    inSitemap: routeInSitemap(draft.path),
  }).blocker;

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
  // Coverage is asked of the routes the site actually builds. Passing the
  // dynamic families in would be lying: a route that exists once per database
  // row cannot be "covered" by a fixed number of overrides.
  const covered = coverage(
    STATIC_ROUTES.map((route) => route.path),
    state.data,
  );

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
        {blocker !== null && (
          <Banner tone="bad" title="This cannot be published">
            {blocker}
          </Banner>
        )}
        <Button onClick={save} disabled={busy || problems.length > 0 || blocker !== null}>
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

      <Card
        title={`Coverage (${covered.length} of ${STATIC_ROUTES.length} routes)`}
        description="Routes the prerenderer writes that have no override of their own. The list comes from main-site/src/lib/seo/static-routes.json, not from anything typed here."
      >
        {covered.length === 0 ? (
          <Empty>
            Every prerendered route has an override. {DYNAMIC_ROUTES.length} route families are
            generated per row and are not counted here.
          </Empty>
        ) : (
          <Table caption="Prerendered routes with no editorial override" head={['Path', 'Missing', '']}>
            {covered.map((row) => (
              <tr key={row.path}>
                <td className="kit-mono">{row.path}</td>
                <td>{row.missing.join(' and ')}</td>
                <td>
                  <Button
                    size="small"
                    variant="quiet"
                    onClick={() => {
                      const route = STATIC_ROUTES.find((entry) => entry.path === row.path);
                      setDraft({
                        ...EMPTY_OVERRIDE,
                        path: row.path,
                        title: route?.title ?? '',
                        description: route?.description ?? '',
                      });
                    }}
                  >
                    Write one
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

interface MissingPath {
  readonly path: string;
  readonly hits: number;
  readonly last_seen: string;
  readonly covered_by: string | null;
}

/** What the chains in the current table do that a single row does not show. */
function chainFindings(rows: readonly RedirectRow[]): {
  readonly loops: readonly { readonly trail: readonly string[] }[];
  readonly chains: readonly { readonly from: string; readonly to: string; readonly finalTarget: string }[];
} {
  const loops: { trail: readonly string[] }[] = [];
  const chains: { from: string; to: string; finalTarget: string }[] = [];
  for (const row of rows) {
    if (!row.is_enabled) continue;
    const walk = chainFrom(row.from_path, rows);
    if (walk.loop) {
      // Only report a loop once, at the alphabetically first path in it, so a
      // two-step loop is one line and not two.
      const start = [...walk.trail].sort()[0] ?? row.from_path;
      if (normalisePath(row.from_path) === start) loops.push({ trail: walk.trail });
    } else if (walk.trail.length > 2) {
      chains.push({
        from: normalisePath(row.from_path),
        to: normalisePath(row.to_path),
        finalTarget: walk.finalTarget ?? '',
      });
    }
  }
  return { loops, chains };
}

function RedirectHealth(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => loadRedirects(env), [env]);
  const { state } = useAsync(load, [env]);

  if (state.status === 'loading') return <Loading label="Walking the chains." />;
  if (state.status === 'error') {
    return (
      <Banner tone="bad" title="The chains could not be read">
        {state.message}
      </Banner>
    );
  }

  const findings = chainFindings(state.data);
  if (findings.loops.length === 0 && findings.chains.length === 0) {
    return (
      <Card
        title="Chains and loops"
        description="Every redirect in the table was followed to its end."
      >
        <Empty>
          No redirect loops, and no chain needs collapsing. Every path reaches a page in one hop.
        </Empty>
      </Card>
    );
  }

  return (
    <Card
      title="Chains and loops"
      description="A loop sends visitors round forever; a chain costs an extra round trip."
    >
      <div className="kit-stack">
        {findings.loops.map((loop) => (
          <Banner key={loop.trail.join('>')} tone="bad" title="Loop">
            {explainLoop(loop.trail)}
          </Banner>
        ))}
        {findings.chains.length > 0 && (
          <Table caption="Redirects that point at another redirect" head={['From', 'Points at', 'Should point at']}>
            {findings.chains.map((chain) => (
              <tr key={chain.from}>
                <td className="kit-mono">{chain.from}</td>
                <td className="kit-mono">{chain.to}</td>
                <td className="kit-mono">{chain.finalTarget}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Card>
  );
}

/**
 * The 404s that keep being asked for.
 *
 * The list is the evidence behind the next redirect: a path with two hundred hits
 * is a path whose replacement is worth writing, and a path with one is a typo. The
 * one-click action prefills the form above rather than writing on its own, so the
 * operator still chooses the destination — which is the part only they can know.
 */
function Missing({ onPrefill }: { onPrefill: (from: string) => void }): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(
    async () => listRpc<MissingPath>(env, 'redirect_404_sources', { p_limit: 25 }),
    [env],
  );
  const { state, reload } = useAsync(load, [env]);

  return (
    <Card
      title="Paths people asked for and did not get"
      description="From the redirect lookup at the edge. The busiest is first, because it is the one worth fixing."
      actions={
        <Button variant="quiet" size="small" onClick={reload}>
          Refresh
        </Button>
      }
    >
      {state.status === 'loading' ? <Loading label="Reading the 404 log." /> : null}
      {state.status === 'error' ? (
        <Banner tone="bad" title="The 404 list did not load">
          {state.message}
        </Banner>
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <Empty>Nothing is being asked for that is missing.</Empty>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <Table caption="Unresolved 404 paths" head={['Path', 'Hits', 'Last asked', '']}>
          {state.data.map((row) => (
            <tr key={row.path}>
              <td className="kit-mono">{row.path}</td>
              <td>{row.hits}</td>
              <td className="kit-small kit-muted">
                {row.covered_by !== null
                  ? `already redirects to ${row.covered_by}`
                  : new Date(row.last_seen).toLocaleString()}
              </td>
              <td>
                <Button
                  size="small"
                  variant="quiet"
                  disabled={row.covered_by !== null}
                  onClick={() => onPrefill(row.path)}
                >
                  Redirect this
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      ) : null}
    </Card>
  );
}

/**
 * Import and export, with the dry run in front of the write.
 *
 * The file is parsed and compared locally first, so an operator sees "1 to create,
 * 0 to update, 40 unchanged" before anything is sent. That sentence is the whole
 * point of the feature: without it, re-importing an export is a leap of faith.
 */
function RedirectTransfer({ rows, onImported }: { rows: readonly RedirectRow[]; onImported: () => void }): ReactElement {
  const env = useCorporateEnv();
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<RedirectPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const parsed = text.trim() === '' ? null : parseRedirects(text);

  const preview = (): void => {
    if (parsed === null) return;
    setDone('');
    setPlan(planRedirectImport(rows, parsed.rows));
  };

  const apply = (): void => {
    if (plan === null) return;
    setBusy(true);
    setError('');
    void (async () => {
      const accepted = plan.rows.filter((row) => row.change !== 'unchanged');
      const refusedPaths = new Set(plan.refused.map((row) => row.from));
      let written = 0;
      try {
        for (const row of accepted) {
          if (refusedPaths.has(row.from)) continue;
          await callRpc<RedirectRow>(env, 'set_redirect', {
            p_from: row.from,
            p_to: row.to,
            p_status: row.status,
            p_note: row.note,
          });
          written += 1;
        }
        setDone(
          `${written} redirect${written === 1 ? '' : 's'} written, ${plan.unchanged} left alone.`,
        );
        setPlan(null);
        setText('');
        onImported();
      } catch (cause) {
        setError(
          `${messageOf(cause)} ${written} row${written === 1 ? ' was' : 's were'} written before this; the rest were not.`,
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Card
      title="Import and export"
      description="An export re-imported unchanged writes nothing. That is what makes it safe to round-trip."
    >
      <div className="kit-stack">
        {error !== '' && (
          <Banner tone="bad" title="The import stopped">
            {error}
          </Banner>
        )}
        {done !== '' && (
          <Banner tone="ok" title="Imported">
            {done}
          </Banner>
        )}

        <div className="kit-row">
          <Button
            variant="quiet"
            onClick={() =>
              download('bdsc-redirects.csv', exportRedirects(rows), 'text/csv;charset=utf-8')
            }
          >
            Export {rows.length} redirect{rows.length === 1 ? '' : 's'}
          </Button>
        </div>

        <TextArea
          label="Paste a redirect file"
          rows={6}
          value={text}
          hint="from_path,to_path,status,note — the same shape the export writes."
          onChange={(event) => {
            setText(event.target.value);
            setPlan(null);
          }}
        />

        {parsed !== null && parsed.problems.length > 0 && (
          <Banner tone="bad" title="Some lines cannot be read">
            <ul className="kit-list">
              {parsed.problems.map((problem) => (
                <li key={`${problem.line}-${problem.message}`}>
                  Line {problem.line}: {problem.message}
                </li>
              ))}
            </ul>
          </Banner>
        )}

        <div className="kit-row">
          <Button onClick={preview} disabled={parsed === null || parsed.rows.length === 0}>
            Preview the import
          </Button>
        </div>

        {plan !== null && (
          <div className="kit-stack">
            <Banner tone={plan.refused.length > 0 ? 'warn' : 'neutral'} title="Nothing has been written">
              {describePlan(plan)}
            </Banner>
            {plan.refused.length > 0 && (
              <Banner tone="bad" title="Rows that would be refused">
                <ul className="kit-list">
                  {plan.refused.map((row) => (
                    <li key={`${row.line}-${row.from}`}>
                      Line {row.line} ({row.from}): {row.reason}
                    </li>
                  ))}
                </ul>
              </Banner>
            )}
            <Table caption="What the import would do" head={['From', 'To', 'Status', 'Change']}>
              {plan.rows.map((row) => (
                <tr key={row.from}>
                  <td className="kit-mono">{row.from}</td>
                  <td className="kit-mono">{row.to}</td>
                  <td>{row.status}</td>
                  <td>
                    <Badge
                      tone={
                        row.change === 'created' ? 'ok' : row.change === 'updated' ? 'warn' : 'neutral'
                      }
                    >
                      {row.change}
                    </Badge>{' '}
                    <span className="kit-small kit-muted">{row.differences.join('; ')}</span>
                  </td>
                </tr>
              ))}
            </Table>
            <Button
              onClick={apply}
              disabled={busy || plan.created + plan.updated === 0}
            >
              {busy
                ? 'Writing'
                : `Write ${plan.created + plan.updated} change${plan.created + plan.updated === 1 ? '' : 's'}`}
            </Button>
          </div>
        )}
      </div>
    </Card>
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
  // §8.6: when the destination is itself redirected, the useful answer is the
  // path they meant, not the refusal. The refusal still stands — a chain is what
  // the database will not make — but it now comes with the correction in it.
  const collapse = draft.to.trim() === '' ? null : collapseSuggestion(draft.to, rows);

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
        {collapse !== null && (
          <Banner tone="neutral" title="That destination moves again">
            <p className="kit-small" style={{ margin: 0 }}>
              {[collapse.trail.join(' → ')]} — point the redirect straight at the end of the chain.
            </p>
            <Button
              size="small"
              variant="quiet"
              onClick={() => setDraft({ ...draft, to: collapse.finalTarget })}
            >
              Use {collapse.finalTarget}
            </Button>
          </Banner>
        )}
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

      <RedirectHealth />
      <Missing onPrefill={(from) => setDraft({ ...EMPTY_REDIRECT, from })} />
      <RedirectTransfer rows={rows} onImported={reload} />
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

/**
 * The same sample screen, rendered from whatever palette it is given.
 *
 * Rendered twice at one size, side by side, so the difference between the draft and
 * the live theme is visible rather than imagined. It is deliberately the *same*
 * markup in both columns: a preview that drew a different composition for the draft
 * would be comparing two designs rather than two palettes.
 *
 * The only thing that varies is the tokens. If a token is missing the site's own
 * stylesheet value shows through, which is what a visitor would see — so a missing
 * token looks like a bug here too, rather than like a grey box.
 */
function SampleScreen({ tokens, label }: { tokens: BrandTokens; label: string }): ReactElement {
  const token = (key: string, fallback: string): string => tokens[key] ?? fallback;
  return (
    <figure
      style={{
        margin: 0,
        // A fixed width in both columns, because two previews at different widths
        // are two previews, and the eye reads the difference as a layout change.
        width: '100%',
        maxWidth: 360,
        background: token('surface', '#ffffff'),
        color: token('text', '#111827'),
        border: `1px solid ${token('border', '#d1d5db')}`,
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: token('primary', '#1d4ed8'),
          color: token('on-primary', '#ffffff'),
          padding: 'var(--sp-2) var(--sp-3)',
          fontSize: '0.95rem',
        }}
      >
        BSDC
      </div>
      <div style={{ padding: 'var(--sp-3)' }}>
        <p style={{ margin: '0 0 var(--sp-2)', fontWeight: 600 }}>A post title in this palette</p>
        <p style={{ margin: '0 0 var(--sp-2)', fontSize: '0.9rem' }}>
          Body text, which is what most readers read most of the time.
        </p>
        <p style={{ margin: '0 0 var(--sp-3)', fontSize: '0.85rem', color: token('text-muted', '#4b5563') }}>
          Secondary text, which is what most palettes get wrong.
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <span
            style={{
              background: token('primary', '#1d4ed8'),
              color: token('on-primary', '#ffffff'),
              padding: '0.4rem 0.9rem',
              borderRadius: 'var(--r-md)',
              fontSize: '0.85rem',
            }}
          >
            Primary action
          </span>
          <span
            style={{
              background: token('accent', '#b45309'),
              color: token('on-accent', '#ffffff'),
              padding: '0.4rem 0.9rem',
              borderRadius: 'var(--r-md)',
              fontSize: '0.85rem',
            }}
          >
            Accent
          </span>
        </div>
        <p style={{ margin: 'var(--sp-2) 0 0', fontSize: '0.85rem', color: token('danger', '#b91c1c') }}>
          Something went wrong.
        </p>
      </div>
      <figcaption className="kit-small kit-muted" style={{ padding: '0 var(--sp-3) var(--sp-2)' }}>
        {label}
      </figcaption>
    </figure>
  );
}

/**
 * The draft beside the live theme.
 *
 * §8.7 asks for exactly this and nothing more: the two rendered at the same size,
 * from the same markup, so what changed is what differs. Each pair underneath says
 * its ratio in both palettes at once, because a contrast number is only meaningful
 * next to the number it replaced.
 */
function SideBySide({
  draft,
  live,
}: {
  draft: BrandTokens;
  live: BrandTokens | null;
}): ReactElement {
  return (
    <div className="kit-stack">
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <SampleScreen tokens={draft} label="This draft" />
        {live === null ? (
          <div className="kit-card" style={{ maxWidth: 360, padding: 'var(--sp-3)' }}>
            <p className="kit-small kit-muted" style={{ margin: 0 }}>
              Nothing is live, so the site is using the colours it shipped with. There is nothing to
              compare against yet.
            </p>
          </div>
        ) : (
          <SampleScreen tokens={live} label="What visitors see now" />
        )}
      </div>
      {live !== null && (
        <Table caption="Contrast, both palettes, by WCAG 2.1" head={['Pair', 'Draft', 'Live', 'Needs']}>
          {CONTRAST_PAIRS.map((pair) => {
            const draftRatio = contrastRatio(
              draft[pair.foreground] ?? '#000000',
              draft[pair.background] ?? '#ffffff',
            );
            const liveRatio = contrastRatio(
              live[pair.foreground] ?? '#000000',
              live[pair.background] ?? '#ffffff',
            );
            return (
              <tr key={`${pair.foreground}-${pair.background}`}>
                <td>{pair.reason}</td>
                <td>
                  <Badge tone={draftRatio >= pair.minimum ? 'ok' : 'bad'}>
                    {draftRatio.toFixed(2)}:1
                  </Badge>{' '}
                  {draftRatio >= pair.minimum ? '' : 'fails'}
                </td>
                <td className="kit-muted">
                  {liveRatio.toFixed(2)}:1 {liveRatio >= pair.minimum ? '' : '(fails)'}
                </td>
                <td>{pair.minimum}:1</td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
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

  // Whether this actor may publish, and why the draft cannot be, is the database's
  // answer rather than the console's. A console that re-derived contrast arithmetic
  // would eventually disagree with the database, and the disagreement would be
  // found by a visitor. `brand_publish_readiness` is the same check publish runs.
  const live = state.status === 'ready' ? (state.data.find((t) => t.is_active) ?? null) : null;
  const liveTokens = live === null ? null : (live.tokens as BrandTokens);
  const readinessLoad = useCallback(async () => {
    if (draft.key.trim() === '') return null;
    try {
      const rows = await listRpc<{
        key: string;
        is_active: boolean;
        can_publish: boolean;
        problems: readonly string[];
        tokens_changed: number;
      }>(env, 'brand_publish_readiness', { p_key: draft.key.trim().toLowerCase() });
      return rows[0] ?? null;
    } catch {
      // A draft that has never been saved has no readiness to read, which is not an
      // error: it is a draft that must be saved before it can be published.
      return null;
    }
  }, [env, draft.key]);
  const { state: readiness, reload: recheckReadiness } = useAsync(readinessLoad, [env, draft.key]);

  // The one thing that blocks publish, distinct from the warnings beside it: a
  // contrast pair below AA. `themeProblems` is the same arithmetic `check_theme_tokens`
  // runs in the database, so this is a warning about a refusal rather than a rule of
  // the console's own.
  const aaFailures = themeProblems(draft.tokens).filter((problem) =>
    problem.message.includes(':1'),
  );
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

      <Card
        title="This draft beside what visitors see"
        description="The same sample screen, rendered from both palettes at one size, so the difference is visible rather than imagined."
      >
        <SideBySide draft={draft.tokens} live={liveTokens} />
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
        {aaFailures.length > 0 && (
          <Banner tone="bad" title="This palette cannot be published">
            <p className="kit-small" style={{ margin: 0 }}>
              Publishing needs every pair at AA. These fail, and the database will refuse the theme
              until they do not:
            </p>
            <ul className="kit-list">
              {aaFailures.map((failure) => (
                <li key={failure.token}>{failure.message}</li>
              ))}
            </ul>
          </Banner>
        )}
        <div className="kit-row">
          <Button onClick={save} disabled={busy || problems.length > 0}>
            {busy ? 'Saving' : 'Save theme'}
          </Button>
          {draft.key.trim() !== '' && (
            <Button
              variant="quiet"
              disabled={
                busy ||
                aaFailures.length > 0 ||
                readiness.status !== 'ready' ||
                readiness.data?.can_publish !== true
              }
              onClick={() => {
                activate(draft.key.trim().toLowerCase());
                recheckReadiness();
              }}
            >
              Save and publish
            </Button>
          )}
        </div>
        {readiness.status === 'ready' && readiness.data !== null && readiness.data.can_publish === false && (
          <Banner tone="warn" title="You can edit this theme but not publish it">
            Publishing needs <code>brand.publish</code>, which is separate from the right to edit a
            palette. Ask an owner to publish it, or to grant you the permission.
          </Banner>
        )}
        {readiness.status === 'ready' && readiness.data !== null && readiness.data.can_publish && (
          <p className="kit-small kit-muted" style={{ margin: 0 }}>
            {readiness.data.tokens_changed === 0
              ? 'This is the same as what visitors see now, so publishing it would change nothing.'
              : `Publishing would change ${readiness.data.tokens_changed} token${readiness.data.tokens_changed === 1 ? '' : 's'}.`}
          </p>
        )}
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
                    {!theme.is_active && themeProblems(theme.tokens as BrandTokens).length > 0 && (
                      <span className="kit-small kit-muted">
                        fails contrast; the database will refuse it
                      </span>
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
