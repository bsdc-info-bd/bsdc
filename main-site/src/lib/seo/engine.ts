import { SITE } from '@/lib/site';
import staticRoutes from './static-routes.json';

/**
 * The SEO engine.
 *
 * Three jobs, all of them pure: decide the canonical form of a URL, decide
 * what a page says about itself, and write the files crawlers fetch. None of
 * it touches the DOM, so the build-time prerender, the Pages Functions at
 * the edge and the running application all produce the same strings — which
 * is the only way a crawler and a visitor can be given the same page.
 */

export interface StaticRoute {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly changefreq: string;
  readonly priority: number;
  readonly heading: string;
  readonly summary: string;
  readonly type: string;
}

export const STATIC_ROUTES: readonly StaticRoute[] = staticRoutes.routes;
export const DISALLOWED_PATHS: readonly string[] = staticRoutes.disallow;

/** Parameters that identify a campaign, not a page. */
const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|igshid$)/i;

/**
 * The canonical form of a path: lower case, no fragment, no trailing slash,
 * no duplicate slashes, and no tracking parameters — a visitor arriving from
 * a newsletter must not create a second copy of the page in an index.
 */
export function canonicalPath(raw: string): string {
  const [beforeHash = ''] = (raw ?? '').split('#');
  const [pathPart = '', queryPart = ''] = beforeHash.split('?');
  const path = `/${pathPart.trim().toLowerCase()}`.replace(/\/{2,}/g, '/');
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path;

  const kept: string[] = [];
  for (const pair of queryPart.split('&')) {
    if (pair === '') continue;
    const key = pair.split('=')[0] ?? '';
    if (TRACKING.test(key)) continue;
    kept.push(pair);
  }
  kept.sort();
  const query = kept.length > 0 ? `?${kept.join('&')}` : '';
  return `${trimmed === '' ? '/' : trimmed}${query}`;
}

export function absoluteUrl(path: string, origin: string = SITE.url): string {
  const base = origin.replace(/\/+$/, '');
  const canonical = canonicalPath(path);
  return canonical === '/' ? `${base}/` : `${base}${canonical}`;
}

/**
 * True when this path must never reach an index, whatever a page says.
 *
 * An entry is a prefix, or a pattern when it holds an asterisk. The pattern
 * exists for editors: a project's owner edits it one path segment below the
 * permalink the whole sitemap exists to advertise, and no prefix can tell those
 * two apart. An asterisk matches exactly one segment, so the editor pattern
 * needs three of them and leaves `/projects/edit` alone — a member may publish
 * a project whose slug is `edit`, and that permalink must stay crawlable.
 *
 * `public.seo_for_path` answers the same question for the HTML a crawler
 * receives, and scripts/db-prove/t37.mjs fails if the two lists drift.
 */
export function isPrivatePath(path: string): boolean {
  const canonical = canonicalPath(path).split('?')[0] ?? '/';
  return DISALLOWED_PATHS.some((entry) =>
    entry.includes('*')
      ? segmentPattern(entry).test(canonical)
      : canonical === entry || canonical.startsWith(`${entry}/`),
  );
}

/** One asterisk is one path segment, so a pattern can never reach across a slash. */
function segmentPattern(pattern: string): RegExp {
  const literal = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+');
  return new RegExp(`^${literal}$`);
}

export function findStaticRoute(path: string): StaticRoute | null {
  const canonical = canonicalPath(path).split('?')[0] ?? '/';
  return STATIC_ROUTES.find((route) => route.path === canonical) ?? null;
}

/** Cuts a sentence to fit a search result, on a word boundary. */
export function clipText(text: string, limit: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit || limit < 2) return flat;
  const cut = flat.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  const body = space > limit / 2 ? cut.slice(0, space) : cut;
  return `${body.replace(/[\s,;:.-]+$/, '')}…`;
}

export interface PageMeta {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly image: string;
  readonly robots: 'index,follow,max-image-preview:large' | 'noindex,nofollow';
  readonly type: string;
}

/**
 * What a page says about itself before anybody overrides it. A private path
 * is withheld here rather than later: the rule belongs with the URL, not
 * with the component that happens to render it.
 */
export function metaForPath(path: string): PageMeta {
  const canonical = canonicalPath(path).split('?')[0] ?? '/';
  const route = findStaticRoute(canonical);
  const private_ = isPrivatePath(canonical);
  return {
    path: canonical,
    title: clipText(route?.title ?? `${SITE.shortName} — ${SITE.name}`, 70),
    description: clipText(route?.description ?? SITE.tagline.en, 180),
    image: '/og/og-image.png',
    robots: private_ ? 'noindex,nofollow' : 'index,follow,max-image-preview:large',
    type: route?.type ?? 'website',
  };
}

/* -------------------------------------------------------------------------- */
/* Serialisation                                                              */
/* -------------------------------------------------------------------------- */

/** XML text: five characters, and no HTML entities beyond them. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** HTML attribute and text content, for the strings injected into the head. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface SitemapUrl {
  readonly loc: string;
  readonly lastmod?: string | null;
  readonly changefreq?: string;
  readonly priority?: number;
}

export function sitemapXml(urls: readonly SitemapUrl[], origin: string = SITE.url): string {
  const entries = urls
    .filter((url) => !isPrivatePath(url.loc))
    .map((url) => {
      const lines = [`    <loc>${escapeXml(absoluteUrl(url.loc, origin))}</loc>`];
      const day = (url.lastmod ?? '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) lines.push(`    <lastmod>${day}</lastmod>`);
      if (url.changefreq) lines.push(`    <changefreq>${escapeXml(url.changefreq)}</changefreq>`);
      if (url.priority !== undefined) {
        lines.push(`    <priority>${url.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;
}

export interface SitemapFile {
  readonly loc: string;
  readonly lastmod?: string | null;
}

export function sitemapIndexXml(files: readonly SitemapFile[], origin: string = SITE.url): string {
  const entries = files.map((file) => {
    const day = (file.lastmod ?? '').slice(0, 10);
    const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(day) ? `\n    <lastmod>${day}</lastmod>` : '';
    return `  <sitemap>\n    <loc>${escapeXml(absoluteUrl(file.loc, origin))}</loc>${lastmod}\n  </sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</sitemapindex>
`;
}

/** The static part of the sitemap, which exists on an empty database too. */
export function staticSitemap(origin: string = SITE.url): string {
  return sitemapXml(
    STATIC_ROUTES.map((route) => ({
      loc: route.path,
      changefreq: route.changefreq,
      priority: route.priority,
    })),
    origin,
  );
}

export function robotsTxt(origin: string = SITE.url): string {
  const base = origin.replace(/\/+$/, '');
  return [
    '# Bangladesh Software Development Community',
    `# ${base}`,
    '',
    'User-agent: *',
    'Allow: /',
    ...[...DISALLOWED_PATHS].sort().map((path) => `Disallow: ${path}`),
    '',
    '# Crawl the pages, not the search results.',
    'Disallow: /search?',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

export interface FeedItem {
  readonly path: string;
  readonly title: string;
  readonly summary: string;
  readonly published: string;
  readonly author: string;
}

/** RSS 2.0, because that is what most readers still speak. */
export function rssXml(items: readonly FeedItem[], origin: string = SITE.url): string {
  const base = origin.replace(/\/+$/, '');
  const entries = items
    .map((item) => {
      const url = absoluteUrl(item.path, origin);
      const date = new Date(item.published);
      const pubDate = Number.isNaN(date.getTime()) ? '' : date.toUTCString();
      return [
        '    <item>',
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(clipText(item.summary, 400))}</description>`,
        `      <dc:creator>${escapeXml(item.author)}</dc:creator>`,
        pubDate === '' ? '' : `      <pubDate>${pubDate}</pubDate>`,
        '    </item>',
      ]
        .filter((line) => line !== '')
        .join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.name)}</title>
    <link>${escapeXml(`${base}/`)}</link>
    <description>${escapeXml(SITE.tagline.en)}</description>
    <language>bn-BD</language>
    <atom:link href="${escapeXml(`${base}/rss.xml`)}" rel="self" type="application/rss+xml" />
${entries}
  </channel>
</rss>
`;
}

/* -------------------------------------------------------------------------- */
/* Structured data                                                            */
/* -------------------------------------------------------------------------- */

/** Drops empty values: an empty property in JSON-LD is a validation warning. */
export function pruneJsonLd(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === 'object') {
      const nested = pruneJsonLd(value as Record<string, unknown>);
      if (Object.keys(nested).length === 0) continue;
      out[key] = nested;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export interface Crumb {
  readonly name: string;
  readonly path: string;
}

export function breadcrumbJsonLd(crumbs: readonly Crumb[], origin: string = SITE.url): string {
  return JSON.stringify(
    pruneJsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: absoluteUrl(crumb.path, origin),
      })),
    }),
  );
}

/** The head of a prerendered page, as a string the build writes into HTML. */
export function headTags(meta: PageMeta, origin: string = SITE.url): string {
  const canonical = absoluteUrl(meta.path, origin);
  const image = absoluteUrl(meta.image, origin);
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="robots" content="${meta.robots}" />`,
    `<link rel="alternate" hreflang="bn" href="${escapeHtml(`${canonical}?lang=bn`)}" />`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(`${canonical}?lang=en`)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE.name)}" />`,
    `<meta property="og:type" content="${escapeHtml(meta.type)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join('\n    ');
}
