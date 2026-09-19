/**
 * BSDC — src/shared/lib/cn.ts
 * Purpose : The single className composer used by every component in the product.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : clsx merges conditional classes; tailwind-merge removes conflicting Tailwind utilities
 *           so a caller can always override a component's defaults (ADR-008).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names and resolves Tailwind conflicts.
 * @param inputs class values (strings, arrays, conditional objects)
 * @returns a single, conflict-free class string
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
