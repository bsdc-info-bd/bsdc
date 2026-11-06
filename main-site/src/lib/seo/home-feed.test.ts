import { describe, expect, it } from 'vitest';
import {
  HOME_FEED_SELECTOR,
  homeFeedQuery,
  renderHomeFeed,
  renderHomeFeedJsonLd,
  renderHomeFeedPreload,
  type HomeFeedPost,
} from './home-feed';

const post = (overrides: Partial<HomeFeedPost> = {}): HomeFeedPost => ({
  slug: 'hello-bd',
  title: 'Hello Bangladesh',
  excerpt: 'A first post',
  published_at: '2026-10-08T10:00:00.000Z',
  created_at: '2026-10-08T10:00:00.000Z',
  language: 'en',
  profiles: { display_name: 'Ada Lovelace', username: 'ada' },
  ...overrides,
});

describe('the home feed written for a reader without JavaScript', () => {
  it('links every post and names its author', () => {
    const html = renderHomeFeed([post()], 'https://www.bsdc.info.bd');
    expect(html).toContain('href="https://www.bsdc.info.bd/p/hello-bd"');
    expect(html).toContain('Hello Bangladesh');
    expect(html).toContain('href="https://www.bsdc.info.bd/@ada"');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('<time datetime="2026-10-08">');
  });

  it('falls back to the excerpt when a post has no title', () => {
    const html = renderHomeFeed([post({ title: '   ' })], 'https://www.bsdc.info.bd');
    expect(html).toContain(
      '<h3><a href="https://www.bsdc.info.bd/p/hello-bd">A first post</a></h3>',
    );
  });

  it('escapes everything it prints', () => {
    const html = renderHomeFeed(
      [
        post({
          title: '<script>alert(1)</script>',
          excerpt: 'a & b "quoted"',
          profiles: { display_name: '<b>Ada</b>', username: 'a"b' },
        }),
      ],
      'https://www.bsdc.info.bd',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b &quot;quoted&quot;');
    expect(html).toContain('a&quot;b');
  });

  it('writes nothing at all when there are no posts', () => {
    expect(renderHomeFeed([], 'https://www.bsdc.info.bd')).toBe('');
    expect(renderHomeFeedJsonLd([], 'https://www.bsdc.info.bd')).toBe('');
  });

  it('produces an ItemList a crawler can read, with no raw markup in it', () => {
    const jsonLd = renderHomeFeedJsonLd(
      [post({ title: '</script><b>x' })],
      'https://www.bsdc.info.bd',
    );
    expect(jsonLd.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(jsonLd.endsWith('</script>')).toBe(true);
    const payload = jsonLd.slice(jsonLd.indexOf('>') + 1, jsonLd.lastIndexOf('</script>'));
    const parsed = JSON.parse(payload) as {
      '@type': string;
      itemListElement: { position: number; url: string; name: string }[];
    };
    expect(parsed['@type']).toBe('ItemList');
    expect(parsed.itemListElement[0]?.url).toBe('https://www.bsdc.info.bd/p/hello-bd');
    expect(parsed.itemListElement[0]?.position).toBe(1);
    expect(payload).not.toContain('</script>');
  });

  it('asks PostgREST only for public, published posts', () => {
    const query = homeFeedQuery(12);
    expect(query).toContain('status=eq.published');
    expect(query).toContain('visibility=eq.public');
    expect(query).toContain('order=published_at.desc.nullslast');
    expect(query).toContain('limit=12');
    // The cover is what gets preloaded, so the query has to bring it.
    expect(query).toContain('cover_url');
  });

  it('preloads the picture above the fold, at the width the card will draw it', () => {
    const cloud = 'https://res.cloudinary.com/bsdc/image/upload/v1/post/feed.png';
    const html = renderHomeFeedPreload([post({ cover_url: cloud })]);
    expect(html).toContain('rel="preload"');
    expect(html).toContain('as="image"');
    expect(html).toContain('fetchpriority="high"');
    // A preload without a descriptor list asks for the wrong width and the card
    // then asks again for the right one, which is two downloads for one picture.
    expect(html).toContain('imagesrcset=');
    expect(html).toContain(' 384w');
    expect(html).toContain(' 1280w');
    expect(html).toContain('imagesizes=');
    expect(html).toContain('/image/upload/c_fill,g_auto,w_960,f_auto,q_auto/');
  });

  it('takes the first card that has a picture, not the first card', () => {
    const cloud = 'https://res.cloudinary.com/bsdc/image/upload/v1/post/second.png';
    const html = renderHomeFeedPreload([
      post({ slug: 'no-art' }),
      post({ slug: 'art', cover_url: cloud }),
    ]);
    expect(html).toContain('second.png');
  });

  it('preloads a host it cannot resize without inventing a descriptor list', () => {
    const imgbb = 'https://i.ibb.co/abc/feed.jpg';
    const html = renderHomeFeedPreload([post({ cover_url: imgbb })]);
    expect(html).toContain(`href="${imgbb}"`);
    expect(html).not.toContain('imagesrcset');
  });

  it('emits nothing when there is nothing worth preloading', () => {
    expect(renderHomeFeedPreload([])).toBe('');
    expect(renderHomeFeedPreload([post()])).toBe('');
    expect(renderHomeFeedPreload([post({ cover_url: '   ' })])).toBe('');
    // A value from a database is not a place to accept a quote or an angle bracket.
    expect(
      renderHomeFeedPreload([post({ cover_url: 'https://x.test/a.png" onload="alert(1)' })]),
    ).toBe('');
    expect(renderHomeFeedPreload([post({ cover_url: 'javascript:alert(1)' })])).toBe('');
  });

  it('targets the element the shell actually carries', () => {
    expect(HOME_FEED_SELECTOR).toBe('div[data-prerender-feed="home"]');
  });
});
