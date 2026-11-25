/**
 * What the site tells crawlers, and how an editor is stopped from telling
 * them something harmful.
 *
 * Every rule here has a twin in `0032_seo.sql`. The database is the one that
 * decides; this copy exists so the console can say "that title is too long"
 * while it is being typed rather than after it has been sent.
 */

export type SeoSource =
  'override' | 'post' | 'product' | 'course' | 'group' | 'profile' | 'default';

export interface SeoEntry {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly image_url: string;
  readonly canonical: string;
  readonly robots: string;
  readonly source: SeoSource | string;
  readonly updated_at: string | null;
}

export interface RedirectRow {
  readonly from_path: string;
  readonly to_path: string;
  readonly status: number;
  readonly note: string;
  readonly hits: number;
  readonly last_hit: string | null;
  readonly is_enabled: boolean;
}

export interface SitemapSection {
  readonly section: string;
  readonly urls: number;
  readonly pages: number;
  readonly lastmod: string | null;
}

/** Google renders roughly this much of a result before it stops. */
export const TITLE_LIMIT = 60;
export const TITLE_MAX = 70;
export const DESCRIPTION_LIMIT = 155;
export const DESCRIPTION_MAX = 180;

/**
 * The canonical form of a path, matching `bsdc.normalise_path`: lower case,
 * no query, no fragment, no duplicate or trailing slashes. The root keeps
 * its slash because it has nothing else to keep.
 */
export function normalisePath(raw: string): string {
  const withoutQuery = (raw ?? '').split('#')[0]?.split('?')[0] ?? '';
  const trimmed = withoutQuery.replace(/\s+/g, '').toLowerCase();
  const collapsed = `/${trimmed}`.replace(/\/{2,}/g, '/');
  const stripped = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
  return stripped === '' ? '/' : stripped;
}

/** True when a path is already in the form the database will store. */
export function isCanonicalPath(raw: string): boolean {
  return raw === normalisePath(raw);
}

/** Shortens on a word boundary and admits it with an ellipsis. */
export function clip(text: string, limit: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit || limit < 2) return flat;
  const cut = flat.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  const body = space > limit / 2 ? cut.slice(0, space) : cut;
  return `${body.replace(/[\s,;:.-]+$/, '')}…`;
}

export type Severity = 'error' | 'warning' | 'good';

export interface SeoCheck {
  readonly id: string;
  readonly severity: Severity;
  readonly message: string;
}

/**
 * The checks a page is held to. They are returned as a list rather than a
 * score out of a hundred, because a number tells an editor to chase the
 * number and a sentence tells them what to fix.
 */
export function seoChecks(entry: {
  title: string;
  description: string;
  path: string;
  image_url?: string;
  robots?: string;
}): readonly SeoCheck[] {
  const checks: SeoCheck[] = [];
  const title = entry.title.trim();
  const description = entry.description.trim();

  if (title === '') {
    checks.push({ id: 'title', severity: 'error', message: 'The page has no title.' });
  } else if (title.length > TITLE_MAX) {
    checks.push({
      id: 'title',
      severity: 'error',
      message: `The title is ${title.length} characters; the database stores ${TITLE_MAX}.`,
    });
  } else if (title.length > TITLE_LIMIT) {
    checks.push({
      id: 'title',
      severity: 'warning',
      message: `The title is ${title.length} characters and will be cut in a search result.`,
    });
  } else if (title.length < 15) {
    checks.push({
      id: 'title',
      severity: 'warning',
      message: 'The title is short enough that a search engine may rewrite it.',
    });
  } else {
    checks.push({ id: 'title', severity: 'good', message: 'The title fits a search result.' });
  }

  if (description === '') {
    checks.push({
      id: 'description',
      severity: 'error',
      message: 'With no description, the search result is assembled from the page body.',
    });
  } else if (description.length > DESCRIPTION_MAX) {
    checks.push({
      id: 'description',
      severity: 'error',
      message: `The description is ${description.length} characters; the database stores ${DESCRIPTION_MAX}.`,
    });
  } else if (description.length > DESCRIPTION_LIMIT) {
    checks.push({
      id: 'description',
      severity: 'warning',
      message: `The description is ${description.length} characters and will be cut.`,
    });
  } else if (description.length < 50) {
    checks.push({
      id: 'description',
      severity: 'warning',
      message: 'The description is too short to say anything a searcher can act on.',
    });
  } else {
    checks.push({
      id: 'description',
      severity: 'good',
      message: 'The description fits a search result.',
    });
  }

  if (!isCanonicalPath(entry.path)) {
    checks.push({
      id: 'path',
      severity: 'error',
      message: `The path will be stored as ${normalisePath(entry.path)}.`,
    });
  }

  if ((entry.image_url ?? '') === '') {
    checks.push({
      id: 'image',
      severity: 'warning',
      message: 'With no share image the site default is used when the link is posted.',
    });
  }

  if ((entry.robots ?? 'index') === 'noindex') {
    checks.push({
      id: 'robots',
      severity: 'warning',
      message: 'This page is withheld from search engines.',
    });
  }

  return checks;
}

/** The worst thing the checks found, for a one-glance badge. */
export function worstSeverity(checks: readonly SeoCheck[]): Severity {
  if (checks.some((check) => check.severity === 'error')) return 'error';
  if (checks.some((check) => check.severity === 'warning')) return 'warning';
  return 'good';
}

export interface SerpPreview {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly truncated: boolean;
}

/** What the entry will look like in a result list, cuts and all. */
export function serpPreview(origin: string, entry: SeoEntry): SerpPreview {
  const title = clip(entry.title, TITLE_LIMIT);
  const description = clip(entry.description, DESCRIPTION_LIMIT);
  const path = normalisePath(entry.canonical === '' ? entry.path : entry.canonical);
  return {
    url: `${origin.replace(/\/+$/, '')}${path === '/' ? '' : path}`,
    title,
    description,
    truncated: title !== entry.title.trim() || description !== entry.description.trim(),
  };
}

export const REDIRECT_CODES = [301, 302, 307, 308] as const;

export function redirectMeaning(status: number): string {
  switch (status) {
    case 301:
      return 'Moved for good. Search engines transfer the old page’s standing.';
    case 308:
      return 'Moved for good, and the method is kept — use for form endpoints.';
    case 302:
      return 'Moved for now. The old URL keeps its standing.';
    case 307:
      return 'Moved for now, and the method is kept.';
    default:
      return 'Not a redirect status BSDC issues.';
  }
}

/**
 * The same refusals `set_redirect` makes, so the console can explain them
 * before the round trip. A destination outside the site cannot loop, which
 * is the only reason it is treated differently.
 */
export function redirectProblems(
  from: string,
  to: string,
  status: number,
  existing: readonly RedirectRow[],
): readonly string[] {
  const problems: string[] = [];
  const fromPath = normalisePath(from);
  const external = /^https?:\/\//i.test(to.trim());
  const toPath = external ? to.trim() : normalisePath(to);

  if (from.trim() === '') problems.push('Enter the path that should move.');
  else if (fromPath === '/') problems.push('The home page cannot be redirected away.');
  if (to.trim() === '') problems.push('Enter where it should go.');
  if (!external && fromPath === toPath && to.trim() !== '') {
    problems.push('A redirect cannot point at itself.');
  }
  if (!(REDIRECT_CODES as readonly number[]).includes(status)) {
    problems.push('Choose 301, 302, 307 or 308.');
  }
  if (!external) {
    const chained = existing.find((row) => row.is_enabled && row.from_path === toPath);
    if (chained) {
      problems.push(
        `${toPath} is itself redirected to ${chained.to_path}; point at the final page.`,
      );
    }
    const back = existing.find((row) => row.from_path === toPath && row.to_path === fromPath);
    if (back) problems.push('That would create a redirect loop.');
  }
  return problems;
}

/** XML text is not HTML text: five characters, no entities beyond them. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SitemapUrl {
  readonly loc: string;
  readonly lastmod: string | null;
  readonly changefreq: string;
  readonly priority: number;
}

/** A sitemap file. Dates are W3C, which for a sitemap means the date alone. */
export function sitemapXml(origin: string, urls: readonly SitemapUrl[]): string {
  const base = origin.replace(/\/+$/, '');
  const body = urls
    .map((url) => {
      const lines = [`    <loc>${escapeXml(`${base}${url.loc}`)}</loc>`];
      const day = (url.lastmod ?? '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) lines.push(`    <lastmod>${day}</lastmod>`);
      lines.push(`    <changefreq>${escapeXml(url.changefreq)}</changefreq>`);
      lines.push(`    <priority>${url.priority.toFixed(1)}</priority>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    '</urlset>',
    '',
  ]
    .filter((part) => part !== '')
    .join('\n');
}

/** The index, one entry per section page, which is what a crawler fetches first. */
export function sitemapIndexXml(origin: string, sections: readonly SitemapSection[]): string {
  const base = origin.replace(/\/+$/, '');
  const entries: string[] = [];
  for (const section of sections) {
    for (let page = 1; page <= Math.max(1, section.pages); page += 1) {
      const loc = `${base}/sitemaps/${section.section}-${page}.xml`;
      const day = (section.lastmod ?? '').slice(0, 10);
      entries.push(
        `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>${
          /^\d{4}-\d{2}-\d{2}$/.test(day) ? `\n    <lastmod>${day}</lastmod>` : ''
        }\n  </sitemap>`,
      );
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</sitemapindex>',
    '',
  ].join('\n');
}

/**
 * robots.txt from the paths the site genuinely withholds. Written here so
 * the file and the `noindex` metadata cannot drift apart: a path that is
 * disallowed for crawling is also a path no sitemap may list.
 */
export function robotsTxt(origin: string, disallow: readonly string[]): string {
  const base = origin.replace(/\/+$/, '');
  const rules = [...new Set(disallow.map((path) => normalisePath(path)))].sort();
  return [
    '# Bangladesh Software Development Community',
    `# ${base}`,
    '',
    'User-agent: *',
    'Allow: /',
    ...rules.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

// ===========================================================================
// The preview, in the units the engines actually cut in
// ===========================================================================
//
// `clip` above counts JavaScript characters. That is the right unit for the
// database, whose limit is a storage limit, and the wrong unit for a preview:
// Bengali is written with combining marks, so a Bangla title of forty code
// points can occupy the room of sixty Latin ones and be cut in the result list
// while `clip` says it fits. The functions below count *display width* and say
// which of the two numbers is the one that will be cut.

/**
 * How much more room a Bangla string takes than a Latin one of the same code
 * point count. Deliberately approximate: the point is to warn early, and a
 * factor that fired on everything would be ignored within a week.
 */
export const BANGLA_WIDTH_FACTOR = 1.35;

/** Where a result list cuts a title, and where a share card does. */
export const TITLE_CUT = TITLE_LIMIT;
export const DESCRIPTION_CUT = DESCRIPTION_LIMIT;
/** Cards are narrower than a result row, and the difference is worth showing. */
export const SOCIAL_TITLE_CUT = 55;
export const SOCIAL_DESCRIPTION_CUT = 110;

/**
 * Length in the room the text occupies, not the code points it uses.
 *
 * A string with no Bangla in it returns its own length, so the Latin case is
 * unchanged from `clip`'s arithmetic and nothing that was already correct moves.
 */
export function displayLength(text: string): number {
  const clusters = [...(text ?? '')].length;
  return /[\u0980-\u09FF]/.test(text ?? '')
    ? Math.round(clusters * BANGLA_WIDTH_FACTOR)
    : clusters;
}

export interface Cut {
  /** What the engine shows, ellipsis included. */
  readonly shown: string;
  /** How many characters the reader never sees. */
  readonly hidden: number;
  /** The width the text was judged at. */
  readonly counted: number;
  /** True when something was removed. */
  readonly cut: boolean;
}

/**
 * Cut at a width, always on a word boundary where there is one.
 *
 * There is no "close enough to the limit" branch that severs a word: an operator
 * reading `…and keep…` is looking at a word that is not on their page, and the
 * preview's whole job is to show them their page. Only text with no space in it
 * at all — a long slug, a single compound — is cut mid-token, because an empty
 * preview would be less honest still.
 */
export function cutToWidth(text: string, limit: number): Cut {
  const clean = (text ?? '').trim();
  if (clean === '') return { shown: '', hidden: 0, counted: 0, cut: false };

  const counted = displayLength(clean);
  if (counted <= limit) return { shown: clean, hidden: 0, counted, cut: false };

  let cut = clean.length;
  let spent = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const next = displayLength(clean.slice(0, i + 1));
    if (next > limit) {
      cut = i;
      break;
    }
    spent = next;
  }

  const head = clean.slice(0, cut);
  const space = head.lastIndexOf(' ');
  const boundary = space > 0 ? space : cut;
  return {
    shown: `${clean.slice(0, boundary).trimEnd()}…`,
    hidden: clean.length - boundary,
    counted: spent,
    cut: true,
  };
}

export interface OverrideDraft {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly robots: string;
  /** Whether the path appears in the generated sitemap. */
  readonly inSitemap: boolean;
}

export interface OverridePreview {
  /** The domain and path as a result list prints them. */
  readonly breadcrumb: string;
  readonly title: Cut;
  readonly description: Cut;
  readonly socialTitle: Cut;
  readonly socialDescription: Cut;
  /** Things worth saying before saving. None of them blocks. */
  readonly notes: readonly string[];
  /** The one thing that must not be saved, or null. */
  readonly blocker: string | null;
}

/**
 * Judge a draft once and answer both questions: what a reader will see, and
 * whether it may be published.
 *
 * `blocker` exists because two of these states are not preferences. A `noindex`
 * page that is in the sitemap asks a crawler to come and read a page it is
 * forbidden to index — the sitemap is doing work against itself — and a
 * canonical that names its own path is not an override at all. Both are refused
 * here for the same reason the database would refuse them: an operator who can
 * save them learns that the console's warnings are decorative.
 */
export function previewOverride(draft: OverrideDraft, origin = 'bsdc.info.bd'): OverridePreview {
  const notes: string[] = [];
  const title = (draft.title ?? '').trim();
  const description = (draft.description ?? '').trim();
  const canonical = (draft.canonical ?? '').trim();
  const path = normalisePath(draft.path ?? '/');

  if (title === '' && description !== '') {
    notes.push(
      'There is a description and no title. The engine will use the page heading, so your description will sit under a title you did not choose.',
    );
  }
  if (title !== '' && description === '') {
    notes.push('There is a title and no description, so the engine will assemble one from the page body.');
  }
  if (draft.robots === 'noindex' && draft.inSitemap) {
    notes.push(
      'This page is in the sitemap and marked noindex. The sitemap invites the crawler that the robots tag turns away.',
    );
  }

  let blocker: string | null = null;
  if (draft.robots === 'noindex' && draft.inSitemap) {
    blocker = 'A page cannot be listed in the sitemap and withheld from indexing at the same time.';
  } else if (canonical !== '' && normalisePath(canonical) === path) {
    blocker = 'The canonical names this page itself, which changes nothing. Leave it empty or point it elsewhere.';
  }

  return {
    breadcrumb: `${origin.replace(/\/+$/, '')}${path === '/' ? '' : path}`,
    title: cutToWidth(title, TITLE_CUT),
    description: cutToWidth(description, DESCRIPTION_CUT),
    socialTitle: cutToWidth(title, SOCIAL_TITLE_CUT),
    socialDescription: cutToWidth(description, SOCIAL_DESCRIPTION_CUT),
    notes,
    blocker,
  };
}

/** Two overrides that claim the same canonical path, whichever of them won. */
export function canonicalCollisions(
  entries: readonly { readonly path: string; readonly canonical: string }[],
): readonly { readonly canonical: string; readonly paths: readonly string[] }[] {
  const byCanonical = new Map<string, Set<string>>();
  for (const entry of entries) {
    const canonical = normalisePath((entry.canonical ?? '').trim());
    if (canonical === '') continue;
    const paths = byCanonical.get(canonical) ?? new Set<string>();
    paths.add(normalisePath(entry.path));
    byCanonical.set(canonical, paths);
  }
  return [...byCanonical.entries()]
    .filter(([, paths]) => paths.size > 1)
    .map(([canonical, paths]) => ({ canonical, paths: [...paths].sort() }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical));
}

/** A route with no override, and what is missing from it. */
export interface CoverageRow {
  readonly path: string;
  readonly missing: readonly ('title' | 'description')[];
}

/**
 * Which routes have no title or no description.
 *
 * The list of routes arrives from the prerender manifest rather than from a
 * table, because the manifest is the thing that actually gets built and a table
 * of routes is a second copy that drifts. This function only decides what is
 * *missing*; it does not invent the route list.
 */
export function coverage(
  routes: readonly string[],
  overrides: readonly { readonly path: string; readonly title: string; readonly description: string }[],
): readonly CoverageRow[] {
  const byPath = new Map(overrides.map((o) => [normalisePath(o.path), o]));
  const rows: CoverageRow[] = [];
  for (const route of routes) {
    const path = normalisePath(route);
    const override = byPath.get(path);
    const missing: ('title' | 'description')[] = [];
    if (!override || (override.title ?? '').trim() === '') missing.push('title');
    if (!override || (override.description ?? '').trim() === '') missing.push('description');
    if (missing.length > 0) rows.push({ path, missing });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

// ===========================================================================
// Redirects that explain themselves
// ===========================================================================
//
// `redirectProblems` refuses a chained destination, which is right — the database
// refuses it too. Refusing is not the same as helping, though: when someone types
// `/old` → `/older` and `/older` already moves on to `/new`, the useful answer is
// not "point at the final page" but "point at `/new`", with the path they meant in
// the sentence. These functions produce that answer, and the cycle when there is
// one, from the same table the save will be checked against.

/** How far a chain is followed before it is called too long to reason about. */
export const MAX_CHAIN = 20;

export interface ChainWalk {
  /** Every path from the start to where the walk stopped. */
  readonly trail: readonly string[];
  /** True when the walk arrived back at its start. */
  readonly loop: boolean;
  /** True when the walk stopped at the guard rather than at a page. */
  readonly tooLong: boolean;
  /** Where a visitor is finally sent, or null when the walk found a loop or ran out. */
  readonly finalTarget: string | null;
}

/**
 * Follow a path through the enabled redirects.
 *
 * Walks at most `MAX_CHAIN` steps, and stops the moment it revisits a path. The
 * stop-on-revisit is what makes the loop reportable: a walk that kept going would
 * return after twenty steps and say "too long", which is the wrong diagnosis and
 * hides the two rows that caused it.
 */
export function chainFrom(start: string, existing: readonly RedirectRow[]): ChainWalk {
  const trail: string[] = [normalisePath(start)];
  const seen = new Set(trail);
  let here = trail[0] as string;

  for (let step = 0; step < MAX_CHAIN; step += 1) {
    const next = existing.find((row) => row.is_enabled && row.from_path === here);
    if (!next) return { trail, loop: false, tooLong: false, finalTarget: here };

    const to = /^https?:\/\//i.test(next.to_path) ? next.to_path : normalisePath(next.to_path);
    trail.push(to);

    if (/^https?:\/\//i.test(to)) {
      // Off-site destination: the chain ends here by definition, because this site
      // cannot redirect away from a page it does not serve.
      return { trail, loop: false, tooLong: false, finalTarget: to };
    }
    if (seen.has(to)) return { trail, loop: true, tooLong: false, finalTarget: null };
    seen.add(to);
    here = to;
  }
  return { trail, loop: false, tooLong: true, finalTarget: null };
}

/**
 * The destination the operator probably meant.
 *
 * Returns null when the destination is not itself redirected (nothing to
 * collapse), when it is off-site (not ours to follow), or when following it
 * loops (a collapse would be an improvement on a mistake).
 */
export function collapseSuggestion(
  to: string,
  existing: readonly RedirectRow[],
): { readonly finalTarget: string; readonly trail: readonly string[] } | null {
  if (/^https?:\/\//i.test(to.trim())) return null;
  const path = normalisePath(to);
  const self = existing.find((row) => row.is_enabled && row.from_path === path);
  if (self === undefined) return null;

  const walk = chainFrom(path, existing);
  if (walk.loop || walk.tooLong || walk.finalTarget === null) return null;
  if (walk.finalTarget === path) return null;
  return { finalTarget: walk.finalTarget, trail: walk.trail };
}

/**
 * The loop, written out as a sentence.
 *
 * `a → b → a` is the whole diagnosis, so it is the whole message. A row that has
 * to be clicked through to be understood is a row that gets closed unread.
 */
export function explainLoop(trail: readonly string[]): string {
  if (trail.length < 2) return 'No loop.';
  const cycle = trail.join(' → ');
  return `${cycle} — a visitor would be sent round forever. Break it by pointing one of these at the page that finally serves the content.`;
}

// ---------------------------------------------------------------------------
// Import and export
// ---------------------------------------------------------------------------
//
// Round-trippable means: export, edit in a spreadsheet, import, and get the same
// table back with no change to the rows nobody touched. That is only true if the
// export is a complete description of a row — hence the note and the status, not
// just the two paths — and if the same text parses to the same rows.

const CSV_HEADER = 'from_path,to_path,status,note';

/** Quote a field only when it has to be quoted, so a clean export stays readable. */
function csvField(value: string): string {
  const text = value ?? '';
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Split one CSV line, honouring quoted fields and doubled quotes. */
function csvSplit(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * The whole table as text, sorted so that two exports of the same table are the
 * same bytes — a diff of an export should only show real changes.
 */
export function exportRedirects(rows: readonly RedirectRow[]): string {
  const lines = [CSV_HEADER];
  for (const row of [...rows].sort((a, b) => a.from_path.localeCompare(b.from_path))) {
    lines.push(
      [
        csvField(row.from_path),
        csvField(row.to_path),
        csvField(String(row.status)),
        csvField(row.note ?? ''),
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

export interface ParsedRedirect {
  /** The line it came from, so every refusal can be found in the file. */
  readonly line: number;
  readonly from: string;
  readonly to: string;
  readonly status: number;
  readonly note: string;
}

export interface ParseResult {
  readonly rows: readonly ParsedRedirect[];
  /** Lines that could not be read, with their number, so nothing is dropped silently. */
  readonly problems: readonly { readonly line: number; readonly message: string }[];
}

/**
 * Read an exported file back.
 *
 * Every problem carries a line number and none of them is skipped: a file with one
 * bad row is reported as a file with one bad row, not as a file with fewer rows
 * than the operator pasted. Nothing here decides whether a redirect is *allowed* —
 * that is `redirectProblems` and, finally, the database.
 */
export function parseRedirects(text: string): ParseResult {
  const rows: ParsedRedirect[] = [];
  const problems: { line: number; message: string }[] = [];
  const lines = (text ?? '').split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === '') return;
    if (index === 0 && line.trim().toLowerCase().replace(/\s/g, '') === CSV_HEADER) return;

    const fields = csvSplit(line);
    if (fields.length < 2) {
      problems.push({ line: lineNumber, message: 'A redirect needs a from path and a to path.' });
      return;
    }
    const from = (fields[0] ?? '').trim();
    const to = (fields[1] ?? '').trim();
    const statusRaw = (fields[2] ?? '').trim();
    const note = (fields[3] ?? '').trim();

    if (from === '') {
      problems.push({ line: lineNumber, message: 'The from path is empty.' });
      return;
    }
    if (to === '') {
      problems.push({ line: lineNumber, message: `${from} has no destination.` });
      return;
    }
    const status = statusRaw === '' ? 301 : Number(statusRaw);
    if (!(REDIRECT_CODES as readonly number[]).includes(status)) {
      problems.push({
        line: lineNumber,
        message: `${from} has status "${statusRaw}", which is not one of ${REDIRECT_CODES.join(', ')}.`,
      });
      return;
    }
    rows.push({ line: lineNumber, from, to, status, note });
  });

  // Track the *first* line that used a path, so a duplicate is reported where the
  // operator can see both lines rather than at the line that follows it.
  const firstLine = new Map<string, number>();
  for (const row of rows) {
    const path = normalisePath(row.from);
    const seen = firstLine.get(path);
    if (seen !== undefined) {
      problems.push({
        line: row.line,
        message: `${path} also appears on line ${seen}; the later line would win.`,
      });
    } else {
      firstLine.set(path, row.line);
    }
  }

  return { rows, problems };
}

export interface RedirectPlanRow {
  readonly from: string;
  readonly to: string;
  readonly status: number;
  readonly note: string;
  readonly change: 'created' | 'updated' | 'unchanged';
  /** What would differ, in words. Empty for an unchanged row. */
  readonly differences: readonly string[];
}

export interface RedirectPlan {
  readonly rows: readonly RedirectPlanRow[];
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Rows in the file that would be refused, with the reason and the line. */
  readonly refused: readonly { readonly line: number; readonly from: string; readonly reason: string }[];
  readonly problems: readonly { readonly line: number; readonly message: string }[];
}

/**
 * What importing a file would do, before it does anything.
 *
 * The counts are the point: "12 created, 3 updated, 40 unchanged" tells an
 * operator that their export-and-reimport round trip was clean, and "40 created"
 * on the same file tells them they are about to duplicate a table. Either answer
 * is only useful before the write.
 */
export function planRedirectImport(
  current: readonly RedirectRow[],
  parsed: readonly ParsedRedirect[],
): RedirectPlan {
  const byPath = new Map(current.map((row) => [normalisePath(row.from_path), row]));
  const rows: RedirectPlanRow[] = [];
  const refused: { line: number; from: string; reason: string }[] = [];

  // The table as it would be after each accepted row, so a file that builds its own
  // loop is caught: `/a→/b` then `/b→/a` is a loop that no single row shows on its
  // own, and checking each row against the *starting* table would wave it through.
  const working: RedirectRow[] = [...current];

  for (const incoming of parsed) {
    const from = normalisePath(incoming.from);
    const existing = byPath.get(from);
    const status = incoming.status;
    const note = incoming.note ?? '';

    // The same refusals the save button depends on, run against the table as it
    // would be after the rows above this one in the same file.
    const blocked = redirectProblems(from, incoming.to, status, working);
    if (blocked.length > 0) {
      refused.push({ line: incoming.line, from, reason: blocked.join(' ') });
      continue;
    }

    const replacement: RedirectRow = {
      from_path: from,
      to_path: incoming.to,
      status,
      note,
      hits: existing?.hits ?? 0,
      last_hit: existing?.last_hit ?? null,
      is_enabled: true,
    };
    const at = working.findIndex((row) => normalisePath(row.from_path) === from);
    if (at >= 0) working[at] = replacement;
    else working.push(replacement);
    byPath.set(from, replacement);

    if (existing === undefined) {
      rows.push({ from, to: incoming.to, status, note, change: 'created', differences: [] });
      continue;
    }

    const differences: string[] = [];
    if (normalisePath(existing.to_path) !== normalisePath(incoming.to)) {
      differences.push(`destination ${existing.to_path} → ${incoming.to}`);
    }
    if (existing.status !== status) differences.push(`status ${existing.status} → ${status}`);
    if ((existing.note ?? '') !== note) differences.push('the note changes');
    if (existing.is_enabled === false) differences.push('the row would be enabled again');

    rows.push({
      from,
      to: incoming.to,
      status,
      note,
      change: differences.length === 0 ? 'unchanged' : 'updated',
      differences,
    });
  }

  return {
    rows,
    created: rows.filter((row) => row.change === 'created').length,
    updated: rows.filter((row) => row.change === 'updated').length,
    unchanged: rows.filter((row) => row.change === 'unchanged').length,
    refused,
    problems: [],
  };
}

/** The counts in a sentence, which is how they will be read. */
export function describePlan(plan: RedirectPlan): string {
  const parts = [
    `${plan.created} to create`,
    `${plan.updated} to update`,
    `${plan.unchanged} unchanged`,
  ];
  if (plan.problems.length > 0) parts.push(`${plan.problems.length} unreadable`);
  if (plan.refused.length > 0) parts.push(`${plan.refused.length} refused`);
  return `${parts.join(', ')}.`;
}
