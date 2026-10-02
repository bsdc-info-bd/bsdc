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
