import {
  HOME_FEED_SELECTOR,
  homeFeedQuery,
  renderHomeFeed,
  renderHomeFeedJsonLd,
  type HomeFeedPost,
} from '../src/lib/seo/home-feed';
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

const DYNAMIC = [
  /^\/p\/[^/]+$/,
  /^\/shop\/[^/]+$/,
  /^\/learn\/[^/]+$/,
  /^\/g\/[^/]+$/,
  /^\/@[^/]+$/,
];

function isDynamicPage(pathname: string): boolean {
  return DYNAMIC.some((pattern) => pattern.test(pathname));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  // 2. Does the page it is about to serve know what it is about?
  if (!contentType.includes('text/html') || !isDynamicPage(pathname)) return response;

  const rows = await rpc<SeoRow[]>(context.env, 'seo_for_path', { p_path: pathname });
  const meta = Array.isArray(rows) ? rows[0] : null;
  if (!meta) return response;

  const origin = siteOrigin(context.env, context.request);
  const canonical = `${origin}${meta.canonical === '' ? pathname : meta.canonical}`;
  const image =
    meta.image_url === ''
      ? `${origin}/og/og-image.png`
      : meta.image_url.startsWith('http')
        ? meta.image_url
        : `${origin}${meta.image_url}`;

  return new HTMLRewriter()
    .on('title', new SetText(escapeHtml(meta.title)))
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
};
