import { defaultPayload, isValidSlug, type PageSection, type SectionKind } from '@kit';

/** Rows as the database returns them. */
export type PageRow = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly noindex: boolean;
  readonly updated_at: string;
  /** 0148: the publishing window and the version the page is on. */
  readonly current_version?: number | undefined;
  readonly publish_at?: string | null | undefined;
  readonly unpublish_at?: string | null | undefined;
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

// ---------------------------------------------------------------------------
// §12.2 Pages that are real
// ---------------------------------------------------------------------------

/** A section as the publish validator sees it. */
export type PublishProblem = {
  readonly position: number;
  readonly kind: SectionKind;
  readonly problem: string;
};

/**
 * Why a page cannot be published, checked locally first.
 *
 * The database is the authority — `publish_custom_page` refuses with the same
 * sentence — but a publish button that only fails after a round trip teaches an
 * editor to press it and find out. This mirrors `bsdc.section_problem` for the
 * cases the editor can see without asking, and the server stays the last word.
 */
export function sectionProblem(kind: SectionKind, payload: Record<string, unknown>): string | null {
  const text = (name: string): string => {
    const value = payload[name];
    return typeof value === 'string' ? value.trim() : '';
  };
  const items = Array.isArray(payload['items']) ? (payload['items'] as unknown[]) : [];

  switch (kind) {
    case 'hero':
      if (text('heading').length < 2) return 'A hero needs a heading of at least two characters.';
      if (text('src') !== '' && text('alt') === '')
        return 'A hero image needs alt text. A picture with no description is a picture half the audience cannot see.';
      return null;
    case 'rich_text':
      if (text('body').length < 2) return 'A text section needs some text.';
      return null;
    case 'cards':
      if (items.length === 0) return 'A cards section needs at least one card.';
      if (items.length > 12) return 'A cards section holds at most twelve cards.';
      if (items.some((item) => itemTitle(item).length < 2)) return 'Every card needs a title.';
      return null;
    case 'faq':
      if (items.length === 0) return 'An FAQ section needs at least one question.';
      if (items.some((item) => !itemFilled(item, 'q') || !itemFilled(item, 'a')))
        return 'Every question needs both a question and an answer.';
      return null;
    case 'cta':
      if (text('heading').length < 2) return 'A call to action needs a heading.';
      if (text('href') === '') return 'A call to action needs somewhere to go.';
      return null;
    case 'gallery':
      if (items.length === 0) return 'A gallery needs at least one picture.';
      if (items.some((item) => !itemFilled(item, 'src')))
        return 'Every gallery picture needs a source.';
      if (items.some((item) => !itemFilled(item, 'alt')))
        return 'Every gallery picture needs alt text.';
      return null;
    case 'embed':
      if (text('url') === '') return 'An embed needs a URL.';
      if (!text('url').startsWith('https://'))
        return 'An embed URL must start with https:// so the page cannot be served insecurely.';
      return null;
    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function itemTitle(item: unknown): string {
  const row = asRecord(item);
  const title = row['title'];
  return typeof title === 'string' ? title.trim() : '';
}

function itemFilled(item: unknown, name: string): boolean {
  const row = asRecord(item);
  const value = row[name];
  return typeof value === 'string' && value.trim() !== '';
}

/** Every section that would stop a publish, in page order. */
export function publishProblems(
  sections: readonly { readonly kind: SectionKind; readonly position: number; readonly payload: Record<string, unknown>; readonly is_visible?: boolean }[],
): readonly PublishProblem[] {
  return sections
    .filter((s) => s.is_visible !== false)
    .map((s) => {
      const problem = sectionProblem(s.kind, s.payload);
      return problem === null ? null : { position: s.position, kind: s.kind, problem };
    })
    .filter((p): p is PublishProblem => p !== null)
    .sort((a, b) => a.position - b.position);
}

/** What a publish would do, said before it happens. */
export function publishSummary(
  problems: readonly PublishProblem[],
  sectionCount: number,
  unpublishAt: string,
): string {
  if (sectionCount === 0) return 'A page with no sections has nothing to publish.';
  if (problems.length > 0) {
    const first = problems[0];
    if (first === undefined) return '';
    return `${String(problems.length)} section${problems.length === 1 ? '' : 's'} would stop the publish. Section ${String(first.position + 1)}: ${first.problem}`;
  }
  if (unpublishAt !== '') {
    return `This page will publish now and unpublish itself at ${unpublishAt}.`;
  }
  return 'This page will publish and stay published until somebody changes it.';
}

/**
 * Whether a slug can be used, before asking the server.
 *
 * The list is the same list the database holds in `reserved_paths`; keeping a copy
 * here means an editor sees the collision as they type rather than after a save. The
 * server is still the authority — a copy is a courtesy, not a rule.
 */
export const RESERVED_PREFIXES: readonly string[] = [
  'about', 'account-deletion', 'admin', 'api', 'auth', 'bookmarks', 'cart', 'checkout',
  'compose', 'contact', 'create', 'events', 'feed', 'freelance', 'g', 'groups', 'guidelines',
  'jobs', 'marketplace', 'messages', 'notifications', 'onboarding', 'orders', 'playground',
  'privacy', 'profile', 'projects', 'robots.txt', 'search', 'settings', 'shop', 'sitemap.xml',
  'system-check', 'terms', 'trash', 'verify',
];

export type SlugCheck = {
  readonly available: boolean;
  readonly reason: string;
};

export function localSlugCheck(slug: string): SlugCheck {
  const trimmed = slug.trim().toLowerCase();
  if (trimmed === '') return { available: false, reason: 'Give the page an address.' };
  if (!isValidSlug(trimmed)) {
    return { available: false, reason: 'Use lower-case words joined by single hyphens.' };
  }
  const first = trimmed.split('/')[0] ?? trimmed;
  if (RESERVED_PREFIXES.includes(first)) {
    return {
      available: false,
      reason: `/${first} is a route this site already owns. A page here would shadow it.`,
    };
  }
  return { available: true, reason: '' };
}

export type PageVersionRow = {
  readonly id: number;
  readonly version: number;
  readonly title: string;
  readonly sections: readonly unknown[];
  readonly created_at: string;
  readonly note: string;
};

/**
 * Publishing history, newest first, with the current version marked.
 *
 * A version that is not the current one is a revert candidate, and a revert writes a
 * new version rather than deleting the ones after it — so the list never shrinks and
 * a wrong revert is itself revertible.
 */
export type VersionView = {
  readonly version: number;
  readonly at: string;
  readonly note: string;
  readonly current: boolean;
  readonly sectionCount: number;
};

export function describeVersions(
  rows: readonly { readonly version: number; readonly created_at: string; readonly note: string; readonly sections: readonly unknown[] }[],
  currentVersion: number,
): readonly VersionView[] {
  return [...rows]
    .sort((a, b) => b.version - a.version)
    .map((row) => ({
      version: row.version,
      at: row.created_at,
      note: row.note,
      current: row.version === currentVersion,
      sectionCount: row.sections.length,
    }));
}

/** How long a page has left in its publishing window, in words. */
export function windowSummary(
  publishAt: string | null,
  unpublishAt: string | null,
  now = new Date(),
): string {
  if (unpublishAt === null) {
    return publishAt === null ? 'Published with no end date.' : 'Published with no end date.';
  }
  const end = new Date(unpublishAt).getTime();
  if (!Number.isFinite(end)) return 'The end date could not be read.';
  const remaining = end - now.getTime();
  if (remaining <= 0) return 'The publishing window has ended; the page returns to draft.';
  const days = Math.floor(remaining / 86_400_000);
  if (days >= 1) return `Unpublishes itself in ${String(days)} day${days === 1 ? '' : 's'}.`;
  const hours = Math.floor(remaining / 3_600_000);
  if (hours >= 1) return `Unpublishes itself in ${String(hours)} hour${hours === 1 ? '' : 's'}.`;
  return 'Unpublishes itself within the hour.';
}
