/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { describe, expect, it } from 'vitest';
import { buildSitemapXml } from '../sitemap-generator';
import { postsToRss, postsToAtom } from '../rss-generator';
import { makePost } from './feed-algorithm.test';

describe('buildSitemapXml', () => {
  it('produces valid sitemap XML with loc, changefreq and priority', () => {
    const xml = buildSitemapXml([
      { loc: '/', changefreq: 'daily', priority: 1.0 },
      { loc: '/blog/my-post', changefreq: 'hourly', priority: 0.9, lastmod: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<loc>https://www.bsdc.info.bd/</loc>');
    expect(xml).toContain('<changefreq>daily</changefreq>');
    expect(xml).toContain('<priority>1.0</priority>');
    expect(xml).toContain('<lastmod>2026-01-01T00:00:00.000Z</lastmod>');
    expect(xml).toContain('</urlset>');
  });
});

describe('RSS generation', () => {
  const post = makePost({ title: 'Launch Day', slug: 'launch-day', body: 'BSDC is live!', tags: ['launch'], publishedAt: Date.parse('2026-01-15T10:00:00Z') });
  it('renders RSS 2.0 with title/link/description/author', () => {
    const rss = postsToRss([post]);
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain('<title>Launch Day</title>');
    expect(rss).toContain('https://www.bsdc.info.bd/post/launch-day');
    expect(rss).toContain('<category>launch</category>');
  });
  it('renders Atom feed', () => {
    const atom = postsToAtom([post]);
    expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(atom).toContain('<entry>');
  });
});
