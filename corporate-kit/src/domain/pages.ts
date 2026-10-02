/**
 * Page composition. The database renumbers sections under a lock; these
 * helpers produce the optimistic order the editor shows while that round
 * trip is in flight, and they produce exactly the same arrangement.
 */

export type SectionKind = 'hero' | 'rich_text' | 'cards' | 'faq' | 'cta' | 'gallery' | 'embed';

export type PageSection = {
  readonly id: string;
  readonly kind: SectionKind;
  readonly position: number;
  readonly payload: Record<string, unknown>;
};

export const SECTION_KINDS: readonly SectionKind[] = [
  'hero',
  'rich_text',
  'cards',
  'faq',
  'cta',
  'gallery',
  'embed',
];

export function sectionKindLabel(kind: SectionKind): string {
  switch (kind) {
    case 'hero':
      return 'Hero';
    case 'rich_text':
      return 'Rich text';
    case 'cards':
      return 'Card grid';
    case 'faq':
      return 'Questions and answers';
    case 'cta':
      return 'Call to action';
    case 'gallery':
      return 'Gallery';
    case 'embed':
      return 'Embed';
    default:
      return kind;
  }
}

/** The empty payload a newly added section starts from, per kind. */
export function defaultPayload(kind: SectionKind): Record<string, unknown> {
  switch (kind) {
    case 'hero':
      return { heading: '', subheading: '', action_label: '', action_href: '' };
    case 'rich_text':
      return { heading: '', body: '' };
    case 'cards':
      return { heading: '', items: [] };
    case 'faq':
      return { heading: '', items: [] };
    case 'cta':
      return { heading: '', body: '', action_label: '', action_href: '' };
    case 'gallery':
      return { heading: '', images: [] };
    case 'embed':
      return { title: '', src: '' };
    default:
      return {};
  }
}

/**
 * Moves one section to a new index and renumbers the whole list, which is
 * what the database does. Out-of-range targets are clamped rather than
 * rejected, because a drag that overshoots the list means "put it at the end".
 */
export function moveSection(
  sections: readonly PageSection[],
  id: string,
  toIndex: number,
): readonly PageSection[] {
  const ordered = [...sections].sort((a, b) => a.position - b.position);
  const from = ordered.findIndex((section) => section.id === id);
  if (from < 0) return ordered.map(renumber);
  const target = Math.min(Math.max(toIndex, 0), ordered.length - 1);
  const [moved] = ordered.splice(from, 1);
  if (!moved) return ordered.map(renumber);
  ordered.splice(target, 0, moved);
  return ordered.map(renumber);
}

function renumber(section: PageSection, index: number): PageSection {
  return { ...section, position: index };
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slugs are lower-case words joined by single hyphens, 2..64 characters. */
export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 64 && SLUG.test(slug);
}

/** Best-effort slug from a title, used only as the field's initial value. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

/** A page is publishable once it has a title, a valid slug and a section. */
export function publishBlockers(page: {
  readonly title: string;
  readonly slug: string;
  readonly sections: readonly PageSection[];
}): readonly string[] {
  const blockers: string[] = [];
  if (page.title.trim().length < 2) blockers.push('The page needs a title.');
  if (!isValidSlug(page.slug))
    blockers.push('The address must be lower-case words joined by hyphens.');
  if (page.sections.length === 0) blockers.push('The page needs at least one section.');
  return blockers;
}
