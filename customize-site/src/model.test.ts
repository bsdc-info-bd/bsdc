import { describe, expect, it } from 'vitest';
import {
  defaultPayload,
  isValidSlug,
  moveSection,
  publishBlockers,
  sectionKindLabel,
  slugify,
  type PageSection,
} from '@kit';
import {
  describeVersions,
  fieldText,
  fieldsFor,
  localSlugCheck,
  publishProblems,
  publishSummary,
  sectionProblem,
  sectionSummary,
  toSection,
  windowSummary,
  withField,
} from './model';

const section = (id: string, position: number): PageSection => ({
  id,
  kind: 'rich_text',
  position,
  payload: {},
});

const list: readonly PageSection[] = [
  section('a', 0),
  section('b', 1),
  section('c', 2),
  section('d', 3),
];

describe('ordering sections', () => {
  it('leaves the list numbered 0..n-1 after a move up', () => {
    const moved = moveSection(list, 'd', 1);
    expect(moved.map((item) => item.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(moved.map((item) => item.position)).toEqual([0, 1, 2, 3]);
  });

  it('leaves the list numbered 0..n-1 after a move down', () => {
    const moved = moveSection(list, 'a', 2);
    expect(moved.map((item) => item.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved.map((item) => item.position)).toEqual([0, 1, 2, 3]);
  });

  it('clamps a target past the end instead of refusing the move', () => {
    expect(moveSection(list, 'a', 99).map((item) => item.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveSection(list, 'd', -5).map((item) => item.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('is a no-op for a section that is not in the list', () => {
    expect(moveSection(list, 'missing', 0).map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('repairs an order that arrived with gaps', () => {
    const gappy = [section('x', 5), section('y', 2), section('z', 9)];
    expect(moveSection(gappy, 'z', 0).map((item) => [item.id, item.position])).toEqual([
      ['z', 0],
      ['y', 1],
      ['x', 2],
    ]);
  });
});

describe('page addresses', () => {
  it('accepts lower-case words joined by single hyphens', () => {
    expect(isValidSlug('about-us')).toBe(true);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('About-Us')).toBe(false);
    expect(isValidSlug('about--us')).toBe(false);
    expect(isValidSlug('-about')).toBe(false);
  });

  it('suggests an address from a title without leaving stray hyphens', () => {
    expect(slugify('About BSDC')).toBe('about-bsdc');
    expect(slugify('  Our team, 2026!  ')).toBe('our-team-2026');
    expect(isValidSlug(slugify('Terms & Conditions'))).toBe(true);
  });
});

describe('publishing', () => {
  it('lists everything standing in the way, not just the first problem', () => {
    expect(publishBlockers({ title: '', slug: 'Bad Slug', sections: [] })).toHaveLength(3);
  });

  it('clears once the page has a title, an address and a section', () => {
    expect(publishBlockers({ title: 'About', slug: 'about', sections: list })).toEqual([]);
  });
});

describe('section payload editing', () => {
  it('offers the right fields for each kind', () => {
    expect(fieldsFor('embed').map((field) => field.name)).toEqual(['title', 'src']);
    expect(fieldsFor('hero')).toHaveLength(4);
    expect(sectionKindLabel('cards')).toBe('Card grid');
  });

  it('edits list fields as lines rather than as JSON', () => {
    const payload = withField(
      'cards',
      defaultPayload('cards'),
      'items',
      'Fast | We ship weekly\nOpen | MIT',
    );
    expect(payload['items']).toEqual([
      { title: 'Fast', text: 'We ship weekly' },
      { title: 'Open', text: 'MIT' },
    ]);
    expect(fieldText(payload, 'items')).toBe('Fast | We ship weekly\nOpen | MIT');
  });

  it('uses question and answer wording for a questions section', () => {
    const payload = withField('faq', defaultPayload('faq'), 'items', 'Is it free? | Yes');
    expect(payload['items']).toEqual([{ question: 'Is it free?', answer: 'Yes' }]);
  });

  it('keeps a pipe inside an answer rather than splitting on every one', () => {
    const payload = withField('faq', {}, 'items', 'Which? | a | b');
    expect(payload['items']).toEqual([{ question: 'Which?', answer: 'a | b' }]);
  });

  it('drops blank lines from a list field', () => {
    const payload = withField('gallery', {}, 'images', 'one.png\n\n  \ntwo.png');
    expect(payload['images']).toEqual(['one.png', 'two.png']);
  });

  it('summarises a section by its heading, then by its size', () => {
    expect(sectionSummary({ ...section('a', 0), payload: { heading: 'Welcome' } })).toBe('Welcome');
    expect(sectionSummary({ ...section('a', 0), payload: { items: [1, 2] } })).toBe('2 items');
    expect(sectionSummary(section('a', 0))).toBe('Not filled in yet');
  });

  it('maps a database row to a section without losing its position', () => {
    const mapped = toSection({
      id: 'id',
      page_id: 'page',
      kind: 'hero',
      position: 3,
      payload: { heading: 'Hi' },
      is_visible: true,
    });
    expect(mapped).toEqual({ id: 'id', kind: 'hero', position: 3, payload: { heading: 'Hi' } });
  });
});

describe('a section that fails its own validation (§12.2)', () => {
  it('refuses a hero with no heading', () => {
    expect(sectionProblem('hero', { heading: '' })).toContain('heading');
  });

  it('refuses a hero image with no alt text, and says why it matters', () => {
    const problem = sectionProblem('hero', { heading: 'Welcome', src: 'https://cdn/x.jpg' });
    expect(problem).toContain('alt text');
    expect(problem).toContain('half the audience cannot see');
  });

  it('accepts a hero image that has alt text', () => {
    expect(
      sectionProblem('hero', { heading: 'Welcome', src: 'https://cdn/x.jpg', alt: 'The team' }),
    ).toBeNull();
  });

  it('refuses an empty cards section and a card with no title', () => {
    expect(sectionProblem('cards', { items: [] })).toContain('at least one card');
    expect(sectionProblem('cards', { items: [{ title: '' }] })).toContain('title');
    expect(sectionProblem('cards', { items: [{ title: 'One' }] })).toBeNull();
  });

  it('caps the cards at twelve', () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ title: `Card ${String(i)}` }));
    expect(sectionProblem('cards', { items })).toContain('twelve');
  });

  it('needs both halves of an FAQ entry', () => {
    expect(sectionProblem('faq', { items: [{ q: 'Why?', a: '' }] })).toContain('answer');
    expect(sectionProblem('faq', { items: [{ q: 'Why?', a: 'Because.' }] })).toBeNull();
  });

  it('refuses a gallery picture with no source or no description', () => {
    expect(sectionProblem('gallery', { items: [{ alt: 'x' }] })).toContain('source');
    expect(sectionProblem('gallery', { items: [{ src: 'https://cdn/x.jpg' }] })).toContain('alt');
    expect(
      sectionProblem('gallery', { items: [{ src: 'https://cdn/x.jpg', alt: 'x' }] }),
    ).toBeNull();
  });

  it('refuses an embed over plain http', () => {
    expect(sectionProblem('embed', { url: 'http://example.com/x' })).toContain('https://');
    expect(sectionProblem('embed', { url: 'https://example.com/x' })).toBeNull();
  });

  it('refuses a call to action with nowhere to go', () => {
    expect(sectionProblem('cta', { heading: 'Join us' })).toContain('somewhere to go');
    expect(sectionProblem('cta', { heading: 'Join us', href: '/signup' })).toBeNull();
  });

  it('names every broken section, in page order', () => {
    const problems = publishProblems([
      { kind: 'hero', position: 2, payload: { heading: '' } },
      { kind: 'rich_text', position: 0, payload: { body: 'Fine.' } },
      { kind: 'embed', position: 1, payload: { url: 'http://x' } },
    ]);
    expect(problems.map((p) => p.position)).toEqual([1, 2]);
  });

  it('ignores a hidden section, which is not published either', () => {
    const problems = publishProblems([
      { kind: 'hero', position: 0, payload: { heading: '' }, is_visible: false },
    ]);
    expect(problems).toHaveLength(0);
  });
});

describe('what a publish will do (§12.2)', () => {
  it('refuses to describe publishing an empty page', () => {
    expect(publishSummary([], 0, '')).toContain('nothing to publish');
  });

  it('names the first broken section rather than the page', () => {
    const summary = publishSummary(
      [{ position: 3, kind: 'gallery', problem: 'Every gallery picture needs alt text.' }],
      5,
      '',
    );
    expect(summary).toContain('Section 4');
    expect(summary).toContain('alt text');
  });

  it('says when the page will unpublish itself', () => {
    expect(publishSummary([], 2, '2026-12-01T10:00')).toContain('unpublish itself');
  });

  it('says a page with no end stays published', () => {
    expect(publishSummary([], 2, '')).toContain('stay published');
  });
});

describe('the reserved-path guard (§12.2)', () => {
  it('refuses a slug that is a route', () => {
    expect(localSlugCheck('settings').available).toBe(false);
    expect(localSlugCheck('settings').reason).toContain('already owns');
  });

  it('refuses a slug under a reserved prefix, not only an exact match', () => {
    expect(localSlugCheck('auth/anything').available).toBe(false);
  });

  it('allows a free slug', () => {
    expect(localSlugCheck('our-story')).toEqual({ available: true, reason: '' });
  });

  it('refuses an invalid slug before it reaches the server', () => {
    expect(localSlugCheck('Our Story').available).toBe(false);
    expect(localSlugCheck('').available).toBe(false);
  });

  it('matches the route list case-insensitively', () => {
    expect(localSlugCheck('Settings').available).toBe(false);
  });
});

describe('publishing history (§12.2)', () => {
  it('marks exactly one version as current', () => {
    const views = describeVersions(
      [
        { version: 1, created_at: '2026-01-01', note: '', sections: [] },
        { version: 2, created_at: '2026-02-01', note: '', sections: [{}, {}] },
        { version: 3, created_at: '2026-03-01', note: '', sections: [{}] },
      ],
      2,
    );
    expect(views.filter((v) => v.current).map((v) => v.version)).toEqual([2]);
  });

  it('lists newest first', () => {
    const views = describeVersions(
      [
        { version: 1, created_at: '2026-01-01', note: '', sections: [] },
        { version: 3, created_at: '2026-03-01', note: '', sections: [] },
      ],
      3,
    );
    expect(views.map((v) => v.version)).toEqual([3, 1]);
  });

  it('counts the sections each version held', () => {
    const views = describeVersions(
      [{ version: 1, created_at: '2026-01-01', note: '', sections: [{}, {}, {}] }],
      1,
    );
    expect(views[0]?.sectionCount).toBe(3);
  });
});

describe('a publishing window (§12.2)', () => {
  const now = new Date('2026-11-23T12:00:00Z');

  it('says a page with no end has no end', () => {
    expect(windowSummary(null, null, now)).toContain('no end date');
  });

  it('counts down in days, then hours', () => {
    expect(windowSummary(null, '2026-11-26T12:00:00Z', now)).toContain('3 days');
    expect(windowSummary(null, '2026-11-23T15:00:00Z', now)).toContain('3 hours');
  });

  it('says the window has ended rather than showing a negative count', () => {
    expect(windowSummary(null, '2026-11-20T12:00:00Z', now)).toContain('has ended');
  });

  it('admits when the date cannot be read', () => {
    expect(windowSummary(null, 'nonsense', now)).toContain('could not be read');
  });
});
