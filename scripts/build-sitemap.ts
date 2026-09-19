/**
 * BSDC — scripts/build-sitemap.ts
 * Purpose : Writes the sitemap index and the split sitemaps (PART 10.03).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The route table is the single source of truth (ADR-005), so a route marked `noindex` is
 *   absent from the sitemap for the same reason it carries a noindex tag: it is not anybody else's
 *   business. A `planned` route is absent too — a sitemap that advertises a screen that does not
 *   exist yet is how a site teaches crawlers to distrust it.
 *   URLs are split at 45,000 per file, comfortably inside the 50,000 limit, so a growing community
 *   never hits the ceiling without warning. Dynamic pages come from the public-content source; when
 *   there is none, the sitemap lists the static pages and says so rather than inventing URLs.
 *   No Cloudflare Worker is involved at any point (ADR-036): this is a build step, and the output is
 *   a static file served by Cloudflare Pages.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROUTES } from '../src/core/config/routes';
import { SITE_URL } from '../src/core/config/app';
import {
  escapeXml,
  loadPublicContent,
  w3cDate,
  type PublicContentItem,
} from './lib/public-content';
import { localePath } from '../src/shared/lib/url';

/** Maximum URLs in one sitemap file. The specification says 50,000. */
const MAX_URLS_PER_FILE = 45_000;

/** Priority given to each kind of public content. */
const KIND_PRIORITY: Readonly<Record<PublicContentItem['kind'], number>> = {
  page: 0.6,
  event: 0.7,
  job: 0.7,
  project: 0.6,
  profile: 0.5,
  gig: 0.6,
};

/** One entry in a sitemap. */
interface Entry {
  readonly loc: string;
  readonly lastmod: string;
  readonly changeFrequency: string;
  readonly priority: number;
  /** Locale-agnostic path, used to emit the hreflang alternates of this URL. */
  readonly path: string;
}

/**
 * Builds the sitemap entries from the route table and the public-content source.
 * @param items dynamic pages
 * @returns the entries
 */
function entries(items: readonly PublicContentItem[]): readonly Entry[] {
  const now = new Date();
  const staticEntries: Entry[] = ROUTES.filter(
    (route) => route.status === 'live' && route.noindex !== true && !route.path.includes(':'),
  ).map((route) => ({
    loc: `${SITE_URL}${route.path === '/' ? '/' : route.path}`,
    path: route.path,
    lastmod: w3cDate(now.toISOString(), now),
    changeFrequency: route.changeFrequency ?? 'monthly',
    priority: route.priority ?? 0.5,
  }));

  const dynamicEntries: Entry[] = items.map((item) => ({
    loc: `${SITE_URL}${item.path}`,
    path: item.path,
    lastmod: w3cDate(item.updatedAt, now),
    changeFrequency: item.kind === 'event' ? 'daily' : 'weekly',
    priority: KIND_PRIORITY[item.kind],
  }));

  const seen = new Set<string>();
  return [...staticEntries, ...dynamicEntries].filter((entry) => {
    if (seen.has(entry.loc)) return false;
    seen.add(entry.loc);
    return true;
  });
}

/**
 * Renders one sitemap file.
 * @param items the entries to include
 * @returns the XML
 */
function sitemapXml(items: readonly Entry[]): string {
  const urls = items
    .map((entry) => {
      const alternates = [
        `<xhtml:link rel="alternate" hreflang="bn-BD" href="${escapeXml(SITE_URL + localePath('bn', entry.path))}" />`,
        `<xhtml:link rel="alternate" hreflang="en-GB" href="${escapeXml(SITE_URL + localePath('en', entry.path))}" />`,
        `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(entry.loc)}" />`,
      ].join('\n    ');
      return (
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n` +
        `    ${alternates}\n` +
        `    <lastmod>${entry.lastmod}</lastmod>\n` +
        `    <changefreq>${entry.changeFrequency}</changefreq>\n` +
        `    <priority>${entry.priority.toFixed(1)}</priority>\n  </url>`
      );
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/**
 * Renders the sitemap index.
 * @param files names of the sitemap files
 * @param now the build instant
 * @returns the XML
 */
function indexXml(files: readonly string[], now: Date): string {
  const stamp = w3cDate(now.toISOString(), now);
  const entries = files
    .map(
      (file) =>
        `  <sitemap>\n    <loc>${escapeXml(`${SITE_URL}/${file}`)}</loc>\n` +
        `    <lastmod>${stamp}</lastmod>\n  </sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

/** Writes every sitemap file and the index. */
function main(): void {
  const now = new Date();
  const all = entries(loadPublicContent());
  const out = resolve(process.cwd(), 'public');
  mkdirSync(out, { recursive: true });

  const chunks: Entry[][] = [];
  for (let index = 0; index < all.length; index += MAX_URLS_PER_FILE) {
    chunks.push(all.slice(index, index + MAX_URLS_PER_FILE));
  }
  // One page is still one sitemap, so a small site has a stable, predictable set of files.
  if (chunks.length === 0) chunks.push([]);

  const files = chunks.map((_chunk, index) => `sitemap-${index + 1}.xml`);
  chunks.forEach((chunk, index) => {
    writeFileSync(resolve(out, files[index] ?? 'sitemap-1.xml'), sitemapXml(chunk), 'utf8');
  });
  writeFileSync(resolve(out, 'sitemap.xml'), indexXml(files, now), 'utf8');

  console.info(
    `[bsdc] sitemap written: ${all.length} URL(s) in ${files.length} file(s); index at /sitemap.xml`,
  );
}

main();
