/**
 * BSDC — src/features/saved/useSavedItems.ts
 * Purpose : The hook every save affordance and the Saved route read.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Consumers get the shared list, a set of ids for O(1) lookups, and one toggle that is
 *   optimistic in the UI and durable in the outbox. Nothing here re-fetches per component: the
 *   hold is reference-counted, so twenty post cards cost one listener between them.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { NewSavedInput, SavedItem, SavedKind } from '@/entities/saved/model';
import { savedItemId } from '@/entities/saved/model';
import { emptySaved, holdSavedList, toggleSaved, useSavedStore } from './store';

/** What the hook returns. */
export interface UseSavedItemsResult {
  /** The bookmarks, newest first. */
  readonly items: readonly SavedItem[];
  /** Ids of every saved thing, for constant-time lookups. */
  readonly savedIds: ReadonlySet<string>;
  /** True until the first read has landed. */
  readonly loading: boolean;
  /** Where the last read came from: the server, or this device. */
  readonly source: 'remote' | 'local';
  /**
   * Adds or removes a bookmark.
   * @param input what is being saved
   * @returns whether it is saved afterwards
   */
  readonly toggle: (input: NewSavedInput) => Promise<boolean>;
  /**
   * Whether one thing is saved.
   * @param kind what kind of thing
   * @param entityId its id
   * @returns true when saved
   */
  readonly isSaved: (kind: SavedKind, entityId: string) => boolean;
  /**
   * Empties the list.
   * @returns how many rows were cleared
   */
  readonly clear: () => Promise<number>;
}

/**
 * Reads and mutates the signed-in account's bookmark list.
 * @param uid account id, or null when signed out
 * @returns the list, the saved ids and the actions
 */
export function useSavedItems(uid: string | null): UseSavedItemsResult {
  const items = useSavedStore((state) => state.items);
  const loading = useSavedStore((state) => state.loading);
  const source = useSavedStore((state) => state.source);

  useEffect(() => {
    if (uid === null) {
      useSavedStore.getState().setAccount(null);
      return;
    }
    return holdSavedList(uid);
  }, [uid]);

  const savedIds = useMemo(() => new Set(items.map((row) => row.id)), [items]);

  const isSaved = useCallback(
    (kind: SavedKind, entityId: string): boolean => savedIds.has(savedItemId(kind, entityId)),
    [savedIds],
  );

  const toggle = useCallback(
    async (input: NewSavedInput): Promise<boolean> => {
      if (uid === null) return false;
      return await toggleSaved(uid, input);
    },
    [uid],
  );

  const clear = useCallback(async (): Promise<number> => {
    if (uid === null) return 0;
    return await emptySaved(uid);
  }, [uid]);

  return { items, savedIds, loading, source, toggle, isSaved, clear };
}
