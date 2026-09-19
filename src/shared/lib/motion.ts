/**
 * BSDC — src/shared/lib/motion.ts
 * Purpose : Shared Framer Motion variants so every surface animates with one vocabulary
 *           (PART 08.07 motion language).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Reduced motion is honoured centrally: `motionSafe` collapses a variant to a single
 *           frame when the user asked for less motion (LAW-14).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { Transition, Variants } from 'framer-motion';

/** Standard easing shared by the CSS token layer and the JS animation layer. */
export const EASE_STANDARD: Transition['ease'] = [0.2, 0.8, 0.2, 1];
export const EASE_EMPHASISED: Transition['ease'] = [0.05, 0.7, 0.1, 1];

/** Entrance: 12px rise, 96% scale, 240ms, standard ease (PART 08.07). */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: EASE_STANDARD } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16, ease: EASE_STANDARD } },
};

/** Feed item insert: height grow plus fade. */
export const feedItemIn: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0.2, ease: EASE_STANDARD } },
};

/** Shared-axis slide used for mobile route transitions. */
export const slideIn: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.24, ease: EASE_STANDARD } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.16, ease: EASE_STANDARD } },
};

/** Desktop route transition: subtle fade and scale. */
export const fadeScaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.99 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: EASE_STANDARD } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: EASE_STANDARD } },
};

/**
 * Collapses a variant to no motion when the platform asks for reduced motion.
 * @param variants source variants
 * @param reduced whether reduced motion is active
 * @returns the original variants or an instant, opacity-only variant set
 */
export function motionSafe(variants: Variants, reduced: boolean): Variants {
  if (!reduced) return variants;
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.001 } },
    exit: { opacity: 0, transition: { duration: 0.001 } },
  };
}
