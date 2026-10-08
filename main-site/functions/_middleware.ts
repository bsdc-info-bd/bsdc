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

class SetAttribute {
  constructor(
    private readonly name: string,
    private readonly value: string,
  ) {}
  element(element: Element): void {
    element.setAttribute(this.name, this.value);
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

  // 2. Does the page it is about to serve know what it is about?
  const contentType = response.headers.get('content-type') ?? '';
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
