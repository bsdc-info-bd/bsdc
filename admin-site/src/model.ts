import {
  DEFAULT_TOKENS,
  normalisePath,
  themeProblems,
  type BrandTokens,
  type RedirectRow,
  type SeoEntry,
} from '@kit';

/**
 * The console's own vocabulary: what an editor is holding on screen, and the
 * small summaries the lists need. Everything that decides anything lives in
 * the kit or in Postgres; this file only shapes what is shown.
 */

export interface OverrideRow {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly image_url: string;
  readonly canonical: string;
  readonly robots: string;
  readonly changefreq: string;
  readonly priority: number;
  readonly note: string;
  readonly updated_at: string;
}

export interface OverrideDraft {
  path: string;
  title: string;
  description: string;
  imageUrl: string;
  canonical: string;
  robots: string;
  changefreq: string;
  priority: string;
  note: string;
}

export const EMPTY_OVERRIDE: OverrideDraft = {
  path: '',
  title: '',
  description: '',
  imageUrl: '',
  canonical: '',
  robots: 'index',
  changefreq: 'weekly',
  priority: '0.5',
  note: '',
};

export function draftFromRow(row: OverrideRow): OverrideDraft {
  return {
    path: row.path,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    canonical: row.canonical,
    robots: row.robots,
    changefreq: row.changefreq,
    priority: row.priority.toFixed(1),
    note: row.note,
  };
}

/** A draft is shown as a preview entry before it exists in the database. */
export function draftAsEntry(draft: OverrideDraft): SeoEntry {
  return {
    path: normalisePath(draft.path),
    title: draft.title,
    description: draft.description,
    image_url: draft.imageUrl,
    canonical: draft.canonical,
    robots: draft.robots,
    source: 'override',
    updated_at: null,
  };
}

/** What stops the save button, in the order an editor would hit them. */
export function overrideProblems(draft: OverrideDraft): readonly string[] {
  const problems: string[] = [];
  if (draft.path.trim() === '') problems.push('Enter the path this override applies to.');
  if (draft.title.trim() === '' && draft.description.trim() === '') {
    problems.push('An override needs a title or a description; an empty one is a deletion.');
  }
  const priority = Number(draft.priority);
  if (!Number.isFinite(priority) || priority < 0 || priority > 1) {
    problems.push('Priority is a number between 0.0 and 1.0.');
  }
  if (draft.imageUrl.trim() !== '' && !/^(https?:\/\/|\/)/.test(draft.imageUrl.trim())) {
    problems.push('The share image must be an absolute URL or a path beginning with /.');
  }
  return problems;
}

/** The arguments `set_seo_override` expects, with the path already canonical. */
export function overrideArgs(draft: OverrideDraft): Record<string, unknown> {
  return {
    p_path: normalisePath(draft.path),
    p_title: draft.title.trim(),
    p_description: draft.description.trim(),
    p_image_url: draft.imageUrl.trim(),
    p_canonical: draft.canonical.trim() === '' ? '' : normalisePath(draft.canonical),
    p_robots: draft.robots,
    p_changefreq: draft.changefreq,
    p_priority: Number(draft.priority),
    p_note: draft.note.trim(),
  };
}

export interface RedirectDraft {
  from: string;
  to: string;
  status: string;
  note: string;
}

export const EMPTY_REDIRECT: RedirectDraft = { from: '', to: '', status: '301', note: '' };

/**
 * A redirect nobody has followed in a long time is a line of configuration
 * earning nothing; one that is followed constantly is a link somebody should
 * fix at the source. Both are worth saying out loud.
 */
export function redirectNote(row: RedirectRow, now: Date = new Date()): string {
  if (!row.is_enabled) return 'Disabled.';
  if (row.hits === 0) return 'Never followed.';
  if (row.last_hit === null) return `${row.hits} hits.`;
  const days = Math.floor((now.getTime() - new Date(row.last_hit).getTime()) / 86_400_000);
  if (days <= 0) return `${row.hits} hits, last today.`;
  if (days === 1) return `${row.hits} hits, last yesterday.`;
  if (days > 180) return `${row.hits} hits, none for ${Math.floor(days / 30)} months.`;
  return `${row.hits} hits, last ${days} days ago.`;
}

/** Busiest first: the redirects worth looking at are the ones in use. */
export function sortRedirects(rows: readonly RedirectRow[]): readonly RedirectRow[] {
  return [...rows].sort((a, b) => b.hits - a.hits || a.from_path.localeCompare(b.from_path));
}

export interface ThemeDraft {
  key: string;
  name: string;
  tokens: BrandTokens;
}

export const NEW_THEME: ThemeDraft = {
  key: '',
  name: '',
  tokens: { ...DEFAULT_TOKENS },
};

export function themeKeyProblems(key: string): readonly string[] {
  const value = key.trim().toLowerCase();
  if (value === '') return ['Give the theme a key, such as "dark-winter".'];
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(value)) {
    return ['A key is lower case letters, digits and hyphens, three characters or more.'];
  }
  return [];
}

/** Everything that would make `save_brand_theme` refuse, gathered in one list. */
export function themeSaveProblems(draft: ThemeDraft): readonly string[] {
  return [
    ...themeKeyProblems(draft.key),
    ...(draft.name.trim().length < 2 ? ['Give the theme a name people will recognise.'] : []),
    ...themeProblems(draft.tokens).map((problem) => problem.message),
  ];
}

/** Counts for the heading, so the tab says how much work is outstanding. */
export function overrideSummary(rows: readonly OverrideRow[]): {
  readonly total: number;
  readonly withheld: number;
  readonly promoted: number;
} {
  return {
    total: rows.length,
    withheld: rows.filter((row) => row.robots === 'noindex').length,
    promoted: rows.filter((row) => row.priority >= 0.8).length,
  };
}
