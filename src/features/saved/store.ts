/**
 * BSDC — src/features/saved/store.ts
 * Purpose : One copy of the bookmark list, shared by every save affordance on the screen.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : A feed shows twenty post cards and every one of them carries a save button. If each
 *   card owned its own copy of the list, twenty cards would mean twenty copies of up to five
 *   hundred bookmarks and twenty chances to disagree with each other about whether a post is
 *   saved. The list lives here instead, hydrated once per account and shared, exactly as the badge
 *   store is shared by the header, the rail and the bottom bar.
 *   The subscription itself is held by the listener registry, so N consumers still mean one
 *   Firestore listener, and it is released when the last consumer unmounts.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { create } from 'zustand';
import {
  clearSavedItems,
  listSavedItems,
  peekSavedItems,
  setSavedItem,
  watchSavedItems,
} from '@/entities/saved/repository';
import { newSavedItem, type NewSavedInput, type SavedItem } from '@/entities/saved/model';
import type { Unsubscribe } from '@/services/realtime/registry';

/** Shape of the shared bookmark state. */
export interface SavedState {
  readonly uid: string | null;
  readonly items: readonly SavedItem[];
  readonly source: 'remote' | 'local';
  readonly loading: boolean;
  readonly setAccount: (uid: string | null) => void;
  readonly setList: (items: readonly SavedItem[], source: 'remote' | 'local') => void;
  readonly put: (item: SavedItem) => void;
  readonly drop: (itemId: string) => void;
}

/**
 * The bookmark store.
 */
export const useSavedStore = create<SavedState>()((set) => ({
  uid: null,
  items: [],
  source: 'local',
  loading: true,
  setAccount: (uid) => set({ uid, items: [], source: 'local', loading: uid !== null }),
  setList: (items, source) => set({ items, source, loading: false }),
  put: (item) =>
    set((state) => ({
      items: [item, ...state.items.filter((row) => row.id !== item.id)].sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt),
      ),
    })),
  drop: (itemId) => set((state) => ({ items: state.items.filter((row) => row.id !== itemId) })),
}));

/** How many mounted consumers currently hold the subscription. */
let holders = 0;

/** Release function for the Firestore listener, held outside React state. */
let release: Unsubscribe | null = null;

/** The account the live subscription belongs to. */
let attached: string | null = null;

/**
 * Attaches the shared bookmark subscription for an account.
 * @param uid account id, or null when signed out
 * @returns a function that releases this consumer's hold
 */
export function holdSavedList(uid: string): () => void {
  holders += 1;
  const store = useSavedStore.getState();
  if (store.uid !== uid) store.setAccount(uid);

  if (attached !== uid) {
    attached = uid;
    release?.();
    void peekSavedItems(uid).then((items) => {
      if (attached !== uid) return;
      useSavedStore.getState().setList(items, 'local');
    });
    void listSavedItems(uid).then(({ items, source }) => {
      if (attached !== uid) return;
      useSavedStore.getState().setList(items, source);
    });
    release = watchSavedItems(uid, (items) => {
      if (attached !== uid) return;
      useSavedStore.getState().setList(items, 'remote');
    });
  }

  return () => {
    holders -= 1;
    if (holders > 0) return;
    holders = 0;
    attached = null;
    release?.();
    release = null;
    useSavedStore.getState().setAccount(null);
  };
}

/**
 * Adds or removes a bookmark, optimistically and then durably.
 * @param uid account id
 * @param input what is being saved
 * @returns whether the thing is saved afterwards
 */
export async function toggleSaved(uid: string, input: NewSavedInput): Promise<boolean> {
  const store = useSavedStore.getState();
  const item = newSavedItem(uid, input);
  const wasSaved = store.items.some((row) => row.id === item.id);

  if (wasSaved) store.drop(item.id);
  else store.put(item);

  const result = await setSavedItem(uid, input, !wasSaved);
  if (result.error !== null && result.error !== undefined) {
    // The write did not land: put the list back the way it was, because a bookmark that says
    // "saved" in the UI and is not saved anywhere is worse than one that waits a moment.
    if (wasSaved) store.put(item);
    else store.drop(item.id);
  }
  return !wasSaved;
}

/**
 * Empties the bookmark list and refreshes the store from the device.
 * @param uid account id
 * @returns how many rows were cleared
 */
export async function emptySaved(uid: string): Promise<number> {
  const count = await clearSavedItems(uid);
  useSavedStore.getState().setList([], 'local');
  return count;
}

/**
 * Reads the saved ids without subscribing, for imperative checks.
 * @returns the ids currently held
 */
export function readSavedIds(): readonly string[] {
  return useSavedStore.getState().items.map((row) => row.id);
}
