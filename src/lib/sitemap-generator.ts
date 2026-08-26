/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { COL, fsDb, normalizePost } from './firestore';
import { APP_URL } from '@/config/constants';
import type { Post } from '@/types/post';

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { loc: '/', changefreq: 'daily', priority: 1.0 },
  { loc: '/explore', changefreq: 'hourly', priority: 0.9 },
  { loc: '/trending', changefreq: 'hourly', priority: 0.9 },
  { loc: '/blog', changefreq: 'hourly', priority: 0.9 },
  { loc: '/qa', changefreq: 'hourly', priority: 0.9 },
  { loc: '/snippets', changefreq: 'hourly', priority: 0.9 },
  { loc: '/docs', changefreq: 'daily', priority: 0.8 },
  { loc: '/wiki', changefreq: 'daily', priority: 0.8 },
  { loc: '/projects', changefreq: 'daily', priority: 0.8 },
  { loc: '/jobs', changefreq: 'hourly', priority: 0.9 },
  { loc: '/events', changefreq: 'daily', priority: 0.8 },
  { loc: '/groups', changefreq: 'daily', priority: 0.8 },
  { loc: '/marketplace', changefreq: 'hourly', priority: 0.8 },
  { loc: '/directory', changefreq: 'daily', priority: 0.7 },
  { loc: '/leaderboard', changefreq: 'daily', priority: 0.7 },
  { loc: '/creator-program', changefreq: 'weekly', priority: 0.7 },
  { loc: '/license', changefreq: 'weekly', priority: 0.7 },
  { loc: '/points', changefreq: 'weekly', priority: 0.5 },
  { loc: '/about', changefreq: 'monthly', priority: 0.6 },
  { loc: '/contact', changefreq: 'monthly', priority: 0.6 },
  { loc: '/guidelines', changefreq: 'monthly', priority: 0.5 },
  { loc: '/terms', changefreq: 'yearly', priority: 0.4 },
  { loc: '/privacy', changefreq: 'yearly', priority: 0.4 },
];

export function postRoute(type: string): string {
  switch (type) {
    case 'blog': return '/blog';
    case 'qa': return '/qa';
    case 'snippet': return '/snippet';
    case 'docs': return '/docs';
    case 'wiki': return '/wiki';
    case 'project': return '/project';
    case 'job': return '/job';
    case 'notice': return '/notice';
    default: return '/post';
  }
}

export async function collectDynamicEntries(): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  const postsSnap = await getDocs(
    query(collection(fsDb(), COL.posts), where('deleted', '==', false), where('visibility', '==', 'public'), limit(2000)),
  );
  for (const d of postsSnap.docs) {
    const post = normalizePost(d.data(), d.id);
    if (post.status !== 'published' && post.status !== 'scheduled') continue;
    entries.push({
      loc: `${postRoute(post.type)}/${post.slug}`,
      lastmod: new Date(post.updatedAt).toISOString(),
      changefreq: 'daily',
      priority: 0.8,
    });
  }
  const usersSnap = await getDocs(query(collection(fsDb(), COL.users), limit(2000)));
  for (const d of usersSnap.docs) {
    const username = d.data().username as string | undefined;
    if (!username) continue;
    entries.push({
      loc: `/p/${username}`,
      lastmod: new Date((d.data().updatedAt as number) || Date.now()).toISOString(),
      changefreq: 'daily',
      priority: 0.6,
    });
  }
  const groupsSnap = await getDocs(query(collection(fsDb(), COL.groups), limit(1000)));
  for (const d of groupsSnap.docs) {
    const slug = d.data().slug as string | undefined;
    if (!slug) continue;
    entries.push({ loc: `/g/${slug}`, changefreq: 'daily', priority: 0.6 });
  }
  const tagsSnap = await getDocs(query(collection(fsDb(), COL.tags), orderBy('postCount', 'desc'), limit(300)));
  for (const d of tagsSnap.docs) {
    entries.push({ loc: `/tag/${encodeURIComponent(d.id)}`, changefreq: 'daily', priority: 0.5 });
  }
  return entries;
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const lastmod = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>${APP_URL}${e.loc.startsWith('/') ? e.loc : `/${e.loc}`}</loc>\n${lastmod ? `    ${lastmod}\n` : ''}    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority.toFixed(1)}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Full dynamic sitemap (static routes + posts + profiles + groups + tags). */
export async function generateFullSitemap(): Promise<string> {
  try {
    const dynamic = await collectDynamicEntries();
    return buildSitemapXml([...STATIC_ENTRIES, ...dynamic]);
  } catch {
    return buildSitemapXml(STATIC_ENTRIES);
  }
}

export function sitemapForPosts(posts: Post[]): string {
  return buildSitemapXml(posts.map((p) => ({
    loc: `${postRoute(p.type)}/${p.slug}`,
    lastmod: new Date(p.updatedAt).toISOString(),
    changefreq: 'daily' as const,
    priority: 0.8,
  })));
}
