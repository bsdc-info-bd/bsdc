import { escapeXml, rpc, siteOrigin, xmlResponse, type RpcEnv } from '../_rpc';

/**
 * Cloudflare Pages Function — /sitemaps/<section>-<page>.xml
 *
 * One file of URLs. The section and the page number come out of the
 * filename, and anything that is not a known section is a 404 rather than an
 * empty file, because an empty sitemap tells a crawler the section is gone.
 */
const SECTIONS = [
  'posts',
  'products',
  'courses',
  'groups',
  'events',
  'jobs',
  'projects',
  'tags',
  'profiles',
];
const PAGE_SIZE = 1000;

interface Url {
  loc: string;
  lastmod: string | null;
  changefreq: string;
  priority: number;
}

export const onRequestGet: PagesFunction<RpcEnv, 'file'> = async (context) => {
  const name = String(context.params.file ?? '');
  const match = /^([a-z]+)-(\d+)\.xml$/.exec(name);
  if (!match) return new Response('Not found', { status: 404 });

  const [, section = '', page = '1'] = match;
  if (!SECTIONS.includes(section)) return new Response('Not found', { status: 404 });

  const origin = siteOrigin(context.env, context.request);
  const urls =
    (await rpc<Url[]>(context.env, 'sitemap_urls', {
      p_section: section,
      p_page: Number(page),
      p_size: PAGE_SIZE,
    })) ?? [];

  if (urls.length === 0) return new Response('Not found', { status: 404 });

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => {
      const day = (url.lastmod ?? '').slice(0, 10);
      const lines = [`    <loc>${escapeXml(`${origin}${url.loc}`)}</loc>`];
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) lines.push(`    <lastmod>${day}</lastmod>`);
      lines.push(`    <changefreq>${escapeXml(url.changefreq)}</changefreq>`);
      lines.push(`    <priority>${Number(url.priority).toFixed(1)}</priority>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    }),
    '</urlset>',
    '',
  ].join('\n');

  return xmlResponse(body, 1800);
};
