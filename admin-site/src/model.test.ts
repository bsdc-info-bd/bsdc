import { describe, expect, it } from 'vitest';
import {
  BRAND_TOKENS,
  DEFAULT_TOKENS,
  cleanTokens,
  clip,
  contrastGrade,
  contrastRatio,
  isCanonicalPath,
  normalisePath,
  normaliseHex,
  readableOn,
  redirectProblems,
  robotsTxt,
  seoChecks,
  serpPreview,
  shades,
  sitemapIndexXml,
  sitemapXml,
  themeCss,
  themeProblems,
  wordmarkSvg,
  worstSeverity,
  type RedirectRow,
  type SeoEntry,
} from '@kit';
import {
  EMPTY_OVERRIDE,
  draftAsEntry,
  draftFromRow,
  overrideArgs,
  overrideProblems,
  overrideSummary,
  redirectNote,
  sortRedirects,
  themeSaveProblems,
  type OverrideRow,
} from './model';

const row = (over: Partial<OverrideRow> = {}): OverrideRow => ({
  path: '/about',
  title: 'About the Bangladesh Software Development Community',
  description:
    'Who runs BSDC, what the community is for, and how a developer anywhere in the country can take part in it.',
  image_url: '/og/about.png',
  canonical: '',
  robots: 'index',
  changefreq: 'monthly',
  priority: 0.6,
  note: '',
  updated_at: '2026-09-01T10:00:00Z',
  ...over,
});

const redirect = (over: Partial<RedirectRow> = {}): RedirectRow => ({
  from_path: '/old',
  to_path: '/new',
  status: 301,
  note: '',
  hits: 0,
  last_hit: null,
  is_enabled: true,
  ...over,
});

describe('one shape for a path', () => {
  it('treats the ways a person writes one URL as one URL', () => {
    expect(normalisePath('/About/')).toBe('/about');
    expect(normalisePath('about')).toBe('/about');
    expect(normalisePath('//blog///post//')).toBe('/blog/post');
    expect(normalisePath('/search?q=react#top')).toBe('/search');
    expect(normalisePath('')).toBe('/');
    expect(normalisePath('/')).toBe('/');
  });

  it('can say whether what was typed is already canonical', () => {
    expect(isCanonicalPath('/about')).toBe(true);
    expect(isCanonicalPath('/About/')).toBe(false);
  });
});

describe('text that has to fit a search result', () => {
  it('cuts on a word boundary and admits the cut', () => {
    const clipped = clip('Bangladesh Software Development Community annual report', 30);
    expect(clipped.endsWith('…')).toBe(true);
    expect(clipped.length).toBeLessThanOrEqual(30);
    expect(clipped).not.toContain('Developm…');
  });

  it('leaves short text alone and collapses whitespace', () => {
    expect(clip('  Two   words ', 40)).toBe('Two words');
  });
});

describe('what the checks say', () => {
  it('objects to nothing when the page is well described', () => {
    const checks = seoChecks({
      title: row().title,
      description: row().description,
      path: row().path,
      image_url: row().image_url,
    });
    expect(worstSeverity(checks)).toBe('good');
  });

  it('treats a missing title as an error and a long one as a warning', () => {
    expect(seoChecks({ title: '', description: row().description, path: '/a' })[0]?.severity).toBe(
      'error',
    );
    const long = seoChecks({ title: 'x'.repeat(65), description: row().description, path: '/a' });
    expect(long[0]?.severity).toBe('warning');
    const tooLong = seoChecks({
      title: 'x'.repeat(80),
      description: row().description,
      path: '/a',
    });
    expect(tooLong[0]?.severity).toBe('error');
  });

  it('says when a page has been withheld, because that is usually a surprise', () => {
    const checks = seoChecks({
      title: row().title,
      description: row().description,
      path: '/about',
      image_url: '/og.png',
      robots: 'noindex',
    });
    expect(checks.some((check) => check.id === 'robots' && check.severity === 'warning')).toBe(
      true,
    );
  });

  it('warns about a path that will be stored differently from what was typed', () => {
    const checks = seoChecks({
      title: row().title,
      description: row().description,
      path: '/About/',
    });
    expect(checks.find((check) => check.id === 'path')?.message).toContain('/about');
  });
});

describe('the search result preview', () => {
  const entry: SeoEntry = {
    path: '/about',
    title: 'A'.repeat(80),
    description: 'B'.repeat(200),
    image_url: '',
    canonical: '',
    robots: 'index',
    source: 'override',
    updated_at: null,
  };

  it('shows the cut rather than pretending everything fits', () => {
    const preview = serpPreview('https://www.bsdc.info.bd/', entry);
    expect(preview.truncated).toBe(true);
    expect(preview.title.endsWith('…')).toBe(true);
    expect(preview.url).toBe('https://www.bsdc.info.bd/about');
  });

  it('uses the canonical path when one is set', () => {
    expect(serpPreview('https://www.bsdc.info.bd', { ...entry, canonical: '/Real/' }).url).toBe(
      'https://www.bsdc.info.bd/real',
    );
  });

  it('does not leave a double slash on the home page', () => {
    expect(serpPreview('https://www.bsdc.info.bd', { ...entry, path: '/' }).url).toBe(
      'https://www.bsdc.info.bd',
    );
  });
});

describe('the override form', () => {
  it('refuses an override that says nothing', () => {
    expect(overrideProblems({ ...EMPTY_OVERRIDE, path: '/a' })).toContain(
      'An override needs a title or a description; an empty one is a deletion.',
    );
  });

  it('refuses a priority outside the range the database stores', () => {
    const draft = { ...EMPTY_OVERRIDE, path: '/a', title: 'Something', priority: '7' };
    expect(overrideProblems(draft).join(' ')).toContain('between 0.0 and 1.0');
  });

  it('sends a canonical path and trimmed text to the database', () => {
    const args = overrideArgs({
      ...EMPTY_OVERRIDE,
      path: '/About/',
      title: '  Title  ',
      description: 'Desc',
      canonical: '/Home/',
      priority: '0.9',
    });
    expect(args['p_path']).toBe('/about');
    expect(args['p_title']).toBe('Title');
    expect(args['p_canonical']).toBe('/home');
    expect(args['p_priority']).toBe(0.9);
  });

  it('round-trips a saved row back into the form', () => {
    const draft = draftFromRow(row());
    expect(draft.priority).toBe('0.6');
    expect(draftAsEntry(draft).path).toBe('/about');
  });

  it('counts what is outstanding for the heading', () => {
    const summary = overrideSummary([
      row(),
      row({ path: '/x', robots: 'noindex' }),
      row({ path: '/y', priority: 0.9 }),
    ]);
    expect(summary).toEqual({ total: 3, withheld: 1, promoted: 1 });
  });
});

describe('redirects', () => {
  it('refuses the mistakes the database refuses', () => {
    expect(redirectProblems('/', '/home', 301, [])).toContain(
      'The home page cannot be redirected away.',
    );
    expect(redirectProblems('/a', '/a', 301, [])).toContain('A redirect cannot point at itself.');
    expect(redirectProblems('/a', '/b', 418, [])).toContain('Choose 301, 302, 307 or 308.');
  });

  it('refuses a chain, naming the page the editor should point at instead', () => {
    const existing = [redirect({ from_path: '/b', to_path: '/c' })];
    expect(redirectProblems('/a', '/b', 301, existing).join(' ')).toContain(
      'point at the final page',
    );
  });

  it('refuses a loop back to where the traffic came from', () => {
    const existing = [redirect({ from_path: '/b', to_path: '/a' })];
    expect(redirectProblems('/a', '/b', 301, existing)).toContain(
      'That would create a redirect loop.',
    );
  });

  it('lets an external destination through, since it cannot loop here', () => {
    expect(redirectProblems('/a', 'https://rrc.bsdc.info.bd/', 301, [])).toEqual([]);
  });

  it('describes how much use a redirect is getting', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    expect(redirectNote(redirect(), now)).toBe('Never followed.');
    expect(redirectNote(redirect({ hits: 4, last_hit: '2026-10-01T00:00:00Z' }), now)).toContain(
      'last today',
    );
    expect(redirectNote(redirect({ hits: 9, last_hit: '2025-01-01T00:00:00Z' }), now)).toContain(
      'months',
    );
    expect(redirectNote(redirect({ is_enabled: false }), now)).toBe('Disabled.');
  });

  it('lists the busiest first', () => {
    const rows = [redirect({ from_path: '/a', hits: 1 }), redirect({ from_path: '/b', hits: 9 })];
    expect(sortRedirects(rows).map((item) => item.from_path)).toEqual(['/b', '/a']);
  });
});

describe('the files crawlers actually fetch', () => {
  it('writes a sitemap with escaped URLs and a date-only lastmod', () => {
    const xml = sitemapXml('https://www.bsdc.info.bd/', [
      { loc: '/p/a&b', lastmod: '2026-05-04T11:00:00Z', changefreq: 'weekly', priority: 0.7 },
    ]);
    expect(xml).toContain('<loc>https://www.bsdc.info.bd/p/a&amp;b</loc>');
    expect(xml).toContain('<lastmod>2026-05-04</lastmod>');
    expect(xml).toContain('<priority>0.7</priority>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('omits a lastmod it cannot vouch for', () => {
    const xml = sitemapXml('https://x.test', [
      { loc: '/a', lastmod: null, changefreq: 'daily', priority: 1 },
    ]);
    expect(xml).not.toContain('<lastmod>');
  });

  it('writes one index entry per sitemap file', () => {
    const xml = sitemapIndexXml('https://x.test', [
      { section: 'posts', urls: 2500, pages: 3, lastmod: '2026-01-02T00:00:00Z' },
    ]);
    expect(xml.match(/<sitemap>/g)).toHaveLength(3);
    expect(xml).toContain('/sitemaps/posts-3.xml');
  });

  it('writes robots.txt from canonical paths, deduplicated and sorted', () => {
    const txt = robotsTxt('https://x.test/', ['/Settings/', '/settings', '/api/']);
    expect(txt).toContain('Disallow: /api');
    expect(txt.match(/Disallow: \/settings/g)).toHaveLength(1);
    expect(txt).toContain('Sitemap: https://x.test/sitemap.xml');
  });
});

describe('the brand, as numbers', () => {
  it('computes the contrast ratios WCAG defines', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastGrade(contrastRatio('#1b4332', '#ffffff'))).toBe('AAA');
    expect(contrastGrade(4.6)).toBe('AA');
    expect(contrastGrade(3.2)).toBe('AA large');
    expect(contrastGrade(2)).toBe('fail');
  });

  it('accepts the short hex people type', () => {
    expect(normaliseHex('#ABC')).toBe('#aabbcc');
    expect(normaliseHex('1b4332')).toBe('#1b4332');
  });

  it('picks the text colour that can be read on a background', () => {
    expect(readableOn('#1b4332')).toBe('#ffffff');
    expect(readableOn('#f4f7f5')).toBe('#111111');
  });

  it('passes the palette the site ships with', () => {
    expect(themeProblems(DEFAULT_TOKENS)).toEqual([]);
  });

  it('refuses a palette whose body text cannot be read', () => {
    const problems = themeProblems({ ...DEFAULT_TOKENS, text: '#cccccc' });
    expect(problems.some((problem) => problem.message.includes('4.5:1'))).toBe(true);
  });

  it('refuses a token that is not a colour, before it looks at contrast', () => {
    const problems = themeProblems({ ...DEFAULT_TOKENS, primary: 'forest green' });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('#rrggbb');
  });

  it('names every token it needs', () => {
    const missing = themeProblems({ primary: '#1b4332' });
    expect(missing.length).toBe(BRAND_TOKENS.length - 1);
  });

  it('builds a nine-step ramp with the colour itself in the middle', () => {
    const ramp = shades('#1b4332');
    expect(ramp).toHaveLength(9);
    expect(ramp[4]).toEqual({ step: 500, hex: '#1b4332' });
    expect(contrastRatio(ramp[0]!.hex, '#ffffff')).toBeLessThan(
      contrastRatio(ramp[8]!.hex, '#ffffff'),
    );
  });

  it('writes CSS custom properties in a stable order', () => {
    const css = themeCss({ primary: '#1B4332', accent: '#2D6A4F' });
    expect(css).toBe(':root {\n  --brand-accent: #2d6a4f;\n  --brand-primary: #1b4332;\n}\n');
  });

  it('tidies every value on the way to the database', () => {
    expect(cleanTokens({ primary: '#ABC', text: ' #081C15 ' })).toEqual({
      primary: '#aabbcc',
      text: '#081c15',
    });
  });

  it('draws the wordmark from the palette', () => {
    const svg = wordmarkSvg({ ...DEFAULT_TOKENS }, 'BSDC');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('#1b4332');
    expect(svg).toContain('>BSDC<');
  });

  it('refuses a theme with no key or name before anything is sent', () => {
    const problems = themeSaveProblems({ key: '', name: '', tokens: DEFAULT_TOKENS });
    expect(problems).toHaveLength(2);
    expect(
      themeSaveProblems({ key: 'dark-winter', name: 'Dark winter', tokens: DEFAULT_TOKENS }),
    ).toEqual([]);
  });
});
