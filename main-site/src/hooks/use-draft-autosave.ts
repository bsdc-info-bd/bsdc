import { useEffect, useRef, useState } from 'react';
import { isDraftMeaningful, saveLocalDraft } from '@/lib/content/draft-storage';
import type { PostDraft } from '@/lib/content/content-types';

export type AutosaveState = 'idle' | 'saving' | 'saved';

/**
 * Debounced local autosave; reports its state so the UI can be honest.
 *
 * `enabled` is false while the composer is editing a published post: that
 * draft lives in the database, and letting it overwrite the browser copy
 * would offer somebody else's post back as a new one on the next visit.
 */
export function useDraftAutosave(draft: PostDraft, delay = 1200, enabled = true): AutosaveState {
  const [state, setState] = useState<AutosaveState>('idle');
  const first = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (!isDraftMeaningful(draft)) return;

    setState('saving');
    const timer = window.setTimeout(() => {
      saveLocalDraft(draft);
      setState('saved');
    }, delay);

    return () => window.clearTimeout(timer);
  }, [draft, delay, enabled]);

  return state;
}
