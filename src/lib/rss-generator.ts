/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { COL, fsDb, normalizePost } from './firestore';
import { APP_URL } from '@/config/constants';
import { postRoute } from './sitemap-generator';
import { extractDescription } from './utils';
import type { Post } from '@/types/post';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function postsToRss(posts: Post[], channelPath = ''): string {
  const items = posts
    .slice(0, 50)
    .map((p) => {
      const link = `${APP_URL}${postRoute(p.type)}/${p.slug}`;
      return `    <item>\n      <title>${esc(p.title || extractDescription(p.body, 'BSDC post'))}</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      <description>${esc(extractDescription(p.body, 'Community post'))}</description>\n      <author>${esc(p.authorName)} (via BSDC)</author>\n      <pubDate>${new Date(p.publishedAt || p.createdAt).toUTCString()}</pubDate>\n${p.tags.map((t) => `      <category>${esc(t)}</category>`).join('\n')}\n    </item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Bangladesh Software Development Community${channelPath ? ` — ${esc(channelPath)}` : ''}</title>\n    <link>${APP_URL}</link>\n    <description>The Pride of Bangladesh — Where Developers Unite</description>\n    <language>en-bd</language>\n    <atom:link href="${APP_URL}/rss.xml" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>\n`;
}

export function postsToAtom(posts: Post[]): string {
  const entries = posts
    .slice(0, 50)
    .map((p) => {
      const link = `${APP_URL}${postRoute(p.type)}/${p.slug}`;
      return `  <entry>\n    <title>${esc(p.title || extractDescription(p.body, 'BSDC post'))}</title>\n    <link href="${link}"/>\n    <id>${link}</id>\n    <updated>${new Date(p.updatedAt).toISOString()}</updated>\n    <summary>${esc(extractDescription(p.body, 'Community post'))}</summary>\n    <author><name>${esc(p.authorName)}</name></author>\n  </entry>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>Bangladesh Software Development Community</title>\n  <link href="${APP_URL}"/>\n  <link href="${APP_URL}/atom.xml" rel="self"/>\n  <id>${APP_URL}/</id>\n  <updated>${new Date().toISOString()}</updated>\n${entries}\n</feed>\n`;
}

export async function fetchLatestPosts(max = 50): Promise<Post[]> {
  const snap = await getDocs(
    query(
      collection(fsDb(), COL.posts),
      where('deleted', '==', false),
      where('visibility', '==', 'public'),
      orderBy('publishedAt', 'desc'),
      limit(max),
    ),
  );
  return snap.docs.map((d) => normalizePost(d.data(), d.id)).filter((p) => p.status === 'published');
}
