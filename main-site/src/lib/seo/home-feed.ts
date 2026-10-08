/**
 * The homepage feed, written as HTML for a reader that does not run scripts.
 *
 * The browser gets the same posts from Postgres and renders them with React;
 * this module exists so the copy that a crawler, a link preview fetcher or a
 * text browser receives is the real feed — titles, authors, dates, links —
 * rather than an empty `<div id="root">`.
 *
 * It is imported by the Pages Function that serves `/` (`functions/_middleware.ts`)
 * and by the build-time prerender check. It deliberately has no imports of its
 * own: it is bundled for the edge, runs in Node during a build, and is unit
 * tested in the browser build, so it must depend on nothing but its arguments.
 */

/** A row of `GET /rest/v1/posts` with the columns this needs. */
export interface HomeFeedPost {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  created_at: string;
  language: string | null;
  profiles: { display_name: string; username: string | null } | null;
}

/**
 * Where the feed goes. The shell in `index.html` carries this element and the
 * middleware replaces its contents, so the marker and the rewriter cannot
 * disagree about which page they are talking about.
 */
export const HOME_FEED_SELECTOR = 'div[data-prerender-feed="home"]';

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clip(value: string, length: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

function isoDate(post: HomeFeedPost): string {
  const value = post.published_at ?? post.created_at;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** One post as an `<article>`: what it says, who wrote it, where it lives. */
export function renderHomeFeed(posts: readonly HomeFeedPost[], origin: string): string {
  if (posts.length === 0) return '';
  const base = origin.replace(/\/+$/, '');
  const items = posts
    .map((post) => {
      const href = `${base}/p/${escapeHtml(post.slug)}`;
      const title = post.title.trim() === '' ? clip(post.excerpt, 80) : post.title;
      const author = post.profiles?.display_name ?? '';
      const handle = post.profiles?.username ?? '';
      const date = isoDate(post);
      return [
        '        <article>',
        `          <h3><a href="${href}">${escapeHtml(title)}</a></h3>`,
        post.excerpt.trim() === '' ? '' : `          <p>${escapeHtml(clip(post.excerpt, 200))}</p>`,
        author === ''
          ? ''
          : `          <p>${handle === '' ? escapeHtml(author) : `<a href="${base}/@${escapeHtml(handle)}">${escapeHtml(author)}</a>`}${
              date === '' ? '' : ` · <time datetime="${date}">${date}</time>`
            }</p>`,
        '        </article>',
      ]
        .filter((line) => line !== '')
        .join('\n');
    })
    .join('\n');

  return [
    '      <section aria-labelledby="latest-posts">',
    '        <h2 id="latest-posts">Latest from the community</h2>',
    '        <p>Every post below is public and readable without an account. Sign in to react, comment, follow members and publish your own.</p>',
    items,
    '      </section>',
  ].join('\n');
}

/**
 * The same list as schema.org data, so a search engine can show it as a
 * carousel instead of guessing at the page.
 */
export function renderHomeFeedJsonLd(posts: readonly HomeFeedPost[], origin: string): string {
  if (posts.length === 0) return '';
  const base = origin.replace(/\/+$/, '');
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Latest from the BSDC community',
    itemListElement: posts.map((post, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${base}/p/${post.slug}`,
      name: post.title.trim() === '' ? clip(post.excerpt, 80) : post.title,
    })),
  };
  // `</script>` inside JSON would end the element early; JSON.stringify never
  // emits a raw `<`, but the escape is cheap insurance.
  return `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`;
}

/** The PostgREST query that produces `HomeFeedPost` rows, newest first. */
export function homeFeedQuery(limit: number): string {
  return (
    'posts?select=slug,title,excerpt,published_at,created_at,language,' +
    'profiles:author_uid(display_name,username)' +
    '&status=eq.published&visibility=eq.public' +
    '&order=published_at.desc.nullslast&limit=' +
    String(limit)
  );
}
