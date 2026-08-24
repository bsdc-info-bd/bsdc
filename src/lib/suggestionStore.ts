/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/** Shared suggestion store — written by PromotionEngine, read anywhere in the UI. */
import { useEffect, useState } from 'react';
import type { SuggestionResult } from './promotions';

let cached: SuggestionResult | null = null;
let cachedAt = 0;
const listeners = new Set<(s: SuggestionResult | null) => void>();

/** Subscribe to the latest suggestions from anywhere in the UI. */
export function useSuggestions(): SuggestionResult | null {
  const [suggestions, setSuggestions] = useState<SuggestionResult | null>(cached);
  useEffect(() => {
    listeners.add(setSuggestions);
    return () => {
      listeners.delete(setSuggestions);
    };
  }, []);
  return suggestions;
}

export function getSuggestionCache(): { get: () => SuggestionResult | null; at: () => number } {
  return { get: () => cached, at: () => cachedAt };
}

export function setSuggestionCache(next: SuggestionResult | null): void {
  cached = next;
  cachedAt = Date.now();
  listeners.forEach((fn) => fn(next));
}
