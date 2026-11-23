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
import { statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

export function alternateLangUrl(canonical, lang) {
  try {
    const parsed = new URL(canonical);
    parsed.searchParams.set('lang', lang);
    return parsed.toString();
  } catch {
    return `${canonical}${canonical.includes('?') ? '&' : '?'}lang=${lang}`;
  }
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
    `<link rel="alternate" hreflang="bn" href="${escapeHtml(alternateLangUrl(canonical, 'bn'))}" />`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(alternateLangUrl(canonical, 'en'))}" />`,
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

/**
 * The stylesheet the template links, inlined into each page.
 *
 * A `<link rel="stylesheet">` is render-blocking: nothing paints until it
 * arrives, and on a mobile connection that is one more round trip in front of
 * the first pixel. The file is the whole design system for every route — it is
 * needed everywhere, it weighs ~11 kB compressed, and the HTML that carries it
 * is already being fetched, so inlining removes a request instead of adding
 * one. Critical-CSS extraction would split the same file in two and still leave
 * a request for the rest.
 */
export function inlineStyles(html, cssByHref) {
  return html.replace(/[ \t]*<link[^>]*rel="stylesheet"[^>]*>[ \t]*\n?/g, (tag) => {
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    const css = href ? cssByHref.get(href) : undefined;
    if (css === undefined) return tag;
    return `<style>${css}</style>\n`;
  });
}

/** Every stylesheet the template links, keyed by its href. */
export async function readStylesheets(template, distDir) {
  const hrefs = [...template.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)]
    .map((match) => /href="([^"]+)"/.exec(match[0])?.[1])
    .filter((href) => typeof href === 'string' && href.startsWith('/'));
  const styles = new Map();
  for (const href of hrefs) {
    try {
      styles.set(href, await readFile(join(distDir, href.replace(/^\//, '')), 'utf8'));
    } catch {
      // A stylesheet that is not on disk stays a link; the page still works.
    }
  }
  return styles;
}

/**
 * The chunks a page needs to render, from Vite's build manifest.
 *
 * The route components are lazy: the entry script runs, discovers `import()`,
 * and only then asks for the page. That is a second round trip in front of the
 * first screen, and the prerender step knows the answer already — it is writing
 * that page. The route's own chunk and the chunks that stand behind it are named
 * in the head, so the browser fetches them alongside the entry instead of after
 * it — the ten largest, because those are the downloads a first screen waits on.
 */
export function modulePreloadHrefs(route, manifest, seen = new Set()) {
  const key = `src/routes/${route.component}.tsx`;
  const entry = manifest[key];
  if (!entry) return [];
  const url = (file) => (file.startsWith('assets/') ? `/${file}` : `/assets/${file}`);
  // The whole static graph, then the ten biggest files in it. Depth was capped
  // at one hop before, which sounds conservative and is not: the chunks that
  // hurt are deeper — the Supabase client and the markdown renderer are shared,
  // so a page imports them *through* a design-system chunk, and a one-hop walk
  // never named them. The browser then asked for them after it had already run
  // the page that imports them, which is one more round trip in front of the
  // first screen on every route that reaches for them.
  //
  // Walking the graph fully cannot add a request, because these are static
  // `import`s: a module's entire static graph is fetched before it runs. So the
  // only question is whether the fetches start together or in series, and the
  // ten-largest ranking spends the head's budget on the downloads a first
  // screen waits on. Chunks already preloaded by the template are seeded into
  // `seen`, so no slot is spent repeating one.
  const pool = [];
  const visit = (chunk) => {
    if (!chunk || pool.length >= 400) return;
    for (const file of [chunk.file, ...(chunk.css ?? [])]) {
      if (!file || seen.has(file) || pool.length >= 400) continue;
      seen.add(file);
      pool.push(file);
    }
    for (const imported of chunk.imports ?? []) visit(manifest[imported]);
  };
  visit(entry);
  const bytes = (file) => {
    try {
      return statSync(join(distDir, file)).size;
    } catch {
      // A manifest without a build next to it — a unit test, mostly — has no
      // sizes to rank by, and the walk order is the answer.
      return 0;
    }
  };
  return pool
    .map((file, index) => ({ file, index, size: bytes(file) }))
    .sort((a, b) => b.size - a.size || a.index - b.index)
    .slice(0, 10)
    .map(({ file }) => url(file));
}

/** The `<link rel="modulepreload">` tags for one page. */
export function modulePreloadTags(hrefs) {
  return hrefs
    .map((href) => `<link rel="modulepreload" crossorigin href="${escapeHtml(href)}" />`)
    .join('\n    ');
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
/**
 * The hero, in the shape the page itself will render it.
 *
 * LCP is the *largest* contentful paint: a later element replaces an earlier one only
 * when it covers more. So the first paint has to be the hero at the hero's own size,
 * in the hero's own container, or the score measures when the JavaScript finished
 * rather than when the words appeared. These are the three shapes the public pages
 * open with, copied exactly — and `engine.test.ts` fails if a class string here stops
 * appearing in the component it came from, which is what makes copying them here safe
 * instead of rendering the component at build time.
 */
const HERO_SHAPES = {
  home: ({ eyebrow, title, description }) =>
    [
      eyebrow
        ? `<p class="text-xs font-semibold uppercase tracking-wide text-green-700">${escapeHtml(eyebrow)}</p>`
        : '',
      `<h1 class="mt-2 text-4xl">${escapeHtml(title)}</h1>`,
      `<p class="mt-3 max-w-[60ch] text-base text-muted">${escapeHtml(description)}</p>`,
    ]
      .filter(Boolean)
      .join(''),
  listHero: ({ title, description }) =>
    [
      '<header class="relative mb-6 overflow-hidden rounded-3xl bsdc-hero p-5 shadow-lg sm:p-8">',
      '<div class="relative flex flex-wrap items-start gap-4">',
      '<div class="min-w-0 flex-1">',
      `<h1 class="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">${escapeHtml(title)}</h1>`,
      `<p class="mt-2 max-w-2xl text-sm leading-6 text-on-hero/90">${escapeHtml(description)}</p>`,
      '</div>',
      '</div>',
      '</header>',
    ].join(''),
  // The component renders an `h2`; the shell keeps the `h1`, at the same size. A
  // crawler's document wants one top-level heading, and paint area — which is what
  // LCP compares — comes from the classes, not from the tag.
  sectionHeading: ({ title, description }) =>
    [
      '<div class="mb-3 flex flex-wrap items-end justify-between gap-2">',
      '<div class="min-w-0">',
      `<h1 class="text-2xl">${escapeHtml(title)}</h1>`,
      `<p class="mt-1 max-w-prose text-sm text-muted">${escapeHtml(description)}</p>`,
      '</div>',
      '</div>',
    ].join(''),
};

export function renderShell(route, routes) {
  const links = routes
    .filter((other) => other.path !== route.path)
    .map(
      (other) =>
        `<li><a class="fab-tap inline-flex rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted" href="${other.path}">${escapeHtml(other.heading)}</a></li>`,
    )
    .join('');
  // The home page keeps the marker the edge function fills with the live
  // feed; every other route is complete as it stands.
  const feedMarker = route.path === '/' ? '<div data-prerender-feed="home"></div>' : '';
  /**
   * Styled with the page's own classes, not bare tags.
   *
   * Two reasons, and the second is the one that matters. First, this markup is
   * the no-JavaScript page: it should look like BSDC rather than like a plain
   * document. Second, it is the largest thing on the screen before React runs,
   * and an unstyled heading is a *different size* from the styled one — so the
   * moment React painted the real hero, the browser recorded a second, later
   * largest paint and the page's LCP became "when did the JavaScript finish"
   * instead of "when did the content appear". Rendered at the same width, in
   * the same classes, the replacement does not repaint anything larger.
   *
   * The stylesheet is inlined into every page (see `inlineStyles`), so these
   * classes are already on the critical path and cost nothing extra.
   */
  /**
   * The page's own opening, in full.
   *
   * `summary` is one sentence about the page; `opening` is the page — the
   * paragraphs a reader sees first, taken from the same locale bundle the
   * application renders. Without them the shell was shorter than the page it
   * was standing in for, and the browser recorded the application's later,
   * taller paint as the largest content on the screen: LCP became "when did
   * the JavaScript finish" on every text page. With them the first paint is
   * the page, and it is the page for a reader whose scripts never run.
   */
  const opening = (route.opening ?? [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  const shape = route.hero ? HERO_SHAPES[route.hero.shape] : undefined;
  const hero = shape ? shape(route.hero) : '';
  const heading = route.path === '/' ? 'text-4xl' : 'text-3xl';
  return [
    '<div data-prerender="true">',
    feedMarker,
    '<section class="fab-container py-6 sm:py-10">',
    hero === ''
      ? [
          `<h1 class="${heading}">${escapeHtml(route.heading)}</h1>`,
          `<p class="mt-3 max-w-[60ch] text-base text-muted">${escapeHtml(route.summary)}</p>`,
        ].join('')
      : hero,
    opening === '' ? '' : `<div class="mt-6 max-w-[72ch] text-base">${opening}</div>`,
    `<nav class="mt-5" aria-label="Sections"><ul class="flex flex-wrap gap-2">${links}</ul></nav>`,
    '</section>',
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
      /<div id="root">(?:<div[^>]*><\/div>)?<\/div>/i,
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
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(join(distDir, '.vite', 'manifest.json'), 'utf8'));
  } catch {
    // A build without the manifest still prerenders; the pages just keep the
    // entry script as the only script on the critical path.
  }
  const styles = await readStylesheets(template, distDir);
  // The entry script's own chunks are already named in the template; a page's
  // budget must go to what the template cannot know it will need.
  const templatePreloads = new Set(
    [...template.matchAll(/rel="modulepreload"[^>]*href="\/([^"]+)"/g)].map((match) =>
      match[1].replace(/^\//, ''),
    ),
  );

  for (const route of routes) {
    // Anything the template already preloads (the entry chunk, the vendor
    // split) is not named twice.
    const preload = modulePreloadTags(
      // A copy per route: the walk marks files as seen as it goes, and a shared
      // set would let the first page claimed every slot for the rest.
      modulePreloadHrefs(route, manifest, new Set(templatePreloads)).filter(
        (href) => !template.includes(href),
      ),
    );
    const html = inlineStyles(
      renderPage(template, route, routes).replace('</head>', `  ${preload}\n  </head>`),
      styles,
    );
    const target =
      route.path === '/'
        ? join(distDir, 'index.html')
        : join(distDir, route.path.slice(1), 'index.html');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html, 'utf8');
  }

  // The manifest is a build artefact, not a public file.
  await rm(join(distDir, '.vite'), { recursive: true, force: true });

  await writeFile(join(distDir, 'sitemap-static.xml'), renderSitemap(routes), 'utf8');
  await writeFile(join(distDir, 'robots.txt'), renderRobots(disallow), 'utf8');

  process.stdout.write(`prerendered ${routes.length} routes into dist/\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
