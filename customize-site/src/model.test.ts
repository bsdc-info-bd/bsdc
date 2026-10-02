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
import { fieldText, fieldsFor, sectionSummary, toSection, withField } from './model';

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
