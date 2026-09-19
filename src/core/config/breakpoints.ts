/**
 * BSDC — src/core/config/breakpoints.ts
 * Purpose : Single source of truth for the ultra-responsive contract (250px -> 5120px).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   :
 *   ADR-009  CSS media queries, Tailwind `screens` and JS `matchMedia` all read from this file so
 *            the three can never drift. src/styles/responsive/*.css uses the same numbers through
 *            CSS custom properties emitted in src/styles/layers/tokens.css.
 *   The 250px target is the primary design target (PART 08.04 R-01..R-20). A folding phone in
 *   cover-screen mode, a Raspberry Pi panel and a 50-inch class TV are all first-class.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */

/** Named breakpoints in ascending order. Values are CSS pixels (min-width). */
export const BREAKPOINTS = {
  'ultra-nano': 250,
  nano: 280,
  tiny: 320,
  'mobile-sm': 360,
  mobile: 375,
  'mobile-lg': 414,
  phablet: 480,
  'tablet-sm': 600,
  tablet: 768,
  'tablet-lg': 834,
  'laptop-sm': 1024,
  laptop: 1280,
  desktop: 1440,
  'desktop-lg': 1680,
  qhd: 1920,
  '2k': 2560,
  ultrawide: 3440,
  '4k': 3840,
  '5k-tv': 5120,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** Tailwind `screens` map derived from BREAKPOINTS. */
export const SCREENS: Record<BreakpointName, string> = Object.fromEntries(
  Object.entries(BREAKPOINTS).map(([name, value]) => [name, `${value}px`]),
) as Record<BreakpointName, string>;

/** Ascending list of [name, px] used by matchMedia helpers and the layout sentinel. */
export const BREAKPOINT_ORDER: readonly (readonly [BreakpointName, number])[] = Object.entries(
  BREAKPOINTS,
) as readonly (readonly [BreakpointName, number])[];

/**
 * Minimum widths at which the shell changes navigation model (PART 08.04 R-04).
 * Bottom nav <= 768px, rail nav 1024-1679px, three-column shell >= 1680px.
 */
export const NAVIGATION_MODEL = {
  bottomNavMax: BREAKPOINTS.tablet,
  railNavMin: BREAKPOINTS['laptop-sm'],
  threeColumnMin: BREAKPOINTS['desktop-lg'],
} as const;

/**
 * Content max-width caps (PART 08.04 R-06). The shell stretches to 5120px but content
 * stays readable; density spacing increases above 2560px so a 50-inch screen never looks
 * like an oversized phone screenshot.
 */
export const CONTENT_MAX_WIDTH = {
  prose: '72ch',
  feed: 680,
  marketplace: 1280,
  admin: 1600,
  ultraWide: 1920,
} as const;

/**
 * Resolves the active breakpoint name for a viewport width.
 * @param width viewport width in CSS pixels (0 is tolerated for SSR/prerender contexts)
 * @returns the largest breakpoint whose min-width is <= the given width
 */
export function resolveBreakpoint(width: number): BreakpointName {
  let current: BreakpointName = 'ultra-nano';
  for (const [name, minWidth] of BREAKPOINT_ORDER) {
    if (width >= minWidth) current = name;
  }
  return current;
}

/**
 * Builds a `matchMedia` query string for a breakpoint.
 * @param name breakpoint name
 * @param direction min-width or max-width
 * @returns a media query string suitable for window.matchMedia
 */
export function mediaQuery(name: BreakpointName, direction: 'min' | 'max' = 'min'): string {
  const value = BREAKPOINTS[name];
  return direction === 'min' ? `(min-width: ${value}px)` : `(max-width: ${value - 0.02}px)`;
}

/**
 * Widths exercised by the responsive CI matrix (PART 24.3). Every route is visited at each
 * width and asserted to have zero horizontal overflow.
 */
export const RESPONSIVE_TEST_WIDTHS: readonly number[] = Object.values(BREAKPOINTS);
