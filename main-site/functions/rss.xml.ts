import { siteOrigin, xmlResponse, escapeXml, type RpcEnv } from './_rpc';

/**
 * Cloudflare Pages Function — /rss.xml
 *
 * The thirty most recent public posts. Readers poll a feed far more often
 * than a person loads a page, so this asks PostgREST for exactly the columns
 * it prints and nothing else, and it is cached for half an hour.
 */
interface PostRow {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  updated_at: string;
}

export const onRequestGet: PagesFunction<RpcEnv> = async (context) => {
  const origin = siteOrigin(context.env, context.request);
  const base = context.env.SUPABASE_URL;
  const key = context.env.SUPABASE_ANON_KEY;

  let posts: PostRow[] = [];
  if (base && key) {
    const query =
      'posts?select=slug,title,excerpt,published_at,updated_at' +
      '&status=eq.published&visibility=eq.public&order=published_at.desc.nullslast&limit=30';
    try {
      const response = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/${query}`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (response.ok) posts = (await response.json()) as PostRow[];
    } catch {
      // An unreachable database means an empty feed, never a broken one.
      posts = [];
    }
  }

  const items = posts
    .map((post) => {
      const url = `${origin}/p/${post.slug}`;
      const date = new Date(post.published_at ?? post.updated_at);
      const pubDate = Number.isNaN(date.getTime()) ? '' : date.toUTCString();
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(post.excerpt)}</description>`,
        pubDate === '' ? '' : `      <pubDate>${pubDate}</pubDate>`,
        '    </item>',
      ]
        .filter((line) => line !== '')
        .join('\n');
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Bangladesh Software Development Community</title>
    <link>${escapeXml(`${origin}/`)}</link>
    <description>The open developer community of Bangladesh</description>
    <language>bn-BD</language>
    <atom:link href="${escapeXml(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return xmlResponse(body, 1800);
};
