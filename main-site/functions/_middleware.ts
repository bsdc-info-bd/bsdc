import {
  HOME_FEED_SELECTOR,
  homeFeedQuery,
  renderHomeFeed,
  renderHomeFeedJsonLd,
  type HomeFeedPost,
} from '../src/lib/seo/home-feed';
import { matchAppRoute } from '../src/lib/seo/app-routes';
import { rpc, siteOrigin, type RpcEnv } from './_rpc';

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

/** The newest public posts, as the anonymous visitor would read them. */
async function fetchHomeFeed(env: RpcEnv, limit: number): Promise<HomeFeedPost[]> {
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!base || !key) return [];
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/${homeFeedQuery(limit)}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as HomeFeedPost[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    // An unreachable database costs the feed copy, never the page.
    return [];
  }
}

export const onRequest: PagesFunction<RpcEnv> = async (context) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';

  // Never run SEO/database redirects in front of auth callbacks or assets.
  if (/^\/(?:api|__|assets|icons)\//.test(pathname)) return context.next();

  // 1. Has this URL moved?
  if (context.request.method === 'GET' && pathname !== '/') {
    const moved = await rpc<RedirectRow[]>(context.env, 'follow_redirect', { p_path: pathname });
    const row = Array.isArray(moved) ? moved[0] : null;
    if (row && row.target) {
      const target = /^https?:\/\//i.test(row.target)
        ? row.target
        : `${siteOrigin(context.env, context.request)}${row.target}${url.search}`;
      return Response.redirect(target, row.status || 301);
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

  // 3. Does the page it is about to serve know what it is about?
  let seoPath: string | null = null;
  if (route.kind === 'handle') seoPath = `/@${route.handle}`;
  else if (route.kind === 'param' && isRecordPage(pathname)) seoPath = pathname;
  if (seoPath === null) return response;

  const rows = await rpc<SeoRow[]>(context.env, 'seo_for_path', { p_path: seoPath });
  const meta = Array.isArray(rows) ? rows[0] : null;
  if (!meta) return response;

  const origin = siteOrigin(context.env, context.request);
  const canonical = `${origin}${meta.canonical === '' ? seoPath : meta.canonical}`;
  const image =
    meta.image_url === ''
      ? `${origin}/og/og-image.png`
      : meta.image_url.startsWith('http')
        ? meta.image_url
        : `${origin}${meta.image_url}`;

  const described = new HTMLRewriter()
    .on('title', new SetText(meta.title))
    .on('meta[name="description"]', new SetAttribute('content', meta.description))
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
        meta.robots === 'noindex' ? 'noindex,nofollow' : 'index,follow,max-image-preview:large',
      ),
    )
    .on('link[rel="canonical"]', new SetAttribute('href', canonical))
    .transform(response);

  // A record that was looked up and is not there is answered with 404, the same
  // as an address no route claims, so the status tells a crawler the truth.
  return meta.source === 'missing' ? withStatus(described, 404) : described;
};

/** The shell's own not-found view, with a 404 status and a noindex directive. */
function answerNotFound(response: Response): Response {
  const rewritten = new HTMLRewriter()
    .on('title', new SetText('Page not found — BSDC'))
    .on('meta[name="robots"]', new SetAttribute('content', 'noindex,nofollow'))
    .transform(response);
  return withStatus(rewritten, 404);
}

function withStatus(response: Response, status: number): Response {
  const headers = new Headers(response.headers);
  return new Response(response.body, { status, headers });
}
