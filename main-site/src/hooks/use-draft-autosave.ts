import { useEffect, useRef, useState } from 'react';
import { isDraftMeaningful, saveLocalDraft } from '@/lib/content/draft-storage';
import type { PostDraft } from '@/lib/content/content-types';

export type AutosaveState = 'idle' | 'saving' | 'saved';

/** Debounced local autosave; reports its state so the UI can be honest. */
export function useDraftAutosave(draft: PostDraft, delay = 1200): AutosaveState {
  const [state, setState] = useState<AutosaveState>('idle');
  const first = useRef(true);

  useEffect(() => {
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
  }, [draft, delay]);

  return state;
}
