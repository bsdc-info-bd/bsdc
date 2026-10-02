import { escapeXml, rpc, siteOrigin, xmlResponse, type RpcEnv } from './_rpc';

/**
 * Cloudflare Pages Function — /sitemap.xml
 *
 * The index. The static half is built at deploy time and never changes
 * between deploys; the rest is counted live, because a sitemap that lags a
 * day behind the content is a sitemap that teaches a crawler to come back
 * less often.
 */
interface Section {
  section: string;
  urls: number;
  pages: number;
  lastmod: string | null;
}

export const onRequestGet: PagesFunction<RpcEnv> = async (context) => {
  const origin = siteOrigin(context.env, context.request);
  const sections = (await rpc<Section[]>(context.env, 'sitemap_sections', { p_size: 1000 })) ?? [];

  const files: { loc: string; lastmod: string | null }[] = [
    { loc: `${origin}/sitemap-static.xml`, lastmod: null },
  ];
  for (const section of sections) {
    for (let page = 1; page <= Math.max(1, section.pages); page += 1) {
      files.push({
        loc: `${origin}/sitemaps/${section.section}-${page}.xml`,
        lastmod: section.lastmod,
      });
    }
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...files.map((file) => {
      const day = (file.lastmod ?? '').slice(0, 10);
      const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(day) ? `\n    <lastmod>${day}</lastmod>` : '';
      return `  <sitemap>\n    <loc>${escapeXml(file.loc)}</loc>${lastmod}\n  </sitemap>`;
    }),
    '</sitemapindex>',
    '',
  ].join('\n');

  return xmlResponse(body);
};
