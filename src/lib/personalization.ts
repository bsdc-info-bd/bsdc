/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * On-device personalization engine.
 *
 * Records REAL interactions (views with dwell time, reactions, comments, bookmarks,
 * searches, follows) into localforage and derives per-user affinities that feed the
 * ranking algorithm: favorite tags, preferred content types and preferred authors.
 * 100% local to the device — nothing is uploaded, and an empty history simply
 * produces neutral scores.
 */
import localforage from 'localforage';
import type { PostType } from '@/types/post';

export interface InteractionEvent {
  kind: 'view' | 'reaction' | 'comment' | 'bookmark' | 'share' | 'search' | 'follow';
  postId?: string;
  postType?: PostType;
  tags?: string[];
  authorId?: string;
  dwellSeconds?: number;
  query?: string;
  at: number;
}

interface PersonalizationModel {
  tagAffinity: Record<string, number>;
  typeAffinity: Record<string, number>;
  authorAffinity: Record<string, number>;
  lastUpdated: number;
}

const WEIGHTS: Record<InteractionEvent['kind'], number> = {
  view: 0.4,
  reaction: 2,
  comment: 3,
  bookmark: 2.5,
  share: 2,
  search: 1,
  follow: 3,
};

const MAX_EVENTS = 500;
const HALF_LIFE_DAYS = 14;

const store = localforage.createInstance({
  name: 'bsdc',
  storeName: 'personalization',
});

let eventBuffer: InteractionEvent[] = [];
let flushTimer: number | null = null;
let cachedModel: PersonalizationModel | null = null;

/** Record an interaction — fire and forget, batched to storage. */
export function trackInteraction(event: Omit<InteractionEvent, 'at'> & { at?: number }): void {
  try {
    eventBuffer.push({ ...event, at: event.at ?? Date.now() });
    if (flushTimer !== null) window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(() => void flush(), 1500);
  } catch {
    /* storage unavailable — personalization silently disabled */
  }
}

async function flush(): Promise<void> {
  if (eventBuffer.length === 0) return;
  const events = eventBuffer;
  eventBuffer = [];
  try {
    const existing = ((await store.getItem<InteractionEvent[]>('events')) || []).slice(-MAX_EVENTS);
    const merged = [...existing, ...events].slice(-MAX_EVENTS);
    await store.setItem('events', merged);
    cachedModel = null; // force recompute
  } catch {
    /* ignore */
  }
}

function decay(at: number, now: number): number {
  const ageDays = (now - at) / 86_400_000;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function buildModel(events: InteractionEvent[]): PersonalizationModel {
  const now = Date.now();
  const model: PersonalizationModel = { tagAffinity: {}, typeAffinity: {}, authorAffinity: {}, lastUpdated: now };
  for (const e of events) {
    const w = (WEIGHTS[e.kind] || 1) * decay(e.at, now) * (1 + Math.min(1, (e.dwellSeconds || 0) / 60));
    if (e.postType) model.typeAffinity[e.postType] = (model.typeAffinity[e.postType] || 0) + w;
    if (e.authorId) model.authorAffinity[e.authorId] = (model.authorAffinity[e.authorId] || 0) + w;
    for (const tag of e.tags || []) {
      const key = tag.toLowerCase();
      model.tagAffinity[key] = (model.tagAffinity[key] || 0) + w;
    }
  }
  return model;
}

export async function getModel(): Promise<PersonalizationModel> {
  if (cachedModel) return cachedModel;
  let events: InteractionEvent[] = [];
  try {
    events = (await store.getItem<InteractionEvent[]>('events')) || [];
  } catch {
    /* ignore */
  }
  cachedModel = buildModel(events);
  return cachedModel;
}

/** Top tags by real affinity, strongest first. */
export async function topTags(limit = 10): Promise<{ tag: string; score: number }[]> {
  const model = await getModel();
  return Object.entries(model.tagAffinity)
    .map(([tag, score]) => ({ tag, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Preferred content types with normalized weight (0..1 relative). */
export async function typeAffinity(): Promise<Partial<Record<PostType, number>>> {
  const model = await getModel();
  const entries = Object.entries(model.typeAffinity) as [PostType, number][];
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const out: Partial<Record<PostType, number>> = {};
  for (const [type, v] of entries) out[type] = v / max;
  return out;
}

export async function authorAffinity(): Promise<Record<string, number>> {
  const model = await getModel();
  return model.authorAffinity;
}

/** Wipe the personalization model (Settings → privacy). */
export async function resetPersonalization(): Promise<void> {
  try {
    await store.clear();
    cachedModel = null;
  } catch {
    /* ignore */
  }
}
