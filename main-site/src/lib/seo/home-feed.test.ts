import { describe, expect, it } from 'vitest';
import {
  HOME_FEED_SELECTOR,
  homeFeedQuery,
  renderHomeFeed,
  renderHomeFeedJsonLd,
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
  });

  it('targets the element the shell actually carries', () => {
    expect(HOME_FEED_SELECTOR).toBe('div[data-prerender-feed="home"]');
  });
});
