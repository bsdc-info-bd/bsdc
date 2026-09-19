/**
 * BSDC — src/entities/search/repository.ts
 * Purpose : Search execution: the device index, the remote prefix queries, and their merge.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Two layers answer a query. The remote layer asks Firestore for prefix matches on the
 *   field each kind is most often searched by; the device layer ranks what this device has
 *   already mirrored. The two are merged by id, so a person never sees the same result twice, and
 *   the UI is told which layers answered so it can say so honestly instead of implying the whole
 *   platform was searched when only this device was (BSDC-SEARCH-002).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { SEARCH_KIND_LIMIT, SEARCH_MIN_QUERY, type SearchKind } from '@/core/config/search';
import { COLLECTIONS } from '@/core/config/collections';
import { firestoreDb } from '@/services/firebase/app';
import { fromQuery, translateFirestoreError } from '@/services/firebase/firestore';
import { withRemote } from '@/services/backend/gateway';
import { mirrorList } from '@/services/offline/mirror';
import {
  isQueryUsable,
  normaliseText,
  tokenise,
  type SearchDoc,
  type SearchGroup,
  type SearchHit,
  type SearchResultSet,
} from './model';
import { indexDoc, limitPerKind, rank, scoreDoc } from './ranking';

/** The field each kind is prefix-searched on remotely. */
const REMOTE_PREFIX_FIELD: Readonly<Record<SearchKind, string>> = {
  people: 'username',
  posts: 'authorUid',
  groups: 'nameLower',
  events: 'titleLower',
  jobs: 'titleLower',
  projects: 'titleLower',
  gigs: 'titleLower',
};

/** A record shape the remote layer can read generically. */
interface RemoteRecord extends Record<string, unknown> {
  readonly id?: string;
}

/**
 * Runs a prefix range query on one collection.
 * Firestore has no `LIKE`, so a prefix range against the upper bound `\uf8ff` is the standard,
 * index-backed way to answer "starts with".
 * @param collection collection name
 * @param field ordering field
 * @param prefix the lower-cased prefix
 * @param limit maximum documents
 * @returns the raw records Firestore returned
 */
async function prefixQuery(
  collection: string,
  field: string,
  prefix: string,
  limit: number,
): Promise<readonly RemoteRecord[]> {
  const {
    collection: coll,
    query,
    orderBy,
    startAt,
    endAt,
    limit: limitTo,
    getDocs,
  } = await import('firebase/firestore');
  const db = await firestoreDb();
  const built = query(
    coll(db, collection),
    orderBy(field),
    startAt(prefix),
    endAt(`${prefix}\uf8ff`),
    limitTo(limit),
  );
  const snapshot = await getDocs(built);
  return fromQuery<RemoteRecord>(snapshot);
}

/** Turns a raw Firestore record into a search document of the given kind. */
type Projector = (record: RemoteRecord) => SearchDoc;

/** One projector per kind: the single place a Firestore shape becomes a search hit. */
/**
 * Reads a field from a Firestore document as text.
 * @param value whatever the document held
 * @returns the text, or an empty string when the field is missing or is not a scalar
 */
export function field(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

const PROJECTORS: Readonly<Record<SearchKind, Projector>> = {
  people: (record) => ({
    kind: 'people',
    id: field(record.uid ?? record.id),
    path: `/u/${field(record.username)}`,
    title: field(record.displayName ?? record.username),
    subtitle: field(record.headline),
    fields: {
      username: field(record.username),
      displayName: field(record.displayName),
      displayNameBn: field(record.displayNameBn),
      headline: field(record.headline),
      bio: field(record.bio),
      skills: Array.isArray(record.skills) ? (record.skills as string[]).join(' ') : '',
    },
    createdAt: field(record.createdAt),
    popularity: Number(record.followerCount ?? 0),
    ...(typeof record.role === 'string' ? { badge: record.role } : {}),
  }),
  posts: (record) => ({
    kind: 'posts',
    id: field(record.id),
    path: `/p/${field(record.id)}`,
    title: field(record.linkTitle).slice(0, 80),
    subtitle: field(record.body).slice(0, 140),
    fields: {
      title: field(record.linkTitle),
      body: field(record.body),
      tags: Array.isArray(record.tags) ? (record.tags as string[]).join(' ') : '',
      authorName: field(record.authorName),
    },
    createdAt: field(record.createdAt),
    popularity: Number(record.reactionCount ?? 0),
  }),
  groups: (record) => ({
    kind: 'groups',
    id: field(record.id),
    path: `/groups/${field(record.id)}`,
    title: field(record.name),
    subtitle: field(record.description).slice(0, 140),
    fields: {
      name: field(record.name),
      description: field(record.description),
      tags: Array.isArray(record.tags) ? (record.tags as string[]).join(' ') : '',
    },
    createdAt: field(record.createdAt),
    popularity: Number(record.memberCount ?? 0),
  }),
  events: (record) => ({
    kind: 'events',
    id: field(record.id),
    path: `/events/${field(record.id)}`,
    title: field(record.title),
    subtitle: field(record.startsAt),
    fields: {
      title: field(record.title),
      titleBn: field(record.titleBn),
      description: field(record.description),
      venueLabel: field(record.venueLabel),
      tags: Array.isArray(record.tags) ? (record.tags as string[]).join(' ') : '',
    },
    createdAt: field(record.createdAt),
    popularity: Number(record.rsvpCount ?? 0),
  }),
  jobs: (record) => ({
    kind: 'jobs',
    id: field(record.id),
    path: `/jobs/${field(record.id)}`,
    title: field(record.title),
    subtitle: field(record.companyName),
    fields: {
      title: field(record.title),
      companyName: field(record.companyName),
      description: field(record.description),
      skills: Array.isArray(record.skills) ? (record.skills as string[]).join(' ') : '',
      location: field(record.location),
    },
    createdAt: field(record.createdAt),
    popularity: Number(record.applicationCount ?? 0),
  }),
  projects: (record) => ({
    kind: 'projects',
    id: field(record.id),
    path: `/projects#${field(record.id)}`,
    title: field(record.title),
    subtitle: field(record.summary),
    fields: {
      title: field(record.title),
      summary: field(record.summary),
      description: field(record.description),
      stack: Array.isArray(record.stack) ? (record.stack as string[]).join(' ') : '',
    },
    createdAt: field(record.createdAt),
    popularity: Number(record.likeCount ?? 0),
  }),
  gigs: (record) => ({
    kind: 'gigs',
    id: field(record.id),
    path: `/freelancer#${field(record.id)}`,
    title: field(record.title),
    subtitle: field(record.category),
    fields: {
      title: field(record.title),
      description: field(record.description),
      skills: Array.isArray(record.skills) ? (record.skills as string[]).join(' ') : '',
      category: field(record.category),
    },
    createdAt: field(record.createdAt),
    popularity: Number(record.completedOrders ?? 0),
  }),
};

/** Collections backing each kind in Firestore. */
const KIND_COLLECTION: Readonly<Record<SearchKind, string>> = {
  people: COLLECTIONS.users,
  posts: COLLECTIONS.posts,
  groups: COLLECTIONS.groups,
  events: COLLECTIONS.events,
  jobs: COLLECTIONS.jobs,
  projects: COLLECTIONS.projects,
  gigs: COLLECTIONS.gigs,
};

/**
 * Asks Firestore for prefix matches on one kind.
 * @param kind the kind
 * @param query the raw query
 * @returns the documents, or an empty list when the backend is unreachable
 */
async function remoteKind(kind: SearchKind, query: string): Promise<readonly SearchDoc[]> {
  const prefix = normaliseText(query).split(' ')[0] ?? '';
  if (prefix.length === 0) return [];
  if (kind === 'posts') {
    // Posts have no single searchable title, so the remote layer matches on tags instead.
    const {
      collection: coll,
      query: build,
      where,
      limit: limitTo,
      getDocs,
    } = await import('firebase/firestore');
    const db = await firestoreDb();
    const built = build(
      coll(db, COLLECTIONS.posts),
      where('tags', 'array-contains', prefix),
      limitTo(SEARCH_KIND_LIMIT),
    );
    const snapshot = await getDocs(built);
    return fromQuery<RemoteRecord>(snapshot).map(PROJECTORS.posts);
  }
  const records = await prefixQuery(
    KIND_COLLECTION[kind],
    REMOTE_PREFIX_FIELD[kind],
    prefix,
    SEARCH_KIND_LIMIT,
  );
  return records.map(PROJECTORS[kind]);
}

/**
 * Builds the device index from everything this device has already mirrored.
 * @returns the search documents held locally
 */
export async function buildDeviceIndex(): Promise<readonly SearchDoc[]> {
  const [profiles, posts, groups, events, jobs, projects, gigs] = await Promise.all([
    mirrorList<RemoteRecord & { id: string; updatedAt: string }>('profiles', { limit: 500 }),
    mirrorList<RemoteRecord & { id: string; updatedAt: string }>('posts', { limit: 500 }),
    mirrorList<RemoteRecord & { id: string; updatedAt: string }>('groups', { limit: 300 }),
    mirrorList<RemoteRecord & { id: string; updatedAt: string }>('events', { limit: 300 }),
    mirrorList<RemoteRecord & { id: string; updatedAt: string }>('jobs', { limit: 300 }),
    mirrorList<RemoteRecord & { id: string; updatedAt: string }>('projects', { limit: 300 }),
    mirrorList<RemoteRecord & { id: string; updatedAt: string }>('gigs', { limit: 300 }),
  ]);
  return [
    ...profiles.map(PROJECTORS.people),
    ...posts.map(PROJECTORS.posts),
    ...groups.map(PROJECTORS.groups),
    ...events.map(PROJECTORS.events),
    ...jobs.map(PROJECTORS.jobs),
    ...projects.map(PROJECTORS.projects),
    ...gigs.map(PROJECTORS.gigs),
  ].filter((doc) => doc.id.length > 0);
}

/**
 * Groups ranked hits by kind, keeping the strongest kind first.
 * @param hits ranked, truncated hits
 * @returns the groups, ordered by their best hit
 */
export function groupHits(hits: readonly SearchHit[]): readonly SearchGroup[] {
  const order: SearchKind[] = [];
  const byKind = new Map<SearchKind, SearchHit[]>();
  for (const hit of hits) {
    if (!byKind.has(hit.doc.kind)) {
      byKind.set(hit.doc.kind, []);
      order.push(hit.doc.kind);
    }
    byKind.get(hit.doc.kind)?.push(hit);
  }
  return order.map((kind) => ({ kind, hits: byKind.get(kind) ?? [] }));
}

/** Options for a search. */
export interface SearchOptions {
  readonly kinds?: readonly SearchKind[] | undefined;
  /** Skip Firestore and rank only what this device holds. */
  readonly deviceOnly?: boolean | undefined;
  readonly limit?: number | undefined;
  readonly now?: Date | undefined;
}

/**
 * Runs a search across the platform, merging the remote and device layers.
 * @param query the raw query
 * @param options kind filter, device-only switch, limits
 * @returns the result set, with the provenance the UI must report
 */
export async function search(query: string, options: SearchOptions = {}): Promise<SearchResultSet> {
  const trimmed = query.trim();
  if (!isQueryUsable(trimmed, SEARCH_MIN_QUERY)) {
    return { query: trimmed, groups: [], source: 'local', total: 0, truncated: false };
  }

  const nowMs = (options.now ?? new Date()).getTime();
  const kinds = options.kinds ?? [];
  const limit = options.limit ?? SEARCH_KIND_LIMIT;

  const localDocs = await buildDeviceIndex();
  const localHits = limitPerKind(rank(localDocs, trimmed, kinds, nowMs), limit);

  if (options.deviceOnly === true) {
    const groups = groupHits(localHits);
    return {
      query: trimmed,
      groups,
      source: 'local',
      total: localHits.length,
      truncated: false,
    };
  }

  const targets: readonly SearchKind[] =
    kinds.length > 0 ? kinds : (Object.keys(PROJECTORS) as SearchKind[]);
  const settled = await Promise.all(
    targets.map(async (kind) => {
      const result = await withRemote(() => remoteKind(kind, trimmed), `search.${kind}`);
      return result.ok ? result.value : [];
    }),
  );

  const remoteDocs = settled.flat();
  const remoteHits = limitPerKind(rank(remoteDocs, trimmed, kinds, nowMs), limit);

  const merged = new Map<string, SearchHit>();
  for (const hit of [...remoteHits, ...localHits]) {
    const key = `${hit.doc.kind}:${hit.doc.id}`;
    const existing = merged.get(key);
    if (existing === undefined || hit.score > existing.score) merged.set(key, hit);
  }
  const hits = limitPerKind(
    [...merged.values()].sort((left, right) => right.score - left.score),
    limit,
  );

  const source: SearchResultSet['source'] =
    remoteDocs.length === 0 ? 'local' : localHits.length === 0 ? 'remote' : 'mixed';

  return {
    query: trimmed,
    groups: groupHits(hits),
    source,
    total: hits.length,
    truncated: hits.length === limit * targets.length,
  };
}

/**
 * Ranks an already-loaded list of documents, used by inline filters that never leave the screen.
 * @param docs documents to filter
 * @param query the raw query
 * @param now optional instant, injected by tests
 * @returns the ranked hits
 */
export function rankLoaded(
  docs: readonly SearchDoc[],
  query: string,
  now: Date = new Date(),
): readonly SearchHit[] {
  return rank(docs, query, [], now.getTime());
}

/**
 * Scores one document against a query, exposed for tests and for the palette's exact-match path.
 * @param doc the document
 * @param query the raw query
 * @param now optional instant
 * @returns the hit, or null below the floor
 */
export function scoreOne(doc: SearchDoc, query: string, now: Date = new Date()): SearchHit | null {
  return scoreDoc(indexDoc(doc), tokenise(query), tokenise(query).join(' '), now.getTime());
}

/**
 * Translates a Firestore failure into a BSDC error, so callers surface one vocabulary.
 * @param error the caught error
 * @returns an AppError
 */
export function searchError(error: unknown): ReturnType<typeof translateFirestoreError> {
  return translateFirestoreError(error, 'search.query');
}
