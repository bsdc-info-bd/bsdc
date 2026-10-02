import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DISALLOWED_PATHS,
  STATIC_ROUTES,
  absoluteUrl,
  breadcrumbJsonLd,
  canonicalPath,
  clipText,
  escapeHtml,
  escapeXml,
  findStaticRoute,
  headTags,
  isPrivatePath,
  metaForPath,
  pruneJsonLd,
  robotsTxt,
  rssXml,
  sitemapIndexXml,
  sitemapXml,
  staticSitemap,
} from './engine';
import {
  renderHead,
  renderPage,
  renderRobots,
  renderShell,
  renderSitemap,
  // The build script is plain JavaScript on purpose: it runs with bare node
  // before anything is compiled. It is imported here, through its hand
  // written declaration file, so the HTML it writes is held to the same
  // assertions as the HTML the application renders.
} from '../../../scripts/prerender.mjs';

const ORIGIN = 'https://www.bsdc.info.bd';

describe('one canonical form for a URL', () => {
  it('folds the ways a link can be written into one', () => {
    expect(canonicalPath('/About/')).toBe('/about');
    expect(canonicalPath('about')).toBe('/about');
    expect(canonicalPath('//shop///thing//')).toBe('/shop/thing');
    expect(canonicalPath('/post#comments')).toBe('/post');
    expect(canonicalPath('')).toBe('/');
  });

  it('drops the parameters that identify a campaign, not a page', () => {
    expect(canonicalPath('/jobs?utm_source=newsletter&utm_medium=email')).toBe('/jobs');
    expect(canonicalPath('/p/a?fbclid=xyz')).toBe('/p/a');
    expect(canonicalPath('/search?q=react&utm_campaign=x')).toBe('/search?q=react');
  });

  it('keeps the parameters that identify a page, in a stable order', () => {
    expect(canonicalPath('/search?page=2&q=rust')).toBe('/search?page=2&q=rust');
    expect(canonicalPath('/search?q=rust&page=2')).toBe('/search?page=2&q=rust');
  });

  it('builds an absolute URL without doubling the slash on the home page', () => {
    expect(absoluteUrl('/', ORIGIN)).toBe('https://www.bsdc.info.bd/');
    expect(absoluteUrl('/about/', `${ORIGIN}/`)).toBe('https://www.bsdc.info.bd/about');
  });
});

describe('pages that must never be indexed', () => {
  it('recognises a private area and everything under it', () => {
    expect(isPrivatePath('/messages')).toBe(true);
    expect(isPrivatePath('/messages/abc')).toBe(true);
    expect(isPrivatePath('/Settings/')).toBe(true);
    expect(isPrivatePath('/admin/analytics')).toBe(true);
    expect(isPrivatePath('/jobs')).toBe(false);
  });

  it('withholds them in the metadata rather than hoping a component remembers', () => {
    expect(metaForPath('/messages/123').robots).toBe('noindex,nofollow');
    expect(metaForPath('/jobs').robots).toBe('index,follow,max-image-preview:large');
  });

  it('never lists a private path in a sitemap, even if asked to', () => {
    const xml = sitemapXml([{ loc: '/settings' }, { loc: '/jobs' }], ORIGIN);
    expect(xml).not.toContain('/settings');
    expect(xml).toContain('/jobs');
  });
});

describe('what a page says about itself', () => {
  it('has a title and a description for every static route', () => {
    for (const route of STATIC_ROUTES) {
      expect(route.title.length).toBeGreaterThan(10);
      expect(route.title.length).toBeLessThanOrEqual(70);
      expect(route.description.length).toBeGreaterThan(50);
      expect(route.description.length).toBeLessThanOrEqual(180);
      expect(route.path).toBe(canonicalPath(route.path));
    }
  });

  it('never lists the same route twice', () => {
    const paths = STATIC_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('falls back to the site description for a page nobody has written copy for', () => {
    expect(findStaticRoute('/not-a-route')).toBeNull();
    expect(metaForPath('/not-a-route').description.length).toBeGreaterThan(10);
  });

  it('cuts overlong text on a word boundary', () => {
    expect(clipText('Bangladesh Software Development Community', 20).endsWith('…')).toBe(true);
    expect(clipText('  spaced   out ', 50)).toBe('spaced out');
  });
});

describe('escaping', () => {
  it('escapes the five characters XML cares about', () => {
    expect(escapeXml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
  });

  it('escapes HTML without inventing entities', () => {
    expect(escapeHtml('A & B <c> "d"')).toBe('A &amp; B &lt;c&gt; &quot;d&quot;');
  });
});

describe('the files crawlers fetch', () => {
  it('writes a valid static sitemap covering every public route', () => {
    const xml = staticSitemap(ORIGIN);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.match(/<url>/g)).toHaveLength(STATIC_ROUTES.length);
    expect(xml).toContain('<loc>https://www.bsdc.info.bd/</loc>');
    expect(xml).toContain('<priority>1.0</priority>');
  });

  it('omits a lastmod it cannot vouch for', () => {
    expect(sitemapXml([{ loc: '/a', lastmod: 'who knows' }], ORIGIN)).not.toContain('<lastmod>');
    expect(sitemapXml([{ loc: '/a', lastmod: '2026-02-03T00:00:00Z' }], ORIGIN)).toContain(
      '<lastmod>2026-02-03</lastmod>',
    );
  });

  it('writes a sitemap index of files', () => {
    const xml = sitemapIndexXml([{ loc: '/sitemaps/posts-1.xml', lastmod: null }], ORIGIN);
    expect(xml).toContain('<loc>https://www.bsdc.info.bd/sitemaps/posts-1.xml</loc>');
  });

  it('disallows every private area in robots.txt and points at the sitemap', () => {
    const txt = robotsTxt(ORIGIN);
    for (const path of DISALLOWED_PATHS) expect(txt).toContain(`Disallow: ${path}`);
    expect(txt).toContain('Sitemap: https://www.bsdc.info.bd/sitemap.xml');
  });

  it('writes an RSS feed with escaped titles and RFC 822 dates', () => {
    const xml = rssXml(
      [
        {
          path: '/p/hello',
          title: 'Tabs & spaces',
          summary: 'A short post about whitespace.',
          published: '2026-03-04T05:06:07Z',
          author: 'Ayesha Rahman',
        },
      ],
      ORIGIN,
    );
    expect(xml).toContain('<title>Tabs &amp; spaces</title>');
    expect(xml).toContain('<pubDate>Wed, 04 Mar 2026 05:06:07 GMT</pubDate>');
    expect(xml).toContain('<guid isPermaLink="true">https://www.bsdc.info.bd/p/hello</guid>');
  });

  it('leaves out a date it cannot parse rather than writing Invalid Date', () => {
    const xml = rssXml(
      [{ path: '/p/a', title: 'A', summary: 'B', published: 'soon', author: 'C' }],
      ORIGIN,
    );
    expect(xml).not.toContain('pubDate');
  });
});

describe('structured data', () => {
  it('drops empty properties rather than emitting them', () => {
    expect(pruneJsonLd({ a: 'x', b: '', c: null, d: [], e: { f: '' }, g: { h: 'i' } })).toEqual({
      a: 'x',
      g: { h: 'i' },
    });
  });

  it('numbers breadcrumbs from one and makes every item absolute', () => {
    const json = JSON.parse(
      breadcrumbJsonLd(
        [
          { name: 'Home', path: '/' },
          { name: 'Jobs', path: '/jobs' },
        ],
        ORIGIN,
      ),
    ) as { itemListElement: { position: number; item: string }[] };
    expect(json.itemListElement[0]?.position).toBe(1);
    expect(json.itemListElement[1]?.item).toBe('https://www.bsdc.info.bd/jobs');
  });
});

describe('the build-time prerender and the application agree', () => {
  const home = STATIC_ROUTES[0]!;

  it('produces exactly the head the engine would produce', () => {
    expect(renderHead(home, ORIGIN)).toBe(headTags(metaForPath(home.path), ORIGIN));
  });

  it('agrees for every route, which is the point of the assertion', () => {
    for (const route of STATIC_ROUTES) {
      expect(renderHead(route, ORIGIN)).toBe(headTags(metaForPath(route.path), ORIGIN));
    }
  });

  it('writes the same sitemap and robots.txt as the engine', () => {
    expect(renderSitemap(STATIC_ROUTES, ORIGIN)).toBe(staticSitemap(ORIGIN));
    expect(renderRobots(DISALLOWED_PATHS, ORIGIN)).toBe(robotsTxt(ORIGIN));
  });

  it('puts words inside the root element for a crawler that runs no scripts', () => {
    const shell = renderShell(home, STATIC_ROUTES);
    expect(shell).toContain(`<h1>${home.heading}</h1>`);
    expect(shell).toContain('href="/jobs"');
    expect(shell).not.toContain(`href="${home.path}"`);
  });

  it('replaces the template head and root rather than appending to them', () => {
    const template = [
      '<!doctype html><html><head><title>Old</title>',
      '<meta name="description" content="Old" />',
      '<meta name="robots" content="index,follow" />',
      '<link rel="canonical" href="https://www.bsdc.info.bd/" />',
      '<meta property="og:title" content="Old" />',
      '<meta name="twitter:title" content="Old" />',
      '</head><body><div id="root"></div></body></html>',
    ].join('\n');
    const html = renderPage(template, home, STATIC_ROUTES, ORIGIN);
    expect(html).not.toContain('content="Old"');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/name="robots"/g)).toHaveLength(1);
    expect(html).toContain('application/ld+json');
    expect(html).toContain('<h1>Bangladesh Software Development Community</h1>');
  });

  it('leaves the real template with exactly one of each head tag', () => {
    const template = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const html = renderPage(template, STATIC_ROUTES[1]!, STATIC_ROUTES, ORIGIN);
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/property="og:url"/g)).toHaveLength(1);
    expect(html.match(/name="twitter:image"/g)).toHaveLength(1);
    expect(html).toContain('href="https://www.bsdc.info.bd/about"');
  });
});
