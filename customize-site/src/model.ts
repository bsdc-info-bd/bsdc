import { defaultPayload, type PageSection, type SectionKind } from '@kit';

/** Rows as the database returns them. */
export type PageRow = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly noindex: boolean;
  readonly updated_at: string;
};

export type SectionRow = {
  readonly id: string;
  readonly page_id: string;
  readonly kind: SectionKind;
  readonly position: number;
  readonly payload: Record<string, unknown>;
  readonly is_visible: boolean;
};

export function toSection(row: SectionRow): PageSection {
  return { id: row.id, kind: row.kind, position: row.position, payload: row.payload };
}

/**
 * The fields an editor sees for each section kind. Keeping this as data
 * rather than as seven forms means a new section kind is a new entry here
 * and nothing else.
 */
export type FieldSpec = {
  readonly name: string;
  readonly label: string;
  readonly multiline?: boolean;
};

const FIELDS: Record<SectionKind, readonly FieldSpec[]> = {
  hero: [
    { name: 'heading', label: 'Heading' },
    { name: 'subheading', label: 'Subheading', multiline: true },
    { name: 'action_label', label: 'Button text' },
    { name: 'action_href', label: 'Button link' },
  ],
  rich_text: [
    { name: 'heading', label: 'Heading' },
    { name: 'body', label: 'Body', multiline: true },
  ],
  cards: [
    { name: 'heading', label: 'Heading' },
    { name: 'items', label: 'Cards, one per line as title | text', multiline: true },
  ],
  faq: [
    { name: 'heading', label: 'Heading' },
    { name: 'items', label: 'Questions, one per line as question | answer', multiline: true },
  ],
  cta: [
    { name: 'heading', label: 'Heading' },
    { name: 'body', label: 'Body', multiline: true },
    { name: 'action_label', label: 'Button text' },
    { name: 'action_href', label: 'Button link' },
  ],
  gallery: [
    { name: 'heading', label: 'Heading' },
    { name: 'images', label: 'Image addresses, one per line', multiline: true },
  ],
  embed: [
    { name: 'title', label: 'Title' },
    { name: 'src', label: 'Address to embed' },
  ],
};

export function fieldsFor(kind: SectionKind): readonly FieldSpec[] {
  return FIELDS[kind];
}

const LIST_FIELDS = new Set(['items', 'images']);

/** Reads a payload field back into the text the editor shows. */
export function fieldText(payload: Record<string, unknown>, name: string): string {
  const value = payload[name];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item !== null && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const parts = [
            record['title'] ?? record['question'] ?? '',
            record['text'] ?? record['answer'] ?? '',
          ];
          return parts.map(String).filter(Boolean).join(' | ');
        }
        return String(item);
      })
      .join('\n');
  }
  return typeof value === 'string' ? value : '';
}

/**
 * Writes an edited field back into a payload. List fields are line based
 * because an editor should not have to write JSON to add a card.
 */
export function withField(
  kind: SectionKind,
  payload: Record<string, unknown>,
  name: string,
  text: string,
): Record<string, unknown> {
  if (!LIST_FIELDS.has(name)) return { ...payload, [name]: text };

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (name === 'images') return { ...payload, images: lines };

  const items = lines.map((line) => {
    const [first = '', ...rest] = line.split('|');
    const second = rest.join('|').trim();
    return kind === 'faq'
      ? { question: first.trim(), answer: second }
      : { title: first.trim(), text: second };
  });
  return { ...payload, items };
}

/** A new section starts from the empty payload its kind defines. */
export function newPayload(kind: SectionKind): Record<string, unknown> {
  return defaultPayload(kind);
}

/** A one-line summary of a section, for the list of sections on a page. */
export function sectionSummary(section: PageSection): string {
  const payload = section.payload;
  const heading = payload['heading'] ?? payload['title'] ?? '';
  const text = typeof heading === 'string' ? heading.trim() : '';
  if (text !== '') return text;
  const items = payload['items'];
  if (Array.isArray(items)) return `${items.length} item${items.length === 1 ? '' : 's'}`;
  return 'Not filled in yet';
}
