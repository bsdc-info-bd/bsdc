/**
 * BSDC — src/entities/saved/model.ts
 * Purpose : One bookmark list across the whole platform: posts, jobs, events, projects and gigs.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A saved item stores a denormalised title and link, not a live reference. That is a
 *   deliberate trade: the list must render on a phone with no signal, from the mirror alone, and
 *   asking it to hydrate five collections first would make "Saved" the slowest screen in the app.
 *   The stored title is what the author wrote, and `titleLang` says which language it is in, so a
 *   Bangla post is never relabelled as English. Deleting the original does not delete the marker;
 *   the list drops rows whose target no longer resolves when it next syncs.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { Locale } from '@/core/config/app';

/** What can be saved. */
export const SAVED_KINDS = ['post', 'job', 'event', 'project', 'gig'] as const;

export type SavedKind = (typeof SAVED_KINDS)[number];

/** Human-readable labels are keyed in the `saved` namespace as `kind.{kind}`. */
export const SAVED_KIND_LABEL_KEYS: Readonly<Record<SavedKind, string>> = {
  post: 'kind.post',
  job: 'kind.job',
  event: 'kind.event',
  project: 'kind.project',
  gig: 'kind.gig',
};

/** A bookmark. One document per saved thing, keyed by `${kind}:${entityId}`. */
export interface SavedItem {
  readonly id: string;
  readonly uid: string;
  readonly kind: SavedKind;
  readonly entityId: string;
  /** Title as its author wrote it. */
  readonly title: string;
  /** Language of `title`. */
  readonly titleLang: Locale;
  /** Secondary line: the author, organisation or employer that owns the thing. */
  readonly subtitle: string;
  /** In-app route to the thing. */
  readonly href: string;
  readonly savedAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Values needed to record a bookmark. */
export interface NewSavedInput {
  readonly kind: SavedKind;
  readonly entityId: string;
  readonly title: string;
  readonly titleLang: Locale;
  readonly subtitle?: string | undefined;
  readonly href: string;
  readonly now?: Date | undefined;
}

/**
 * Narrows an unknown string to a saved kind.
 * @param value candidate
 * @returns true when the value is a real kind
 */
export function isSavedKind(value: string): value is SavedKind {
  return (SAVED_KINDS as readonly string[]).includes(value);
}

/**
 * Builds the document id of a bookmark: one kind plus one entity id is one row, so saving the
 * same thing twice cannot create two rows that disagree with each other.
 * @param kind what is saved
 * @param entityId id of the saved thing
 * @returns the document id
 */
export function savedItemId(kind: SavedKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

/**
 * Trims a stored title to something a list row can show on a 250px screen.
 * @param title raw title
 * @returns the title, collapsed and cut to 140 characters
 */
export function savedTitle(title: string): string {
  const flat = title.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 139).trimEnd()}…` : flat;
}

/**
 * Trims a stored subtitle to the ceiling the rules enforce, so a long seller name cannot make the
 * write fail after the button has already told the person it worked.
 * @param subtitle raw subtitle
 * @returns the subtitle, collapsed and cut to 120 characters
 */
export function savedSubtitle(subtitle: string): string {
  const flat = subtitle.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 119).trimEnd()}…` : flat;
}

/**
 * Builds a saved item.
 * @param uid saving account id
 * @param input what is being saved
 * @returns a complete saved item
 */
export function newSavedItem(uid: string, input: NewSavedInput): SavedItem {
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: savedItemId(input.kind, input.entityId),
    uid,
    kind: input.kind,
    entityId: input.entityId,
    title: savedTitle(input.title),
    titleLang: input.titleLang,
    subtitle: savedSubtitle(input.subtitle ?? ''),
    href: input.href,
    savedAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
