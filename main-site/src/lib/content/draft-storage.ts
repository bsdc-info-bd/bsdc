import { EMPTY_DRAFT, storedDraftSchema, type PostDraft } from './content-types';

/**
 * Composer drafts survive a refresh, a crashed tab and a lost connection.
 * The browser copy is the fast path; the server copy (a post row with status
 * "draft") is written by the composer's explicit save.
 */
const STORAGE_KEY = 'bsdc.compose.draft';

export function loadLocalDraft(): PostDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const merged = { ...EMPTY_DRAFT, ...parsed.data };
    // A draft saved before picture sizes were kept still opens; the layout
    // falls back to a default shape rather than losing the member's writing.
    return {
      ...merged,
      media: merged.media.map((item) => ({
        ...item,
        width: item.width ?? null,
        height: item.height ?? null,
      })),
    } satisfies PostDraft;
  } catch {
    return null;
  }
}

export function saveLocalDraft(draft: PostDraft): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage can be full or blocked; the composer keeps working in memory.
  }
}

export function clearLocalDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

/** True when the draft holds anything worth restoring. */
export function isDraftMeaningful(draft: PostDraft): boolean {
  return (
    draft.title.trim().length > 0 ||
    draft.body.trim().length > 0 ||
    draft.code.trim().length > 0 ||
    draft.media.length > 0 ||
    draft.pollOptions.some((option) => option.trim().length > 0)
  );
}
