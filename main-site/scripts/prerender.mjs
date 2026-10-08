#!/usr/bin/env node
/**
 * Build-time prerender.
 *
 * Vite produces one `index.html` with an empty root element. A crawler that
 * does not run scripts — and plenty still do not, including most link
 * preview fetchers — sees nothing in it. This step writes one real HTML file
 * per public route, with the page's own head and a readable summary of the
 * page inside the root element, which React replaces on hydration.
 *
 * The head is produced by the same rules as `src/lib/seo/engine.ts`, and a
 * test asserts the two agree, so the HTML served to a crawler and the HTML
 * rendered for a visitor cannot drift apart.
 *
 * Outputs (into dist/): one index.html per route, sitemap.xml, robots.txt.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const distDir = resolve(appRoot, 'dist');
const routesFile = resolve(appRoot, 'src/lib/seo/static-routes.json');

const SITE_URL = process.env.SITE_URL ?? 'https://www.bsdc.info.bd';
const SITE_NAME = 'Bangladesh Software Development Community';
const SITE_TAGLINE = 'The open developer community of Bangladesh';

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function absoluteUrl(path, origin = SITE_URL) {
  const base = origin.replace(/\/+$/, '');
  return path === '/' ? `${base}/` : `${base}${path}`;
}

/** The head of one page: identical in shape to `headTags()` in the engine. */
export function renderHead(route, origin = SITE_URL) {
  const canonical = absoluteUrl(route.path, origin);
  const image = `${origin.replace(/\/+$/, '')}/og/og-image.png`;
  return [
    `<title>${escapeHtml(route.title)}</title>`,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    `<link rel="alternate" hreflang="bn" href="${escapeHtml(`${canonical}?lang=bn`)}" />`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(`${canonical}?lang=en`)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:type" content="${escapeHtml(route.type)}" />`,
    `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join('\n    ');
}

/** The JSON-LD graph every page carries, with the page itself added to it. */
export function renderJsonLd(route, origin = SITE_URL) {
  const base = origin.replace(/\/+$/, '');
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: SITE_NAME,
      alternateName: 'BSDC',
      url: `${base}/`,
      logo: `${base}/icons/icon-512.png`,
      parentOrganization: { '@type': 'Organization', name: 'RRC Development' },
    },
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      url: `${base}/`,
      name: SITE_NAME,
      description: SITE_TAGLINE,
      publisher: { '@id': `${base}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${base}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${absoluteUrl(route.path, origin)}#webpage`,
      url: absoluteUrl(route.path, origin),
      name: route.title,
      description: route.description,
      isPartOf: { '@id': `${base}/#website` },
    },
  ];
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  })}</script>`;
}

/**
 * What sits inside #root until React takes over. It is the page in words:
 * a heading, a sentence, and links to every other public page, so a crawler
 * that never runs a script can still find the whole site.
 */
export function renderShell(route, routes) {
  const links = routes
    .filter((other) => other.path !== route.path)
    .map((other) => `<li><a href="${other.path}">${escapeHtml(other.heading)}</a></li>`)
    .join('');
  // The home page keeps the marker the edge function fills with the live
  // feed; every other route is complete as it stands.
  const feedMarker = route.path === '/' ? '<div data-prerender-feed="home"></div>' : '';
  return [
    '<div data-prerender="true">',
    feedMarker,
    `<h1>${escapeHtml(route.heading)}</h1>`,
    `<p>${escapeHtml(route.summary)}</p>`,
    `<nav aria-label="Sections"><ul>${links}</ul></nav>`,
    '</div>',
  ].join('');
}

/**
 * Strips the placeholder head the template carries. A page with two
 * canonical links or two og:title tags is worse than a page with none: the
 * crawler picks one and nobody can predict which.
 */
export function stripTemplateHead(template) {
  return template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/[ \t]*<meta\s+name="description"[\s\S]*?\/>\s*/i, '')
    .replace(/[ \t]*<meta\s+name="robots"[^>]*>\s*/i, '')
    .replace(/[ \t]*<link\s+rel="canonical"[^>]*>\s*/i, '')
    .replace(/[ \t]*<meta\s+property="og:[\s\S]*?\/>\s*/gi, '')
    .replace(/[ \t]*<meta\s+name="twitter:[\s\S]*?\/>\s*/gi, '')
    .replace(/[ \t]*<!--[\s\S]*?Defaults for the social preview[\s\S]*?-->\s*/i, '');
}

export function renderPage(template, route, routes, origin = SITE_URL) {
  const head = `${renderHead(route, origin)}\n    ${renderJsonLd(route, origin)}`;
  return stripTemplateHead(template)
    .replace('</head>', `  ${head}\n  </head>`)
    .replace(
      /<div id="root">[\s\S]*?<\/div>/i,
      `<div id="root">${renderShell(route, routes)}</div>`,
    );
}

export function renderSitemap(routes, origin = SITE_URL) {
  const entries = routes
    .map((route) =>
      [
        '  <url>',
        `    <loc>${escapeXml(absoluteUrl(route.path, origin))}</loc>`,
        `    <changefreq>${escapeXml(route.changefreq)}</changefreq>`,
        `    <priority>${route.priority.toFixed(1)}</priority>`,
        '  </url>',
      ].join('\n'),
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

export function renderRobots(disallow, origin = SITE_URL) {
  const base = origin.replace(/\/+$/, '');
  return [
    '# Bangladesh Software Development Community',
    `# ${base}`,
    '',
    'User-agent: *',
    'Allow: /',
    ...[...disallow].sort().map((path) => `Disallow: ${path}`),
    '',
    '# Crawl the pages, not the search results.',
    'Disallow: /search?',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

async function main() {
  const { routes, disallow } = JSON.parse(await readFile(routesFile, 'utf8'));
  const template = await readFile(join(distDir, 'index.html'), 'utf8');

  for (const route of routes) {
    const html = renderPage(template, route, routes);
    const target =
      route.path === '/'
        ? join(distDir, 'index.html')
        : join(distDir, route.path.slice(1), 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html, 'utf8');
  }

  await writeFile(join(distDir, 'sitemap-static.xml'), renderSitemap(routes), 'utf8');
  await writeFile(join(distDir, 'robots.txt'), renderRobots(disallow), 'utf8');

  process.stdout.write(`prerendered ${routes.length} routes into dist/\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
