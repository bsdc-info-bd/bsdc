import {
  escapeHtml,
  HOME_FEED_SELECTOR,
  homeFeedQuery,
  renderHomeFeed,
  renderHomeFeedJsonLd,
  renderHomeFeedPreload,
  type HomeFeedPost,
} from '../src/lib/seo/home-feed';
import { isEdgeNoindexPath, matchAppRoute } from '../src/lib/seo/app-routes';
import { resolveSupabasePublic, rpc, siteOrigin, supabaseAnonHeaders, type RpcEnv } from './_rpc';

/**
 * Cloudflare Pages Function — middleware for every request.
 *
 * Two jobs, both of which only the edge can do.
 *
 * A URL that has moved is answered with a redirect before the single-page
 * application loads, so the visitor makes one request and the search engine
 * sees a proper 301 rather than a 200 followed by a client-side jump.
 *
 * A URL whose content lives in the database — a post, a product, a course —
 * is served the application shell with its own title, description and share
 * image written into the head. React writes the same values again on
 * hydration; the difference is that a crawler or a link preview fetcher that
 * never runs a script now gets them too.
 *
 * The home page gets the same treatment for its feed: the newest public posts
 * are written into the shell as real articles and as an ItemList, so the front
 * door of the site is readable before anybody signs in — and readable to
 * something that will never sign in at all. That response is cached at the
 * edge for five minutes, which is what keeps it fast.
 */
interface SeoRow {
  path: string;
  title: string;
  description: string;
  image_url: string;
  canonical: string;
  robots: string;
  source: string;
  updated_at?: string | null;
}

interface RedirectRow {
  target: string;
  status: number;
}

/**
 * Addresses whose title, description and image live in the database. Every one
 * of these is looked up with seo_for_path, which answers for a missing record as
 * well, so a crawler never gets the site's home description for a page that is
 * not there. Member permalinks (/@name, and the bare /name form) are looked up
 * through the route match, not this list.
 */
const RECORD_PAGES = [
  /^\/p\/[^/]+$/,
  /^\/shop\/[^/]+$/,
  /^\/learn\/[^/]+$/,
  /^\/g\/[^/]+$/,
  /^\/projects\/[^/]+$/,
  /^\/jobs\/[^/]+$/,
  /^\/events\/[^/]+$/,
  /^\/freelance\/[^/]+$/,
  /^\/tag\/[^/]+$/,
];

function isRecordPage(pathname: string): boolean {
  return RECORD_PAGES.some((pattern) => pattern.test(pathname));
}

class SetText {
  constructor(private readonly value: string) {}
  element(element: Element): void {
    element.setInnerContent(this.value);
  }
}

class ReplaceInner {
  constructor(private readonly html: string) {}
  element(element: Element): void {
    element.setInnerContent(this.html, { html: true });
  }
}

class AppendHtml {
  constructor(private readonly html: string) {}
  element(element: Element): void {
    element.append(this.html, { html: true });
  }
}

class SetAttribute {
  constructor(
    private readonly name: string,
    private readonly value: string,
  ) {}
  element(element: Element): void {
    element.setAttribute(this.name, this.value);
  }
}

class RemoveElement {
  element(element: Element): void {
    element.remove();
  }
}

function edgeAlternateLangUrl(canonical: string, lang: 'bn' | 'en'): string {
  try {
    const parsed = new URL(canonical);
    parsed.searchParams.set('lang', lang);
    return parsed.toString();
  } catch {
    return `${canonical}${canonical.includes('?') ? '&' : '?'}lang=${lang}`;
  }
}

function ogTypeForPath(seoPath: string): 'article' | 'profile' | 'website' {
  if (seoPath.startsWith('/p/') || seoPath.startsWith('/learn/')) return 'article';
  if (seoPath.startsWith('/@')) return 'profile';
  return 'website';
}

function edgeRecordJsonLd(
  seoPath: string,
  meta: SeoRow,
  canonical: string,
  image: string,
  origin: string,
): string {
  const base = origin.replace(/\/+$/, '');
  let entityType = 'WebPage';
  if (seoPath.startsWith('/p/')) entityType = 'Article';
  else if (seoPath.startsWith('/projects/')) entityType = 'SoftwareSourceCode';
  else if (seoPath.startsWith('/tag/') || seoPath.startsWith('/g/')) entityType = 'CollectionPage';
  else if (seoPath.startsWith('/@')) entityType = 'ProfilePage';

  const modified =
    typeof meta.updated_at === 'string' && meta.updated_at.trim().length > 0
      ? { dateModified: meta.updated_at.trim() }
      : {};

  const node: Record<string, unknown> =
    entityType === 'ProfilePage'
      ? {
          '@type': 'ProfilePage',
          url: canonical,
          mainEntity: {
            '@type': 'Person',
            name: meta.title,
            description: meta.description,
            url: canonical,
            image,
          },
        }
      : entityType === 'Article'
        ? {
            '@type': 'Article',
            headline: meta.title,
            description: meta.description,
            url: canonical,
            image,
            ...modified,
            mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
            publisher: { '@id': `${base}/#organization` },
          }
        : {
            '@type': entityType,
            name: meta.title,
            description: meta.description,
            url: canonical,
            image,
            ...(entityType === 'SoftwareSourceCode' ? modified : {}),
          };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: 'Bangladesh Software Development Community',
        alternateName: 'BSDC',
        url: `${base}/`,
        logo: `${base}/icons/icon-512.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: `${base}/`,
        name: 'Bangladesh Software Development Community',
        publisher: { '@id': `${base}/#organization` },
      },
      node,
    ],
  };

  return `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`;
}

function edgeRecordShell(meta: SeoRow, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  const sections = [
    ['/', 'Home'],
    ['/shop', 'Marketplace'],
    ['/jobs', 'Jobs'],
    ['/freelance', 'Freelance'],
    ['/projects', 'Projects'],
    ['/learn', 'Learning'],
    ['/groups', 'Groups'],
    ['/events', 'Events'],
  ]
    .map(([href, label]) => `<li><a href="${base}${href}">${label}</a></li>`)
    .join('');

  return [
    '<article>',
    `<h1>${escapeHtml(meta.title)}</h1>`,
    `<p>${escapeHtml(meta.description)}</p>`,
    '</article>',
    `<nav aria-label="Sections"><ul>${sections}</ul></nav>`,
  ].join('');
}

/** The newest public posts, as the anonymous visitor would read them. */
async function fetchHomeFeed(env: RpcEnv, limit: number): Promise<HomeFeedPost[]> {
  const target = resolveSupabasePublic(env);
  if (target === null) return [];
  try {
    const response = await fetch(`${target.base}/rest/v1/${homeFeedQuery(limit)}`, {
      headers: supabaseAnonHeaders(target.key),
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as HomeFeedPost[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    // An unreachable database costs the feed copy, never the page.
    return [];
  }
}

function isStaticAssetPath(pathname: string): boolean {
  return (
    /^\/(?:api|__|assets|icons|\.well-known)\//.test(pathname) ||
    /\.(?:js|mjs|css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|map|json|webmanifest|txt|xml)$/i.test(
      pathname,
    )
  );
}

function safeRedirectTarget(rawTarget: string, origin: string, search: string): string | null {
  const trimmed = rawTarget.trim();
  if (trimmed === '' || trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('/')) return `${origin}${trimmed}${search}`;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (host === 'bsdc.info.bd' || host.endsWith('.bsdc.info.bd')) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export const onRequest: PagesFunction<RpcEnv> = async (context) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';

  // Never run SEO/database redirects in front of auth callbacks, feeds or assets.
  if (pathname === '/playground/runner' || isStaticAssetPath(pathname)) return context.next();

  // 1. Has this URL moved?
  if (context.request.method === 'GET' && pathname !== '/') {
    const moved = await rpc<RedirectRow[]>(context.env, 'follow_redirect', { p_path: pathname });
    const row = Array.isArray(moved) ? moved[0] : null;
    if (row && row.target) {
      const target = safeRedirectTarget(
        row.target,
        siteOrigin(context.env, context.request),
        url.search,
      );
      if (target !== null) return Response.redirect(target, row.status || 301);
    }
  }

  const response = await context.next();
  const contentType = response.headers.get('content-type') ?? '';

  // 1b. The home page carries the live feed in its HTML.
  if (
    pathname === '/' &&
    context.request.method === 'GET' &&
    response.status === 200 &&
    contentType.includes('text/html')
  ) {
    const posts = await fetchHomeFeed(context.env, 12);
    if (posts.length > 0) {
      const origin = siteOrigin(context.env, context.request);
      const transformed = new HTMLRewriter()
        .on(HOME_FEED_SELECTOR, new ReplaceInner(renderHomeFeed(posts, origin)))
        // The preload first: the browser needs it before it starts the bundle,
        // and the JSON-LD can wait behind it.
        .on('head', new AppendHtml(renderHomeFeedPreload(posts)))
        .on('head', new AppendHtml(renderHomeFeedJsonLd(posts, origin)))
        .transform(response);
      // Five minutes at the edge: the page is the same for everybody, and the
      // feed is one query per five minutes rather than one per visitor.
      const headers = new Headers(transformed.headers);
      headers.set('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
      return new Response(transformed.body, { status: transformed.status, headers });
    }
    return response;
  }

  if (!contentType.includes('text/html')) return response;

  // 2. Is there a page at this address at all?
  // An address no route answers is a 404 with the shell's own not-found view,
  // never the site's home description served as a 200. This is the soft-404 fix.
  const route = matchAppRoute(pathname);
  if (route === null) return answerNotFound(response);

  const origin = siteOrigin(context.env, context.request);

  if (route.kind === 'static' && context.request.method === 'GET' && pathname !== route.path) {
    return Response.redirect(`${origin}${route.path}${url.search}`, 301);
  }

  // 2b. Private, editor, search, and verification-code routes without their own
  // prerendered file fall back to `dist/index.html`, which carries the home
  // page's `index,follow` meta. Mark them `noindex,nofollow` right at the edge.
  if (isEdgeNoindexPath(pathname)) {
    const noindexUrl = `${origin}${pathname}`;
    return new HTMLRewriter()
      .on('meta[name="robots"]', new SetAttribute('content', 'noindex,nofollow'))
      .on('link[rel="canonical"]', new SetAttribute('href', noindexUrl))
      .on('meta[property="og:url"]', new SetAttribute('content', noindexUrl))
      .on(
        'link[rel="alternate"][hreflang="bn"]',
        new SetAttribute('href', edgeAlternateLangUrl(noindexUrl, 'bn')),
      )
      .on(
        'link[rel="alternate"][hreflang="en"]',
        new SetAttribute('href', edgeAlternateLangUrl(noindexUrl, 'en')),
      )
      .on('link[rel="alternate"][hreflang="x-default"]', new SetAttribute('href', noindexUrl))
      .on('script[type="application/ld+json"]', new RemoveElement())
      .on('div[data-prerender="true"]', new ReplaceInner(''))
      .transform(response);
  }

  // 3. Does the page it is about to serve know what it is about?
  let seoPath: string | null = null;
  if (route.kind === 'handle') seoPath = `/@${route.handle}`;
  else if (route.kind === 'param' && isRecordPage(pathname)) seoPath = pathname;
  if (seoPath === null) return response;

  const rows = await rpc<SeoRow[]>(context.env, 'seo_for_path', { p_path: seoPath });
  const meta = Array.isArray(rows) ? rows[0] : null;
  if (!meta) return response;

  const canonical = `${origin}${meta.canonical === '' ? seoPath : meta.canonical}`;
  const rawImage = meta.image_url.trim();
  const image =
    rawImage === ''
      ? `${origin}/og/og-image.png`
      : rawImage.startsWith('https://')
        ? rawImage
        : /^http:\/\//i.test(rawImage)
          ? rawImage.replace(/^http:\/\//i, 'https://')
          : `${origin}${rawImage.startsWith('/') ? rawImage : `/${rawImage}`}`;
  const isNoindex = meta.robots === 'noindex' || meta.source === 'missing';

  let rewriter = new HTMLRewriter()
    .on('title', new SetText(meta.title))
    .on('meta[name="description"]', new SetAttribute('content', meta.description))
    .on('meta[property="og:type"]', new SetAttribute('content', ogTypeForPath(seoPath)))
    .on('meta[property="og:title"]', new SetAttribute('content', meta.title))
    .on('meta[property="og:description"]', new SetAttribute('content', meta.description))
    .on('meta[property="og:url"]', new SetAttribute('content', canonical))
    .on('meta[property="og:image"]', new SetAttribute('content', image))
    .on('meta[name="twitter:title"]', new SetAttribute('content', meta.title))
    .on('meta[name="twitter:description"]', new SetAttribute('content', meta.description))
    .on('meta[name="twitter:image"]', new SetAttribute('content', image))
    .on(
      'meta[name="robots"]',
      new SetAttribute(
        'content',
        isNoindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large',
      ),
    )
    .on('link[rel="canonical"]', new SetAttribute('href', canonical))
    .on(
      'link[rel="alternate"][hreflang="bn"]',
      new SetAttribute('href', edgeAlternateLangUrl(canonical, 'bn')),
    )
    .on(
      'link[rel="alternate"][hreflang="en"]',
      new SetAttribute('href', edgeAlternateLangUrl(canonical, 'en')),
    )
    .on('link[rel="alternate"][hreflang="x-default"]', new SetAttribute('href', canonical))
    .on('script[type="application/ld+json"]', new RemoveElement())
    .on(
      'div[data-prerender="true"]',
      new ReplaceInner(isNoindex ? '' : edgeRecordShell(meta, origin)),
    );

  if (!isNoindex) {
    rewriter = rewriter.on(
      'head',
      new AppendHtml(edgeRecordJsonLd(seoPath, meta, canonical, image, origin)),
    );
  }

  const described = rewriter.transform(response);

  // A record that was looked up and is not there is answered with 404, the same
  // as an address no route claims, so the status tells a crawler the truth.
  return meta.source === 'missing' ? withStatus(described, 404, 'no-store') : described;
};

/** The shell's own not-found view, with a 404 status and a noindex directive. */
function answerNotFound(response: Response): Response {
  const title = 'Page not found — BSDC';
  const description = 'The page you requested does not exist on BSDC.';
  const rewritten = new HTMLRewriter()
    .on('title', new SetText(title))
    .on('meta[name="description"]', new SetAttribute('content', description))
    .on('meta[property="og:title"]', new SetAttribute('content', title))
    .on('meta[property="og:description"]', new SetAttribute('content', description))
    .on('meta[name="twitter:title"]', new SetAttribute('content', title))
    .on('meta[name="twitter:description"]', new SetAttribute('content', description))
    .on('meta[name="robots"]', new SetAttribute('content', 'noindex,nofollow'))
    .on('link[rel="canonical"]', new RemoveElement())
    .on('link[rel="alternate"][hreflang]', new RemoveElement())
    .on('meta[property="og:url"]', new RemoveElement())
    .on('script[type="application/ld+json"]', new RemoveElement())
    .on('div[data-prerender="true"]', new ReplaceInner('<h1>Page not found</h1>'))
    .transform(response);
  return withStatus(rewritten, 404, 'no-store');
}

function withStatus(response: Response, status: number, cacheControl?: string): Response {
  const headers = new Headers(response.headers);
  if (cacheControl) headers.set('cache-control', cacheControl);
  return new Response(response.body, { status, headers });
}
